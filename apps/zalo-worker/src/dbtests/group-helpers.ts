// apps/zalo-worker/src/dbtests/group-helpers.ts — dung chung cho cac test DB
// nhom cua P02 (fixture phien gia + tien ich DB). Khong phai file test.

import { randomBytes, randomUUID } from 'node:crypto';
import { enqueue, sql } from '@lenqclaw/core';
import { AccountSession } from '../account-session.js';
import { PACER_DEFAULTS, type PacerConfig } from '../config.js';
import { encryptSession } from '../crypto.js';
import { FakeZaloClient } from '../testing/fake-client.js';

export const KEY = randomBytes(32);
export const FAST: PacerConfig = { ...PACER_DEFAULTS, typingMinMs: 0, typingMaxMs: 0 };
export const SECRET = { cookie: [{ key: 'zpw_sek', value: 'COOKIE-SECRET-VALUE' }], imei: 'IMEI-SECRET-VALUE', userAgent: 'UA/1' };

export function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** `enqueue` tra id bigserial (pg tra chuoi) — chuan hoa ve number. */
export async function enqueueId(...args: Parameters<typeof enqueue>): Promise<number> {
  return Number(await enqueue(...args));
}

export async function resetAccount(): Promise<void> {
  await sql(
    `update zalo_accounts set session_enc = null, session_state = 'logged_out', login_requested_at = null,
       qr_data_url = null, qr_expires_at = null, updated_at = now() where id = 'community'`
  );
  await sql(`update outbox set status = 'cancelled' where zalo_account_id = 'community' and status in ('queued','sending')`);
}

export async function connectedSession(client = new FakeZaloClient(), cfg: PacerConfig = FAST) {
  await sql(`update zalo_accounts set session_enc = $1, updated_at = now() where id = 'community'`, [
    encryptSession(SECRET, KEY, 'community'),
  ]);
  const s = new AccountSession('community', client, KEY, cfg, { sleep: async () => {}, rng: () => 0 });
  await s.start();
  return { s, client, fake: client.last };
}

/** Tao nhom thu rieng (co dong zalo_groups) cho mot test. */
export async function makeGroup(threadId: string, budgetPerHour = 20): Promise<void> {
  await sql(
    `insert into zalo_groups (zalo_account_id, thread_id, name, enabled, budget_per_hour)
     values ('community', $1, 'Nhóm thử', true, $2) on conflict do nothing`,
    [threadId, budgetPerHour]
  );
}

export async function dropGroup(threadId: string): Promise<void> {
  await sql(`delete from group_messages where zalo_account_id='community' and thread_id=$1`, [threadId]);
  await sql(`delete from zalo_groups where zalo_account_id='community' and thread_id=$1`, [threadId]);
}

export async function outboxRow(id: number): Promise<{ status: string; body: Record<string, unknown>; result: Record<string, unknown> | null; zalo_msg_id: string | null; sent_at: string | null }> {
  const r = await sql<{ status: string; body: Record<string, unknown>; result: Record<string, unknown> | null; zalo_msg_id: string | null; sent_at: string | null }>(
    `select status, body, result, zalo_msg_id, sent_at::text as sent_at from outbox where id = $1`,
    [id]
  );
  return r[0]!;
}
