// packages/core/src/services/timers.ts — dong ho khong pg-boss (01-CONTRACTS §1).
// `runTimers(now, cfg, ctx)` nhan `now` THAM SO — CAM `Date.now()` / `now()` cua Postgres trong so sanh. Moi buoc
// idempotent va doc lap, SQL thuan, 0 model. Gom luong cua P03: `flushAmbient` (SPEC-P03 §4.2) va `pruneBuffers`
// (BB-11); P04–P07 them buoc con lai (cau hoi bo trong, chao thanh vien, lich, het han the duyet, bao cao ngay...).

import { sql } from '../adapters/db.js';
import { audit } from './audit.js';
import { readCommunityConfig, type CommunityConfig } from './community-config.js';
import { enqueueSystemEvent } from './system-events.js';
import { checkOps } from './ops-watch.js';
import { embedPending, pickUnanswered } from './knowledge.js';
import { expireApprovals } from './approvals.js';
import { expireJoinRequests } from './join-requests.js';
import { reconcileDeletes } from './moderation.js';
import { flushWelcomes } from './welcome.js';

export interface TimerReport {
  /** Ten buoc → so muc da xu ly. */
  steps: Record<string, number>;
}

/** D31: runner song song truyen cac thread dang chay — timers bo qua de khong tao luot chong. */
export interface TimerContext {
  busyThreads?: ReadonlySet<string>;
  /** D32: bat buoc `opsWatch` (runner that bat; sim tick/test khong ⇒ khong them khoa `opsWatch` vao `steps`). */
  opsWatch?: boolean;
  /** D32: thoi diem runner khoi dong (cho canh heartbeat worker chua tung co). */
  startedAt?: Date;
}

/** Hang so §11: toi da bao nhieu dong xoa / tick / bang vet van hanh. */
export const PRUNE_BATCH = 5000;

/**
 * `flushAmbient`: phien `pending_since <= now - AMBIENT_DEBOUNCE_SEC` cua nhom dang bat, mode ambient:
 *  - bo qua thread dang co su kien `sys-%` ambient_flush chua xu ly / dang chay (D31);
 *  - cua so ngan sach `ambient_turns_per_hour` (truot bang `turns_window_start`, reset khi qua 1 gio):
 *    con ⇒ `enqueueSystemEvent({event:'ambient_flush'})`; het ⇒ `pending_since=null`, `last_seen_message_id=max`,
 *    audit `ambient.budget_skip` (khong sinh su kien).
 * `prepare` (khong phai buoc nay) moi dat `pending_since=null`/`turns_in_window++` — truoc model (D28).
 */
export async function flushAmbient(now: Date, cfg: CommunityConfig, ctx: TimerContext = {}): Promise<number> {
  const due = await sql<{
    zalo_account_id: string;
    thread_id: string;
    turns_window_start: Date | null;
    turns_in_window: number;
    ambient_turns_per_hour: number;
    mode: string;
    enabled: boolean;
  }>(
    `select s.zalo_account_id, s.thread_id, s.turns_window_start, s.turns_in_window, g.ambient_turns_per_hour, g.mode, g.enabled
       from group_sessions s
       join zalo_groups g on g.zalo_account_id = s.zalo_account_id and g.thread_id = s.thread_id
      where s.pending_since is not null
        and s.pending_since <= $1::timestamptz - make_interval(secs => $2)
      order by s.pending_since`,
    [now, cfg.ambientDebounceSec]
  );
  let n = 0;
  for (const row of due) {
    if (!row.enabled || row.mode !== 'ambient') {
      // nhom da tat / chuyen ve mention trong luc cho: bo phien cho, khong sinh luot.
      await sql(`update group_sessions set pending_since = null where zalo_account_id = $1 and thread_id = $2`, [row.zalo_account_id, row.thread_id]);
      continue;
    }
    if (ctx.busyThreads?.has(row.thread_id)) continue;
    const inflight = await sql(
      `select 1 from inbound_events
        where zalo_account_id = $1 and thread_id = $2 and sender_uid = 'system' and processed_at is null
          and payload->>'event' = 'ambient_flush' limit 1`,
      [row.zalo_account_id, row.thread_id]
    );
    if (inflight.length > 0) continue;

    const windowFresh =
      row.turns_window_start !== null && now.getTime() - new Date(row.turns_window_start).getTime() < 3_600_000;
    const used = windowFresh ? row.turns_in_window : 0;
    if (used >= row.ambient_turns_per_hour) {
      await sql(
        `update group_sessions
            set pending_since = null,
                last_seen_message_id = greatest(last_seen_message_id,
                  coalesce((select max(id) from group_messages where zalo_account_id = $1 and thread_id = $2), 0))
          where zalo_account_id = $1 and thread_id = $2`,
        [row.zalo_account_id, row.thread_id]
      );
      await audit(sql, { actorType: 'system', actorId: null, action: 'ambient.budget_skip', target: row.thread_id, data: { used } });
      continue;
    }
    await enqueueSystemEvent({ event: 'ambient_flush', threadId: row.thread_id });
    n++;
  }
  return n;
}

/** Xoa toi da `PRUNE_BATCH` dong cu cua mot bang vet (SPEC-D31 §11). `table`/`col` la hang so noi bo, khong tu nguoi dung. */
async function pruneOld(table: 'turn_traces' | 'agent_runs' | 'audit_log', now: Date, days: number): Promise<number> {
  const rows = await sql<{ c: number }>(
    `with del as (
       delete from ${table}
        where id in (select id from ${table} where created_at < $1::timestamptz - make_interval(days => $2)
                      order by created_at limit ${PRUNE_BATCH})
        returning 1)
     select count(*)::int as c from del`,
    [now, days]
  );
  return rows[0]?.c ?? 0;
}

/** BB-11: giu <= GROUP_BUFFER_MAX tin/nhom va <= GROUP_BUFFER_RETENTION_DAYS ngay. D32 e4 (SPEC-D31 §11): them
 * `turn_traces`/`agent_runs` > TRACE_RETENTION_DAYS (180) va `audit_log` > AUDIT_RETENTION_DAYS (365), <= 5000 dong/tick/bang.
 * Tra tong so dong da xoa. */
export async function pruneBuffers(now: Date, cfg: CommunityConfig): Promise<number> {
  const old = await sql<{ id: number }>(
    `delete from group_messages where received_at < $1::timestamptz - make_interval(days => $2) returning id::int as id`,
    [now, cfg.groupBufferRetentionDays]
  );
  const over = await sql<{ id: number }>(
    `delete from group_messages
      where id in (select id from (select id, row_number() over (partition by zalo_account_id, thread_id order by id desc) as rn
                                     from group_messages) t where t.rn > $1)
      returning id::int as id`,
    [cfg.groupBufferMax]
  );
  const traces = await pruneOld('turn_traces', now, cfg.traceRetentionDays);
  const runs = await pruneOld('agent_runs', now, cfg.traceRetentionDays);
  const audits = await pruneOld('audit_log', now, cfg.auditRetentionDays);
  return old.length + over.length + traces + runs + audits;
}

let lastOpsWatchMs = 0;

/** Test: xoa moc gioi han tan suat opsWatch. */
export function resetOpsWatchThrottleForTest(): void {
  lastOpsWatchMs = 0;
}

/** D32 buoc `opsWatch`: tu gioi han moi OPS_WATCH_INTERVAL_MS (theo `now` tham so). Tra so tin bao dong da GUI (0 khi bo qua). */
export async function opsWatch(now: Date, cfg: CommunityConfig, ctx: TimerContext = {}): Promise<number> {
  if (lastOpsWatchMs !== 0 && now.getTime() - lastOpsWatchMs < cfg.opsWatchIntervalMs) return 0;
  lastOpsWatchMs = now.getTime();
  const rep = await checkOps(now, 'runner', { cfg, ...(ctx.startedAt ? { startedAt: ctx.startedAt } : {}) });
  return rep.sent;
}

/** P07 §2: loi mot buoc ⇒ audit `timer.error {step}` + tiep buoc sau (ap cho cac buoc P04; buoc cu giu hanh vi cu). */
async function safeStep(step: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    await audit(sql, { actorType: 'system', actorId: null, action: 'timer.error', target: step, data: { step, error: err instanceof Error ? err.name : 'unknown' } }).catch(() => undefined);
    return 0;
  }
}

/** Thu tu theo SPEC-P07 §2: #2 flushAmbient · #4 pickUnanswered (P04 §5) · #6 expireApprovals (P05 §5.5) ·
 * #7 reconcileDeletes (P05 §9) · #8 pruneBuffers · #9 embedPending (P04 §1, <= 50 muc) · #13 opsWatch. */
export async function runTimers(now: Date, cfg: CommunityConfig = readCommunityConfig(), ctx: TimerContext = {}): Promise<TimerReport> {
  const steps: Record<string, number> = {};
  steps.flushAmbient = await flushAmbient(now, cfg, ctx);
  steps.flushWelcomes = await safeStep('flushWelcomes', () => flushWelcomes(now, cfg, ctx.busyThreads ? { busyThreads: ctx.busyThreads } : {}));
  steps.pickUnanswered = await safeStep('pickUnanswered', () => pickUnanswered(now, cfg, ctx.busyThreads));
  steps.expireApprovals = await safeStep('expireApprovals', () => expireApprovals(now));
  steps.expireJoinRequests = await safeStep('expireJoinRequests', () => expireJoinRequests(now));
  steps.reconcileDeletes = await safeStep('reconcileDeletes', () => reconcileDeletes(now));
  steps.pruneBuffers = await pruneBuffers(now, cfg);
  steps.embedPending = await safeStep('embedPending', () => embedPending(50, now));
  if (ctx.opsWatch) steps.opsWatch = await opsWatch(now, cfg, ctx);
  return { steps };
}
