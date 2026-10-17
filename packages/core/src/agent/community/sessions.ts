// packages/core/src/agent/community/sessions.ts — phien nhom / hoi thoai (SPEC-P03 §4.2).
// D28: moc danh dau phien la node `prepare`, TRUOC loi goi model dau tien (luot loi van tinh vao
// `turns_in_window` — dung chi phi; khong de `pending_since` mo lam timer flush lap moi 20 s).
// D31: `last_seen_message_id` chi tang (`greatest`) — hai luot cung nhom ket thuc lech thu tu khong lui moc.

import { sql } from '../../adapters/db.js';
import { getOrCreateConversation } from '../conversation.js';
import type { AccountId, TurnKind } from '../../domain/types.js';

/** Tin ambient dau tien chua xu ly: `pending_since = coalesce(pending_since, now())`. */
export async function markAmbientPending(account: AccountId, threadId: string): Promise<void> {
  await sql(
    `insert into group_sessions (zalo_account_id, thread_id, pending_since)
     values ($1,$2, now())
     on conflict (zalo_account_id, thread_id)
     do update set pending_since = coalesce(group_sessions.pending_since, now())`,
    [account, threadId]
  );
}

/**
 * `prepare` danh dau phien TRUOC model. Chi hai loai luot cham `group_sessions`:
 *  - `group_mention`: tin ambient dang cho duoc coi la da thay (nam trong `recent`) ⇒ `pending_since=null`.
 *  - `group_ambient_flush`: nhu tren + `turns_in_window++` (cua so truot 1 gio, reset khi qua han).
 */
export async function markSessionAtPrepare(args: {
  account: AccountId;
  threadId: string;
  kind: TurnKind;
  maxSeenId: number;
  now: Date;
}): Promise<void> {
  if (args.kind === 'group_mention') {
    await sql(
      `insert into group_sessions (zalo_account_id, thread_id, pending_since, last_seen_message_id, last_turn_at)
       values ($1,$2,null,$3,$4)
       on conflict (zalo_account_id, thread_id)
       do update set pending_since = null,
                     last_seen_message_id = greatest(group_sessions.last_seen_message_id, $3),
                     last_turn_at = $4`,
      [args.account, args.threadId, args.maxSeenId, args.now]
    );
    return;
  }
  if (args.kind === 'group_ambient_flush') {
    await sql(
      `insert into group_sessions (zalo_account_id, thread_id, pending_since, last_seen_message_id, last_turn_at, turns_window_start, turns_in_window)
       values ($1,$2,null,$3,$4,$4,1)
       on conflict (zalo_account_id, thread_id)
       do update set pending_since = null,
                     last_seen_message_id = greatest(group_sessions.last_seen_message_id, $3),
                     last_turn_at = $4,
                     turns_window_start = case when group_sessions.turns_window_start is null
                                                 or $4::timestamptz - group_sessions.turns_window_start >= interval '1 hour'
                                               then $4::timestamptz else group_sessions.turns_window_start end,
                     turns_in_window = case when group_sessions.turns_window_start is null
                                                 or $4::timestamptz - group_sessions.turns_window_start >= interval '1 hour'
                                            then 1 else group_sessions.turns_in_window + 1 end`,
      [args.account, args.threadId, args.maxSeenId, args.now]
    );
  }
}

export async function getLastSeenMessageId(account: AccountId, threadId: string): Promise<number> {
  const rows = await sql<{ last_seen_message_id: number }>(
    `select last_seen_message_id::int as last_seen_message_id from group_sessions where zalo_account_id = $1 and thread_id = $2`,
    [account, threadId]
  );
  return rows[0]?.last_seen_message_id ?? 0;
}

/** Hoi thoai nhom (mot dong/nhom) — `messages` chi ghi tin agent GUI va text cuoi rieng tu. */
export async function ensureGroupConversation(account: AccountId, threadId: string): Promise<string> {
  const c = await getOrCreateConversation(account, threadId, 'group', 'group');
  return c.id;
}
