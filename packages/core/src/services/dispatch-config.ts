// packages/core/src/services/dispatch-config.ts — cau hinh P05 (thuan,
// mau apps/zalo-worker/src/config.ts). SPEC-P05-Dispatch.md §10.2.3: so
// khong hop le => nem `ConfigError`. GOI Ý PHÍ (`FREE_TRIAL_DAYS`,
// `SLOT_FEE_MONTHLY`, `SLOT_MIN_JOBS_PER_VENDOR`, `BQL_SHARE_PCT`) la GIA
// (Đ14, §10.16 Q1) — doi qua env, KHONG sua ma.

export class ConfigError extends Error {
  readonly code = 'ConfigError';
}

export interface DispatchConfig {
  holdMinutes: number;
  dispatchTimeoutMin: number;
  accessRemindMin: number;
  quoteOverBandPct: number;
  quoteConsentMin: number;
  maxHoldRepublish: number;
  noShowBlockThreshold: number;
  noShowWindowDays: number;
  noShowBlockDays: number;
  accessPassBeforeMin: number;
  accessPassAfterMin: number;
  publishFallbackMin: number;
  requestAccessFallbackMin: number;
  dispatchReemitMin: number;
  timerIntervalMs: number;
  vendorIntentMin: number;
  freeTrialDays: number;
  slotFeeMonthly: number;
  slotMinJobsPerVendor: number;
  bqlSharePct: number;
  slotPeriodDays: number;
  slotRemindDays: number;
  waitlistInviteHours: number;
}

function readNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new ConfigError(`${key}="${raw}" khong phai so hop le.`);
  }
  return n;
}

/** SPEC-P05-Dispatch.md §10.2.3 — bang gia tri mac dinh day du. */
export function readDispatchConfig(env: NodeJS.ProcessEnv = process.env): DispatchConfig {
  return {
    holdMinutes: readNumber(env, 'HOLD_MINUTES', 10),
    dispatchTimeoutMin: readNumber(env, 'DISPATCH_TIMEOUT_MIN', 45),
    accessRemindMin: readNumber(env, 'ACCESS_REMIND_MIN', 30),
    quoteOverBandPct: readNumber(env, 'QUOTE_OVER_BAND_PCT', 30),
    quoteConsentMin: readNumber(env, 'QUOTE_CONSENT_MIN', 30),
    maxHoldRepublish: readNumber(env, 'MAX_HOLD_REPUBLISH', 2),
    noShowBlockThreshold: readNumber(env, 'NO_SHOW_BLOCK_THRESHOLD', 3),
    noShowWindowDays: readNumber(env, 'NO_SHOW_WINDOW_DAYS', 30),
    noShowBlockDays: readNumber(env, 'NO_SHOW_BLOCK_DAYS', 7),
    accessPassBeforeMin: readNumber(env, 'ACCESS_PASS_BEFORE_MIN', 30),
    accessPassAfterMin: readNumber(env, 'ACCESS_PASS_AFTER_MIN', 120),
    publishFallbackMin: readNumber(env, 'PUBLISH_FALLBACK_MIN', 2),
    requestAccessFallbackMin: readNumber(env, 'REQUEST_ACCESS_FALLBACK_MIN', 2),
    dispatchReemitMin: readNumber(env, 'DISPATCH_REEMIT_MIN', 5),
    timerIntervalMs: readNumber(env, 'TIMER_INTERVAL_MS', 10000),
    vendorIntentMin: readNumber(env, 'VENDOR_INTENT_MIN', 0.6),
    freeTrialDays: readNumber(env, 'FREE_TRIAL_DAYS', 30),
    slotFeeMonthly: readNumber(env, 'SLOT_FEE_MONTHLY', 300000),
    slotMinJobsPerVendor: readNumber(env, 'SLOT_MIN_JOBS_PER_VENDOR', 8),
    bqlSharePct: readNumber(env, 'BQL_SHARE_PCT', 10),
    slotPeriodDays: readNumber(env, 'SLOT_PERIOD_DAYS', 30),
    slotRemindDays: readNumber(env, 'SLOT_REMIND_DAYS', 3),
    waitlistInviteHours: readNumber(env, 'WAITLIST_INVITE_HOURS', 48),
  };
}
