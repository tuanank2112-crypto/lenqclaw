// packages/core/src/runner/inbound-runner.ts — tien trinh `npm run core:run`
// (SPEC-P02 §9.2, Đ22): vong lap goi `processInbound(routeInboundEvent)`
// (nhan-truoc-xu-ly-sau, co san) moi 1 s. DUNG MOT ban sao (§9.6) ⇒ tuan tu
// toan cuc, dung thu tu theo thread. Khong pg-boss, khong gom tin 2,5 s.
// SIGINT/SIGTERM ⇒ xong tin dang xu ly roi dung, dong DB, exit 0.

import { pathToFileURL } from 'node:url';
import { closeDb } from '../adapters/db.js';
import { processInbound, type InboundHandler } from '../sim/sim-transport.js';
import { routeInboundEvent } from '../agent/resident-agent.js';

export const RUNNER_INTERVAL_MS = 1000;

export interface RunnerOptions {
  handler?: InboundHandler;
  intervalMs?: number;
  signal?: AbortSignal;
  /** Goi sau moi tin da xu ly (test/log). */
  onProcessed?: () => void;
  onError?: (err: unknown) => void;
}

/** Xu ly het tin dang cho (tung tin mot). Tra so tin da xu ly. */
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

/** Vong lap chinh: moi `intervalMs` rut het hang doi. Loi DB tam thoi ⇒ log, thu lai vong sau. */
export async function runInboundLoop(opts: RunnerOptions = {}): Promise<void> {
  const handler = opts.handler ?? routeInboundEvent;
  const interval = opts.intervalMs ?? RUNNER_INTERVAL_MS;
  while (!opts.signal?.aborted) {
    try {
      const n = await drainInbound(handler, opts.signal);
      for (let i = 0; i < n; i++) opts.onProcessed?.();
    } catch (err) {
      opts.onError?.(err);
    }
    await sleep(interval, opts.signal);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('CORE_RUN_ERROR: DATABASE_URL chua duoc cau hinh.');
    process.exit(1);
  }
  const controller = new AbortController();
  const stop = (signal: string) => {
    if (controller.signal.aborted) return;
    console.log(JSON.stringify({ t: new Date().toISOString(), event: 'runner.stopping', signal }));
    controller.abort();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'runner.started', interval_ms: RUNNER_INTERVAL_MS }));
  let processed = 0;
  await runInboundLoop({
    signal: controller.signal,
    onProcessed: () => {
      processed++;
      console.log(JSON.stringify({ t: new Date().toISOString(), event: 'runner.processed', total: processed }));
    },
    onError: (err) => {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(JSON.stringify({ t: new Date().toISOString(), event: 'runner.error', error: msg.slice(0, 300) }));
    },
  });
  await closeDb();
  process.exit(0);
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  void main();
}
