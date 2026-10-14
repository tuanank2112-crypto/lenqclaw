// apps/web/tests/zalo-logout.db.test.ts — SPEC-P02 §9.8: POST /api/zalo/community/logout
// chi admin (401 chua dang nhap, 403 vai khac, 200); sau 200 (worker KHONG
// chay trong test nay) ⇒ session_enc null + logged_out + qr_* xoa, ngay trong
// transaction cua route (khong de phien mo coi) + audit 'zalo.logout'.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, sql } from '@lenqclaw/core';
import { POST as logout } from '../app/api/zalo/[account]/logout/route';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';
import type { StaffRole } from '@lenqclaw/core';

async function req(url: string, method: string, role: StaffRole | null): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = `${SESSION_COOKIE_NAME}=${await createSessionCookie(`u-${role}`, role)}`;
  return new NextRequest(url, { method, headers });
}

const params = (account: string) => ({ params: Promise.resolve({ account }) });

async function setConnected(): Promise<void> {
  await sql(
    `update zalo_accounts set session_enc = '\\x00'::bytea, session_state = 'connected',
       qr_data_url = 'data:image/png;base64,QQ==', qr_expires_at = now() + interval '3 minutes',
       qr_state = 'waiting_scan', logout_requested_at = null
     where id = 'community'`
  );
}

describe('/api/zalo/community/logout (db, §9.8)', () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
    delete process.env.ZALO_ACCOUNTS;
  });

  afterAll(async () => {
    await sql(
      `update zalo_accounts set session_enc = null, session_state = 'logged_out', qr_data_url = null,
         qr_expires_at = null, qr_state = null, logout_requested_at = null where id = 'community'`
    );
    await closeDb();
  });

  it('chua dang nhap ⇒ 401, khong doi gi', async () => {
    await setConnected();
    const res = await logout(await req('http://localhost/api/zalo/community/logout', 'POST', null), params('community'));
    expect(res.status).toBe(401);
    const r = await sql<{ session_state: string }>(`select session_state from zalo_accounts where id='community'`);
    expect(r[0]!.session_state).toBe('connected');
  });

  it('operator ⇒ 403, khong doi gi', async () => {
    await setConnected();
    for (const role of ['operator'] as const) {
      const res = await logout(await req('http://localhost/api/zalo/community/logout', 'POST', role), params('community'));
      expect(res.status).toBe(403);
    }
    const r = await sql<{ session_state: string }>(`select session_state from zalo_accounts where id='community'`);
    expect(r[0]!.session_state).toBe('connected');
  });

  it('tai khoan khong duoc bat / ten la ⇒ 404', async () => {
    for (const acc of ['other', 'evil']) {
      const res = await logout(await req(`http://localhost/api/zalo/${acc}/logout`, 'POST', 'admin'), params(acc));
      expect(res.status).toBe(404);
    }
  });

  it('admin, worker KHONG chay ⇒ 200; session_enc null + logged_out + qr_* xoa ngay + audit zalo.logout', async () => {
    await setConnected();
    const res = await logout(await req('http://localhost/api/zalo/community/logout', 'POST', 'admin'), params('community'));
    expect(res.status).toBe(200);
    const r = await sql<{
      session_enc: Buffer | null;
      session_state: string;
      qr_data_url: string | null;
      qr_expires_at: string | null;
      qr_state: string | null;
    }>(`select session_enc, session_state, qr_data_url, qr_expires_at, qr_state from zalo_accounts where id='community'`);
    expect(r[0]!.session_enc).toBeNull();
    expect(r[0]!.session_state).toBe('logged_out');
    expect(r[0]!.qr_data_url).toBeNull();
    expect(r[0]!.qr_expires_at).toBeNull();
    expect(r[0]!.qr_state).toBeNull();
    const a = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action='zalo.logout' and target='community'
         and actor_id='u-admin' and created_at > now() - interval '1 minute'`
    );
    expect(a[0]!.c).toBeGreaterThanOrEqual(1);
  });
});
