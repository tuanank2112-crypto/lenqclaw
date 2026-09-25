// packages/core/src/services/system-events.ts — bus su kien he thong tren
// CHINH `inbound_events` (SPEC-P05-Dispatch.md §10.8.2, Đ27): KHONG them
// bang, KHONG pg-boss. `sender_uid='system'` la gia tri DANH RIENG —
// `simInbound`/`/api/dev/sim/send` tu choi (sim/sim-transport.ts).

import { sql } from '../adapters/db.js';
import { audit } from './audit.js';

export interface EnqueueSystemEventArgs {
  event: 'access_approved';
  jobId: string;
}

/**
 * `insert into inbound_events (...)` voi `sender_uid='system'`,
 * `zalo_msg_id='sys-<uuid>'`, `payload={kind:'system', event, job_id}`.
 * `threadId` = uid Zalo cua tho duoc gan tren `market` — thieu (chua co
 * `zalo_identities`) => audit `system.vendor_no_identity`, KHONG ghi, tra 0.
 * Duoc runner/`processInbound` nhat nhu tin thuong (KHONG phai tin Zalo
 * that — chi la bus DB co san).
 */
export async function enqueueSystemEvent(args: EnqueueSystemEventArgs): Promise<number> {
  const jobRows = await sql<{ assigned_vendor_id: string | null }>(
    `select assigned_vendor_id from jobs where id = $1`,
    [args.jobId]
  );
  const vendorId = jobRows[0]?.assigned_vendor_id ?? null;
  if (!vendorId) {
    await audit(sql, {
      actorType: 'system',
      actorId: null,
      action: 'system.vendor_no_identity',
      target: args.jobId,
      data: { event: args.event, reason: 'no_assigned_vendor' },
    });
    return 0;
  }

  const identityRows = await sql<{ zalo_uid: string }>(
    `select zalo_uid from zalo_identities where zalo_account_id = 'market' and party_type = 'vendor' and party_id = $1`,
    [vendorId]
  );
  if (identityRows.length === 0) {
    await audit(sql, {
      actorType: 'system',
      actorId: vendorId,
      action: 'system.vendor_no_identity',
      target: args.jobId,
      data: { event: args.event },
    });
    return 0;
  }
  const threadId = identityRows[0]!.zalo_uid;

  const rows = await sql<{ id: number }>(
    `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload)
     values ('market', 'sys-' || gen_random_uuid(), $1, 'user', 'system', false, $2)
     returning id`,
    [threadId, JSON.stringify({ kind: 'system', event: args.event, job_id: args.jobId })]
  );
  return rows[0]!.id;
}
