// packages/core/src/agent/resident-agent.ts — vong luot agent cu dan
// (SPEC-P03-Resident-Agent.md §10.1-§10.2, §10.8). `echoHandler`/
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
import { detectEmergency, redactPii, buildEmergencyReply, REGISTER_REPLY } from './pii.js';
import { RESIDENT_TOOLS, handoffToStaffTool } from './tools/index.js';
import { RESIDENT_SYSTEM_PROMPT } from './prompts/resident.js';
import type { ToolContext } from './tool-context.js';
import type { Party } from '../domain/types.js';

const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 20;

export const BUSY_REPLY = 'Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.';

function extractText(payload: Record<string, unknown>): string {
  const t = (payload as { text?: unknown }).text;
  return typeof t === 'string' ? t : '';
}

/** BB-08: danh tinh CHI tu `zalo_identities`, khong bao gio tu noi dung tin
 * nhan hay output LLM (vd chuoi "[userId: ...]" nguoi dung tu go). */
async function resolveParty(account: 'bql' | 'market', senderUid: string): Promise<Party> {
  const rows = await sql<{ party_type: Party['type']; party_id: string }>(
    `select party_type, party_id from zalo_identities where zalo_account_id = $1 and zalo_uid = $2`,
    [account, senderUid]
  );
  if (rows.length === 0) return { type: 'unknown', id: null, account };
  return { type: rows[0]!.party_type, id: rows[0]!.party_id, account };
}

async function getOrCreateConversation(
  account: 'bql' | 'market',
  threadId: string,
  partyType: Party['type'],
  partyId: string | null
): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into conversations (zalo_account_id, thread_id, party_type, party_id)
     values ($1,$2,$3,$4)
     on conflict (zalo_account_id, thread_id) do update set party_type = excluded.party_type, party_id = excluded.party_id
     returning id`,
    [account, threadId, partyType, partyId]
  );
  return rows[0]!.id;
}

async function saveMessage(
  conversationId: string,
  direction: 'in' | 'out',
  role: 'user' | 'assistant' | 'staff',
  text: string
): Promise<void> {
  await sql(`insert into messages (conversation_id, direction, role, content) values ($1,$2,$3,$4)`, [
    conversationId,
    direction,
    role,
    JSON.stringify({ text }),
  ]);
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

interface EmergencyArgs {
  conversationId: string;
  account: 'bql' | 'market';
  threadId: string;
  party: Party;
  text: string;
  term: string;
}

/** SPEC-P03 §1, §10.6(a): khan cap tat dinh, 0 lan goi model. */
async function handleEmergency(args: EmergencyArgs): Promise<void> {
  const { conversationId, account, threadId, party, text } = args;

  let apartmentId: string | null = null;
  let buildingId: string | null = null;
  if (party.type === 'resident' && party.id) {
    const rows = await sql<{ apartment_id: string; building_id: string }>(
      `select ra.apartment_id, a.building_id
       from resident_apartments ra join apartments a on a.id = ra.apartment_id
       where ra.resident_id = $1 order by ra.apartment_id limit 1`,
      [party.id]
    );
    apartmentId = rows[0]?.apartment_id ?? null;
    buildingId = rows[0]?.building_id ?? null;
  }

  const ticketRows = await sql<{ id: string }>(
    `insert into tickets (building_id, apartment_id, resident_id, kind, summary, status)
     values ($1,$2,$3,'emergency',$4,'open') returning id`,
    [buildingId, apartmentId, party.type === 'resident' ? party.id : null, text]
  );

  await audit(sql, {
    actorType: 'system',
    actorId: party.id,
    action: 'agent.emergency_detected',
    target: ticketRows[0]!.id,
    data: { term: args.term },
  });

  const hotline = process.env.BQL_HOTLINE?.trim() || '1900-0000';
  const reply = buildEmergencyReply(hotline);
  await sendToThread(account, threadId, conversationId, reply);
}

async function replyRegister(
  account: 'bql' | 'market',
  threadId: string,
  conversationId: string
): Promise<void> {
  await sendToThread(account, threadId, conversationId, REGISTER_REPLY);
}

async function buildToolContext(residentId: string, conversationId: string, latestText: string): Promise<ToolContext | null> {
  const rows = await sql<{ apartment_id: string; building_id: string }>(
    `select ra.apartment_id, a.building_id
     from resident_apartments ra join apartments a on a.id = ra.apartment_id
     where ra.resident_id = $1 order by ra.apartment_id limit 1`,
    [residentId]
  );
  if (rows.length === 0) return null;
  const openJobs = await sql<{ id: string }>(
    `select id from jobs where resident_id = $1 and status in ('drafting','awaiting_consent') order by created_at desc limit 1`,
    [residentId]
  );
  return {
    residentId,
    apartmentId: rows[0]!.apartment_id,
    buildingId: rows[0]!.building_id,
    conversationId,
    jobId: openJobs[0]?.id ?? null,
    latestText,
  };
}

async function loadHistory(conversationId: string): Promise<MessageParam[]> {
  const rows = await sql<{ role: 'user' | 'assistant' | 'staff'; content: { text?: string } }>(
    `select role, content from messages where conversation_id = $1 order by id desc limit ${HISTORY_LIMIT}`,
    [conversationId]
  );
  return rows
    .reverse()
    .map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: redactPii(r.content?.text ?? ''),
    }));
}

/** SPEC-P03 §10.2: `runResidentTurn` — vong toi da 6 luot tool. LLM khong
 * chay trong transaction DB (Đ17-a); moi tool tu quan ly transaction rieng. */
export async function runResidentTurn(
  ctx: ToolContext,
  text: string,
  account: 'bql' | 'market',
  threadId: string
): Promise<void> {
  const toolMap = new Map(RESIDENT_TOOLS.map((t) => [t.definition.name, t]));
  const toolDefs = RESIDENT_TOOLS.map((t) => t.definition);

  const history = await loadHistory(ctx.conversationId);
  const messages: MessageParam[] = [...history, { role: 'user', content: redactPii(text) }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await callModel({
        route: 'diagnose',
        system: RESIDENT_SYSTEM_PROMPT,
        messages,
        tools: toolDefs,
        conversationId: ctx.conversationId,
      });
    } catch {
      // ModelUnavailableError (01-CONTRACTS §9, SPEC-P03 §8): xin loi + hen
      // tra loi; khong retry trong luot nay (retry qua pg-boss ngoai P03).
      await sendToThread(account, threadId, ctx.conversationId, 'Em đang bận, sẽ trả lời trong vài phút.');
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
      }
      return;
    }

    // §10.8: MOI tool_result cua mot luot nam trong MOT message 'user'.
    const toolResults: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = toolMap.get(tu.name);
      try {
        if (!tool) throw new Error(`Tool khong ton tai: ${tu.name}`);
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

/** SPEC-P03 §10.2: (1) Party tu zalo_identities (BB-08); (2) khan cap chay
 * TRUOC moi loi goi LLM, ke ca khi Party khong phai cu dan active; (3) khong
 * phai cu dan active => REGISTER_REPLY, dung; (4) nguoc lai runResidentTurn. */
export const residentHandler: InboundHandler = async (e: InboundEvent) => {
  const account = e.zaloAccountId as 'bql' | 'market';
  const text = extractText(e.payload);
  const party = await resolveParty(account, e.senderUid);
  const conversationId = await getOrCreateConversation(account, e.threadId, party.type, party.id);
  await saveMessage(conversationId, 'in', 'user', text);

  const emergencyTerm = detectEmergency(text);
  if (emergencyTerm) {
    await handleEmergency({ conversationId, account, threadId: e.threadId, party, text, term: emergencyTerm });
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

  const ctx = await buildToolContext(party.id, conversationId, text);
  if (!ctx) {
    // Cu dan active nhung chua gan can ho — khong the mo cuoc, coi nhu chua
    // dang ky day du (khong nam trong 01-CONTRACTS, xu ly an toan).
    await replyRegister(account, e.threadId, conversationId);
    return;
  }

  await runResidentTurn(ctx, text, account, e.threadId);
};

/** Dieu phoi handler theo (account, threadType) — SPEC-P03 §10.1: "Account
 * bql + thread user => residentHandler". `market`/nhom khac van vong vong
 * lai (`echoHandler`) toi khi P05 thay. Goi tu apps/web (khong sua
 * `sim/sim-transport.ts`). */
export const routeInboundEvent: InboundHandler = async (e: InboundEvent) => {
  if (e.zaloAccountId === 'bql' && e.threadType === 'user') {
    return residentHandler(e);
  }
  return echoHandler(e);
};
