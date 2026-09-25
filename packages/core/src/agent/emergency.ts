// packages/core/src/agent/emergency.ts — logic dung chung cho DUONG KHAN
// CAP (SPEC-P03-Resident-Agent.md §11.1, §11.2): tao ticket `kind='emergency'`
// + gui `EMERGENCY_REPLY` qua outbox, VOI chong lap (cung mot cu dan da co
// ticket emergency con mo < 30 phut => khong tao lai, khong gui lai tin).
// Dung boi CA BA lop: lop 1 (tu khoa, resident-agent.ts), lop 2 (triage,
// resident-agent.ts), lop 3 (co model dat urgency='emergency', tool
// save_job_draft.ts) — mot noi DUY NHAT tranh sai lech hanh vi giua 3 lop.

import { sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { audit } from '../services/audit.js';
import { buildEmergencyReply, bqlHotline } from './pii.js';

const DEDUPE_WINDOW_MINUTES = 30;

/** Cu dan da co ticket emergency con `status='open'` tao trong
 * `DEDUPE_WINDOW_MINUTES` phut gan day chua. */
export async function hasRecentOpenEmergencyTicket(residentId: string | null): Promise<boolean> {
  if (!residentId) return false;
  const rows = await sql<{ c: number }>(
    `select count(*)::int as c from tickets
     where resident_id = $1 and kind = 'emergency' and status = 'open'
       and created_at > now() - ($2 || ' minutes')::interval`,
    [residentId, String(DEDUPE_WINDOW_MINUTES)]
  );
  return rows[0]!.c > 0;
}

export interface TriggerEmergencyArgs {
  conversationId: string;
  buildingId: string | null;
  apartmentId: string | null;
  residentId: string | null;
  summary: string;
  source: 'lexical' | 'triage' | 'model_flag';
}

export interface TriggerEmergencyResult {
  created: boolean;
  ticketId: string | null;
}

/** Tao ticket + gui EMERGENCY_REPLY (0 lan goi model — BB-06); tra
 * `created=false` neu bi chong lap (khong tao gi, khong gui gi them). */
export async function triggerEmergencyFlow(args: TriggerEmergencyArgs): Promise<TriggerEmergencyResult> {
  if (await hasRecentOpenEmergencyTicket(args.residentId)) {
    return { created: false, ticketId: null };
  }
  const conv = await sql<{ zalo_account_id: 'bql' | 'market'; thread_id: string }>(
    `select zalo_account_id, thread_id from conversations where id = $1`,
    [args.conversationId]
  );
  if (conv.length === 0) return { created: false, ticketId: null };

  const ticketRows = await sql<{ id: string }>(
    `insert into tickets (building_id, apartment_id, resident_id, kind, summary, status)
     values ($1,$2,$3,'emergency',$4,'open') returning id`,
    [args.buildingId, args.apartmentId, args.residentId, args.summary]
  );

  await audit(sql, {
    actorType: 'system',
    actorId: args.residentId,
    action: 'agent.emergency_detected',
    target: ticketRows[0]!.id,
    data: { source: args.source },
  });

  const reply = buildEmergencyReply(bqlHotline());
  await enqueue({
    zaloAccountId: conv[0]!.zalo_account_id,
    threadId: conv[0]!.thread_id,
    threadType: 'user',
    kind: 'text',
    body: { text: reply },
  });
  await sql(`insert into messages (conversation_id, direction, role, content) values ($1,'out','assistant',$2)`, [
    args.conversationId,
    JSON.stringify({ text: reply }),
  ]);

  return { created: true, ticketId: ticketRows[0]!.id };
}
