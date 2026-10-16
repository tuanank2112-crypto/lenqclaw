// apps/web/tests/sim-thread.db.test.ts — GET /api/dev/sim/thread: cong chan (D29 diem 8).
// Route tra noi dung tin nhom ⇒ PHAI 403 cho operator, 404 khi DATA_MODE ≠ sim.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, sql, type StaffRole } from '@lenqclaw/core';
import { GET as simThread } from '../app/api/dev/sim/thread/route';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';

const staffIds = new Map<StaffRole, string>();

async function staffId(role: StaffRole): Promise<string> {
  const cached = staffIds.get(role);
  if (cached) return cached;
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,'x',$2) returning id`,
    [`sim-thread-${role}-${randomUUID().slice(0, 8)}@test.local`, role]
  );
  staffIds.set(role, rows[0]!.id);
  return rows[0]!.id;
}

async function get(role: StaffRole | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = `${SESSION_COOKIE_NAME}=${await createSessionCookie(await staffId(role), role)}`;
  return simThread(new NextRequest('http://localhost/api/dev/sim/thread?account=community&threadId=sim-group-x', { headers }));
}

describe('GET /api/dev/sim/thread — cong chan (db)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterEach(() => {
    delete process.env.DATA_MODE;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('DATA_MODE ≠ sim ⇒ 404 (ke ca admin da dang nhap)', async () => {
    delete process.env.DATA_MODE;
    expect((await get('admin')).status).toBe(404);
    process.env.DATA_MODE = 'real';
    expect((await get('admin')).status).toBe(404);
  });

  it('operator ⇒ 403 va khong ro ri noi dung; chua dang nhap ⇒ 403', async () => {
    process.env.DATA_MODE = 'sim';
    const res = await get('operator');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect((await get(null)).status).toBe(403);
  });

  it('admin + DATA_MODE=sim ⇒ 200 { messages, actions }', async () => {
    process.env.DATA_MODE = 'sim';
    const res = await get('admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ messages: expect.any(Array), actions: expect.any(Array) });
  });
});
