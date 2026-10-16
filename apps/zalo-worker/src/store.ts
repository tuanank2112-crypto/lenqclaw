// apps/zalo-worker/src/store.ts — moi cau SQL cua worker. Ket noi DB CHI qua
// `sql` cua @lenqclaw/core (BB-07). Worker KHONG tu chen dong outbox: tin moi
// (doan tach, "da xem") di qua `enqueue` cua core (BB-04).

import { audit, enqueue, sql, tx, type SessionState } from '@lenqclaw/core';
import type { AccountId } from './config.js';
import { buildSplitBodies } from './pacer-policy.js';

export interface AccountRow {
  id: AccountId;
  session_enc: Buffer | null;
  session_state: SessionState;
  updated_at: string;
  login_requested_at: string | null;
}

export async function loadAccount(id: AccountId): Promise<AccountRow | null> {
  const rows = await sql<AccountRow>(
    `select id, session_enc, session_state, updated_at::text as updated_at, login_requested_at::text as login_requested_at
     from zalo_accounts where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function setState(id: AccountId, state: SessionState): Promise<void> {
  await sql(`update zalo_accounts set session_state = $2 where id = $1`, [id, state]);
}

/** Compare-and-set `session_enc` theo `updated_at` (SPEC-P02 §2.4). Tra
 * `updated_at` moi, hoac `null` khi dong da bi ben khac ghi truoc. */
export async function saveSessionCas(id: AccountId, enc: Buffer, expectedUpdatedAt: string): Promise<string | null> {
  const rows = await sql<{ updated_at: string }>(
    `update zalo_accounts set session_enc = $2, updated_at = clock_timestamp()
     where id = $1 and updated_at = $3::timestamptz
     returning updated_at::text as updated_at`,
    [id, enc, expectedUpdatedAt]
  );
  return rows[0]?.updated_at ?? null;
}

/** Nhan yeu cau dang nhap QR tu web (cot `login_requested_at`, §9.2). */
export async function claimLoginRequest(id: AccountId): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `update zalo_accounts set login_requested_at = null, session_state = 'qr_pending',
       qr_data_url = null, qr_expires_at = null, qr_state = null
     where id = $1 and login_requested_at is not null returning id`,
    [id]
  );
  return rows.length > 0;
}

export async function setQr(id: AccountId, dataUrl: string): Promise<void> {
  await sql(
    `update zalo_accounts set qr_data_url = $2, qr_expires_at = now() + interval '3 minutes',
       session_state = 'qr_pending', qr_state = 'waiting_scan'
     where id = $1`,
    [id, dataUrl]
  );
}

export type QrState = 'waiting_scan' | 'scanned' | 'expired' | 'declined';

/** Su kien QR khac 'qr' (zca-js) ⇒ cot `qr_state` (§9.8): scanned/expired/declined. */
export async function setQrState(id: AccountId, state: QrState): Promise<void> {
  await sql(`update zalo_accounts set qr_state = $2 where id = $1`, [id, state]);
}

/** Xoa anh QR (khong dung qr_state) — dung khi luong QR that bai TRUOC khi co
 * ket qua cuoi cung: giu lai qr_state='expired'/'declined' de trang /zalo van
 * hien dung nut "Lay ma QR moi" (§9.8) thay vi roi ve idle. */
export async function clearQrImage(id: AccountId): Promise<void> {
  await sql(`update zalo_accounts set qr_data_url = null, qr_expires_at = null where id = $1`, [id]);
}

/** Dang nhap xong ⇒ xoa anh QR + qr_state (§9.8: "dang nhap xong ⇒ null"). */
export async function clearQr(id: AccountId): Promise<void> {
  await sql(`update zalo_accounts set qr_data_url = null, qr_expires_at = null, qr_state = null where id = $1`, [id]);
}

/** Nhan yeu cau dang xuat tu web (cot `logout_requested_at`, §9.8). session_enc/qr_*
 * da duoc route web xoa ngay (tranh phien mo coi khi worker khong chay); worker
 * chi can bao da xu ly xong yeu cau (dut ket noi in-memory o AccountSession.logout). */
export async function claimLogoutRequest(id: AccountId): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `update zalo_accounts set logout_requested_at = null where id = $1 and logout_requested_at is not null returning id`,
    [id]
  );
  return rows.length > 0;
}

/** Xoa phien + trang thai QR, dat logged_out (§9.8). Idempotent — worker goi lai
 * de dam bao du worker co chay hay khong, phien khong bao gio mo coi. */
export async function clearSessionOnLogout(id: AccountId): Promise<void> {
  await sql(
    `update zalo_accounts set session_enc = null, qr_data_url = null, qr_expires_at = null,
       qr_state = null, session_state = 'logged_out', logout_requested_at = null
     where id = $1`,
    [id]
  );
}

export async function touchEvent(id: AccountId): Promise<void> {
  await sql(`update zalo_accounts set last_event_at = now() where id = $1`, [id]);
}

export type AlertKind =
  | 'kicked'
  | 'dead'
  | 'cookie_expired'
  | 'session_decrypt_failed'
  | 'qr_failed'
  | 'qr_probe_failed'
  | 'rate_limited'
  | 'session_cas_conflict'
  | 'deputy_missing';

/** Bao dong giai doan 1 = session_state + banner /zalo + audit 'zalo.alert' (§9.1). */
export async function alert(id: AccountId, kind: AlertKind, data: Record<string, unknown> = {}): Promise<void> {
  await audit(sql, {
    actorType: 'system',
    actorId: 'zalo-worker',
    action: 'zalo.alert',
    target: id,
    data: { kind, ...data },
  });
}

export interface InboundInsert {
  account: AccountId;
  msgId: string;
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  isSelf: boolean;
  payload: Record<string, unknown>;
  /** Tin `is_self` ghi voi processed_at=now(): luu vet, runner khong xu ly. */
  markProcessed: boolean;
}

/** `INSERT … ON CONFLICT (zalo_account_id, zalo_msg_id) DO NOTHING` (§3.1). */
export async function insertInbound(r: InboundInsert): Promise<number | null> {
  const rows = await sql<{ id: number }>(
    `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, processed_at)
     values ($1,$2,$3,$4,$5,$6,$7, case when $8::boolean then now() else null end)
     on conflict (zalo_account_id, zalo_msg_id) do nothing
     returning id`,
    [r.account, r.msgId, r.threadId, r.threadType, r.senderUid, r.isSelf, JSON.stringify(r.payload), r.markProcessed]
  );
  return rows[0]?.id ?? null;
}

/** Tin `is_self` co phai do bot gui (khop outbox) khong: khop `zalo_msg_id`,
 * hoac dang `sending` cung thread + cung noi dung (tin vong ve truoc khi
 * sendMessage kip tra msgId). */
export async function isBotEcho(account: AccountId, threadId: string, msgId: string, text: string | null): Promise<boolean> {
  const rows = await sql<{ id: number }>(
    `select id from outbox
     where zalo_account_id = $1
       and (zalo_msg_id = $3
            or (status = 'sending' and thread_id = $2 and $4::text is not null and body->>'text' = $4::text))
     limit 1`,
    [account, threadId, msgId, text]
  );
  return rows.length > 0;
}

export const STAFF_TAKEOVER_MINUTES = 30;

/** Nhan vien tra loi tay tu tai khoan community ⇒ bot im 30 phut (§3.2). */
export async function setStaffTakeover(account: AccountId, threadId: string): Promise<void> {
  await sql(
    `insert into conversations (zalo_account_id, thread_id, human_takeover_until)
     values ($1, $2, now() + ($3 || ' minutes')::interval)
     on conflict (zalo_account_id, thread_id)
     do update set human_takeover_until = greatest(coalesce(conversations.human_takeover_until, now()), now() + ($3 || ' minutes')::interval)`,
    [account, threadId, String(STAFF_TAKEOVER_MINUTES)]
  );
}

export async function markUndone(account: AccountId, msgId: string): Promise<number> {
  const rows = await sql<{ id: number }>(
    `update inbound_events set payload = payload || jsonb_build_object('undone', true, 'undone_at', now())
     where zalo_account_id = $1 and zalo_msg_id = $2 returning id`,
    [account, msgId]
  );
  return rows.length;
}

/** Nguoi da nhan dien = owner (`account_owners`) HOAC thanh vien con hieu luc
 * cua mot nhom (`group_members.left_at is null`) — chi nhung nguoi nay nhan "da xem". */
export async function isIdentified(account: AccountId, uid: string): Promise<boolean> {
  const rows = await sql<{ one: number }>(
    `select 1 as one from account_owners where zalo_account_id = $1 and zalo_uid = $2
     union all
     select 1 as one from group_members where zalo_account_id = $1 and zalo_uid = $2 and left_at is null
     limit 1`,
    [account, uid]
  );
  return rows.length > 0;
}

export async function enqueueSeen(
  account: AccountId,
  threadId: string,
  seen: Record<string, unknown>,
  notBefore: Date
): Promise<number> {
  return enqueue({ zaloAccountId: account, threadId, threadType: 'user', kind: 'seen', body: { seen }, notBefore });
}

// ---------------------------------------------------------------- pacer

export interface OutboxRow {
  id: number;
  thread_id: string;
  thread_type: 'user' | 'group';
  kind: 'text' | 'image' | 'typing' | 'seen' | 'action' | 'react';
  body: Record<string, unknown>;
  attempts: number;
  staff_takeover: boolean;
  /** `outbox.created_at` (epoch ms) — doi han `GROUP_TEXT_TTL_MIN`. */
  created_ms: number;
}

/** Tin `queued` den han cua tai khoan, theo thu tu gui (doan tach giu dung
 * cho cua tin goc). `staff_takeover` = thread dang trong han tiep quan VA co
 * tin nhan vien gui tay (is_self khong khop outbox) trong 30 phut qua. */
export async function fetchDue(account: AccountId, limit = 200): Promise<OutboxRow[]> {
  return sql<OutboxRow>(
    `select o.id::int as id, o.thread_id, o.thread_type, o.kind, o.body, o.attempts,
            (extract(epoch from o.created_at) * 1000)::float8 as created_ms,
            (o.thread_type = 'user' and exists (
              select 1 from conversations c
              where c.zalo_account_id = o.zalo_account_id and c.thread_id = o.thread_id
                and c.human_takeover_until > now()
                and exists (
                  select 1 from inbound_events ie
                  where ie.zalo_account_id = o.zalo_account_id and ie.thread_id = o.thread_id
                    and ie.is_self and (ie.payload->>'staff_manual') = 'true'
                    and ie.received_at > now() - ($2 || ' minutes')::interval
                )
            )) as staff_takeover
     from outbox o
     where o.zalo_account_id = $1 and o.status = 'queued' and o.not_before <= now()
     order by coalesce((o.body->>'split_of')::bigint, o.id), coalesce((o.body->>'part')::int, 0), o.id
     limit $3`,
    [account, String(STAFF_TAKEOVER_MINUTES), limit]
  );
}

export async function cancelRow(id: number, reason: string): Promise<void> {
  await sql(
    `update outbox set status = 'cancelled', body = body || jsonb_build_object('cancel_reason', $2::text)
     where id = $1 and status = 'queued'`,
    [id, reason]
  );
}

/** queued → sending (CAS). */
export async function markSending(id: number): Promise<boolean> {
  const rows = await sql<{ id: number }>(
    `update outbox set status = 'sending', attempts = attempts + 1 where id = $1 and status = 'queued' returning id`,
    [id]
  );
  return rows.length > 0;
}

/** `result` (jsonb) chi co voi `action` (SPEC-P02 §4.2): ket qua rut gon, KHONG chua noi dung tin. */
export async function markSent(id: number, msgId: string | null, result?: Record<string, unknown>): Promise<void> {
  await sql(
    `update outbox set status = 'sent', zalo_msg_id = $2, sent_at = now(),
       result = coalesce($3::jsonb, result) where id = $1`,
    [id, msgId, result === undefined ? null : JSON.stringify(result)]
  );
}

/** Tra tin ve `queued` (giu nguyen, lui toi `notBefore`). */
export async function requeue(id: number, notBefore: Date): Promise<void> {
  await sql(`update outbox set status = 'queued', not_before = $2 where id = $1 and status = 'sending'`, [id, notBefore]);
}

export async function markFailed(id: number, reason: string, result?: Record<string, unknown>): Promise<void> {
  await sql(
    `update outbox set status = 'failed', body = body || jsonb_build_object('fail_reason', $2::text),
       result = coalesce($3::jsonb, result) where id = $1`,
    [id, reason, result === undefined ? null : JSON.stringify(result)]
  );
}

/** Tach tin dai (§5): dong goc giu doan 1; doan 2..n thanh dong outbox moi
 * qua `enqueue` cua core, danh dau `split_of` + `part` de giu thu tu. */
export async function splitRow(row: OutboxRow, parts: string[], account: AccountId): Promise<void> {
  const bodies = buildSplitBodies(row.id, row.body, parts);
  const updated = await sql<{ id: number }>(
    `update outbox set body = $2::jsonb where id = $1 and status = 'queued' returning id`,
    [row.id, JSON.stringify(bodies[0])]
  );
  if (updated.length === 0) return;
  for (let i = 1; i < bodies.length; i++) {
    await enqueue({
      zaloAccountId: account,
      threadId: row.thread_id,
      threadType: row.thread_type,
      kind: 'text',
      body: bodies[i]!,
    });
  }
}

/** Lich su gui gan day de pacer khoi dong lai khong "quen" gioi han. Dung `sent_at`
 * (co tu 007), roi ve `created_at` cho dong cu. */
export async function recentSent(
  account: AccountId,
  windowMs: number
): Promise<Array<{ at: number; threadId: string; isGroup: boolean }>> {
  const rows = await sql<{ at: string; thread_id: string; thread_type: string }>(
    `select coalesce(sent_at, created_at)::text as at, thread_id, thread_type from outbox
     where zalo_account_id = $1 and status = 'sent' and kind = 'text'
       and coalesce(sent_at, created_at) > now() - ($2 || ' milliseconds')::interval
     order by coalesce(sent_at, created_at)`,
    [account, String(windowMs)]
  );
  return rows.map((r) => ({ at: new Date(r.at).getTime(), threadId: r.thread_id, isGroup: r.thread_type === 'group' }));
}

// ---------------------------------------------------------------- nhom (SPEC-P02 §4–§5)

/** So tin text da gui (hoac dang gui) vao mot nhom trong 1 gio gan nhat — cau SQL 01-CONTRACTS §8.4
 * (da do `evidence/ARCH/db-checks.txt` (c)). Cua so tinh bang `now()` cua DB (D29 diem 3): `sent_at`
 * cung do `now()` cua DB ghi, nen lech dong ho worker khong the nho/gian ngan sach. */
export async function groupTextSentLastHour(account: AccountId, threadId: string): Promise<number> {
  const rows = await sql<{ c: number }>(
    `select count(*)::int as c from outbox
     where zalo_account_id = $1 and thread_id = $2 and kind = 'text' and status in ('sent','sending')
       and coalesce(sent_at, created_at) > now() - interval '1 hour'`,
    [account, threadId]
  );
  return rows[0]?.c ?? 0;
}

export interface GroupGate {
  budget: number;
  enabled: boolean;
}

/** `zalo_groups.budget_per_hour` + `enabled`; `null` khi nhom khong co dong (⇒ pacer huy `group_unknown`). */
export async function groupGate(account: AccountId, threadId: string): Promise<GroupGate | null> {
  const rows = await sql<{ budget_per_hour: number; enabled: boolean }>(
    `select budget_per_hour, enabled from zalo_groups where zalo_account_id = $1 and thread_id = $2`,
    [account, threadId]
  );
  return rows[0] ? { budget: rows[0].budget_per_hour, enabled: rows[0].enabled } : null;
}

/** Sau khi gui text nhom thanh cong: dong dem do core chen truoc (`zalo_msg_id='out-<outbox_id>'`)
 * nhan msgId that — de xoa/quote tin cua chinh bot (SPEC-P02 §4.3). Khong co dong ⇒ 0 (khong sao). */
export async function linkSentGroupMessage(outboxId: number, msgId: string): Promise<number> {
  const rows = await sql<{ id: number }>(
    `update group_messages g set zalo_msg_id = $2
     where g.zalo_msg_id = 'out-' || $1::text
       and not exists (
         select 1 from group_messages x where x.zalo_account_id = g.zalo_account_id and x.zalo_msg_id = $2
       )
     returning g.id`,
    [outboxId, msgId]
  );
  return rows.length;
}

/** Zalo tra 166 (thieu quyen): dat `bot_is_admin=false` cho nhom (SPEC-P02 §4.2). */
export async function markBotNotAdmin(account: AccountId, threadId: string): Promise<void> {
  await sql(
    `update zalo_groups set bot_is_admin = false, updated_at = now() where zalo_account_id = $1 and thread_id = $2`,
    [account, threadId]
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lop chan cuoi BB-06 (D29 diem 1): nhan the duyet cho MOT lan thi hanh kick/block. Mot cau lenh co dieu kien
 * (CAS): the PHAI `approved`, chua nhan (`executed_at is null`), cung tai khoan/thread/uid dich, dung `kind`
 * (`kick_member`↔`remove_member`, `block_member`↔`block_member`). Nhan = dat `executed_at` TRUOC khi goi Zalo
 * nen hai tick cung the chi mot tick qua. Khong khop ⇒ `false` (caller KHONG goi Zalo). */
export async function claimApproval(
  approvalId: string,
  account: AccountId,
  threadId: string,
  action: 'remove_member' | 'block_member',
  targetUid: string
): Promise<boolean> {
  if (!UUID_RE.test(approvalId)) return false;
  const kind = action === 'remove_member' ? 'kick_member' : 'block_member';
  const rows = await sql<{ id: string }>(
    `update approvals set executed_at = now()
     where id = $1::uuid and zalo_account_id = $2 and thread_id = $3 and kind = $4 and target_uid = $5
       and status = 'approved' and executed_at is null
     returning id`,
    [approvalId, account, threadId, kind, targetUid]
  );
  return rows.length > 0;
}

/** Tra the da nhan khi Zalo CHUA thi hanh (rate-limit / hang doi lai) de lan sau van chay duoc. */
export async function releaseApproval(approvalId: string): Promise<void> {
  if (!UUID_RE.test(approvalId)) return;
  await sql(`update approvals set executed_at = null where id = $1::uuid and status = 'approved'`, [approvalId]);
}

/** `approvals` approved ⇒ executed | failed (01-CONTRACTS §5.1). Chuyen trang thai co dieu kien
 * `status='approved'`: khong khop ⇒ tra false (khong ghi de). Audit `approval.<to>`. */
export async function completeApproval(approvalId: string, ok: boolean, result: Record<string, unknown>): Promise<boolean> {
  const to = ok ? 'executed' : 'failed';
  const rows = await sql<{ id: string }>(
    `update approvals set status = $2, executed_at = now(), result = $3::jsonb
     where id = $1::uuid and status = 'approved' returning id`,
    [approvalId, to, JSON.stringify(result)]
  );
  if (rows.length === 0) return false;
  await audit(sql, {
    actorType: 'system',
    actorId: 'zalo-worker',
    action: `approval.${to}`,
    target: approvalId,
    data: { ok },
  });
  return true;
}

export interface GroupSyncResult {
  name: string;
  adminIds: string[];
  creatorId: string;
  members: Array<{ uid: string; displayName: string }>;
  total: number;
}

/** Ket qua `sync_group_info` ⇒ DB (SPEC-P02 §4.2): upsert `zalo_groups` (ten, `bot_is_admin`,
 * `last_synced_at`), upsert `group_members` (con trong danh sach ⇒ `left_at=null`; admin ⇒
 * `moderator`, KHONG ha vai), thanh vien khong con trong danh sach ⇒ `left_at=now()`. */
export async function applyGroupSync(
  account: AccountId,
  groupId: string,
  result: GroupSyncResult,
  ownUid: string
): Promise<{ botIsAdmin: boolean }> {
  const botIsAdmin = result.adminIds.includes(ownUid) || result.creatorId === ownUid;
  await tx(async (q) => {
    await q(
      `insert into zalo_groups (zalo_account_id, thread_id, name, bot_is_admin, last_synced_at)
       values ($1, $2, $3, $4, now())
       on conflict (zalo_account_id, thread_id) do update
         set name = coalesce(nullif(excluded.name, ''), zalo_groups.name),
             bot_is_admin = excluded.bot_is_admin, last_synced_at = now(), updated_at = now()`,
      [account, groupId, result.name, botIsAdmin]
    );
    if (result.members.length === 0) return;
    const uids = result.members.map((m) => m.uid);
    const roles = result.members.map((m) => (result.adminIds.includes(m.uid) ? 'moderator' : 'member'));
    const names = result.members.map((m) => m.displayName);
    await q(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name)
       select $1, $2, t.u, t.r, nullif(t.n, '') from unnest($3::text[], $4::text[], $5::text[]) as t(u, r, n)
       on conflict (zalo_account_id, thread_id, zalo_uid) do update
         set left_at = null,
             display_name = coalesce(excluded.display_name, group_members.display_name),
             role = case when excluded.role = 'moderator' then 'moderator' else group_members.role end`,
      [account, groupId, uids, roles, names]
    );
    await q(
      `update group_members set left_at = now()
       where zalo_account_id = $1 and thread_id = $2 and left_at is null and zalo_uid <> all($3::text[])`,
      [account, groupId, uids]
    );
  });
  return { botIsAdmin };
}

/** Audit hanh dong quan tri (BB-09): KHONG ghi noi dung — chi ten hanh dong, thread, ket qua, ma. */
export async function auditAction(
  action: 'zalo.action' | 'zalo.action_failed' | 'zalo.action_blocked',
  data: { action: string; thread: string; ok: boolean; code: number | string | null }
): Promise<void> {
  await audit(sql, { actorType: 'system', actorId: 'zalo-worker', action, target: data.thread, data });
}

/** Audit su kien pacer (huy vi ngan sach/nhom la): khong ghi noi dung. */
export async function auditPacer(action: string, threadId: string, data: Record<string, unknown> = {}): Promise<void> {
  await audit(sql, { actorType: 'system', actorId: 'zalo-worker', action, target: threadId, data });
}
