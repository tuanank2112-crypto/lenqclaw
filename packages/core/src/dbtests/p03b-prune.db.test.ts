// p03b-prune.db.test.ts — SPEC-D31 §11 (D32 e4): pruneBuffers don turn_traces/agent_runs (TRACE_RETENTION_DAYS 180) va
// audit_log (AUDIT_RETENTION_DAYS 365), toi da 5000 dong / tick / bang. Dong "cu" dat o nam 2000 de luon la dong cu nhat.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { readCommunityConfig } from '../services/community-config.js';
import { PRUNE_BATCH, pruneBuffers } from '../services/timers.js';

const cfg = readCommunityConfig();
const NOW = new Date(); // ngay that: dong dev cu hon 180 ngay (neu co) bi don dung chinh sach
const count = async (q: string): Promise<number> => (await sql<{ c: number }>(q))[0]!.c;

afterEach(async () => {
  await sql(`delete from audit_log where action = 'prune.test'`);
  await sql(`delete from agent_runs where route = 'prune-test'`);
  await sql(`delete from turn_traces where thread_id = 'prune-test'`);
});
afterAll(async () => {
  await closeDb();
});

describe('pruneBuffers — giu du lieu van hanh (§11)', () => {
  it('mac dinh 180 / 365 ngay', () => {
    expect([cfg.traceRetentionDays, cfg.auditRetentionDays]).toEqual([180, 365]);
  });

  it('turn_traces + agent_runs > 180 ngay bi xoa, <= 180 ngay giu; audit_log 365: 300 ngay giu, 400 ngay xoa', async () => {
    const mkTrace = (daysAgo: number) =>
      sql(
        `insert into turn_traces (zalo_account_id, thread_id, thread_type, kind, outcome, created_at)
         values ('community','prune-test','group','group_mention','replied', $1::timestamptz - make_interval(days => $2))`,
        [NOW, daysAgo]
      );
    const mkRun = (daysAgo: number) =>
      sql(`insert into agent_runs (route, outcome, created_at) values ('prune-test','ok', $1::timestamptz - make_interval(days => $2))`, [NOW, daysAgo]);
    const mkAudit = (daysAgo: number) =>
      sql(`insert into audit_log (actor_type, action, created_at) values ('system','prune.test', $1::timestamptz - make_interval(days => $2))`, [NOW, daysAgo]);
    for (const d of [10, 179, 181, 400]) {
      await mkTrace(d);
      await mkRun(d);
    }
    for (const d of [10, 300, 364, 366, 800]) await mkAudit(d);
    const removed = await pruneBuffers(NOW, cfg);
    expect(removed).toBeGreaterThanOrEqual(2 + 2 + 2);
    expect(await count(`select count(*)::int as c from turn_traces where thread_id = 'prune-test'`)).toBe(2);
    expect(await count(`select count(*)::int as c from agent_runs where route = 'prune-test'`)).toBe(2);
    const left = await sql<{ d: number }>(`select round(extract(epoch from ($1::timestamptz - created_at)) / 86400)::int as d from audit_log where action = 'prune.test' order by 1`, [NOW]);
    expect(left.map((r) => r.d)).toEqual([10, 300, 364]);
  });

  it(`toi da ${PRUNE_BATCH} dong / tick / bang: ${PRUNE_BATCH + 3} dong audit cu ⇒ tick 1 xoa ${PRUNE_BATCH}, con 3; tick 2 xoa not`, async () => {
    await sql(
      `insert into audit_log (actor_type, action, created_at)
       select 'system', 'prune.test', '2000-01-01T00:00:00Z'::timestamptz + (g || ' seconds')::interval from generate_series(1, $1::int) g`,
      [PRUNE_BATCH + 3]
    );
    await pruneBuffers(NOW, cfg);
    expect(await count(`select count(*)::int as c from audit_log where action = 'prune.test'`)).toBe(3);
    await pruneBuffers(NOW, cfg);
    expect(await count(`select count(*)::int as c from audit_log where action = 'prune.test'`)).toBe(0);
  });
});
