// packages/core/src/services/ops-watch.ts — giam sat van hanh (D32, BB-20, SPEC-D31 §10.2). SQL thuan, 0 model.
// `checkOps(now, self)` do du 8 loai bao dong; runner goi nhu buoc `opsWatch` cua `runTimers` (tu gioi han moi
// OPS_WATCH_INTERVAL_MS), worker goi bang `every('ops', ...)`. Ca hai co the danh gia CUNG dieu kien (tru heartbeat cua chinh minh)
// — CAS `alert_state` trong adapters/alert.ts bao dam DUNG MOT tin. Noi dung bao dong CHI co loai, khoa, so do, gio VN, duong
// dashboard — CAM noi dung tin, ten thanh vien, uid, prompt, token.

import { sql } from '../adapters/db.js';
import { sendAlert, type AlertInput, type AlertKind, type AlertResult } from '../adapters/alert.js';
import { readCommunityConfig, type CommunityConfig } from './community-config.js';
import { fmtHhmmVn, vnDateString } from './vn-time.js';

export type OpsSelf = 'runner' | 'worker';

export interface OpsReport {
  /** Moi dong = mot lan goi sendAlert (ke ca hoi phuc). */
  results: Array<{ kind: AlertKind; key: string; resolved: boolean; result: AlertResult }>;
  sent: number;
  dbDown: boolean;
}

export interface OpsOptions {
  cfg?: CommunityConfig;
  /** Thoi diem tien trinh khoi dong — chua co dong heartbeat cua ben kia sau HEARTBEAT_STALE_MS ke tu day ⇒ stale. */
  startedAt?: Date;
}

const SLO_P95_MS = { fast: 5000, rag: 15000 } as const;
const MODULE_START = new Date();
let dbFailures = 0;
let dbAlerted = false;

/** Test: dat lai bo dem loi DB trong tien trinh. */
export function resetOpsWatchForTest(): void {
  dbFailures = 0;
  dbAlerted = false;
}

export async function checkOps(now: Date, self: OpsSelf, opts: OpsOptions = {}): Promise<OpsReport> {
  const cfg = opts.cfg ?? readCommunityConfig();
  const report: OpsReport = { results: [], sent: 0, dbDown: false };
  const emit = async (a: AlertInput, localOnly = false): Promise<void> => {
    const result = await sendAlert(a, localOnly ? { localOnly: true } : {});
    report.results.push({ kind: a.kind, key: a.key, resolved: a.resolved === true, result });
    if (result === 'sent') report.sent++;
  };
  const stamp = `${vnDateString(now)} ${fmtHhmmVn(now)} gio VN`;

  // --- db_unreachable: 3 lan lien that bai ket noi ⇒ bao (localOnly, khong dung DB) ---
  try {
    await sql('select 1');
  } catch {
    dbFailures++;
    report.dbDown = true;
    if (dbFailures >= 3) {
      dbAlerted = true;
      await emit({ kind: 'db_unreachable', key: self, severity: 'critical', text: `${self} khong ket noi duoc DB ${dbFailures} lan lien (${stamp}).` }, true);
    }
    return report;
  }
  dbFailures = 0;
  if (dbAlerted) {
    dbAlerted = false;
    await emit({ kind: 'db_unreachable', key: self, severity: 'critical', text: `${self} ket noi lai DB (${stamp}).`, resolved: true }, true);
  }

  // --- zalo_session ---
  const acc = await sql<{ session_state: string; cookie_expired: boolean }>(
    `select a.session_state,
            exists (select 1 from audit_log l where l.action = 'zalo.alert' and l.target = a.id and l.data->>'kind' = 'cookie_expired'
                     and l.created_at > $1::timestamptz - interval '10 minutes') as cookie_expired
       from zalo_accounts a where a.id = 'community'`,
    [now]
  );
  const st = acc[0];
  if (st) {
    if (st.session_state === 'kicked' || st.session_state === 'dead' || (st.cookie_expired && st.session_state !== 'connected')) {
      const why = st.session_state === 'kicked' || st.session_state === 'dead' ? st.session_state : 'cookie_expired';
      await emit({ kind: 'zalo_session', key: 'community', severity: 'critical', text: `Phien Zalo "community" khong con hoat dong (${why}) luc ${stamp}. Mo /zalo de dang nhap lai bang QR.` });
    } else if (st.session_state === 'connected') {
      await emit({ kind: 'zalo_session', key: 'community', severity: 'critical', text: `Phien Zalo "community" da ket noi lai (${stamp}).`, resolved: true });
    }
  }

  // --- heartbeat cua ben kia ---
  const beats = await sql<{ name: string; age_ms: number; oldest_inflight_ms: number | null }>(
    `select name, (extract(epoch from ($1::timestamptz - beat_at)) * 1000)::float8 as age_ms,
            (info->>'oldest_inflight_ms')::float8 as oldest_inflight_ms
       from process_heartbeats where name in ('runner','worker')`,
    [now]
  );
  const beat = (n: string) => beats.find((b) => b.name === n);
  const startedAt = opts.startedAt ?? MODULE_START;
  const sinceStart = now.getTime() - startedAt.getTime();
  const staleCheck = async (name: 'runner' | 'worker', kind: 'runner_stale' | 'worker_stale'): Promise<void> => {
    const b = beat(name);
    const missing = b === undefined && sinceStart >= cfg.heartbeatStaleMs;
    const stale = b !== undefined && b.age_ms > cfg.heartbeatStaleMs;
    if (missing || stale) {
      const age = b === undefined ? 'chua tung co dau song' : `dau song cuoi ${Math.round(b.age_ms / 1000)} s truoc`;
      await emit({ kind, key: name, severity: 'critical', text: `${name} mat dau song: ${age} (nguong ${Math.round(cfg.heartbeatStaleMs / 1000)} s) luc ${stamp}. Kiem tra tien trinh va /zalo.` });
    } else if (b !== undefined) {
      await emit({ kind, key: name, severity: 'critical', text: `${name} da co dau song tro lai (${stamp}).`, resolved: true });
    }
  };
  // Moi tien trinh canh BEN KIA (runner chet khong tu bao duoc).
  if (self === 'worker') await staleCheck('runner', 'runner_stale');
  if (self === 'runner') await staleCheck('worker', 'worker_stale');

  // --- inbound_backlog (worker canh: runner song nhung ket thi khong tu thay) ---
  if (self === 'worker') {
    const q = await sql<{ c: number }>(
      `select count(*)::int as c from inbound_events where processed_at is null and received_at < $1::timestamptz - interval '60 seconds'`,
      [now]
    );
    const backlog = q[0]?.c ?? 0;
    if (backlog >= 1) {
      await emit({ kind: 'inbound_backlog', key: 'queue', severity: 'warning', text: `${backlog} tin den chua duoc xu ly qua 60 s luc ${stamp}. Kiem tra runner (/agent).` });
    } else {
      await emit({ kind: 'inbound_backlog', key: 'queue', severity: 'warning', text: `Hang doi tin den da het ket (${stamp}).`, resolved: true });
    }
    const oldest = beat('runner')?.oldest_inflight_ms ?? 0;
    if (oldest > cfg.turnStuckMs) {
      await emit({ kind: 'inbound_backlog', key: 'stuck', severity: 'warning', text: `Mot luot dang chay ${Math.round(oldest / 1000)} s (nguong ${Math.round(cfg.turnStuckMs / 1000)} s) luc ${stamp}. Kiem tra runner.` });
    } else {
      await emit({ kind: 'inbound_backlog', key: 'stuck', severity: 'warning', text: `Het luot ket (${stamp}).`, resolved: true });
    }
  }

  if (self === 'runner') {
    // --- model_down ---
    const m = await sql<{ bad: number; ok: number }>(
      `select count(*) filter (where outcome in ('error','deadline'))::int as bad, count(*) filter (where outcome = 'ok')::int as ok
         from agent_runs where route = 'community' and created_at > $1::timestamptz - interval '10 minutes' and created_at <= $1::timestamptz`,
      [now]
    );
    const mm = m[0] ?? { bad: 0, ok: 0 };
    if (mm.bad >= cfg.alertModelErrors && mm.ok === 0) {
      await emit({ kind: 'model_down', key: 'community', severity: 'critical', text: `Model chinh loi ${mm.bad} lan trong 10 phut, 0 lan thanh cong, luc ${stamp}. Kiem tra khoa/quota model (/agent).` });
    } else if (mm.ok > 0) {
      await emit({ kind: 'model_down', key: 'community', severity: 'critical', text: `Model chinh da tra loi lai (${stamp}).`, resolved: true });
    }

    // --- slo_breach (60 phut, n >= 10) ---
    const lanes = await sql<{ lane: 'fast' | 'rag'; n: number; p95: number | null; hit: number | null }>(
      `select lane, count(*)::int as n, percentile_cont(0.95) within group (order by core_ms)::float8 as p95,
              avg(deadline_hit::int)::float8 as hit
         from reply_latency where received_at > $1::timestamptz - interval '60 minutes' and received_at <= $1::timestamptz
        group by lane`,
      [now]
    );
    for (const lane of ['fast', 'rag'] as const) {
      const row = lanes.find((l) => l.lane === lane);
      const breach = row !== undefined && row.n >= 10 && ((row.p95 ?? 0) > SLO_P95_MS[lane] || (row.hit ?? 0) > 0.05);
      if (breach) {
        await emit({
          kind: 'slo_breach',
          key: lane,
          severity: 'warning',
          text: `Lan ${lane} vuot SLO trong 60 phut: n=${row.n}, p95 core_ms=${Math.round(row.p95 ?? 0)} (SLO ${SLO_P95_MS[lane]}), deadline_hit=${Math.round((row.hit ?? 0) * 100)}% (tran 5%) luc ${stamp}. Xem /agent.`,
        });
      } else {
        await emit({ kind: 'slo_breach', key: lane, severity: 'warning', text: `Lan ${lane} da tro lai trong SLO (${stamp}).`, resolved: true });
      }
    }

    // --- bot_not_admin ---
    const bad = await sql<{ thread_id: string }>(
      `select thread_id from zalo_groups where zalo_account_id = 'community' and enabled and not bot_is_admin and last_synced_at is not null order by thread_id`
    );
    for (const g of bad) {
      await emit({ kind: 'bot_not_admin', key: g.thread_id.slice(0, 64), severity: 'warning', text: `Bot khong con la pho nhom o nhom ${g.thread_id} luc ${stamp}. Mo /groups de xem.` });
    }
    const open = await sql<{ key: string }>(
      `select s.key from alert_state s where s.kind = 'bot_not_admin' and s.open
          and not exists (select 1 from zalo_groups g where g.zalo_account_id = 'community' and g.thread_id = s.key
                           and g.enabled and not g.bot_is_admin and g.last_synced_at is not null)`
    );
    for (const o of open) {
      await emit({ kind: 'bot_not_admin', key: o.key, severity: 'warning', text: `Bot da la pho nhom tro lai o nhom ${o.key} (${stamp}).`, resolved: true });
    }
  }

  return report;
}
