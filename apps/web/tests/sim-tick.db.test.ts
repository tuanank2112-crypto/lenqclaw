// apps/web/tests/sim-tick.db.test.ts — POST /api/dev/sim/tick (P01: runTimers la
// khung rong => steps {}; buoc thuc te do P03–P07 dien).

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, sql, type StaffRole } from '@lenqclaw/core';
import { POST as simTick } from '../app/api/dev/sim/tick/route';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';

const staffIds = new Map<StaffRole, string>();

/** Session can mot staff_users THAT (audit ghi actor_id). */
async function staffId(role: StaffRole): Promise<string> {
  const cached = staffIds.get(role);
  if (cached) return cached;
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,'x',$2) returning id`,
    [`sim-tick-${role}-${randomUUID().slice(0, 8)}@test.local`, role]
  );
  staffIds.set(role, rows[0]!.id);
  return rows[0]!.id;
}

async function req(url: string, role: StaffRole | null, body?: unknown): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = `${SESSION_COOKIE_NAME}=${await createSessionCookie(await staffId(role), role)}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, { method: 'POST', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

describe('/api/dev/sim/tick (db)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterEach(() => {
    delete process.env.DATA_MODE;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('DATA_MODE ≠ sim ⇒ 404', async () => {
    delete process.env.DATA_MODE;
    const res = await simTick(await req('http://localhost/api/dev/sim/tick', 'admin', {}));
    expect(res.status).toBe(404);
  });

  it('chua dang nhap ⇒ 401; operator ⇒ 403', async () => {
    process.env.DATA_MODE = 'sim';
    expect((await simTick(await req('http://localhost/api/dev/sim/tick', null, {}))).status).toBe(401);
    expect((await simTick(await req('http://localhost/api/dev/sim/tick', 'operator', {}))).status).toBe(403);
  });

  it('admin ⇒ 200, khung timers tra steps rong + delivered la so; now sai dinh dang ⇒ 400', async () => {
    process.env.DATA_MODE = 'sim';
    const res = await simTick(
      await req('http://localhost/api/dev/sim/tick', 'admin', { now: new Date().toISOString() })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toEqual({});
    expect(typeof body.delivered).toBe('number');

    const bad = await simTick(await req('http://localhost/api/dev/sim/tick', 'admin', { now: 'khong-phai-ngay' }));
    expect(bad.status).toBe(400);
  });
});
