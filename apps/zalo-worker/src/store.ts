// apps/zalo-worker/src/store.ts — moi cau SQL cua worker. Ket noi DB CHI qua
// `sql` cua @lenqclaw/core (BB-07). Worker KHONG tu chen dong outbox: tin moi
// (doan tach, "da xem") di qua `enqueue` cua core (BB-04).

import { audit, enqueue, sql, type SessionState } from '@lenqclaw/core';
import type { AccountId } from './config.js';

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
  | 'session_cas_conflict';

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

/** Nhan vien tra loi tay tu tai khoan bql ⇒ bot im 30 phut (§3.2). */
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

export async function isIdentified(account: AccountId, uid: string): Promise<boolean> {
  const rows = await sql<{ one: number }>(
    `select 1 as one from zalo_identities where zalo_account_id = $1 and zalo_uid = $2`,
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
  kind: 'text' | 'image' | 'typing' | 'seen';
  body: Record<string, unknown>;
  attempts: number;
  job_id: string | null;
  staff_takeover: boolean;
}

/** Tin `queued` den han cua tai khoan, theo thu tu gui (doan tach giu dung
 * cho cua tin goc). `staff_takeover` = thread dang trong han tiep quan VA co
 * tin nhan vien gui tay (is_self khong khop outbox) trong 30 phut qua. */
export async function fetchDue(account: AccountId, limit = 200): Promise<OutboxRow[]> {
  return sql<OutboxRow>(
    `select o.id::int as id, o.thread_id, o.thread_type, o.kind, o.body, o.attempts, o.job_id::text as job_id,
            exists (
              select 1 from conversations c
              where c.zalo_account_id = o.zalo_account_id and c.thread_id = o.thread_id
                and c.human_takeover_until > now()
                and exists (
                  select 1 from inbound_events ie
                  where ie.zalo_account_id = o.zalo_account_id and ie.thread_id = o.thread_id
                    and ie.is_self and (ie.payload->>'staff_manual') = 'true'
                    and ie.received_at > now() - ($2 || ' minutes')::interval
                )
            ) as staff_takeover
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

export async function markSent(id: number, msgId: string | null): Promise<void> {
  await sql(`update outbox set status = 'sent', zalo_msg_id = $2 where id = $1`, [id, msgId]);
}

/** Tra tin ve `queued` (giu nguyen, lui toi `notBefore`). */
export async function requeue(id: number, notBefore: Date): Promise<void> {
  await sql(`update outbox set status = 'queued', not_before = $2 where id = $1 and status = 'sending'`, [id, notBefore]);
}

export async function markFailed(id: number, reason: string): Promise<void> {
  await sql(
    `update outbox set status = 'failed', body = body || jsonb_build_object('fail_reason', $2::text) where id = $1`,
    [id, reason]
  );
}

/** Tach tin dai (§5): dong goc giu doan 1; doan 2..n thanh dong outbox moi
 * qua `enqueue` cua core, danh dau `split_of` + `part` de giu thu tu. */
export async function splitRow(row: OutboxRow, parts: string[], account: AccountId): Promise<void> {
  const updated = await sql<{ id: number }>(
    `update outbox set body = body || jsonb_build_object('text', $2::text, 'split_of', id, 'part', 0)
     where id = $1 and status = 'queued' returning id`,
    [row.id, parts[0]]
  );
  if (updated.length === 0) return;
  for (let i = 1; i < parts.length; i++) {
    await enqueue({
      zaloAccountId: account,
      threadId: row.thread_id,
      threadType: row.thread_type,
      kind: 'text',
      body: { ...row.body, text: parts[i], split_of: row.id, part: i },
      jobId: row.job_id,
    });
  }
}

/** Lich su gui gan day de pacer khoi dong lai khong "quen" gioi han. outbox
 * khong co cot `sent_at` ⇒ dung `created_at` (xap xi). */
export async function recentSent(account: AccountId, windowMs: number): Promise<Array<{ at: number; threadId: string }>> {
  const rows = await sql<{ at: string; thread_id: string }>(
    `select created_at::text as at, thread_id from outbox
     where zalo_account_id = $1 and status = 'sent' and kind = 'text'
       and created_at > now() - ($2 || ' milliseconds')::interval
     order by created_at`,
    [account, String(windowMs)]
  );
  return rows.map((r) => ({ at: new Date(r.at).getTime(), threadId: r.thread_id }));
}
