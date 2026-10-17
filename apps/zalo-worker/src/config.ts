// apps/zalo-worker/src/config.ts — doc env cua worker (SPEC-P02 §5, §9.1,
// §9.3). Moi so cua pacer lay tu env `PACER_*`, mac dinh = bang §5.

export type AccountId = 'community';

export interface PacerConfig {
  /** Giua 2 tin cung thread: >= threadGapMs + jitter [0, threadJitterMs]. */
  threadGapMs: number;
  threadJitterMs: number;
  /** Toan tai khoan: <= maxPerMinute tin trong 60 s truot. */
  maxPerMinute: number;
  /** Nguoi nhan khac nhau: <= maxRecipients trong recipientWindowMs / tai khoan. */
  maxRecipients: number;
  recipientWindowMs: number;
  /** Tach tin dai: moi doan <= maxChars ky tu. */
  maxChars: number;
  /** "Dang go" truoc tin tra loi: tre typingMinMs..typingMaxMs ti le do dai. */
  typingMinMs: number;
  typingMaxMs: number;
  /** "Da xem" cho thread da nhan dien: tre seenMinMs..seenMaxMs. */
  seenMinMs: number;
  seenMaxMs: number;
  /** Loi gioi han / khong msgId / ma 221 ⇒ lui backoffMs cho tai khoan. */
  backoffMs: number;
  /** Chu ky pacer (D31 T9: 250). */
  tickMs: number;
  /** D31 T7: thread da co "dang go" trong chung nay ms ⇒ tin text khong gui lai "dang go" va khong tre them. */
  typingFreshMs: number;
  /** Nhom (BB-08, SPEC-P02 §5): giua 2 tin cung nhom >= groupGapMs + jitter [0, groupJitterMs]. */
  groupGapMs: number;
  groupJitterMs: number;
  /** Tin text nhom cho ngan sach qua ngan nay (phut) ⇒ cancelled('budget_expired'). */
  groupTextTtlMin: number;
  /** SPEC-P02 §4.1: toi da bay nhieu hang `action` moi tick. */
  actionsPerTick: number;
}

export const PACER_DEFAULTS: PacerConfig = {
  threadGapMs: 3000,
  threadJitterMs: 2000,
  maxPerMinute: 10,
  maxRecipients: 15,
  recipientWindowMs: 10 * 60 * 1000,
  maxChars: 1800,
  typingMinMs: 1000,
  typingMaxMs: 3000,
  seenMinMs: 2000,
  seenMaxMs: 6000,
  backoffMs: 30 * 60 * 1000,
  tickMs: 250,
  typingFreshMs: 8000,
  groupGapMs: 8000,
  groupJitterMs: 3000,
  groupTextTtlMin: 30,
  actionsPerTick: 3,
};

const PACER_ENV: Record<keyof PacerConfig, string> = {
  threadGapMs: 'PACER_THREAD_GAP_MS',
  threadJitterMs: 'PACER_THREAD_JITTER_MS',
  maxPerMinute: 'PACER_MAX_PER_MINUTE',
  maxRecipients: 'PACER_MAX_RECIPIENTS',
  recipientWindowMs: 'PACER_RECIPIENT_WINDOW_MS',
  maxChars: 'PACER_MAX_CHARS',
  typingMinMs: 'PACER_TYPING_MIN_MS',
  typingMaxMs: 'PACER_TYPING_MAX_MS',
  seenMinMs: 'PACER_SEEN_MIN_MS',
  seenMaxMs: 'PACER_SEEN_MAX_MS',
  backoffMs: 'PACER_BACKOFF_MS',
  tickMs: 'PACER_TICK_MS',
  typingFreshMs: 'PACER_TYPING_FRESH_MS',
  groupGapMs: 'PACER_GROUP_GAP_MS',
  groupJitterMs: 'PACER_GROUP_JITTER_MS',
  groupTextTtlMin: 'GROUP_TEXT_TTL_MIN',
  actionsPerTick: 'PACER_ACTIONS_PER_TICK',
};

export class ConfigError extends Error {
  readonly code = 'ConfigError';
}

export function readPacerConfig(env: NodeJS.ProcessEnv = process.env): PacerConfig {
  const out = { ...PACER_DEFAULTS };
  for (const key of Object.keys(PACER_ENV) as Array<keyof PacerConfig>) {
    const name = PACER_ENV[key];
    const raw = env[name]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new ConfigError(`${name}="${raw}" khong hop le (can so nguyen >= 0).`);
    }
    out[key] = n;
  }
  if (out.maxPerMinute < 1 || out.maxRecipients < 1 || out.maxChars < 1 || out.tickMs < 1 || out.actionsPerTick < 1) {
    throw new ConfigError(
      'PACER_MAX_PER_MINUTE/PACER_MAX_RECIPIENTS/PACER_MAX_CHARS/PACER_TICK_MS/PACER_ACTIONS_PER_TICK phai >= 1.'
    );
  }
  return out;
}

/** `ZALO_ACCOUNTS` (danh sach phay), mac dinh `community`. Chi nhan
 * `community` (01-CONTRACTS §10, D12) — gia tri khac => `ConfigError`. */
export function readAccounts(env: NodeJS.ProcessEnv = process.env): AccountId[] {
  const raw = (env.ZALO_ACCOUNTS ?? 'community').trim() || 'community';
  const list = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  for (const a of list) {
    if (a !== 'community') throw new ConfigError(`ZALO_ACCOUNTS chua "${a}" khong hop le (chi community).`);
  }
  return list as AccountId[];
}
