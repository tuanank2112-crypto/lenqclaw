// apps/web/tests/00-login.db.test.ts — SPEC-P01-Foundation.md §9: login
// dung/sai => dung 1 dong audit auth.login.ok / auth.login.fail.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, hashPassword, sql } from '@lenqclaw/core';
import { POST as login } from '../app/api/auth/login/route';

const EMAIL = 'test-login-p01@example.com';
const PASSWORD = 'mat-khau-dung-123';

describe('POST /api/auth/login (db)', () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
    const hash = await hashPassword(PASSWORD);
    await sql(`delete from staff_users where email = $1`, [EMAIL]);
    await sql(`insert into staff_users (email, password_hash, role) values ($1,$2,'bql_admin')`, [EMAIL, hash]);
  });

  afterAll(async () => {
    await sql(`delete from staff_users where email = $1`, [EMAIL]);
    await closeDb();
  });

  it('dang nhap dung => 200 + dung 1 dong audit auth.login.ok', async () => {
    const before = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'auth.login.ok' and target = $1`,
      [EMAIL]
    );
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const res = await login(req);
    expect(res.status).toBe(200);

    const after = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'auth.login.ok' and target = $1`,
      [EMAIL]
    );
    expect(after[0]!.c).toBe(before[0]!.c + 1);
  });

  it('dang nhap sai mat khau => 401 + dung 1 dong audit auth.login.fail', async () => {
    const before = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'auth.login.fail' and target = $1`,
      [EMAIL]
    );
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'sai-mat-khau' }),
    });
    const res = await login(req);
    expect(res.status).toBe(401);

    const after = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'auth.login.fail' and target = $1`,
      [EMAIL]
    );
    expect(after[0]!.c).toBe(before[0]!.c + 1);
  });
});
