// packages/core/src/agent/vendor-agent.ts — vong luot agent THO
// (SPEC-P05-Dispatch.md §10.5, Đ27). Mau agent/resident-agent.ts (runResidentTurn)
// nhung don gian hon: khong co JobDraft, dung VendorToolContext.

import type { ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql } from '../adapters/db.js';
import { callModel } from '../adapters/model.js';
import type { InboundEvent } from '../adapters/transport.js';
import { audit } from '../services/audit.js';
import { claimJob } from '../services/dispatch.js';
import { sendVendorMessage } from '../services/vendor-messages.js';
import { getSlotSummary } from '../services/slots.js';
import type { InboundHandler } from '../sim/sim-transport.js';
import { redactPii } from './pii.js';
import { extractJobCodes, matchesClaimPhrase, parsePriceVnd } from './vendor-intent.js';
import { triageVendorMessage } from './vendor-triage.js';
import { resolveParty, getOrCreateConversation, saveMessage, maskForModel } from './conversation.js';
import { VENDOR_TOOLS, vendorHandoffToStaffTool } from './tools/index.js';
import { assertValidToolInput } from './tools/tool-kit.js';
import { buildVendorSystemPrompt } from './prompts/vendor.js';
import { ModelUnavailableError } from '../domain/errors.js';
import type { VendorToolContext, VendorTriageResult } from './vendor-tool-context.js';
import type { TradeGroup, JobStatus } from '../domain/types.js';

const MAX_TOOL_ROUNDS = 6;
const TRIAGE_HISTORY_LIMIT = 3;
const DM_HISTORY_LIMIT = 20;

export const BUSY_REPLY = 'Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.';
export const VENDOR_REGISTER_REPLY =
  'Xin chào, hệ thống chưa nhận diện anh/chị là thợ đã đăng ký. Vui lòng liên hệ Ban quản lý để được hỗ trợ đăng ký.';
export const VENDOR_PENDING_REPLY = 'Tài khoản thợ của anh/chị đang chờ Ban quản lý duyệt.';
export const VENDOR_SUSPENDED_REPLY = 'Tài khoản thợ của anh/chị hiện đang bị đình chỉ. Vui lòng liên hệ Ban quản lý.';
export const VENDOR_TEXT_ONLY_REPLY = 'Hệ thống hiện chỉ hỗ trợ tin nhắn dạng văn bản.';

function extractText(payload: Record<string, unknown>): string {
  const t = (payload as { text?: unknown }).text;
  return typeof t === 'string' ? t : '';
}

async function sendDm(threadId: string, conversationId: string, text: string): Promise<void> {
  await sendVendorMessage({ threadId, threadType: 'user', text, jobId: null });
  await saveMessage(conversationId, 'out', 'assistant', text);
}

async function loadVendorBuildingIds(vendorId: string): Promise<string[]> {
  const rows = await sql<{ building_id: string }>(`select building_id from vendor_buildings where vendor_id = $1`, [vendorId]);
  return rows.map((r) => r.building_id);
}

async function loadGroupTradeGroup(threadId: string): Promise<TradeGroup | null> {
  const rows = await sql<{ trade_group: TradeGroup }>(
    `select trade_group from vendor_groups where zalo_account_id = 'market' and thread_id = $1 limit 1`,
    [threadId]
  );
  return rows[0]?.trade_group ?? null;
}

async function loadRecentDmTextsForTriage(conversationId: string): Promise<string[]> {
  const rows = await sql<{ content: { text?: string } }>(
    `select content from messages where conversation_id = $1 order by id desc limit ${TRIAGE_HISTORY_LIMIT}`,
    [conversationId]
  );
  return rows.reverse().map((r) => redactPii(r.content?.text ?? ''));
}

async function loadDmHistory(conversationId: string, excludeMessageId: number): Promise<MessageParam[]> {
  const rows = await sql<{ role: 'user' | 'assistant' | 'staff'; content: { text?: string } }>(
    `select role, content from messages where conversation_id = $1 and id <> $2 order by id desc limit ${DM_HISTORY_LIMIT}`,
    [conversationId, excludeMessageId]
  );
  return rows
    .reverse()
    .map((r) => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: maskForModel(r.content?.text ?? '', []) }));
}

function nowIsoVn(now: Date): string {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return `${vn.toISOString().slice(0, 19)}+07:00`;
}

interface ContextLines {
  vendorName: string;
  buildingCodes: string[];
  tradeGroups: TradeGroup[];
  myJobs: Array<{ code: string; status: JobStatus; hold_expires_at: string | null }>;
  publishedInScope: Array<{ code: string; category_name: string; window: [string, string]; mode: string }>;
}

async function loadContextLines(ctx: VendorToolContext): Promise<ContextLines> {
  const vendorRows = await sql<{ full_name: string }>(`select full_name from vendors where id = $1`, [ctx.vendorId]);
  const buildingRows = await sql<{ code: string }>(
    `select b.code from vendor_buildings vb join buildings b on b.id = vb.building_id where vb.vendor_id = $1`,
    [ctx.vendorId]
  );
  const tradeGroupRows = await sql<{ trade_group: TradeGroup }>(
    `select distinct c.trade_group from vendor_skills s join job_categories c on c.code = s.category_code where s.vendor_id = $1`,
    [ctx.vendorId]
  );
  const myJobRows = await sql<{ code: string; status: JobStatus; hold_expires_at: string | null }>(
    `select code, status, hold_expires_at from jobs where assigned_vendor_id = $1 and status in ('held','confirmed','access_pending')
     order by updated_at desc`,
    [ctx.vendorId]
  );

  let publishedInScope: ContextLines['publishedInScope'] = [];
  if (ctx.threadType === 'group' && ctx.groupTradeGroup) {
    const rows = await sql<{ code: string; name_vi: string; window_start: string | null; window_end: string | null; mode: string | null }>(
      `select j.code, coalesce(c.name_vi,'') as name_vi, j.window_start, j.window_end, j.mode
       from jobs j join job_categories c on c.code = j.category_code
       join vendor_groups g on g.building_id = j.building_id and g.trade_group = c.trade_group
       where g.thread_id = $1 and j.status = 'published'`,
      [ctx.threadId]
    );
    publishedInScope = rows.map((r) => ({
      code: r.code,
      category_name: r.name_vi,
      window: [r.window_start ?? '', r.window_end ?? ''],
      mode: r.mode ?? 'quote',
    }));
  }

  return {
    vendorName: vendorRows[0]?.full_name ?? '',
    buildingCodes: buildingRows.map((r) => r.code),
    tradeGroups: tradeGroupRows.map((r) => r.trade_group),
    myJobs: myJobRows,
    publishedInScope,
  };
}

function buildContextBlock(ctx: VendorToolContext, lines: ContextLines, slotSummary: string): string {
  const price = parsePriceVnd(ctx.latestText);
  const myJobsText = lines.myJobs.length
    ? lines.myJobs.map((j) => `${j.code} (${j.status}${j.hold_expires_at ? `, giữ tới ${j.hold_expires_at}` : ''})`).join('; ')
    : 'không có';
  const publishedText = lines.publishedInScope.length
    ? lines.publishedInScope.map((j) => `${j.code} — ${j.category_name} (${j.window[0]}–${j.window[1]}, ${j.mode})`).join('; ')
    : 'không có';
  return [
    `Bây giờ: ${nowIsoVn(ctx.now)}`,
    `Thợ: ${lines.vendorName} · Nhóm nghề: ${lines.tradeGroups.join(', ') || 'không rõ'} · Toà: ${lines.buildingCodes.join(', ') || 'không rõ'}`,
    `Slot: ${slotSummary}`,
    `Cuốc đang giữ/xác nhận của thợ: ${myJobsText}`,
    `Cuốc đang đăng trong nhóm này: ${publishedText}`,
    `Mã cuốc trong tin: [${ctx.jobCodesInText.join(', ')}]`,
    `Giá đọc được trong tin: ${price ?? 'không có'}`,
  ].join('\n');
}

/** SPEC-P05-Dispatch.md §10.5.3: mau `runResidentTurn`, vong toi da 6 luot
 * tool. `dmConversationId`/`dmThreadId` la noi text cuoi LUON duoc gui toi
 * (ke ca khi kich hoat tu nhom — CAM agent phat text tu do vao nhom). */
export async function runVendorTurn(
  ctx: VendorToolContext,
  dmConversationId: string,
  dmThreadId: string,
  currentMessageId: number
): Promise<void> {
  const toolMap = new Map(VENDOR_TOOLS.map((t) => [t.definition.name, t]));
  const toolDefs = VENDOR_TOOLS.map((t) => t.definition);
  const systemPrompt = buildVendorSystemPrompt();

  const lines = await loadContextLines(ctx);
  const slotSummary = await getSlotSummary(ctx.vendorId, ctx.now);
  const slotText = slotSummary.slots.length
    ? slotSummary.slots.map((s) => `${s.tradeGroup}@${s.buildingCode}: còn ${s.daysLeft} ngày${s.isTrial ? ' (dùng thử)' : ''}`).join('; ')
    : 'chưa có slot nào';
  const contextBlock = buildContextBlock(ctx, lines, slotText);

  const history = ctx.threadType === 'user' ? await loadDmHistory(dmConversationId, currentMessageId) : [];
  const messages: MessageParam[] = [
    ...history,
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: 'Đã nhận ngữ cảnh hiện tại.' },
    { role: 'user', content: maskForModel(ctx.latestText, []) },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await callModel({
        route: 'vendor_parse',
        system: systemPrompt,
        messages,
        tools: toolDefs,
        conversationId: ctx.conversationId,
      });
    } catch (err) {
      if (!(err instanceof ModelUnavailableError)) {
        await audit(sql, {
          actorType: 'agent',
          actorId: ctx.vendorId,
          action: 'agent.model_error',
          target: ctx.conversationId,
          data: { error: err instanceof Error ? err.name : String(err) },
        });
      }
      throw err;
    }

    if (result.message.stop_reason === 'refusal') {
      await vendorHandoffToStaffTool.run(ctx, { reason: 'model_refusal' });
      if (ctx.threadType === 'user') await sendDm(dmThreadId, dmConversationId, BUSY_REPLY);
      return;
    }

    messages.push({ role: 'assistant', content: result.message.content as unknown as ContentBlockParam[] });

    const toolUses = result.message.content.filter((b) => b.type === 'tool_use') as Array<{
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
    }>;

    if (toolUses.length === 0) {
      const textOut = result.message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim();
      if (textOut) {
        await sendDm(dmThreadId, dmConversationId, textOut);
      } else if (ctx.threadType === 'user') {
        // N2 (mau P03): vong DM ket thuc khong co text => BUSY_REPLY + handoff.
        await vendorHandoffToStaffTool.run(ctx, { reason: 'agent_empty' });
        await sendDm(dmThreadId, dmConversationId, BUSY_REPLY);
      }
      // Luot nhom khong co text => im (khong BUSY_REPLY — §10.5.3).
      return;
    }

    const toolResults: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = toolMap.get(tu.name);
      try {
        if (!tool) throw new Error(`Tool khong ton tai: ${tu.name}`);
        assertValidToolInput(tool.definition, tu.input);
        const output = await tool.run(ctx, tu.input as never);
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(output) });
      } catch (err) {
        const code = (err as { code?: string })?.code ?? 'Error';
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          is_error: true,
          content: JSON.stringify({ code, message }),
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  await vendorHandoffToStaffTool.run(ctx, { reason: 'agent_loop_limit' });
  if (ctx.threadType === 'user') await sendDm(dmThreadId, dmConversationId, BUSY_REPLY);
}

async function buildVendorToolContext(args: {
  vendorId: string;
  vendorUid: string;
  conversationId: string;
  threadId: string;
  threadType: 'user' | 'group';
  latestText: string;
  latestMessageCreatedAt: string;
  triage: VendorTriageResult | null;
  jobCodesInText: readonly string[];
  systemEvent: { event: 'access_approved'; jobId: string } | null;
  now: Date;
}): Promise<VendorToolContext> {
  const buildingIds = await loadVendorBuildingIds(args.vendorId);
  const groupTradeGroup = args.threadType === 'group' ? await loadGroupTradeGroup(args.threadId) : null;
  return {
    vendorId: args.vendorId,
    vendorUid: args.vendorUid,
    buildingIds,
    conversationId: args.conversationId,
    threadId: args.threadId,
    threadType: args.threadType,
    groupTradeGroup,
    latestText: args.latestText,
    latestMessageCreatedAt: args.latestMessageCreatedAt,
    triage: args.triage,
    jobCodesInText: args.jobCodesInText,
    systemEvent: args.systemEvent,
    now: args.now,
  };
}

/** SPEC-P05-Dispatch.md §10.4.3: tin NHOM chi duoc XU LY khi thoa MOT trong
 * (a) co ma cuoc trong tin, (b) nguoi gui dang giu mot cuoc `held`, (c) nhom
 * dang co >=1 cuoc `published`. */
async function groupMessageIsRelevant(
  vendorId: string,
  threadId: string,
  jobCodesInText: readonly string[]
): Promise<boolean> {
  if (jobCodesInText.length > 0) return true;
  const heldRows = await sql(`select 1 from jobs where assigned_vendor_id = $1 and status = 'held'`, [vendorId]);
  if (heldRows.length > 0) return true;
  const publishedRows = await sql(
    `select 1 from jobs j join job_categories c on c.code = j.category_code
     join vendor_groups g on g.building_id = j.building_id and g.trade_group = c.trade_group
     where g.thread_id = $1 and j.status = 'published' limit 1`,
    [threadId]
  );
  return publishedRows.length > 0;
}

/** SPEC-P05-Dispatch.md §10.5.4: luot kich hoat boi su kien he thong
 * `access_approved` (enqueueSystemEvent) — CHI co nghia voi
 * `dispatch_to_vendor`/`get_my_assignments`. */
async function handleSystemEvent(e: InboundEvent): Promise<void> {
  const payload = e.payload as { kind?: string; event?: string; job_id?: string };
  if (payload.event !== 'access_approved' || !payload.job_id) return;
  const jobRows = await sql<{ assigned_vendor_id: string | null }>(`select assigned_vendor_id from jobs where id = $1`, [
    payload.job_id,
  ]);
  const vendorId = jobRows[0]?.assigned_vendor_id ?? null;
  if (!vendorId) {
    await audit(sql, { actorType: 'system', actorId: null, action: 'system.no_vendor', target: payload.job_id, data: {} });
    return;
  }
  const identityRows = await sql<{ zalo_uid: string }>(
    `select zalo_uid from zalo_identities where zalo_account_id = 'market' and party_type = 'vendor' and party_id = $1`,
    [vendorId]
  );
  if (identityRows.length === 0) {
    await audit(sql, { actorType: 'system', actorId: vendorId, action: 'system.vendor_no_identity', target: payload.job_id, data: {} });
    return;
  }
  const vendorUid = identityRows[0]!.zalo_uid;
  const party = await resolveParty('market', vendorUid);
  const { conversation } = await getOrCreateConversation('market', vendorUid, party);

  const ctx = await buildVendorToolContext({
    vendorId,
    vendorUid,
    conversationId: conversation.id,
    threadId: vendorUid,
    threadType: 'user',
    latestText: '',
    latestMessageCreatedAt: new Date().toISOString(),
    triage: null,
    jobCodesInText: [],
    systemEvent: { event: 'access_approved', jobId: payload.job_id },
    now: new Date(),
  });

  const jobCodeRows = await sql<{ code: string }>(`select code from jobs where id = $1`, [payload.job_id]);
  const code = jobCodeRows[0]?.code ?? payload.job_id;
  const sysText = `[Hệ thống] BQL đã duyệt cho thợ vào toà cho cuốc ${code}. Hãy giao việc bằng dispatch_to_vendor.`;
  const saved = await saveMessage(conversation.id, 'in', 'user', sysText);
  try {
    await runVendorTurn({ ...ctx, latestText: sysText }, conversation.id, vendorUid, saved.id);
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      await audit(sql, { actorType: 'system', actorId: vendorId, action: 'agent.model_error', target: conversation.id, data: {} });
    } else {
      throw err;
    }
  }
}

/** SPEC-P05-Dispatch.md §10.5.1 `vendorHandler` (chi `e.zaloAccountId ===
 * 'market'`). */
export const vendorHandler: InboundHandler = async (e: InboundEvent) => {
  const payload = e.payload as { kind?: string; text?: unknown };
  if (e.senderUid === 'system') {
    if (e.zaloMsgId.startsWith('sys-') && payload.kind === 'system') {
      await handleSystemEvent(e);
    } else {
      await audit(sql, { actorType: 'system', actorId: e.senderUid, action: 'vendor.forged_system_event', target: e.threadId, data: {} });
    }
    return;
  }

  const party = await resolveParty('market', e.senderUid);
  if (party.type !== 'vendor' || !party.id) {
    if (e.threadType === 'user') {
      await sendVendorMessage({ threadId: e.threadId, threadType: 'user', text: VENDOR_REGISTER_REPLY, jobId: null });
    } else {
      await audit(sql, { actorType: 'system', actorId: null, action: 'vendor.unknown_in_group', target: e.threadId, data: {} });
    }
    return;
  }
  const vendorId = party.id;

  const vendorRows = await sql<{ status: string }>(`select status from vendors where id = $1`, [vendorId]);
  const vendorStatus = vendorRows[0]?.status ?? 'pending';
  if (vendorStatus === 'pending' || vendorStatus === 'suspended') {
    await sendVendorMessage({
      threadId: e.senderUid,
      threadType: 'user',
      text: vendorStatus === 'pending' ? VENDOR_PENDING_REPLY : VENDOR_SUSPENDED_REPLY,
      jobId: null,
    });
    return;
  }

  const text = extractText(e.payload);
  const codes = extractJobCodes(text);

  if (e.threadType === 'group') {
    if (!(await groupMessageIsRelevant(vendorId, e.threadId, codes))) {
      await audit(sql, { actorType: 'system', actorId: vendorId, action: 'vendor.group_noise', target: e.threadId, data: {} });
      return;
    }
  }

  let conversationId: string;
  let mismatch = false;
  if (e.threadType === 'user') {
    const r = await getOrCreateConversation('market', e.threadId, party);
    conversationId = r.conversation.id;
    mismatch = r.mismatch;
  } else {
    // §10.5.1(5): conversation cua thread NHOM — KHONG gan nguoi, khong ap N11.
    const r = await getOrCreateConversation('market', e.threadId, { type: 'unknown', id: null, account: 'market' });
    conversationId = r.conversation.id;
  }

  // Luon dam bao co conversation DM cua CHINH tho nay de log text ra + kiem
  // human_takeover, ke ca khi luot nay kich hoat tu nhom (§10.5.3).
  const dmResult = await getOrCreateConversation('market', e.senderUid, party);
  const dmConversationId = dmResult.conversation.id;

  if (e.threadType === 'user' && mismatch) {
    await saveMessage(conversationId, 'in', 'user', text);
    await audit(sql, { actorType: 'system', actorId: vendorId, action: 'conversation.party_mismatch', target: conversationId, data: {} });
    await sendDm(e.threadId, conversationId, BUSY_REPLY);
    return;
  }

  if (dmResult.conversation.human_takeover_until && new Date(dmResult.conversation.human_takeover_until) > new Date()) {
    await saveMessage(conversationId, 'in', 'user', text);
    return;
  }

  if (!text) {
    if (e.threadType === 'user') await sendDm(e.threadId, conversationId, VENDOR_TEXT_ONLY_REPLY);
    return;
  }

  const now = new Date();
  const recentForTriage = e.threadType === 'user' ? await loadRecentDmTextsForTriage(conversationId) : [];
  const triage = await triageVendorMessage(redactPii(text), recentForTriage, conversationId);
  const saved = await saveMessage(conversationId, 'in', 'user', text, {
    triage,
    codes,
    vendor_id: vendorId,
    group: e.threadType === 'group',
  });

  const ctx = await buildVendorToolContext({
    vendorId,
    vendorUid: e.threadType === 'user' ? e.threadId : e.senderUid,
    conversationId,
    threadId: e.threadId,
    threadType: e.threadType,
    latestText: text,
    latestMessageCreatedAt: saved.createdAt,
    triage,
    jobCodesInText: codes,
    systemEvent: null,
    now,
  });

  try {
    await runVendorTurn(ctx, dmConversationId, ctx.vendorUid, saved.id);
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      if (e.threadType === 'group' && matchesClaimPhrase(text, codes[0] ?? null) && codes.length > 0) {
        try {
          const result = await claimJob({ jobCode: codes[0]!, vendorId, now, source: 'fallback_no_model' });
          await audit(sql, { actorType: 'system', actorId: vendorId, action: 'claim.fallback_no_model', target: codes[0]!, data: {} });
          if (result.won) {
            await sendDm(ctx.vendorUid, dmConversationId, `Bạn đã giữ ${codes[0]} (chế độ dự phòng).`);
          }
        } catch {
          // khong ro trang thai — im lang, timer/agent luot sau xu ly tiep.
        }
      } else {
        await audit(sql, { actorType: 'system', actorId: vendorId, action: 'agent.model_error', target: conversationId, data: {} });
        if (e.threadType === 'user') await sendDm(ctx.vendorUid, dmConversationId, BUSY_REPLY);
      }
      return;
    }
    throw err;
  }
};

