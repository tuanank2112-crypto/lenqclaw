// apps/zalo-worker/src/pacer-policy.ts — luat pacer THUAN (khong DB, khong
// mang), SPEC-P02 §5 (ke hoach 02) + BB-08. Dung chung cho pacer that (pacer.ts),
// test va tools/pacer-sim.ts. Moi so lay tu PacerConfig (env PACER_*).

import type { PacerConfig } from './config.js';

export type BlockReason = 'backoff' | 'thread_gap' | 'group_gap' | 'per_minute' | 'recipients' | 'group_budget';

export type CheckResult = { ok: true } | { ok: false; reason: BlockReason };

/** Cua so ngan sach nhom: 1 gio truot (BB-08). */
export const BUDGET_WINDOW_MS = 60 * 60 * 1000;

interface SendEntry {
  at: number;
  threadId: string;
  isGroup: boolean;
  /** `action` chi tinh vao `maxPerMinute` (01-CONTRACTS §8.3), khong tinh gian cach/nguoi nhan. */
  action: boolean;
}

export class PacerPolicy {
  private sends: SendEntry[] = [];
  private nextAllowedByThread = new Map<string, number>();
  private backoffUntil = 0;

  /** `budgetPerHour` (tuy chon): neu dat, chinh sach TU DEM ngan sach text nhom trong bo nho
   * (dung cho mo phong `simulatePacer`); pacer that doc ngan sach tu DB (store.groupGate). */
  constructor(
    private readonly cfg: PacerConfig,
    private readonly rng: () => number = Math.random,
    private readonly budgetPerHour?: number
  ) {}

  /** Giu lich su du dai cho cua so lon nhat (nguoi nhan 10 phut, 60 s, ngan sach 1 gio). */
  private prune(now: number): void {
    const horizon = now - Math.max(this.cfg.recipientWindowMs, 60_000, BUDGET_WINDOW_MS);
    if (this.sends.length > 0 && this.sends[0]!.at < horizon) {
      this.sends = this.sends.filter((s) => s.at >= horizon);
    }
  }

  isBackingOff(now: number): boolean {
    return now < this.backoffUntil;
  }

  backoffUntilMs(): number {
    return this.backoffUntil;
  }

  /** Doi `maxPerMinute` toan tai khoan (text + action). */
  private perMinuteBlocked(now: number): boolean {
    return this.sends.filter((s) => s.at > now - 60_000).length >= this.cfg.maxPerMinute;
  }

  check(now: number, threadId: string, isGroup = false): CheckResult {
    this.prune(now);
    if (now < this.backoffUntil) return { ok: false, reason: 'backoff' };
    const next = this.nextAllowedByThread.get(threadId);
    if (next !== undefined && now < next) return { ok: false, reason: isGroup ? 'group_gap' : 'thread_gap' };
    if (this.perMinuteBlocked(now)) return { ok: false, reason: 'per_minute' };
    if (isGroup) {
      if (this.budgetPerHour !== undefined) {
        const used = this.sends.filter((s) => !s.action && s.threadId === threadId && s.at > now - BUDGET_WINDOW_MS).length;
        if (used >= this.budgetPerHour) return { ok: false, reason: 'group_budget' };
      }
      return { ok: true }; // nhom khong tinh vao `recipients` (SPEC-P02 §5)
    }
    const recipients = new Set(
      this.sends.filter((s) => !s.isGroup && !s.action && s.at > now - this.cfg.recipientWindowMs).map((s) => s.threadId)
    );
    if (!recipients.has(threadId) && recipients.size >= this.cfg.maxRecipients) {
      return { ok: false, reason: 'recipients' };
    }
    return { ok: true };
  }

  /** `action` den han co duoc chay luc nay khong (chi `maxPerMinute` + backoff). */
  checkAction(now: number): CheckResult {
    this.prune(now);
    if (now < this.backoffUntil) return { ok: false, reason: 'backoff' };
    if (this.perMinuteBlocked(now)) return { ok: false, reason: 'per_minute' };
    return { ok: true };
  }

  /** Ghi mot lan gui tin (text). Jitter chon tai day: DM 0..threadJitterMs, nhom 0..groupJitterMs. */
  record(now: number, threadId: string, isGroup = false): void {
    this.sends.push({ at: now, threadId, isGroup, action: false });
    const gap = isGroup ? this.cfg.groupGapMs : this.cfg.threadGapMs;
    const jitterMax = isGroup ? this.cfg.groupJitterMs : this.cfg.threadJitterMs;
    const jitter = Math.floor(this.rng() * (jitterMax + 1));
    this.nextAllowedByThread.set(threadId, now + gap + jitter);
  }

  /** Ghi mot `action` da thi hanh: chi tinh vao `maxPerMinute`. */
  recordAction(now: number, threadId: string): void {
    this.sends.push({ at: now, threadId, isGroup: false, action: true });
  }

  /** Nap lich su gui (khi khoi dong lai) — khong ap jitter, chi khoang cach toi thieu. */
  seedHistory(entries: ReadonlyArray<{ at: number; threadId: string; isGroup?: boolean }>): void {
    for (const e of entries) {
      const isGroup = e.isGroup ?? false;
      this.sends.push({ at: e.at, threadId: e.threadId, isGroup, action: false });
      const next = e.at + (isGroup ? this.cfg.groupGapMs : this.cfg.threadGapMs);
      if ((this.nextAllowedByThread.get(e.threadId) ?? 0) < next) this.nextAllowedByThread.set(e.threadId, next);
    }
    this.sends.sort((a, b) => a.at - b.at);
  }

  /** Loi gioi han / khong msgId / ma 221 ⇒ lui backoffMs (§5). */
  backoff(now: number): void {
    this.backoffUntil = now + this.cfg.backoffMs;
  }
}

export interface QueueItem {
  id: number;
  threadId: string;
  isGroup?: boolean;
  /** D31 T8: hang nay la tin TRA LOI mot tin den (`outbox.inbound_event_id` khac null). */
  reply?: boolean;
}

/** Chon tin ke tiep duoc gui: hang doi da sap theo thu tu gui; CHI tin dau
 * cua moi thread duoc xet (giu thu tu trong thread). D31 T8: vong 1 chi xet thread co hang DAU la tin
 * tra loi, vong 2 cac thread con lai — chi doi THU TU, `policy.check` (gap, per-minute, ngan sach, backoff) giu nguyen.
 * `onBlocked` (tuy chon) nhan hang dau thread bi `check` tu choi + ly do (pacer ghi `hold_reason`). */
export function pickNext<T extends QueueItem>(
  now: number,
  queue: readonly T[],
  policy: PacerPolicy,
  onBlocked?: (item: T, reason: BlockReason) => void
): T | null {
  const seenThreads = new Set<string>();
  const heads: T[] = [];
  for (const item of queue) {
    if (seenThreads.has(item.threadId)) continue;
    seenThreads.add(item.threadId);
    heads.push(item);
  }
  for (const round of [heads.filter((h) => h.reply === true), heads.filter((h) => h.reply !== true)]) {
    for (const item of round) {
      const res = policy.check(now, item.threadId, item.isGroup ?? false);
      if (res.ok) return item;
      onBlocked?.(item, res.reason);
    }
  }
  return null;
}

/** Tach tin dai thanh cac doan <= maxChars (dem theo code point), uu tien
 * cat o xuong dong, roi khoang trang. */
export function splitText(text: string, maxChars: number): string[] {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = Math.min(start + maxChars, chars.length);
    if (end < chars.length) {
      const window = chars.slice(start, end);
      let cut = window.lastIndexOf('\n');
      if (cut < maxChars / 2) cut = window.lastIndexOf(' ');
      if (cut >= maxChars / 2) end = start + cut + 1;
    }
    const piece = chars.slice(start, end).join('').trim();
    if (piece.length > 0) parts.push(piece);
    start = end;
  }
  return parts;
}

/** Mention cua text goc ⇒ mention hop le cua doan DAU (SPEC-P02 §4.3): chi giu mention nam
 * TRON trong doan dau, doi `pos` ve toa do doan dau. Mention roi sang doan sau bi bo, khong bia. */
export function mentionsForFirstChunk(
  text: string,
  firstChunk: string,
  mentions: ReadonlyArray<{ uid: string; pos: number; len: number }>
): Array<{ uid: string; pos: number; len: number }> {
  const offset = text.indexOf(firstChunk);
  if (offset < 0) return [];
  return mentions
    .filter((m) => m.pos >= offset && m.pos + m.len <= offset + firstChunk.length)
    .map((m) => ({ uid: m.uid, pos: m.pos - offset, len: m.len }));
}

/** Body cua tung doan khi tach tin dai (SPEC-P02 §4.3): `quote` CHI o part 0; `mentions` chi giu
 * mention nam tron trong doan dau; moi doan mang `split_of` = id dong goc + `part`. */
export function buildSplitBodies(
  rowId: number,
  body: Record<string, unknown>,
  parts: readonly string[]
): Array<Record<string, unknown>> {
  const { quote, mentions, ...rest } = body as Record<string, unknown> & { quote?: unknown; mentions?: unknown };
  return parts.map((text, i) => {
    const out: Record<string, unknown> = { ...rest, text, split_of: rowId, part: i };
    if (i === 0) {
      if (quote !== undefined) out.quote = quote;
      if (Array.isArray(mentions)) {
        const kept = mentionsForFirstChunk(
          String(body.text ?? ''),
          text,
          mentions as Array<{ uid: string; pos: number; len: number }>
        );
        if (kept.length > 0) out.mentions = kept;
      }
    }
    return out;
  });
}

/** Tre "dang go" ti le do dai tin: typingMinMs .. typingMaxMs (bao hoa o maxChars). */
export function typingDelayMs(textLength: number, cfg: PacerConfig): number {
  const ratio = Math.min(1, Math.max(0, textLength / cfg.maxChars));
  return Math.round(cfg.typingMinMs + (cfg.typingMaxMs - cfg.typingMinMs) * ratio);
}

/** Tre "da xem": ngau nhien trong [seenMinMs, seenMaxMs]. */
export function seenDelayMs(cfg: PacerConfig, rng: () => number = Math.random): number {
  return Math.round(cfg.seenMinMs + (cfg.seenMaxMs - cfg.seenMinMs) * rng());
}

export interface SendLogEntry {
  at: number;
  threadId: string;
  /** Tin text vao nhom (gian cach `groupGapMs`, khong tinh `recipients`, co ngan sach gio). */
  isGroup?: boolean;
}

export interface Violation {
  rule: 'thread_gap' | 'group_gap' | 'per_minute' | 'recipients' | 'group_budget';
  at: number;
  detail: string;
}

/** Kiem DOC LAP bang §5 tren nhat ky gui (khong dung PacerPolicy): moi cap
 * tin lien tiep cung thread cach >= threadGapMs (DM) / groupGapMs (nhom); moi cua so 60 s
 * <= maxPerMinute; moi cua so recipientWindowMs <= maxRecipients nguoi nhan (DM, nhom
 * khong tinh); neu co `opts.budgetPerHour`: moi cua so 1 gio truot, moi nhom <= ngan sach. */
export function verifySendLog(
  log: readonly SendLogEntry[],
  cfg: PacerConfig,
  opts: { budgetPerHour?: number } = {}
): Violation[] {
  const v: Violation[] = [];
  const sorted = [...log].sort((a, b) => a.at - b.at);
  const lastByThread = new Map<string, number>();
  for (const e of sorted) {
    const last = lastByThread.get(e.threadId);
    const gap = e.isGroup ? cfg.groupGapMs : cfg.threadGapMs;
    if (last !== undefined && e.at - last < gap) {
      v.push({
        rule: e.isGroup ? 'group_gap' : 'thread_gap',
        at: e.at,
        detail: `${e.threadId}: ${e.at - last} ms < ${gap}`,
      });
    }
    lastByThread.set(e.threadId, e.at);
  }
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!.at;
    const inMinute = sorted.filter((e) => e.at >= start && e.at < start + 60_000).length;
    if (inMinute > cfg.maxPerMinute) {
      v.push({ rule: 'per_minute', at: start, detail: `${inMinute} tin trong 60 s tu t=${start}` });
    }
    const recips = new Set(
      sorted
        .filter((e) => !e.isGroup && e.at >= start && e.at < start + cfg.recipientWindowMs)
        .map((e) => e.threadId)
    );
    if (recips.size > cfg.maxRecipients) {
      v.push({ rule: 'recipients', at: start, detail: `${recips.size} nguoi nhan trong cua so tu t=${start}` });
    }
    if (opts.budgetPerHour !== undefined && sorted[i]!.isGroup) {
      const t = sorted[i]!.threadId;
      const inHour = sorted.filter(
        (e) => e.isGroup && e.threadId === t && e.at >= start && e.at < start + BUDGET_WINDOW_MS
      ).length;
      if (inHour > opts.budgetPerHour) {
        v.push({ rule: 'group_budget', at: start, detail: `${t}: ${inHour} tin trong 1 gio tu t=${start} > ${opts.budgetPerHour}` });
      }
    }
  }
  return v;
}

export interface SimResult {
  log: SendLogEntry[];
  violations: Violation[];
  finishedAtMs: number;
}

/** Thread gia lap nhom: `sim-group-*` (SPEC-P02 §5). */
export function isSimGroupThread(threadId: string): boolean {
  return threadId.startsWith('sim-group-');
}

/** Gia lap dong ho ao: `messages` tin (moi tin mot threadId) xep hang tai
 * t=0, pacer chay moi tickMs, moi tick toi da MOT tin/tai khoan. threadId dang
 * `sim-group-*` la nhom (gian cach `groupGapMs`, ngan sach `opts.budgetPerHour`/gio). */
export function simulatePacer(
  threadIds: readonly string[],
  cfg: PacerConfig,
  rng: () => number,
  policyFactory?: (
    cfg: PacerConfig,
    rng: () => number
  ) => { pick: (now: number, q: QueueItem[]) => QueueItem | null; record: (now: number, t: string, isGroup?: boolean) => void },
  opts: { budgetPerHour?: number } = {}
): SimResult {
  const queue: QueueItem[] = threadIds.map((t, i) => ({ id: i + 1, threadId: t, isGroup: isSimGroupThread(t) }));
  const pacer = policyFactory
    ? policyFactory(cfg, rng)
    : (() => {
        const p = new PacerPolicy(cfg, rng, opts.budgetPerHour);
        return {
          pick: (now: number, q: QueueItem[]) => pickNext(now, q, p),
          record: (now: number, t: string, isGroup?: boolean) => p.record(now, t, isGroup),
        };
      })();
  const log: SendLogEntry[] = [];
  let now = 0;
  const limit = 24 * 60 * 60 * 1000;
  while (queue.length > 0 && now < limit) {
    const item = pacer.pick(now, queue);
    if (item) {
      pacer.record(now, item.threadId, item.isGroup ?? false);
      log.push({ at: now, threadId: item.threadId, isGroup: item.isGroup ?? false });
      queue.splice(queue.indexOf(item), 1);
    }
    now += cfg.tickMs;
  }
  return { log, violations: verifySendLog(log, cfg, opts), finishedAtMs: now };
}

/** RNG tat dinh cho gia lap/test (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
