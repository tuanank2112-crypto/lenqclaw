// apps/web/tests/healthz.db.test.ts — GET /api/healthz (D32, D37, SPEC-D31 §9; G24): 200 khi hai tien trinh con song va phien connected,
// 503 khi heartbeat cu / phien chet / DB loi; body KHONG co token, so lieu, ten, loi chi tiet.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@lenqclaw/core';
import { GET } from '../app/api/healthz/route';
import { canAccess } from '../lib/auth/policy';

type Saved = { name: string; pid: number; host: string; started_at: string; beat_at: string; info: unknown };
let savedBeats: Saved[] = [];
let savedState = 'logged_out';

async function setBeat(name: 'runner' | 'worker', ageSec: number): Promise<void> {
  await sql(
    `insert into process_heartbeats (name, pid, host, started_at, beat_at, info)
     values ($1, 1, 'test-host', now(), now() - make_interval(secs => $2), '{"secret_like":"info-khong-duoc-lo"}'::jsonb)
     on conflict (name) do update set beat_at = excluded.beat_at, info = excluded.info`,
    [name, ageSec]
  );
}

beforeAll(async () => {
  savedBeats = await sql<Saved>(
    `select name, pid, host, started_at::text as started_at, beat_at::text as beat_at, info from process_heartbeats`
  );
  savedState = (await sql<{ session_state: string }>(`select session_state from zalo_accounts where id = 'community'`))[0]!.session_state;
});

afterEach(() => {
  delete process.env.DATA_MODE;
});

afterAll(async () => {
  await sql(`delete from process_heartbeats`);
  for (const b of savedBeats) {
    await sql(
      `insert into process_heartbeats (name, pid, host, started_at, beat_at, info) values ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6::jsonb)`,
      [b.name, b.pid, b.host, b.started_at, b.beat_at, JSON.stringify(b.info)]
    );
  }
  await sql(`update zalo_accounts set session_state = $1 where id = 'community'`, [savedState]);
  await closeDb();
});

async function call(): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
  const res = await GET();
  const raw = await res.text();
  return { status: res.status, body: JSON.parse(raw), raw };
}

describe('/api/healthz (db)', () => {
  it('khong can dang nhap: middleware/policy cho GET qua', () => {
    expect(canAccess(null, '/api/healthz', 'GET')).toBe(true);
  });

  it('hai heartbeat moi + phien connected ⇒ 200 {ok:true, runner:{age_s}, worker:{age_s}, zalo:"connected"}', async () => {
    await sql(`update zalo_accounts set session_state = 'connected' where id = 'community'`);
    await setBeat('runner', 2);
    await setBeat('worker', 3);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, runner: { age_s: 2 }, worker: { age_s: 3 }, zalo: 'connected' });
  });

  it('heartbeat runner cu 120 s ⇒ 503 ok:false; body chi gom ok/runner/worker/zalo — khong lo info heartbeat, host, so lieu', async () => {
    await sql(`update zalo_accounts set session_state = 'connected' where id = 'community'`);
    await setBeat('runner', 120);
    await setBeat('worker', 1);
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect((r.body.runner as { age_s: number }).age_s).toBe(120);
    expect(r.raw).not.toContain('info-khong-duoc-lo');
    expect(r.raw).not.toContain('test-host');
    expect(Object.keys(r.body).sort()).toEqual(['ok', 'runner', 'worker', 'zalo']);
  });

  it('heartbeat worker cu ⇒ 503; thieu dong heartbeat ⇒ 503 (age_s null)', async () => {
    await sql(`update zalo_accounts set session_state = 'connected' where id = 'community'`);
    await setBeat('runner', 1);
    await setBeat('worker', 90);
    expect((await call()).status).toBe(503);
    await sql(`delete from process_heartbeats where name = 'worker'`);
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.worker).toEqual({ age_s: null });
  });

  it('phien Zalo khong connected ⇒ 503 (kicked/dead); DATA_MODE=sim bo yeu cau phien', async () => {
    await setBeat('runner', 1);
    await setBeat('worker', 1);
    await sql(`update zalo_accounts set session_state = 'dead' where id = 'community'`);
    const bad = await call();
    expect(bad.status).toBe(503);
    expect(bad.body.zalo).toBe('dead');
    process.env.DATA_MODE = 'sim';
    expect((await call()).status).toBe(200);
  });
});
