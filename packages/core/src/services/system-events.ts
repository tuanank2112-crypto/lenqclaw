// packages/core/src/services/system-events.ts — bus su kien he thong tren
// CHINH `inbound_events` (01-CONTRACTS §8.5): KHONG them bang, KHONG pg-boss.
// `sender_uid='system'` la gia tri DANH RIENG — `simInbound` va
// `/api/dev/sim/send` tu choi (sim/sim-transport.ts).

import { sql } from '../adapters/db.js';

export type SystemEvent =
  | { event: 'ambient_flush'; threadId: string }
  | { event: 'welcome_flush'; threadId: string; uids: string[] }
  | { event: 'unanswered_question'; threadId: string; groupMessageId: number }
  | { event: 'join_request'; threadId: string; uid: string }
  | { event: 'automation'; automationId: string; threadId: string | null }
  | { event: 'approval_executed'; approvalId: string; threadId: string };

/** Truong `data` cua payload = moi truong cua su kien tru `event` (01-CONTRACTS §8.2). */
function toData(e: SystemEvent): Record<string, unknown> {
  const { event: _event, ...rest } = e;
  void _event;
  return rest;
}

/**
 * `insert into inbound_events (...)` voi `sender_uid='system'`,
 * `zalo_msg_id='sys-<uuid>'`, `payload={kind:'system', event, data}`.
 * `thread_type` = 'group' khi co `threadId` (su kien cua nhom), nguoc lai
 * 'user' (`automation` khong gan nhom ⇒ DM owner). Tra id dong moi.
 * Chi `insert` + tra id — khong audit, khong logic nghiep vu (P01 khung).
 */
export async function enqueueSystemEvent(e: SystemEvent): Promise<number> {
  const ownerDm = e.event === 'automation' && e.threadId === null;
  let threadId: string;
  if (ownerDm) {
    // Su kien khong gan nhom => DM owner dau tien cua tai khoan (neu chua co owner: 'owner').
    const owners = await sql<{ zalo_uid: string }>(
      `select zalo_uid from account_owners where zalo_account_id = 'community' order by created_at, zalo_uid limit 1`
    );
    threadId = owners[0]?.zalo_uid ?? 'owner';
  } else {
    threadId = (e as { threadId: string }).threadId;
  }
  const threadType = ownerDm ? 'user' : 'group';
  const rows = await sql<{ id: number }>(
    `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload)
     values ('community', 'sys-' || gen_random_uuid(), $1, $2, 'system', false, $3)
     returning id`,
    [threadId, threadType, JSON.stringify({ kind: 'system', event: e.event, data: toData(e) })]
  );
  return rows[0]!.id;
}
