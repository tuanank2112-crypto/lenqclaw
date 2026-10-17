// apps/zalo-worker/src/main.ts — tien trinh dai han `npm run zalo:worker`
// (SPEC-P02 §1, §9). DUNG MOT ban (§9.6, G01). Thu tu kiem khi khoi dong:
// ZALO_SESSION_KEY (thieu/sai do dai ⇒ exit 1) → ZALO_ACCOUNTS / PACER_* →
// DATABASE_URL. SIGINT/SIGTERM ⇒ dung vong lap, dong listener, dong DB, exit 0.

import { closeDb, holdAdvisoryLock } from '@lenqclaw/core';
import { ConfigError, readAccounts, readPacerConfig } from './config.js';
import { parseSessionKey, SessionKeyError } from './crypto.js';
import { createZcaClient } from './zca-client.js';
import { AccountSession } from './account-session.js';
import { AccountPacer } from './pacer.js';
import { errSummary, logEvent } from './log.js';

const LOGIN_POLL_MS = 2_000;
const LOGOUT_POLL_MS = 2_000;
const WATCHDOG_MS = 60_000;
const COOKIE_SYNC_MS = 10 * 60_000;

function fail(message: string): never {
  process.stderr.write(`ZALO_WORKER_CONFIG_ERROR: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let key: Buffer;
  try {
    key = parseSessionKey(process.env.ZALO_SESSION_KEY);
  } catch (err) {
    if (err instanceof SessionKeyError) fail(err.message);
    throw err;
  }
  let accounts;
  let cfg;
  try {
    accounts = readAccounts();
    cfg = readPacerConfig();
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message);
    throw err;
  }
  if (!process.env.DATABASE_URL) fail('DATABASE_URL chua duoc cau hinh.');

  // D31 T6 / BB-19: DUNG MOT worker. Giu advisory lock TRUOC khi mo bat ky phien zca-js nao — ban thu hai thoat 1
  // (2 phien zca-js cho cung mot tai khoan = rui ro khoa tai khoan). Mat ket noi giu khoa ⇒ thoat 1 (supervisor khoi dong lai).
  const lock = await holdAdvisoryLock('lenqclaw:worker:community', (err) => {
    process.stderr.write(`${JSON.stringify({ t: new Date().toISOString(), event: 'worker.lock_lost', error: err.message.slice(0, 200) })}\n`);
    process.exit(1);
  });
  if (lock === null) {
    process.stderr.write('WORKER_ALREADY_RUNNING: da co mot worker khac giu khoa lenqclaw:worker:community.\n');
    await closeDb();
    process.exit(1);
  }

  const client = createZcaClient();
  const sessions = accounts.map((a) => new AccountSession(a, client, key, cfg));
  const pacers = sessions.map((s) => new AccountPacer(s.account, cfg, () => s.getSession()));

  for (const s of sessions) await s.start();
  for (const p of pacers) await p.init();
  logEvent('worker.started', { accounts: accounts.join(',') });

  let stopping = false;
  const timers: NodeJS.Timeout[] = [];
  const busy = new Map<string, boolean>();
  const every = (name: string, ms: number, fn: () => Promise<unknown>) => {
    timers.push(
      setInterval(() => {
        if (stopping || busy.get(name)) return;
        busy.set(name, true);
        fn()
          .catch((err) => logEvent('worker.loop_error', { loop: name, error: errSummary(err) }))
          .finally(() => busy.set(name, false));
      }, ms)
    );
  };

  sessions.forEach((s, i) => {
    every(`login:${s.account}`, LOGIN_POLL_MS, () => s.pollLoginRequest());
    every(`logout:${s.account}`, LOGOUT_POLL_MS, () => s.pollLogoutRequest());
    every(`watchdog:${s.account}`, WATCHDOG_MS, () => s.watchdogTick());
    every(`cookies:${s.account}`, COOKIE_SYNC_MS, () => s.syncCookies());
    every(`pacer:${s.account}`, cfg.tickMs, () => pacers[i]!.tick());
  });

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logEvent('worker.stopping', { signal });
    for (const t of timers) clearInterval(t);
    for (const s of sessions) await s.stop();
    await lock.release();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  process.stderr.write(`ZALO_WORKER_FATAL: ${errSummary(err)}\n`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
