// apps/zalo-worker/src/config.ts — doc env cua worker (SPEC-P02 §5, §9.1,
// §9.3). Moi so cua pacer lay tu env `PACER_*`, mac dinh = bang §5.

export type AccountId = 'bql' | 'market';

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
  /** Chu ky pacer. */
  tickMs: number;
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
  tickMs: 1000,
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
  if (out.maxPerMinute < 1 || out.maxRecipients < 1 || out.maxChars < 1 || out.tickMs < 1) {
    throw new ConfigError('PACER_MAX_PER_MINUTE/PACER_MAX_RECIPIENTS/PACER_MAX_CHARS/PACER_TICK_MS phai >= 1.');
  }
  return out;
}

/** `ZALO_ACCOUNTS` (danh sach phay), mac dinh `bql`. Giai doan 1 (§9.1,
 * §9.6): `market` bi tu choi — CAM bat. */
export function readAccounts(env: NodeJS.ProcessEnv = process.env): AccountId[] {
  const raw = (env.ZALO_ACCOUNTS ?? 'bql').trim() || 'bql';
  const list = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  for (const a of list) {
    if (a !== 'bql' && a !== 'market') throw new ConfigError(`ZALO_ACCOUNTS chua "${a}" khong hop le (chi bql).`);
    if (a === 'market') {
      throw new ConfigError('ZALO_ACCOUNTS=market bi CAM o giai doan 1 (SPEC-P02 §9.6) — chi dung "bql".');
    }
  }
  return list as AccountId[];
}
