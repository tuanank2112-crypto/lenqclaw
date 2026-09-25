// packages/core/src/agent/resident-agent.ts — vong luot agent cu dan
// (SPEC-P03-Resident-Agent.md §10.1-§10.2, §10.8, §11). `echoHandler`/
// `sim-transport.ts` KHONG bi sua (ghi chu trong file do) — dispatch giua
// `residentHandler` va `echoHandler` nam O DAY (`routeInboundEvent`), goi
// tu apps/web (SPEC-P03 §10.1: "account bql + thread user => residentHandler").

import type { ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql } from '../adapters/db.js';
import { callModel } from '../adapters/model.js';
import { enqueue, type InboundEvent } from '../adapters/transport.js';
import { audit } from '../services/audit.js';
import type { InboundHandler } from '../sim/sim-transport.js';
import { echoHandler } from '../sim/sim-transport.js';
import { vendorHandler } from './vendor-agent.js';
import { detectEmergency, redactPii, REGISTER_REPLY, bqlHotline, MODEL_DOWN_REPLY } from './pii.js';
import { triageMessage, type TriageResult } from './triage.js';
import { triggerEmergencyFlow } from './emergency.js';
import { RESIDENT_TOOLS, handoffToStaffTool } from './tools/index.js';
import { assertValidToolInput } from './tools/tool-kit.js';
import { buildResidentSystemPrompt } from './prompts/resident.js';
import type { ToolContext } from './tool-context.js';
import { resolveParty, getOrCreateConversation, saveMessage, loadHistory, maskForModel } from './conversation.js';
import type { JobDraft } from '../domain/types.js';
import { ModelUnavailableError } from '../domain/errors.js';

const MAX_TOOL_ROUNDS = 6;
const TRIAGE_HISTORY_LIMIT = 3;
const TRIAGE_EMERGENCY_MIN_DEFAULT = 0.5;

export const BUSY_REPLY = 'Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.';

function extractText(payload: Record<string, unknown>): string {
  const t = (payload as { text?: unknown }).text;
  return typeof t === 'string' ? t : '';
}

async function sendToThread(
  account: 'bql' | 'market',
  threadId: string,
  conversationId: string,
  text: string
): Promise<void> {
  await enqueue({ zaloAccountId: account, threadId, threadType: 'user', kind: 'text', body: { text } });
  await saveMessage(conversationId, 'out', 'assistant', text);
}

async function replyRegister(
  account: 'bql' | 'market',
  threadId: string,
  conversationId: string
): Promise<void> {
  await sendToThread(account, threadId, conversationId, REGISTER_REPLY);
}

async function loadResidentApartment(
  residentId: string
): Promise<{ apartmentId: string; buildingId: string } | null> {
  const rows = await sql<{ apartment_id: string; building_id: string }>(
    `select ra.apartment_id, a.building_id
     from resident_apartments ra join apartments a on a.id = ra.apartment_id
     where ra.resident_id = $1 order by ra.apartment_id limit 1`,
    [residentId]
  );
  if (rows.length === 0) return null;
  return { apartmentId: rows[0]!.apartment_id, buildingId: rows[0]!.building_id };
}

async function buildToolContext(
  residentId: string,
  apartmentId: string,
  buildingId: string,
  conversationId: string,
  latestText: string,
  latestMessageCreatedAt: string,
  triage: TriageResult | null
): Promise<ToolContext> {
  // §11.6 (G9): dua vao job 'drafting' da co (neu co) — khoa tao job moi
  // theo resident_id nam trong `save_job_draft.ts` (insertJob).
  const openJobs = await sql<{ id: string }>(
    `select id from jobs where resident_id = $1 and status in ('drafting','awaiting_consent') order by created_at desc limit 1`,
    [residentId]
  );
  return {
    residentId,
    apartmentId,
    buildingId,
    conversationId,
    jobId: openJobs[0]?.id ?? null,
    latestText,
    latestMessageCreatedAt,
    triage,
  };
}

async function loadOpenJobDraft(residentId: string): Promise<{ code: string; draft: JobDraft } | null> {
  const rows = await sql<{ code: string; draft: JobDraft }>(
    `select code, draft from jobs where resident_id = $1 and status in ('drafting','awaiting_consent')
     order by created_at desc limit 1`,
    [residentId]
  );
  return rows[0] ?? null;
}

async function loadCategories(): Promise<Array<{ code: string; name_vi: string }>> {
  return sql<{ code: string; name_vi: string }>(`select code, name_vi from job_categories order by code`);
}

interface HistoryRow {
  role: 'user' | 'assistant' | 'staff';
  content: { text?: string };
}

async function loadApartmentCodes(buildingId: string): Promise<string[]> {
  const rows = await sql<{ code: string }>(`select code from apartments where building_id = $1`, [buildingId]);
  return rows.map((r) => r.code);
}

async function loadRecentTextsForTriage(conversationId: string): Promise<string[]> {
  const rows = await sql<HistoryRow>(
    `select role, content from messages where conversation_id = $1 order by id desc limit ${TRIAGE_HISTORY_LIMIT}`,
    [conversationId]
  );
  return rows.reverse().map((r) => redactPii(r.content?.text ?? ''));
}

/** SPEC-P03 §11.1: nguong bat co khan cap cua lop 2 (hieu y). */
function triageEmergencyMin(): number {
  const raw = process.env.TRIAGE_EMERGENCY_MIN?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : TRIAGE_EMERGENCY_MIN_DEFAULT;
}

/** SPEC-P03 §10.2, §10.8: vong toi da 6 luot tool. LLM khong chay trong
 * transaction DB (Đ17-a); moi tool tu quan ly transaction rieng. */
export async function runResidentTurn(
  ctx: ToolContext,
  text: string,
  account: 'bql' | 'market',
  threadId: string,
  currentMessageId: number,
  categories: Array<{ code: string; name_vi: string }>
): Promise<void> {
  const toolMap = new Map(RESIDENT_TOOLS.map((t) => [t.definition.name, t]));
  const toolDefs = RESIDENT_TOOLS.map((t) => t.definition);
  const systemPrompt = buildResidentSystemPrompt(categories);
  const apartmentCodes = await loadApartmentCodes(ctx.buildingId);

  // N6: tin hien tai chi xuat hien DUNG MOT LAN trong `messages` — history
  // loai tru chinh no (`loadHistory` da `id <> currentMessageId`).
  const history = await loadHistory(ctx.conversationId, currentMessageId, apartmentCodes);

  // N7: JobDraft dang mo (da che PII) noi vao PHAN BIEN DOI, sau breakpoint
  // cache (mot khoi user rieng truoc tin hien tai — khong lam vo history).
  const draft = await loadOpenJobDraft(ctx.residentId);
  const draftMessages: MessageParam[] = draft
    ? [
        {
          role: 'user',
          content: `[Ngu canh he thong — JobDraft dang mo, ma cuoc ${draft.code}]: ${maskForModel(
            JSON.stringify(draft.draft),
            apartmentCodes
          )}`,
        },
        { role: 'assistant', content: 'Da nhan ngu canh phieu viec hien tai.' },
      ]
    : [];

  const jobCodes = draft ? [draft.code] : [];
  const messages: MessageParam[] = [
    ...history,
    ...draftMessages,
    { role: 'user', content: maskForModel(text, apartmentCodes, jobCodes) },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await callModel({
        route: 'diagnose',
        system: systemPrompt,
        messages,
        tools: toolDefs,
        conversationId: ctx.conversationId,
      });
    } catch (err) {
      if (!(err instanceof ModelUnavailableError)) {
        // G10: loi khac ModelUnavailableError van theo duong lui §11.12
        // NHUNG phai ghi audit rieng (khong nuot im).
        await audit(sql, {
          actorType: 'agent',
          actorId: ctx.residentId,
          action: 'agent.model_error',
          target: ctx.conversationId,
          data: { error: err instanceof Error ? err.name : String(err) },
        });
      }
      // SPEC-P03 §11.12 (Đ31): model sap (ModelUnavailableError HOAC loi
      // khac) => tra loi kem hotline BQL (CODE, khong phai prompt) + handoff
      // cho nguoi that ('model_unavailable'). Chong lap: `handoff_to_staff`
      // dat lai `human_takeover_until`, luot ke tiep bi N3 (§11.6) chan
      // TRUOC khi vao lai `runResidentTurn` — khong can kiem rieng o day.
      await sendToThread(account, threadId, ctx.conversationId, MODEL_DOWN_REPLY(bqlHotline()));
      await handoffToStaffTool.run(ctx, { reason: 'model_unavailable' });
      return;
    }

    if (result.message.stop_reason === 'refusal') {
      await handoffToStaffTool.run(ctx, { reason: 'model_refusal' });
      await sendToThread(account, threadId, ctx.conversationId, BUSY_REPLY);
      return;
    }

    // §10.8: noi NGUYEN response.content (ke ca thinking) lam luot assistant.
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
        await sendToThread(account, threadId, ctx.conversationId, textOut);
      } else {
        // N2: vong ket thuc ma KHONG co text (rong, hoac stop_reason
        // max_tokens) => BUSY_REPLY + handoff_to_staff('agent_empty'). Moi
        // tin vao nhan dung MOT tin ra.
        await handoffToStaffTool.run(ctx, { reason: 'agent_empty' });
        await sendToThread(account, threadId, ctx.conversationId, BUSY_REPLY);
      }
      return;
    }

    // §10.8: MOI tool_result cua mot luot nam trong MOT message 'user'.
    const toolResults: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = toolMap.get(tu.name);
      try {
        if (!tool) throw new Error(`Tool khong ton tai: ${tu.name}`);
        // 01-CONTRACTS §2b: Gemini khong co `strict` cap API => tu kiem
        // input theo input_schema TRUOC khi chay tool.
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

  // Het 6 vong ma chua co text cuoi (SPEC-P03 §10.2, ca §10.6-i).
  await handoffToStaffTool.run(ctx, { reason: 'agent_loop_limit' });
  await sendToThread(account, threadId, ctx.conversationId, BUSY_REPLY);
}

/** SPEC-P03 §10.2, §11: (1) Party tu zalo_identities (BB-08); (2) khan cap
 * (lop 1 tu khoa + lop 2 hieu y) chay TRUOC moi loi goi LLM chinh, ke ca khi
 * Party khong phai cu dan active; (3) N11: thread da gan nguoi khac => im,
 * 0 model; (4) N3: dang human_takeover => im, 0 model (tru khan cap); (5)
 * khong phai cu dan active => REGISTER_REPLY, dung; (6) nguoc lai runResidentTurn. */
export const residentHandler: InboundHandler = async (e: InboundEvent) => {
  const account = e.zaloAccountId as 'bql' | 'market';
  const text = extractText(e.payload);
  const party = await resolveParty(account, e.senderUid);
  const { conversation, mismatch } = await getOrCreateConversation(account, e.threadId, party);
  const conversationId = conversation.id;

  // Lop 1 — luoi tat dinh, KHONG goi model, chay TRUOC TAT CA (BB-06).
  const emergencyTerm = detectEmergency(text);
  if (emergencyTerm) {
    await saveMessage(conversationId, 'in', 'user', text);
    let apartmentId: string | null = null;
    let buildingId: string | null = null;
    if (party.type === 'resident' && party.id) {
      const loc = await loadResidentApartment(party.id);
      apartmentId = loc?.apartmentId ?? null;
      buildingId = loc?.buildingId ?? null;
    }
    await triggerEmergencyFlow({
      conversationId,
      buildingId,
      apartmentId,
      residentId: party.type === 'resident' ? party.id : null,
      summary: text,
      source: 'lexical',
    });
    return;
  }

  // N11: thread da gan cho NGUOI KHAC — khong nap lich su, 0 lan goi model.
  if (mismatch) {
    await saveMessage(conversationId, 'in', 'user', text);
    await audit(sql, {
      actorType: 'system',
      actorId: party.id,
      action: 'conversation.party_mismatch',
      target: conversationId,
      data: {},
    });
    await sendToThread(account, e.threadId, conversationId, BUSY_REPLY);
    return;
  }

  // Lop 2 — hieu y bang model (§11.10). Chi cham PII TRUOC khi gui.
  const recentForTriage = await loadRecentTextsForTriage(conversationId);
  const triage = await triageMessage(redactPii(text), recentForTriage, conversationId);
  const saved = await saveMessage(conversationId, 'in', 'user', text, triage ? { triage } : {});

  if (triage && triage.emergency !== null && triage.emergency_confidence >= triageEmergencyMin()) {
    let apartmentId: string | null = null;
    let buildingId: string | null = null;
    if (party.type === 'resident' && party.id) {
      const loc = await loadResidentApartment(party.id);
      apartmentId = loc?.apartmentId ?? null;
      buildingId = loc?.buildingId ?? null;
    }
    await triggerEmergencyFlow({
      conversationId,
      buildingId,
      apartmentId,
      residentId: party.type === 'resident' ? party.id : null,
      summary: text,
      source: 'triage',
    });
    return;
  }
  if (!triage) {
    await audit(sql, {
      actorType: 'system',
      actorId: party.id,
      action: 'triage.unavailable',
      target: conversationId,
      data: {},
    });
  }

  // N3: dang trong `human_takeover_until` => luu tin, KHONG goi model,
  // KHONG tra loi (tru duong khan cap da xu ly o tren).
  if (conversation.human_takeover_until && new Date(conversation.human_takeover_until) > new Date()) {
    return;
  }

  if (party.type !== 'resident' || !party.id) {
    await replyRegister(account, e.threadId, conversationId);
    return;
  }

  const residentRows = await sql<{ status: string }>(`select status from residents where id = $1`, [party.id]);
  if (residentRows.length === 0 || residentRows[0]!.status !== 'active') {
    await replyRegister(account, e.threadId, conversationId);
    return;
  }

  const location = await loadResidentApartment(party.id);
  if (!location) {
    // Cu dan active nhung chua gan can ho — khong the mo cuoc, coi nhu chua
    // dang ky day du (khong nam trong 01-CONTRACTS, xu ly an toan).
    await replyRegister(account, e.threadId, conversationId);
    return;
  }

  const ctx = await buildToolContext(
    party.id,
    location.apartmentId,
    location.buildingId,
    conversationId,
    text,
    saved.createdAt,
    triage
  );
  const categories = await loadCategories();
  await runResidentTurn(ctx, text, account, e.threadId, saved.id, categories);
};

/** Dieu phoi handler theo (account, threadType) — SPEC-P03 §10.1 + Đ27
 * (SPEC-P05-Dispatch.md §10.1): "Account bql + thread user => residentHandler";
 * account `market` (DM lan nhom) => `vendorHandler` (P05-C). Goi tu apps/web
 * (khong sua `sim/sim-transport.ts`). */
export const routeInboundEvent: InboundHandler = async (e: InboundEvent) => {
  if (e.zaloAccountId === 'bql' && e.threadType === 'user') {
    return residentHandler(e);
  }
  if (e.zaloAccountId === 'market') {
    return vendorHandler(e);
  }
  return echoHandler(e);
};
