// apps/web/tests/zalo-login.db.test.ts — SPEC-P02 §9.2: POST /api/zalo/community/login
// chi admin (401 chua dang nhap, 403 vai khac, 200 + login_requested_at);
// GET /api/zalo/status khong lo session_enc, QR het han khong tra.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, sql } from '@lenqclaw/core';
import { POST as login } from '../app/api/zalo/[account]/login/route';
import { GET as status } from '../app/api/zalo/status/route';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';
import type { StaffRole } from '@lenqclaw/core';

async function req(url: string, method: string, role: StaffRole | null): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = `${SESSION_COOKIE_NAME}=${await createSessionCookie(`u-${role}`, role)}`;
  return new NextRequest(url, { method, headers });
}

const params = (account: string) => ({ params: Promise.resolve({ account }) });

describe('/api/zalo (db)', () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
    delete process.env.ZALO_ACCOUNTS;
    await sql(`update zalo_accounts set login_requested_at = null, qr_data_url = null, qr_expires_at = null where id = 'community'`);
  });

  afterAll(async () => {
    await sql(`update zalo_accounts set login_requested_at = null, qr_data_url = null, qr_expires_at = null where id = 'community'`);
    await closeDb();
  });

  it('chua dang nhap ⇒ 401, khong dat login_requested_at', async () => {
    const res = await login(await req('http://localhost/api/zalo/community/login', 'POST', null), params('community'));
    expect(res.status).toBe(401);
    const r = await sql<{ login_requested_at: string | null }>(`select login_requested_at from zalo_accounts where id='community'`);
    expect(r[0]!.login_requested_at).toBeNull();
  });

  it('operator ⇒ 403', async () => {
    for (const role of ['operator'] as const) {
      const res = await login(await req('http://localhost/api/zalo/community/login', 'POST', role), params('community'));
      expect(res.status).toBe(403);
    }
    const r = await sql<{ login_requested_at: string | null }>(`select login_requested_at from zalo_accounts where id='community'`);
    expect(r[0]!.login_requested_at).toBeNull();
  });

  it('admin ⇒ 200 + login_requested_at duoc dat + audit', async () => {
    const res = await login(await req('http://localhost/api/zalo/community/login', 'POST', 'admin'), params('community'));
    expect(res.status).toBe(200);
    const r = await sql<{ ok: boolean }>(
      `select login_requested_at > now() - interval '1 minute' as ok from zalo_accounts where id='community'`
    );
    expect(r[0]!.ok).toBe(true);
    const a = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action='zalo.login_requested' and target='community' and created_at > now() - interval '1 minute'`
    );
    expect(a[0]!.c).toBeGreaterThanOrEqual(1);
  });

  it('tai khoan khac community / ten la ⇒ 404', async () => {
    for (const acc of ['other', 'evil']) {
      const res = await login(await req(`http://localhost/api/zalo/${acc}/login`, 'POST', 'admin'), params(acc));
      expect(res.status).toBe(404);
    }
  });

  it('GET status: 401/403/200; QR con han moi tra; khong co session_enc', async () => {
    expect((await status(await req('http://localhost/api/zalo/status', 'GET', null))).status).toBe(401);
    expect((await status(await req('http://localhost/api/zalo/status', 'GET', 'operator'))).status).toBe(403);

    await sql(
      `update zalo_accounts set qr_data_url = 'data:image/png;base64,QQ==', qr_expires_at = now() + interval '3 minutes' where id='community'`
    );
    let res = await status(await req('http://localhost/api/zalo/status', 'GET', 'admin'));
    expect(res.status).toBe(200);
    let body = (await res.json()) as { accounts: Array<Record<string, unknown>> };
    expect(body.accounts.map((a) => a.id)).toEqual(['community']);
    expect(body.accounts[0]!.qr_data_url).toBe('data:image/png;base64,QQ==');
    expect('session_enc' in body.accounts[0]!).toBe(false);

    await sql(`update zalo_accounts set qr_expires_at = now() - interval '1 second' where id='community'`);
    res = await status(await req('http://localhost/api/zalo/status', 'GET', 'admin'));
    body = (await res.json()) as { accounts: Array<Record<string, unknown>> };
    expect(body.accounts[0]!.qr_data_url).toBeNull();
  });
});
