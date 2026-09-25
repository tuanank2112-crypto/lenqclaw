// apps/zalo-worker/src/watchdog.ts — quyet dinh THUAN cua watchdog phien
// (SPEC-P02 §6, gotcha G01/G02). Khong DB, khong mang — account-session.ts
// thi hanh.

export const CLOSE_MANUAL = 1000;
export const CLOSE_ABNORMAL = 1006;
export const CLOSE_DUPLICATE = 3000;
export const CLOSE_KICKED = 3003;

export type CloseDecision =
  | { kind: 'kicked' } // 3000/3003: KHONG tu dang nhap lai, bao dong, cho nguoi mo QR
  | { kind: 'ignore' } // 1000 do chinh worker dong
  | { kind: 'reconnect' }; // 1006 / ma khac / loi mang

export function decideOnClose(code: number, stoppingByUs: boolean): CloseDecision {
  if (code === CLOSE_DUPLICATE || code === CLOSE_KICKED) return { kind: 'kicked' };
  if (stoppingByUs) return { kind: 'ignore' };
  return { kind: 'reconnect' };
}

export const RECONNECT_BASE_MS = 5_000;
export const RECONNECT_MAX_MS = 5 * 60_000;
export const RECONNECT_MAX_ATTEMPTS = 10;

/** Lui 5 s → 5 phut (nhan doi), `attempt` bat dau tu 1. */
export function reconnectDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(RECONNECT_BASE_MS * 2 ** (n - 1), RECONNECT_MAX_MS);
}

/** Qua 10 lan ⇒ `dead` + bao dong. */
export function isAttemptExhausted(attempt: number): boolean {
  return attempt > RECONNECT_MAX_ATTEMPTS;
}

export const IDLE_PROBE_MS = 20 * 60_000;
export const ACTIVE_HOUR_FROM = 7;
export const ACTIVE_HOUR_TO = 22; // [7h, 22h)
export const WATCHDOG_TZ = 'Asia/Ho_Chi_Minh';

export function hourInTz(now: Date, tz: string = WATCHDOG_TZ): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(now);
  return Number(h) % 24;
}

/** Khong co su kien nao 20 phut trong gio 7–22h ⇒ goi API doc nhe. */
export function shouldProbeIdle(now: Date, lastEventAtMs: number): boolean {
  if (now.getTime() - lastEventAtMs < IDLE_PROBE_MS) return false;
  const h = hourInTz(now);
  return h >= ACTIVE_HOUR_FROM && h < ACTIVE_HOUR_TO;
}
