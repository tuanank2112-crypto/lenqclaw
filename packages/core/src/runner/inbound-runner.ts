// packages/core/src/runner/inbound-runner.ts — tien trinh `npm run core:run` (SPEC-P02 §9.2, SPEC-D31 §6, BB-19).
// D31: MOT dispatcher nhan tin (`claimNextInbound(exclude)`), toi da `RUNNER_CONCURRENCY` luot chay CUNG LUC,
// KHONG nhan tin cua thread dang chay ⇒ song song GIUA cac thread, TUAN TU dung thu tu `id` TRONG mot thread.
// `runTimers` chay vong RIENG (khong chong lan, khong cho luot nao). Dau song `process_heartbeats('runner')` moi
// HEARTBEAT_INTERVAL_MS. Chi MOT ban chay: advisory lock `lenqclaw:runner` (thieu ⇒ RUNNER_ALREADY_RUNNING, exit 1;
// mat ket noi giu khoa ⇒ dung nhan viec, exit 1). SIGINT/SIGTERM ⇒ ngung nhan, cho luot dang chay toi da
// RUNNER_DRAIN_MS, dong DB, exit 0. Khong pg-boss, khong LISTEN/NOTIFY.

import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { closeDb, holdAdvisoryLock, sql } from '../adapters/db.js';
import { claimNextInbound, handleClaimed, processInbound, type InboundHandler } from '../sim/sim-transport.js';
import { routeInboundEvent } from '../agent/community/router.js';
import { runTimers, type TimerReport } from '../services/timers.js';
import { readCommunityConfig } from '../services/community-config.js';
import { botUid } from '../agent/community/bot.js';

/** Mac dinh cu cua vong tuan tu (giu cho tuong thich); dispatcher dung `RUNNER_POLL_MS`. */
export const RUNNER_INTERVAL_MS = 200;

export interface RunnerOptions {
  handler?: InboundHandler;
  /** = `pollMs` (ten cu). */
  intervalMs?: number;
  signal?: AbortSignal;
  /** Goi sau moi tin da xu ly (test/log). */
  onProcessed?: () => void;
  onError?: (err: unknown) => void;
  /** Goi sau moi lan `runTimers` chay (test/log). */
  onTimers?: (report: TimerReport) => void;
  timerIntervalMs?: number;
  /** So luot toi da chay cung luc (mac dinh `RUNNER_CONCURRENCY`). */
  concurrency?: number;
  /** Cho luot dang chay toi da bay nhieu ms khi dung (mac dinh `RUNNER_DRAIN_MS`). */
  drainMs?: number;
  /** Tat dau song (test). */
  heartbeat?: boolean;
  /** Tat vong timers (test chi quan tam tin nhan). */
  timers?: boolean;
}

/** Xu ly het tin dang cho (tung tin mot, tuan tu). Tra so tin da xu ly. */
export async function drainInbound(handler: InboundHandler = routeInboundEvent, signal?: AbortSignal): Promise<number> {
  let n = 0;
  while (!signal?.aborted) {
    const { processed } = await processInbound(handler);
    if (processed === 0) break;
    n += processed;
  }
  return n;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

interface RunnerStats {
  startedAt: Date;
  lastClaimAt: Date | null;
  lastTimersAt: Date | null;
}

async function writeHeartbeat(stats: RunnerStats, inflight: Map<string, { startedAt: number }>, concurrency: number): Promise<void> {
  const now = Date.now();
  const oldest = [...inflight.values()].reduce((m, v) => Math.max(m, now - v.startedAt), 0);
  await sql(
    `insert into process_heartbeats (name, pid, host, started_at, beat_at, info)
     values ('runner', $1, $2, $3, now(), $4::jsonb)
     on conflict (name) do update set pid = excluded.pid, host = excluded.host, started_at = excluded.started_at,
                                      beat_at = now(), info = excluded.info`,
    [
      process.pid,
      hostname(),
      stats.startedAt,
      JSON.stringify({
        inflight: inflight.size,
        oldest_inflight_ms: oldest,
        last_claim_at: stats.lastClaimAt?.toISOString() ?? null,
        last_timers_at: stats.lastTimersAt?.toISOString() ?? null,
        concurrency,
      }),
    ]
  );
}

/**
 * Dispatcher (SPEC-D31 §6): chi MOT vong goi `claimNextInbound` (tuan tu), toi da `concurrency` luot cung luc, khong
 * nhan tin cua thread dang chay. Co o trong ⇒ nhan tiep ngay; khong co tin ⇒ ngu toi da `pollMs` (day som khi mot luot xong).
 * `runTimers` va dau song chay o vong RIENG.
 */
export async function runDispatcher(opts: RunnerOptions = {}): Promise<void> {
  const cfg = readCommunityConfig();
  const baseHandler = opts.handler ?? routeInboundEvent;
  // D37: lam moi anh chup `botUid` (cache 60 s) truoc moi luot — node do thi doc dong bo `resolveBotUid()`.
  const handler: InboundHandler = async (e) => {
    await botUid('community', process.env, Date.now, e.threadId).catch(() => null);
    return baseHandler(e);
  };
  const concurrency = opts.concurrency ?? cfg.runnerConcurrency;
  const pollMs = opts.intervalMs ?? cfg.runnerPollMs;
  const drainMs = opts.drainMs ?? cfg.runnerDrainMs;
  const timerIntervalMs = opts.timerIntervalMs ?? cfg.timerIntervalMs;
  const signal = opts.signal;
  const inflight = new Map<string, { startedAt: number; done: Promise<void> }>();
  const stats: RunnerStats = { startedAt: new Date(), lastClaimAt: null, lastTimersAt: null };
  const onError = (err: unknown) => opts.onError?.(err);

  // --- vong timers rieng (khong chong lan, khong cho luot nao) ---
  let timersBusy = false;
  const timersLoop = (async () => {
    if (opts.timers === false) return;
    let last = 0;
    while (!signal?.aborted) {
      const now = Date.now();
      if (!timersBusy && now - last >= timerIntervalMs) {
        last = now;
        timersBusy = true;
        try {
          const report = await runTimers(new Date(now), cfg, { busyThreads: new Set(inflight.keys()), opsWatch: opts.heartbeat !== false, startedAt: stats.startedAt });
          stats.lastTimersAt = new Date();
          opts.onTimers?.(report);
        } catch (err) {
          onError(err);
        } finally {
          timersBusy = false;
        }
      }
      await sleep(Math.min(250, timerIntervalMs), signal);
    }
  })();

  // --- dau song ---
  const heartbeatLoop = (async () => {
    if (opts.heartbeat === false) return;
    while (!signal?.aborted) {
      try {
        await writeHeartbeat(stats, inflight, concurrency);
      } catch (err) {
        onError(err); // ghi heartbeat loi ⇒ log, khong dung tien trinh
      }
      await sleep(cfg.heartbeatIntervalMs, signal);
    }
  })();

  // --- vong nhan tin ---
  while (!signal?.aborted) {
    let claimedAny = false;
    try {
      while (inflight.size < concurrency && !signal?.aborted) {
        const e = await claimNextInbound([...inflight.keys()]);
        if (!e) break;
        claimedAny = true;
        stats.lastClaimAt = new Date();
        const entry = {
          startedAt: Date.now(),
          done: handleClaimed(e, handler)
            .catch(onError)
            .finally(() => {
              inflight.delete(e.threadId);
              opts.onProcessed?.();
            }),
        };
        inflight.set(e.threadId, entry);
      }
    } catch (err) {
      onError(err); // loi DB tam thoi ⇒ log, thu lai vong sau
    }
    if (inflight.size >= concurrency) {
      await Promise.race([...inflight.values()].map((v) => v.done));
    } else if (!claimedAny) {
      await Promise.race([sleep(pollMs, signal), ...[...inflight.values()].map((v) => v.done)]);
    }
  }

  // --- dung em: cho luot dang chay toi da drainMs ---
  if (inflight.size > 0) {
    await Promise.race([Promise.allSettled([...inflight.values()].map((v) => v.done)), sleep(drainMs)]);
  }
  await Promise.allSettled([timersLoop, heartbeatLoop]);
}

/** Ten cu (tuong thich): vong lap runner = dispatcher; chua dat `concurrency` ⇒ `RUNNER_CONCURRENCY`. */
export async function runInboundLoop(opts: RunnerOptions = {}): Promise<void> {
  return runDispatcher({ heartbeat: false, ...opts });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('CORE_RUN_ERROR: DATABASE_URL chua duoc cau hinh.');
    process.exit(1);
  }
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ t: new Date().toISOString(), event, ...extra }));
  const controller = new AbortController();
  const stop = (signal: string) => {
    if (controller.signal.aborted) return;
    log('runner.stopping', { signal });
    controller.abort();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  const lock = await holdAdvisoryLock('lenqclaw:runner', (err) => {
    // Mat ket noi giu khoa ⇒ KHONG chac con la ban duy nhat: dung nhan viec, thoat 1 (supervisor khoi dong lai).
    console.error(JSON.stringify({ t: new Date().toISOString(), event: 'runner.lock_lost', error: err.message.slice(0, 200) }));
    process.exit(1);
  });
  if (lock === null) {
    console.error('RUNNER_ALREADY_RUNNING: da co mot runner khac giu khoa lenqclaw:runner.');
    await closeDb();
    process.exit(1);
  }

  const cfg = readCommunityConfig();
  log('runner.started', { concurrency: cfg.runnerConcurrency, poll_ms: cfg.runnerPollMs });
  let processed = 0;
  await runDispatcher({
    signal: controller.signal,
    onProcessed: () => {
      processed++;
      log('runner.processed', { total: processed });
    },
    onError: (err) => {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(JSON.stringify({ t: new Date().toISOString(), event: 'runner.error', error: msg.slice(0, 300) }));
    },
    onTimers: (report) => log('runner.timers', { ...report }),
  });
  await lock.release();
  await closeDb();
  process.exit(0);
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  void main();
}
