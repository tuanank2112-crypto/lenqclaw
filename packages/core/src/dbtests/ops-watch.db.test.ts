// ops-watch.db.test.ts — G24 (D32, BB-20): checkOps tren DB that + fetch Telegram GIA (0 mang). Moi kind duoc do qua
// `report.results` (kind, key, ket qua) va qua so lan fetch khop noi dung; trang thai dung chung (heartbeat, alert_state,
// phien Zalo) duoc luu/khoi phuc. Cac kind dung cua so thoi gian dung `now` gia (nam 2031) de cach ly khoi du lieu dev.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAlertFetchForTest } from '../adapters/alert.js';
import { closeDb, sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { checkOps, resetOpsWatchForTest, type OpsReport } from '../services/ops-watch.js';
import { opsWatch, resetOpsWatchThrottleForTest } from '../services/timers.js';
import { readCommunityConfig } from '../services/community-config.js';

const TOKEN_ENV = ['TELEGRAM', 'BOT', 'TOKEN'].join('_');
const TOKEN = '888000222:AAFAKE-db-test-token';
let texts: string[] = [];

type Row = Record<string, unknown>;
let savedBeats: Row[] = [];
let savedAlertState: Row[] = [];
let savedState = 'logged_out';

async function setBeat(name: 'runner' | 'worker', ageSec: number, info: Row = {}): Promise<void> {
  await sql(
    `insert into process_heartbeats (name, pid, host, started_at, beat_at, info)
     values ($1, 1, 'test', now(), now() - make_interval(secs => $2), $3::jsonb)
     on conflict (name) do update set beat_at = excluded.beat_at, info = excluded.info`,
    [name, ageSec, JSON.stringify(info)]
  );
}
const setSession = (s: string) => sql(`update zalo_accounts set session_state = $1 where id = 'community'`, [s]);
const sentOf = (r: OpsReport, kind: string, key?: string) =>
  r.results.filter((x) => x.kind === kind && x.result === 'sent' && (key === undefined || x.key === key));

beforeAll(async () => {
  savedBeats = await sql(`select name, pid, host, started_at::text as started_at, beat_at::text as beat_at, info from process_heartbeats`);
  savedAlertState = await sql(`select * from alert_state`);
  savedState = (await sql<{ session_state: string }>(`select session_state from zalo_accounts where id = 'community'`))[0]!.session_state;
});

beforeEach(async () => {
  texts = [];
  process.env[TOKEN_ENV] = TOKEN;
  process.env.TELEGRAM_CHAT_ID = '-100999';
  setAlertFetchForTest((async (_u: string, init: RequestInit) => {
    texts.push(String(JSON.parse(String(init.body)).text));
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch);
  resetOpsWatchForTest();
  resetOpsWatchThrottleForTest();
  await sql(`delete from alert_state`);
  await sql(`delete from audit_log where action in ('alert.sent','alert.capped')  and created_at > now() - interval '2 hours'`);
  await setSession('connected');
  await setBeat('runner', 1);
  await setBeat('worker', 1);
});

afterEach(() => {
  setAlertFetchForTest(null);
  delete process.env[TOKEN_ENV];
  delete process.env.TELEGRAM_CHAT_ID;
});

afterAll(async () => {
  await sql(`delete from process_heartbeats`);
  for (const b of savedBeats) {
    await sql(`insert into process_heartbeats (name, pid, host, started_at, beat_at, info) values ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6::jsonb)`, [
      b.name, b.pid, b.host, b.started_at, b.beat_at, JSON.stringify(b.info),
    ]);
  }
  await sql(`delete from alert_state`);
  for (const a of savedAlertState) {
    await sql(`insert into alert_state (kind, key, open, last_sent_at, sent_count, suppressed) values ($1,$2,$3,$4,$5,$6)`, [
      a.kind, a.key, a.open, a.last_sent_at, a.sent_count, a.suppressed,
    ]);
  }
  await setSession(savedState);
  await closeDb();
});

describe('G24 — runner_stale / worker_stale', () => {
  it('heartbeat runner cu 120 s ⇒ checkOps(now,"worker") ⇒ DUNG 1 fetch; goi lai 3 lan trong 30 phut ⇒ van 1; heartbeat moi ⇒ +1 tin hoi phuc', async () => {
    await setBeat('runner', 120);
    const stale = () => texts.filter((t) => t.includes('runner mat dau song'));
    const r1 = await checkOps(new Date(), 'worker');
    expect(sentOf(r1, 'runner_stale', 'runner')).toHaveLength(1);
    expect(stale()).toHaveLength(1);
    for (let i = 0; i < 3; i++) await checkOps(new Date(), 'worker');
    expect(stale()).toHaveLength(1);
    await setBeat('runner', 1);
    const r2 = await checkOps(new Date(), 'worker');
    expect(sentOf(r2, 'runner_stale', 'runner')).toHaveLength(1);
    expect(texts.filter((t) => t.includes('✅ đã hồi phục') && t.includes('runner'))).toHaveLength(1);
    // chua co su co ⇒ khong gui them hoi phuc
    await checkOps(new Date(), 'worker');
    expect(texts.filter((t) => t.includes('✅ đã hồi phục') && t.includes('runner'))).toHaveLength(1);
  });

  it('runner canh worker (worker_stale); khong tu canh chinh minh (runner stale + self=runner ⇒ khong bao runner_stale)', async () => {
    await setBeat('worker', 200);
    const r = await checkOps(new Date(), 'runner');
    expect(sentOf(r, 'worker_stale', 'worker')).toHaveLength(1);
    await setBeat('worker', 1);
    await setBeat('runner', 500);
    const r2 = await checkOps(new Date(), 'runner');
    expect(r2.results.some((x) => x.kind === 'runner_stale')).toBe(false);
  });

  it('chua tung co dong heartbeat: chi bao khi tien trinh da chay >= HEARTBEAT_STALE_MS', async () => {
    await sql(`delete from process_heartbeats where name = 'runner'`);
    const cfg = readCommunityConfig();
    const young = await checkOps(new Date(), 'worker', { startedAt: new Date(Date.now() - 5000) });
    expect(young.results.some((x) => x.kind === 'runner_stale')).toBe(false);
    const old = await checkOps(new Date(), 'worker', { startedAt: new Date(Date.now() - cfg.heartbeatStaleMs - 1000) });
    expect(sentOf(old, 'runner_stale', 'runner')).toHaveLength(1);
  });
});

describe('G24 — zalo_session', () => {
  it('runner VA worker cung luc thay phien "dead" ⇒ tong DUNG 1 tin zalo_session', async () => {
    await setSession('dead');
    const [a, b] = await Promise.all([checkOps(new Date(), 'runner'), checkOps(new Date(), 'worker')]);
    expect(sentOf(a, 'zalo_session').length + sentOf(b, 'zalo_session').length).toBe(1);
    expect(texts.filter((t) => t.includes('Phien Zalo'))).toHaveLength(1);
    // connected lai ⇒ 1 tin hoi phuc
    await setSession('connected');
    await checkOps(new Date(), 'runner');
    expect(texts.filter((t) => t.includes('✅ đã hồi phục') && t.includes('Phien Zalo'))).toHaveLength(1);
  });

  it('audit zalo.alert cookie_expired trong 10 phut (phien logged_out) ⇒ bao; qua 10 phut ⇒ khong', async () => {
    await setSession('logged_out');
    await sql(
      `insert into audit_log (actor_type, actor_id, action, target, data, created_at)
       values ('system','zalo-worker','zalo.alert','community','{"kind":"cookie_expired"}'::jsonb, now() - interval '3 minutes')`
    );
    const r = await checkOps(new Date(), 'runner');
    expect(sentOf(r, 'zalo_session')).toHaveLength(1);
    const later = await checkOps(new Date(Date.now() + 20 * 60_000), 'runner');
    expect(later.results.some((x) => x.kind === 'zalo_session')).toBe(false);
  });
});

describe('G24 — inbound_backlog / model_down / slo_breach / bot_not_admin', () => {
  it('runner song nhung 1 luot ket qua TURN_STUCK_MS ⇒ worker bao inbound_backlog (stuck); het ket ⇒ hoi phuc', async () => {
    await setBeat('runner', 1, { inflight: 1, oldest_inflight_ms: 999_999 });
    const r = await checkOps(new Date(), 'worker');
    expect(sentOf(r, 'inbound_backlog', 'stuck')).toHaveLength(1);
    await setBeat('runner', 1, { inflight: 0, oldest_inflight_ms: 0 });
    const r2 = await checkOps(new Date(), 'worker');
    expect(sentOf(r2, 'inbound_backlog', 'stuck')).toHaveLength(1);
    expect(texts.some((t) => t.includes('Het luot ket'))).toBe(true);
  });

  it('tin den chua xu ly > 60 s ⇒ worker bao inbound_backlog (queue)', async () => {
    const thread = `ops-${randomUUID().slice(0, 8)}`;
    await sql(
      `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, received_at)
       values ('community', $1, $2, 'user', 'u', false, '{}'::jsonb, now() - interval '5 minutes')`,
      [`ops-${thread}`, thread]
    );
    try {
      const r = await checkOps(new Date(), 'worker');
      expect(sentOf(r, 'inbound_backlog', 'queue')).toHaveLength(1);
    } finally {
      await sql(`delete from inbound_events where thread_id = $1`, [thread]);
    }
  });

  it('model_down: 5 agent_runs loi, 0 ok trong 10 phut ⇒ 1 tin; co lan ok ⇒ hoi phuc', async () => {
    const t0 = new Date('2031-03-01T10:00:00Z');
    const mk = async (outcome: string, at: string) =>
      sql(`insert into agent_runs (route, model, latency_ms, outcome, created_at) values ('community','m',10,$1,$2::timestamptz)`, [outcome, at]);
    for (let i = 0; i < 5; i++) await mk(i % 2 ? 'error' : 'deadline', '2031-03-01T09:55:00Z');
    try {
      const r = await checkOps(t0, 'runner');
      expect(sentOf(r, 'model_down', 'community')).toHaveLength(1);
      const again = await checkOps(t0, 'runner');
      expect(sentOf(again, 'model_down')).toHaveLength(0);
      await mk('ok', '2031-03-01T09:58:00Z');
      const rec = await checkOps(t0, 'runner');
      expect(sentOf(rec, 'model_down')).toHaveLength(1); // hoi phuc
      expect(texts.some((x) => x.includes('Model chinh da tra loi lai'))).toBe(true);
    } finally {
      await sql(`delete from agent_runs where created_at >= '2031-03-01' and created_at < '2031-03-02'`);
    }
  });

  it('slo_breach: 10 dong reply_latency fast core_ms 7000 ⇒ DUNG 1 tin; 9 dong ⇒ khong bao (n < 10)', async () => {
    const base = new Date('2031-03-02T10:00:00Z');
    const thread = `slo-${randomUUID().slice(0, 8)}`;
    const insert = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const ev = 9_000_000_000 + Math.floor(Math.random() * 1e9);
        const recv = new Date(base.getTime() - 10 * 60_000).toISOString();
        await sql(
          `insert into turn_traces (zalo_account_id, thread_id, thread_type, kind, outcome, lane, inbound_event_id, received_at, model_ms)
           values ('community', $1, 'group', 'group_mention', 'replied', 'fast', $2, $3::timestamptz, 1000)`,
          [thread, ev, recv]
        );
        const o = Number(await enqueue({ zaloAccountId: 'community', threadId: thread, threadType: 'group', kind: 'text', body: { text: 'x' }, inboundEventId: ev }));
        await sql(
          `update outbox set status = 'sent', created_at = $2::timestamptz + interval '1 second', picked_at = $2::timestamptz + interval '6500 ms',
                  sent_at = $2::timestamptz + interval '7 seconds' where id = $1`,
          [o, recv]
        );
      }
    };
    try {
      await insert(9);
      const none = await checkOps(base, 'runner');
      expect(sentOf(none, 'slo_breach')).toHaveLength(0);
      await insert(1);
      const r = await checkOps(base, 'runner');
      expect(sentOf(r, 'slo_breach', 'fast')).toHaveLength(1);
      const again = await checkOps(base, 'runner');
      expect(sentOf(again, 'slo_breach', 'fast')).toHaveLength(0); // chong lap
      expect(texts.filter((t) => t.includes('Lan fast vuot SLO'))).toHaveLength(1);
    } finally {
      await sql(`delete from outbox where thread_id = $1`, [thread]);
      await sql(`delete from turn_traces where thread_id = $1`, [thread]);
    }
  });

  it('bot_not_admin: nhom bat, bot khong phai pho nhom, da dong bo ⇒ 1 tin; bot_is_admin=true ⇒ hoi phuc', async () => {
    const thread = `na-${randomUUID().slice(0, 8)}`;
    await sql(
      `insert into zalo_groups (zalo_account_id, thread_id, name, enabled, bot_is_admin, last_synced_at) values ('community', $1, 'Nhom thu', true, false, now())`,
      [thread]
    );
    try {
      const r = await checkOps(new Date(), 'runner');
      expect(sentOf(r, 'bot_not_admin', thread)).toHaveLength(1);
      const dup = await checkOps(new Date(), 'runner');
      expect(sentOf(dup, 'bot_not_admin', thread)).toHaveLength(0);
      await sql(`update zalo_groups set bot_is_admin = true where thread_id = $1`, [thread]);
      const rec = await checkOps(new Date(), 'runner');
      expect(rec.results.filter((x) => x.kind === 'bot_not_admin' && x.key === thread && x.resolved && x.result === 'sent')).toHaveLength(1);
    } finally {
      await sql(`delete from zalo_groups where thread_id = $1`, [thread]);
    }
  });

  it('nhom chua dong bo (last_synced_at null) hoac tat ⇒ khong bao', async () => {
    const thread = `na2-${randomUUID().slice(0, 8)}`;
    await sql(`insert into zalo_groups (zalo_account_id, thread_id, name, enabled, bot_is_admin) values ('community', $1, 'x', true, false)`, [thread]);
    try {
      const r = await checkOps(new Date(), 'runner');
      expect(r.results.some((x) => x.kind === 'bot_not_admin' && x.key === thread)).toBe(false);
    } finally {
      await sql(`delete from zalo_groups where thread_id = $1`, [thread]);
    }
  });
});

describe('G24 — tran ALERT_MAX_PER_HOUR, thieu TELEGRAM_*, opsWatch tu gioi han', () => {
  it('thieu TELEGRAM_* ⇒ moi ket qua "disabled", 0 fetch', async () => {
    delete process.env[TOKEN_ENV];
    await setBeat('runner', 300);
    const r = await checkOps(new Date(), 'worker');
    expect(r.results.some((x) => x.kind === 'runner_stale' && x.result === 'disabled')).toBe(true);
    expect(texts).toHaveLength(0);
  });

  it('da co 20 audit alert.sent trong 60 phut ⇒ suppressed + audit alert.capped, 0 fetch', async () => {
    for (let i = 0; i < 20; i++) {
      await sql(`insert into audit_log (actor_type, actor_id, action, target, data) values ('system','alert','alert.sent','x','{}'::jsonb)`);
    }
    try {
      await setBeat('runner', 300);
      const r = await checkOps(new Date(), 'worker');
      expect(r.results.find((x) => x.kind === 'runner_stale')?.result).toBe('suppressed');
      expect(texts).toHaveLength(0);
      const capped = await sql<{ c: number }>(`select count(*)::int as c from audit_log where action = 'alert.capped' and created_at > now() - interval '1 minute'`);
      expect(capped[0]!.c).toBeGreaterThanOrEqual(1);
    } finally {
      await sql(`delete from audit_log where action in ('alert.sent','alert.capped') and created_at > now() - interval '5 minutes'`);
    }
  });

  it('runTimers buoc opsWatch tu gioi han moi OPS_WATCH_INTERVAL_MS (theo now tham so)', async () => {
    const cfg = readCommunityConfig();
    await setBeat('worker', 300);
    const t0 = new Date();
    expect(await opsWatch(t0, cfg)).toBeGreaterThanOrEqual(1); // worker_stale gui
    await sql(`delete from alert_state`);
    expect(await opsWatch(new Date(t0.getTime() + 1000), cfg)).toBe(0); // trong 60 s ⇒ bo qua (khong chay)
    expect(await opsWatch(new Date(t0.getTime() + cfg.opsWatchIntervalMs + 1), cfg)).toBeGreaterThanOrEqual(1);
  });
});
