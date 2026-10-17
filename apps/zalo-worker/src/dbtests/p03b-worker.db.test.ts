// p03b-worker.db.test.ts — P03b-A (SPEC-D31 §7.1 mục 4, T6): picked_at / hold_reason tren DB that, khoa mot ban cua worker.
// zca-js GIA (0 mang). Can DB da migrate (`npm run test:db` o root).

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, enqueue, holdAdvisoryLock, sql } from '@lenqclaw/core';
import { AccountPacer } from '../pacer.js';
import { fetchDue } from '../store.js';
import { FakeZaloClient } from '../testing/fake-client.js';
import { connectedSession, dropGroup, FAST, makeGroup, resetAccount, uid } from './group-helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.join(here, '..', 'main.ts');

beforeEach(async () => {
  await resetAccount();
});
afterAll(async () => {
  await resetAccount();
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
