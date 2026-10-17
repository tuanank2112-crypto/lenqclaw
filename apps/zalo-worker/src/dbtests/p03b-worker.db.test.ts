// p03b-worker.db.test.ts — P03b-A (SPEC-D31 §7.1 mục 4, T6): picked_at / hold_reason tren DB that, khoa mot ban cua worker.
// zca-js GIA (0 mang). Can DB da migrate (`npm run test:db` o root).

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, enqueue, holdAdvisoryLock, sql } from '@lenqclaw/core';
import { setAlertFetchForTest } from '@lenqclaw/core/adapters/alert';
import { CLOSE_KICKED } from '../watchdog.js';
import { AccountPacer } from '../pacer.js';
import { countQueuedDue, fetchDue, setOwnUid, writeWorkerHeartbeat } from '../store.js';
import { FakeZaloClient } from '../testing/fake-client.js';
import { connectedSession, dropGroup, FAST, makeGroup, resetAccount, uid } from './group-helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.join(here, '..', 'main.ts');

beforeEach(async () => {
  await resetAccount();
});
afterAll(async () => {
  await resetAccount();
  // D39: test phien `connected` ghi own_uid that vao DB dev; don ⇒ sim khong bi mat nhan dien mention bot.
  await sql(`update zalo_accounts set own_uid = null where id = 'community'`);
  await closeDb();
});

interface Timing {
  status: string;
  picked_at: string | null;
  hold_reason: string | null;
  inbound_event_id: number | null;
}
async function timing(id: number): Promise<Timing> {
  const r = await sql<Timing>(
    `select status, picked_at::text as picked_at, hold_reason, inbound_event_id::int as inbound_event_id from outbox where id = $1`,
    [id]
  );
  return r[0]!;
}

describe('pacer ghi do thoi gian tren DB that (§7.1.4)', () => {
  it('tin bi gap nhom giu ⇒ picked_at + hold_reason="group_gap"; tin khong bi giu ⇒ picked_at, hold_reason null; fetchDue tra inbound_event_id', async () => {
    let now = 0;
    const client = new FakeZaloClient('community-self-uid', () => now);
    const { s } = await connectedSession(client);
    const group = uid('g-d31');
    await makeGroup(group);
    try {
      const a = Number(await enqueue({ zaloAccountId: 'community', threadId: group, threadType: 'group', kind: 'text', body: { text: 'a' }, inboundEventId: 111 }));
      const pacer = new AccountPacer('community', FAST, () => s.getSession(), { now: () => now, rng: () => 0 });
      const due = (await fetchDue('community')).find((r) => r.id === a)!;
      expect(due.inbound_event_id).toBe(111);
      await pacer.tick();
      const ta = await timing(a);
      expect(ta.status).toBe('sent');
      expect(ta.picked_at).not.toBeNull();
      expect(ta.hold_reason).toBeNull();
      expect(ta.inbound_event_id).toBe(111);

      const b = Number(await enqueue({ zaloAccountId: 'community', threadId: group, threadType: 'group', kind: 'text', body: { text: 'b' }, inboundEventId: 112 }));
      now += 2000;
      await pacer.tick(); // gap nhom 8 s chua het ⇒ giu
      expect((await timing(b)).status).toBe('queued');
      expect((await timing(b)).picked_at).toBeNull();
      now += 10_000;
      await pacer.tick();
      const tb = await timing(b);
      expect(tb.status).toBe('sent');
      expect(tb.picked_at).not.toBeNull();
      expect(tb.hold_reason).toBe('group_gap');
    } finally {
      await dropGroup(group);
      await s.stop();
    }
  });
});

describe('T6 — khoa mot ban cua worker (BB-19)', () => {
  it('khoa dang bi giu ⇒ worker thoat 1, in WORKER_ALREADY_RUNNING, KHONG mo phien zca-js (khong log worker.started/zalo.state)', async () => {
    const lock = await holdAdvisoryLock('lenqclaw:worker:community', () => {});
    expect(lock).not.toBeNull();
    try {
      const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', MAIN], {
          env: { ...process.env, ZALO_SESSION_KEY: 'ab'.repeat(32) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('worker khong thoat sau 25 s'));
        }, 25_000);
        child.on('exit', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
      });
      expect(out.code).toBe(1);
      expect(out.stderr).toContain('WORKER_ALREADY_RUNNING');
      expect(out.stdout).not.toContain('worker.started');
      expect(out.stdout).not.toContain('zalo.state');
    } finally {
      await lock!.release();
    }
    // khoa giai phong ⇒ lay lai duoc
    const again = await holdAdvisoryLock('lenqclaw:worker:community', () => {});
    expect(again).not.toBeNull();
    await again!.release();
  }, 40_000);
});

describe('P03b-B — own_uid (D37) va heartbeat worker (D32 §9)', () => {
  it('phien connected ghi zalo_accounts.own_uid = session.ownUid; ghi lai cung gia tri ⇒ khong doi (idempotent); dang xuat khong xoa', async () => {
    await sql(`update zalo_accounts set own_uid = null where id = 'community'`);
    const client = new FakeZaloClient('7700123');
    const { s } = await connectedSession(client);
    try {
      const r = await sql<{ own_uid: string | null }>(`select own_uid from zalo_accounts where id = 'community'`);
      expect(r[0]!.own_uid).toBe('7700123');
      expect(await setOwnUid('community', '7700123')).toBe(false);
      expect(await setOwnUid('community', '7700999')).toBe(true);
      await s.logout();
      const after = await sql<{ own_uid: string | null }>(`select own_uid from zalo_accounts where id = 'community'`);
      expect(after[0]!.own_uid).toBe('7700999');
    } finally {
      await s.stop();
      await sql(`update zalo_accounts set own_uid = null where id = 'community'`);
    }
  });

  it('writeWorkerHeartbeat upsert 1 dong name=worker (beat_at moi, info dung dang); countQueuedDue dem hang den han', async () => {
    const saved = await sql<{ name: string; pid: number; host: string; started_at: string; beat_at: string; info: unknown }>(
      `select name, pid, host, started_at::text as started_at, beat_at::text as beat_at, info from process_heartbeats where name = 'worker'`
    );
    const group = uid('g-hb');
    await makeGroup(group);
    try {
      await sql(`update outbox set status = 'cancelled' where zalo_account_id = 'community' and status = 'queued'`);
      await enqueue({ zaloAccountId: 'community', threadId: group, threadType: 'group', kind: 'text', body: { text: 'x' } });
      expect(await countQueuedDue('community')).toBe(1);
      const started = new Date(Date.now() - 60_000);
      await writeWorkerHeartbeat(started, { session_state: 'connected', last_pacer_tick_at: new Date().toISOString(), queued_due: 1 });
      await writeWorkerHeartbeat(started, { session_state: 'connected', last_pacer_tick_at: null, queued_due: 0 });
      const rows = await sql<{ age_s: number; info: Record<string, unknown>; pid: number }>(
        `select extract(epoch from (now() - beat_at))::float8 as age_s, info, pid from process_heartbeats where name = 'worker'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.age_s).toBeLessThan(5);
      expect(rows[0]!.info).toEqual({ session_state: 'connected', last_pacer_tick_at: null, queued_due: 0 });
      expect(rows[0]!.pid).toBe(process.pid);
    } finally {
      await dropGroup(group);
      await sql(`update outbox set status = 'cancelled' where zalo_account_id = 'community' and status = 'queued'`);
      if (saved[0]) {
        await sql(
          `update process_heartbeats set pid=$2, host=$3, started_at=$4::timestamptz, beat_at=$5::timestamptz, info=$6::jsonb where name=$1`,
          [saved[0].name, saved[0].pid, saved[0].host, saved[0].started_at, saved[0].beat_at, JSON.stringify(saved[0].info)]
        );
      } else {
        await sql(`delete from process_heartbeats where name = 'worker'`);
      }
    }
  });
});

describe('P03b-C — worker gui zalo_session NGAY (D32 §10.2)', () => {
  const TOKEN_ENV = ['TELEGRAM', 'BOT', 'TOKEN'].join('_');
  it('listener dong ma 3003 (kicked) ⇒ DUNG 1 tin Telegram zalo_session ngay lap tuc; dong lan 2 ⇒ khong lap (CAS)', async () => {
    const texts: string[] = [];
    process.env[TOKEN_ENV] = '999:FAKE-WORKER-TOKEN';
    process.env.TELEGRAM_CHAT_ID = '-1';
    setAlertFetchForTest((async (_u: string, init: RequestInit) => {
      texts.push(String(JSON.parse(String(init.body)).text));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    await sql(`delete from alert_state where kind = 'zalo_session'`);
    const { s } = await connectedSession(new FakeZaloClient('7700555'));
    try {
      await s.onClosed(CLOSE_KICKED);
      expect(texts).toHaveLength(1);
      expect(texts[0]).toContain('kicked');
      expect(texts[0]).not.toContain('FAKE-WORKER-TOKEN');
      await s.onClosed(CLOSE_KICKED);
      expect(texts).toHaveLength(1);
    } finally {
      setAlertFetchForTest(null);
      delete process.env[TOKEN_ENV];
      delete process.env.TELEGRAM_CHAT_ID;
      await sql(`delete from alert_state where kind = 'zalo_session'`);
      await s.stop();
    }
  });
});
