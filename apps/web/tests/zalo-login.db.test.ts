// apps/web/tests/zalo-login.db.test.ts — SPEC-P02 §9.2: POST /api/zalo/bql/login
// chi bql_admin (401 chua dang nhap, 403 vai khac, 200 + login_requested_at);
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
    await sql(`update zalo_accounts set login_requested_at = null, qr_data_url = null, qr_expires_at = null where id = 'bql'`);
  });

  afterAll(async () => {
    await sql(`update zalo_accounts set login_requested_at = null, qr_data_url = null, qr_expires_at = null where id = 'bql'`);
    await closeDb();
  });

  it('chua dang nhap ⇒ 401, khong dat login_requested_at', async () => {
    const res = await login(await req('http://localhost/api/zalo/bql/login', 'POST', null), params('bql'));
    expect(res.status).toBe(401);
    const r = await sql<{ login_requested_at: string | null }>(`select login_requested_at from zalo_accounts where id='bql'`);
    expect(r[0]!.login_requested_at).toBeNull();
  });

  it('bql_staff / guard ⇒ 403', async () => {
    for (const role of ['bql_staff', 'guard'] as const) {
      const res = await login(await req('http://localhost/api/zalo/bql/login', 'POST', role), params('bql'));
      expect(res.status).toBe(403);
    }
    const r = await sql<{ login_requested_at: string | null }>(`select login_requested_at from zalo_accounts where id='bql'`);
    expect(r[0]!.login_requested_at).toBeNull();
  });

  it('bql_admin ⇒ 200 + login_requested_at duoc dat + audit', async () => {
    const res = await login(await req('http://localhost/api/zalo/bql/login', 'POST', 'bql_admin'), params('bql'));
    expect(res.status).toBe(200);
    const r = await sql<{ ok: boolean }>(
      `select login_requested_at > now() - interval '1 minute' as ok from zalo_accounts where id='bql'`
    );
    expect(r[0]!.ok).toBe(true);
    const a = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action='zalo.login_requested' and target='bql' and created_at > now() - interval '1 minute'`
    );
    expect(a[0]!.c).toBeGreaterThanOrEqual(1);
  });

  it('tai khoan market (CAM giai doan 1) / ten la ⇒ 404', async () => {
    for (const acc of ['market', 'evil']) {
      const res = await login(await req(`http://localhost/api/zalo/${acc}/login`, 'POST', 'bql_admin'), params(acc));
      expect(res.status).toBe(404);
    }
  });

  it('GET status: 401/403/200; QR con han moi tra; khong co session_enc', async () => {
    expect((await status(await req('http://localhost/api/zalo/status', 'GET', null))).status).toBe(401);
    expect((await status(await req('http://localhost/api/zalo/status', 'GET', 'guard'))).status).toBe(403);

    await sql(
      `update zalo_accounts set qr_data_url = 'data:image/png;base64,QQ==', qr_expires_at = now() + interval '3 minutes' where id='bql'`
    );
    let res = await status(await req('http://localhost/api/zalo/status', 'GET', 'bql_admin'));
    expect(res.status).toBe(200);
    let body = (await res.json()) as { accounts: Array<Record<string, unknown>> };
    expect(body.accounts.map((a) => a.id)).toEqual(['bql']);
    expect(body.accounts[0]!.qr_data_url).toBe('data:image/png;base64,QQ==');
    expect('session_enc' in body.accounts[0]!).toBe(false);

    await sql(`update zalo_accounts set qr_expires_at = now() - interval '1 second' where id='bql'`);
    res = await status(await req('http://localhost/api/zalo/status', 'GET', 'bql_admin'));
    body = (await res.json()) as { accounts: Array<Record<string, unknown>> };
    expect(body.accounts[0]!.qr_data_url).toBeNull();
  });
});
