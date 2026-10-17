// packages/core/src/services/join-requests.ts — duyet vao nhom (SPEC-P05 §6, D05b). 3 policy: auto_approve (0 model) ·
// manual (the duyet `approve_join` / uid) · agent_review (su kien he thong ⇒ luot `group_join_review`; model im/sap ⇒ CHO VAO — Q9).
// Moi quyet dinh ghi `join_requests.decision/decided_by/decided_at/reason` + audit `join.<decision>`. Khong ghi noi dung tin.

import { sql } from '../adapters/db.js';
import type { GroupRow } from '../agent/community/graph/state.js';
import { ActionNotPermittedError, InvalidToolInputError } from '../domain/errors.js';
import type { AccountId } from '../domain/types.js';
import { createApproval } from './approvals.js';
import { audit } from './audit.js';
import { readCommunityConfig } from './community-config.js';
import { enqueueAction } from './outbox-actions.js';
import { enqueueSystemEvent } from './system-events.js';

export const JOIN_REJECT_REASON_MIN = 10;

export interface JoinRequestEventArgs {
  account: AccountId;
  group: GroupRow;
  uids: readonly string[];
  names: readonly string[];
  now: Date;
  inboundEventId?: number;
}

/** Dong `pending` (neu da co dong mo cho uid nay ⇒ dung lai, khong tao trung). Tra true neu moi tao. */
async function openRequest(account: AccountId, threadId: string, uid: string, name: string | null, now: Date): Promise<boolean> {
  const rows = await sql<{ id: number }>(
    `insert into join_requests (zalo_account_id, thread_id, zalo_uid, display_name, requested_at)
     values ($1,$2,$3,$4,$5) on conflict (zalo_account_id, thread_id, zalo_uid) where decision = 'pending' do nothing returning id::int as id`,
    [account, threadId, uid, name, now]
  );
  return rows.length > 0;
}

/** CAS pending → approved|rejected. Tra true neu doi duoc. */
export async function resolveJoinRequest(
  account: AccountId,
  threadId: string,
  uid: string,
  decision: 'approved' | 'rejected',
  by: string,
  reason: string | null,
  now: Date
): Promise<boolean> {
  const rows = await sql<{ id: number }>(
    `update join_requests set decision = $4, decided_by = $5, decided_at = $6, reason = $7
      where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and decision = 'pending' returning id::int as id`,
    [account, threadId, uid, decision, by, now, reason]
  );
  if (rows.length === 0) return false;
  await audit(sql, { actorType: by === 'agent' ? 'agent' : 'system', actorId: by, action: `join.${decision}`, target: threadId, data: { uid } });
  return true;
}

/** §6: sự kiện `join_request` ở nhóm `enabled` theo `join_policy`. Nhóm chưa khai / tắt ⇒ bỏ qua (caller audit). */
export async function handleJoinRequestEvent(a: JoinRequestEventArgs): Promise<{ policy: string; handled: number }> {
  const { account, group, uids, now } = a;
  const nameOf = (i: number): string | null => (a.names[i] && a.names[i]!.trim() !== '' ? a.names[i]!.trim().slice(0, 200) : null);
  let handled = 0;

  if (group.joinPolicy === 'auto_approve') {
    const accepted: string[] = [];
    for (const [i, uid] of uids.entries()) {
      await sql(
        `insert into join_requests (zalo_account_id, thread_id, zalo_uid, display_name, requested_at, decision, decided_by, decided_at)
         values ($1,$2,$3,$4,$5,'approved','policy',$5)`,
        [account, group.threadId, uid, nameOf(i), now]
      );
      await audit(sql, { actorType: 'system', actorId: 'policy', action: 'join.approved', target: group.threadId, data: { uid } });
      accepted.push(uid);
    }
    // dong `pending` cu cua cac uid nay (neu co) cung duoc dong
    if (accepted.length > 0) {
      await sql(
        `update join_requests set decision = 'approved', decided_by = 'policy', decided_at = $4
          where zalo_account_id = $1 and thread_id = $2 and zalo_uid = any($3::text[]) and decision = 'pending'`,
        [account, group.threadId, accepted, now]
      );
      await enqueueAction({ account, threadId: group.threadId, action: 'review_join', uids: accepted, approve: true, ...(a.inboundEventId !== undefined ? { inboundEventId: a.inboundEventId } : {}) });
      handled = accepted.length;
    }
    return { policy: 'auto_approve', handled };
  }

  for (const [i, uid] of uids.entries()) {
    const fresh = await openRequest(account, group.threadId, uid, nameOf(i), now);
    if (group.joinPolicy === 'manual') {
      await createApproval({
        account,
        kind: 'approve_join',
        threadId: group.threadId,
        targetUid: uid,
        reason: 'Có người xin vào nhóm, chính sách nhóm là duyệt thủ công.',
        payload: { display_name: nameOf(i) },
        requestedBy: 'moderation',
        now,
      });
      handled++;
    } else if (fresh) {
      // agent_review: moi uid mot luot (su kien he thong ⇒ node `system_event` ⇒ `group_join_review`)
      await enqueueSystemEvent({ event: 'join_request', threadId: group.threadId, uid });
      handled++;
    }
  }
  return { policy: group.joinPolicy, handled };
}

/** Tool `review_join_request` (policy agent_review): approve ⇒ `review_join approve:true`; reject cần reason ≥ 10 ký tự. */
export async function reviewJoinByAgent(args: {
  account: AccountId;
  group: GroupRow;
  uid: string;
  decision: 'approve' | 'reject';
  reason: string;
  now: Date;
  inboundEventId?: number;
}): Promise<{ decision: 'approved' | 'rejected' }> {
  if (args.group.joinPolicy !== 'agent_review') throw new ActionNotPermittedError('Nhóm này không dùng chính sách agent_review.');
  const reason = args.reason.trim();
  if (args.decision === 'reject' && reason.length < JOIN_REJECT_REASON_MIN) {
    throw new InvalidToolInputError(`Từ chối cần lý do rõ ràng (≥ ${JOIN_REJECT_REASON_MIN} ký tự).`);
  }
  const to = args.decision === 'approve' ? 'approved' : 'rejected';
  const changed = await resolveJoinRequest(args.account, args.group.threadId, args.uid, to, 'agent', reason.slice(0, 500) || null, args.now);
  if (!changed) throw new ActionNotPermittedError('Không có yêu cầu vào nhóm đang chờ cho uid này.');
  await enqueueAction({
    account: args.account,
    threadId: args.group.threadId,
    action: 'review_join',
    uids: [args.uid],
    approve: args.decision === 'approve',
    ...(args.inboundEventId !== undefined ? { inboundEventId: args.inboundEventId } : {}),
  });
  return { decision: to };
}

/** Q9 (node `deliver`, delivery `join_default`): model im / sập / chạm trần ⇒ CHO VÀO. Chỉ khi vẫn còn `pending`. */
export async function applyJoinDefault(args: { account: AccountId; threadId: string; uid: string; now: Date; inboundEventId?: number }): Promise<boolean> {
  const changed = await resolveJoinRequest(args.account, args.threadId, args.uid, 'approved', 'default', 'model_silent', args.now);
  if (!changed) return false;
  await enqueueAction({
    account: args.account,
    threadId: args.threadId,
    action: 'review_join',
    uids: [args.uid],
    approve: true,
    ...(args.inboundEventId !== undefined ? { inboundEventId: args.inboundEventId } : {}),
  });
  return true;
}

/** Số lần uid đã xin vào nhóm này trước yêu cầu hiện tại (ngữ cảnh cho lượt agent_review). */
export async function priorJoinRequestCount(account: AccountId, threadId: string, uid: string): Promise<number> {
  const rows = await sql<{ c: number }>(
    `select count(*)::int as c from join_requests where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and decision <> 'pending'`,
    [account, threadId, uid]
  );
  return rows[0]?.c ?? 0;
}

/** Timer (`onlyThreadIds`: chỉ để test — G34): `pending` quá `JOIN_REQUEST_TTL_HOURS` ⇒ `expired`. Tra số dòng. */
export async function expireJoinRequests(now: Date, opts: { onlyThreadIds?: readonly string[] } = {}): Promise<number> {
  const cfg = readCommunityConfig();
  const rows = await sql<{ thread_id: string; zalo_uid: string }>(
    `update join_requests set decision = 'expired', decided_by = 'timer', decided_at = $1
      where decision = 'pending' and requested_at <= $1::timestamptz - make_interval(hours => $2)
        and ($3::text[] is null or thread_id = any($3::text[])) returning thread_id, zalo_uid`,
    [now, cfg.joinRequestTtlHours, opts.onlyThreadIds ? [...opts.onlyThreadIds] : null]
  );
  for (const r of rows) await audit(sql, { actorType: 'system', actorId: 'timer', action: 'join.expired', target: r.thread_id, data: { uid: r.zalo_uid } });
  return rows.length;
}

/** Ngữ cảnh lượt `group_join_review`: tên hiển thị (không tin cậy) của yêu cầu đang chờ + số lần đã xin trước đó. */
export async function loadJoinReviewInfo(account: AccountId, threadId: string, uid: string): Promise<{ displayName: string | null; prior: number }> {
  const cur = await sql<{ display_name: string | null }>(
    `select display_name from join_requests where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 order by (decision = 'pending') desc, id desc limit 1`,
    [account, threadId, uid]
  );
  return { displayName: cur[0]?.display_name ?? null, prior: await priorJoinRequestCount(account, threadId, uid) };
}
