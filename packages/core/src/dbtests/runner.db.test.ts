// runner.db.test.ts — SPEC-P03 §11 hang 16 (v), SPEC-D31 §6/§16: dispatcher song song theo thread, thu tu trong thread,
// advisory lock mot ban, dau song, flushAmbient khong sinh su kien chong. Handler gia (khong goi model).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, holdAdvisoryLock, sql } from '../adapters/db.js';
import { claimNextInbound, simInbound } from '../sim/sim-transport.js';
import { runDispatcher } from '../runner/inbound-runner.js';
import { readCommunityConfig } from '../services/community-config.js';
import { runTimers } from '../services/timers.js';
import { ACCOUNT, count, mkGroup, send, uniq } from './p03-helpers.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function until(cond: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await sleep(20);
  }
  throw new Error('until: het thoi gian cho');
}

async function skipStale(): Promise<void> {
  await sql(`update inbound_events set processed_at = now() where processed_at is null`);
}

beforeAll(async () => {
  await skipStale();
});
afterAll(async () => {
  await closeDb();
});

async function dm(thread: string, msgId: string): Promise<void> {
  await simInbound({ account: ACCOUNT, threadId: thread, threadType: 'user', senderUid: thread, text: msgId, msgId });
}

describe('runner song song theo thread (BB-19)', () => {
  it('(v) thread A treo 3 s, tin thread B toi sau 100 ms ⇒ B xong truoc A', async () => {
    await skipStale();
    const A = uniq('runA');
    const B = uniq('runB');
    const log: string[] = [];
    const ctl = new AbortController();
    const loop = runDispatcher({
      signal: ctl.signal,
      concurrency: 4,
      intervalMs: 50,
      timers: false,
      heartbeat: false,
      handler: async (e) => {
        log.push(`start:${e.zaloMsgId}`);
        if (e.threadId === A) await sleep(3000);
        log.push(`end:${e.zaloMsgId}`);
      },
    });
    const a = uniq('a1');
    const b = uniq('b1');
    await dm(A, a);
    await sleep(100);
    await dm(B, b);
    await until(() => log.includes(`end:${b}`));
    expect(log.includes(`end:${a}`)).toBe(false); // A van dang treo
    expect(log.indexOf(`start:${a}`)).toBeLessThan(log.indexOf(`start:${b}`));
    await until(() => log.includes(`end:${a}`), 6000);
    expect(log.indexOf(`end:${b}`)).toBeLessThan(log.indexOf(`end:${a}`));
    ctl.abort();
    await loop;
  }, 20_000);

  it('A1, A2 cung thread chay DUNG thu tu va KHONG chong nhau (du con o trong)', async () => {
    await skipStale();
    const A = uniq('runSeq');
    const spans = new Map<string, { start: number; end: number }>();
    const ctl = new AbortController();
    const loop = runDispatcher({
      signal: ctl.signal,
      concurrency: 4,
      intervalMs: 20,
      timers: false,
      heartbeat: false,
      handler: async (e) => {
        const start = Date.now();
        await sleep(300);
        spans.set(e.zaloMsgId, { start, end: Date.now() });
      },
    });
    const ids = [uniq('s1'), uniq('s2'), uniq('s3')];
    for (const id of ids) await dm(A, id);
    await until(() => spans.size === 3);
    const [s1, s2, s3] = ids.map((i) => spans.get(i)!);
    expect(s2!.start).toBeGreaterThanOrEqual(s1!.end);
    expect(s3!.start).toBeGreaterThanOrEqual(s2!.end);
    ctl.abort();
    await loop;
  }, 20_000);

  it('RUNNER_CONCURRENCY=1: thread khac phai cho (dieu kien nen cua ca do G23 serial)', async () => {
    await skipStale();
    const A = uniq('runC1a');
    const B = uniq('runC1b');
    const ends = new Map<string, number>();
    const ctl = new AbortController();
    const loop = runDispatcher({
      signal: ctl.signal,
      concurrency: 1,
      intervalMs: 20,
      timers: false,
      heartbeat: false,
      handler: async (e) => {
        if (e.threadId === A) await sleep(800);
        ends.set(e.zaloMsgId, Date.now());
      },
    });
    const a = uniq('a');
    const b = uniq('b');
    const t0 = Date.now();
    await dm(A, a);
    await sleep(50);
    await dm(B, b);
    await until(() => ends.has(b));
    expect(ends.get(b)! - t0).toBeGreaterThanOrEqual(800);
    ctl.abort();
    await loop;
  }, 20_000);

  it('claimNextInbound(exclude): bo qua thread dang chay; thread co tin cu hon chua xu ly thi tin sau khong duoc nhan', async () => {
    await skipStale();
    const A = uniq('claimA');
    const B = uniq('claimB');
    await dm(A, uniq('a1'));
    await dm(A, uniq('a2'));
    await dm(B, uniq('b1'));
    const first = await claimNextInbound([]);
    expect(first!.threadId).toBe(A);
    // thread A dang chay (exclude) ⇒ nhan tin cua B, KHONG phai a2
    const second = await claimNextInbound([A]);
    expect(second!.threadId).toBe(B);
    // khong exclude nhung a1 da nhan (processed) ⇒ a2 duoc nhan (nguoi goi phai tu exclude de giu thu tu)
    const third = await claimNextInbound([]);
    expect(third!.threadId).toBe(A);
    expect(await claimNextInbound([])).toBeNull();
  });

  it('dau song: process_heartbeats(runner) co beat_at moi + info.concurrency', async () => {
    await skipStale();
    process.env.HEARTBEAT_INTERVAL_MS = '1000';
    try {
      const ctl = new AbortController();
      const loop = runDispatcher({ signal: ctl.signal, concurrency: 3, intervalMs: 50, timers: false });
      await until(async () => (await count(`select 1 from process_heartbeats where name = 'runner' and beat_at > now() - interval '5 seconds'`)) === 1, 5000);
      const hb = await sql<{ pid: number; info: { concurrency: number; inflight: number } }>(`select pid, info from process_heartbeats where name = 'runner'`);
      expect(hb[0]!.pid).toBe(process.pid);
      expect(hb[0]!.info).toMatchObject({ concurrency: 3, inflight: 0 });
      ctl.abort();
      await loop;
    } finally {
      delete process.env.HEARTBEAT_INTERVAL_MS;
    }
  }, 15_000);

  it('dung em: abort cho luot dang chay xong (toi da RUNNER_DRAIN_MS)', async () => {
    await skipStale();
    const A = uniq('drain');
    let finished = false;
    const ctl = new AbortController();
    const loop = runDispatcher({
      signal: ctl.signal,
      concurrency: 2,
      intervalMs: 20,
      timers: false,
      heartbeat: false,
      drainMs: 5000,
      handler: async () => {
        await sleep(400);
        finished = true;
      },
    });
    await dm(A, uniq('d'));
    await sleep(120);
    ctl.abort();
    await loop;
    expect(finished).toBe(true);
  }, 15_000);
});

describe('advisory lock mot ban (BB-19)', () => {
  it('lan 2 cung ten ⇒ null; giai phong roi lay lai duoc; ten khac khong anh huong', async () => {
    const lost: Error[] = [];
    const l1 = await holdAdvisoryLock('lenqclaw:worker:community', (e) => lost.push(e));
    expect(l1).not.toBeNull();
    const l2 = await holdAdvisoryLock('lenqclaw:worker:community', () => undefined);
    expect(l2).toBeNull();
    const other = await holdAdvisoryLock('lenqclaw:runner', () => undefined);
    if (other) await other.release(); // runner that co the dang chay o may dev — khong ket luan gi
    await l1!.release();
    const l3 = await holdAdvisoryLock('lenqclaw:worker:community', () => undefined);
    expect(l3).not.toBeNull();
    await l3!.release();
    expect(lost).toHaveLength(0);
  });

  it('mat ket noi giu khoa ⇒ goi onLost', async () => {
    const lost: Error[] = [];
    const lock = await holdAdvisoryLock('lenqclaw:worker:community', (e) => lost.push(e));
    expect(lock).not.toBeNull();
    const killed = await sql<{ terminated: boolean }>(
      `select pg_terminate_backend(l.pid) as terminated from pg_locks l
        where l.locktype = 'advisory' and l.granted
          and ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended('lenqclaw:worker:community', 0)`
    );
    expect(killed.length).toBeGreaterThanOrEqual(1);
    await until(() => lost.length > 0, 5000);
    expect(lost[0]).toBeInstanceOf(Error);
    await lock!.release();
  });
});

describe('flushAmbient chong chong lan (SPEC-D31 §6)', () => {
  it('da co su kien sys ambient_flush chua xu ly ⇒ khong sinh them; thread dang chay (busyThreads) ⇒ bo qua', async () => {
    await skipStale();
    const g = await mkGroup({ mode: 'ambient' });
    await send({ threadId: g, senderUid: 'sim-mem-2', text: 'tin ambient' });
    // xu ly tin (ingest + defer) bang dispatcher voi pipeline that: dung runTimers truc tiep sau khi dat pending
    await sql(`insert into group_sessions (zalo_account_id, thread_id, pending_since) values ($1,$2, now() - interval '1 minute')
               on conflict (zalo_account_id, thread_id) do update set pending_since = excluded.pending_since`, [ACCOUNT, g]);
    const cfg = readCommunityConfig();
    const now = new Date(Date.now() + 25_000);
    // busy ⇒ bo qua
    await runTimers(now, cfg, { busyThreads: new Set([g]) });
    expect(await count(`select 1 from inbound_events where thread_id = $1 and zalo_msg_id like 'sys-%'`, [g])).toBe(0);
    // khong busy ⇒ 1 su kien; chay lai ⇒ van 1 (su kien chua xu ly)
    await runTimers(now, cfg);
    await runTimers(now, cfg);
    expect(await count(`select 1 from inbound_events where thread_id = $1 and zalo_msg_id like 'sys-%'`, [g])).toBe(1);
    await skipStale(); // don dep: khong de su kien chua xu ly tro lai cho test khac
  });
});
