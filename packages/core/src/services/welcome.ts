// packages/core/src/services/welcome.ts — chao thanh vien moi (SPEC-P05 §7). Su kien `join` ⇒ upsert thanh vien (welcomed_at=null)
// + danh dau phien `welcome_pending_since`; timer `flushWelcomes` gom trong cua so `WELCOME_DEBOUNCE_SEC` roi phat DUNG MOT su kien
// `welcome_flush` cho ca nhom nguoi do. `welcomed_at` dat TRUOC luot (khong bao gio chao hai lan).

import { sql } from '../adapters/db.js';
import type { GroupRow } from '../agent/community/graph/state.js';
import type { AccountId } from '../domain/types.js';
import { audit } from './audit.js';
import type { CommunityConfig } from './community-config.js';
import { enqueueSystemEvent } from './system-events.js';

/** `join`: upsert `group_members(joined_at=now, left_at=null, welcomed_at=null)`; nhóm bật chào ⇒ `welcome_pending_since = coalesce(.., now)`. */
export async function recordMemberJoin(args: {
  account: AccountId;
  group: GroupRow;
  uids: readonly string[];
  names: readonly string[];
  now: Date;
}): Promise<number> {
  const { account, group, now } = args;
  let n = 0;
  for (const [i, uid] of args.uids.entries()) {
    if (uid.trim() === '') continue;
    const name = args.names[i]?.trim() ? args.names[i]!.trim().slice(0, 200) : null;
    await sql(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name, joined_at, left_at, welcomed_at)
       values ($1,$2,$3,'member',$4,$5,null,null)
       on conflict (zalo_account_id, thread_id, zalo_uid)
       do update set joined_at = $5, left_at = null, welcomed_at = null, display_name = coalesce($4, group_members.display_name)`,
      [account, group.threadId, uid, name, now]
    );
    n++;
  }
  if (n > 0 && group.welcomeEnabled) {
    await sql(
      `insert into group_sessions (zalo_account_id, thread_id, welcome_pending_since) values ($1,$2,$3)
       on conflict (zalo_account_id, thread_id)
       do update set welcome_pending_since = coalesce(group_sessions.welcome_pending_since, $3)`,
      [account, group.threadId, now]
    );
  }
  return n;
}

/** `leave` / `remove_member`: đánh dấu rời nhóm. */
export async function recordMemberLeave(args: { account: AccountId; threadId: string; uids: readonly string[]; now: Date }): Promise<number> {
  if (args.uids.length === 0) return 0;
  const rows = await sql<{ zalo_uid: string }>(
    `update group_members set left_at = $4
      where zalo_account_id = $1 and thread_id = $2 and zalo_uid = any($3::text[]) and left_at is null returning zalo_uid`,
    [args.account, args.threadId, args.uids, args.now]
  );
  return rows.length;
}

/**
 * Timer #3 (SPEC-P07 §2): phiên `welcome_pending_since <= now - WELCOME_DEBOUNCE_SEC` ⇒ uids = thành viên chưa chào, vào trong
 * `WELCOME_WINDOW_MIN`, còn trong nhóm ⇒ `welcome_flush` (1 sự kiện/nhóm) + `welcomed_at = now` TRƯỚC lượt.
 * Bỏ qua thread đang chạy (`busyThreads`) hoặc đã có `welcome_flush` chưa xử lý. Tra so nhom da phat su kien.
 */
export async function flushWelcomes(now: Date, cfg: CommunityConfig, ctx: { busyThreads?: ReadonlySet<string> } = {}): Promise<number> {
  const due = await sql<{ zalo_account_id: AccountId; thread_id: string; enabled: boolean; welcome_enabled: boolean; pending_since: string }>(
    `select s.zalo_account_id, s.thread_id, g.enabled, g.welcome_enabled, s.welcome_pending_since::text as pending_since
       from group_sessions s join zalo_groups g on g.zalo_account_id = s.zalo_account_id and g.thread_id = s.thread_id
      where s.welcome_pending_since is not null and s.welcome_pending_since <= $1::timestamptz - make_interval(secs => $2)
      order by s.welcome_pending_since`,
    [now, cfg.welcomeDebounceSec]
  );
  let sent = 0;
  for (const s of due) {
    // D41/F16: xoa bang CAS theo gia tri da doc VA (khi `guard`) chi khi khong con thanh vien chua chao trong cua so: `join` den
    // giua chung ⇒ phien van cho, lan flush sau van chao. (`recordMemberJoin` giu coalesce(pending, now) nen gia tri cot khong doi
    // khi co join moi — can them dieu kien thanh vien.)
    const clear = (guard = true) =>
      sql(
        `update group_sessions set welcome_pending_since = null
          where zalo_account_id = $1 and thread_id = $2 and welcome_pending_since = $3::timestamptz
            and (not $6::boolean or not exists (select 1 from group_members m
                  where m.zalo_account_id = $1 and m.thread_id = $2 and m.welcomed_at is null and m.left_at is null
                    and m.joined_at > $4::timestamptz - make_interval(mins => $5)))`,
        [s.zalo_account_id, s.thread_id, s.pending_since, now, cfg.welcomeWindowMin, guard]
      );
    if (!s.enabled || !s.welcome_enabled) {
      await clear(false);
      continue;
    }
    if (ctx.busyThreads?.has(s.thread_id)) continue;
    const inflight = await sql(
      `select 1 from inbound_events where zalo_account_id = $1 and thread_id = $2 and sender_uid = 'system' and processed_at is null
          and payload->>'event' = 'welcome_flush' limit 1`,
      [s.zalo_account_id, s.thread_id]
    );
    if (inflight.length > 0) continue;

    const marked = await sql<{ zalo_uid: string }>(
      `update group_members set welcomed_at = $3
        where zalo_account_id = $1 and thread_id = $2 and welcomed_at is null and left_at is null
          and joined_at > $3::timestamptz - make_interval(mins => $4)
        returning zalo_uid`,
      [s.zalo_account_id, s.thread_id, now, cfg.welcomeWindowMin]
    );
    if (marked.length === 0) {
      await clear();
      continue;
    }
    const uids = marked.map((m) => m.zalo_uid).sort();
    try {
      await enqueueSystemEvent({ event: 'welcome_flush', threadId: s.thread_id, uids });
    } catch (err) {
      // khong de thanh vien bi danh dau "da chao" ma khong co su kien
      await sql(`update group_members set welcomed_at = null where zalo_account_id = $1 and thread_id = $2 and zalo_uid = any($3::text[])`, [s.zalo_account_id, s.thread_id, uids]);
      throw err;
    }
    await clear();
    await audit(sql, { actorType: 'system', actorId: null, action: 'welcome.flush', target: s.thread_id, data: { count: uids.length } });
    sent++;
  }
  return sent;
}
