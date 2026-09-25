// apps/zalo-worker/src/pacer-policy.ts — luat pacer THUAN (khong DB, khong
// mang), SPEC-P02 §5. Dung chung cho pacer that (pacer.ts), test va
// tools/pacer-sim.ts. Moi so lay tu PacerConfig (env PACER_*).

import type { PacerConfig } from './config.js';

export type BlockReason = 'backoff' | 'thread_gap' | 'per_minute' | 'recipients';

export type CheckResult = { ok: true } | { ok: false; reason: BlockReason };

export class PacerPolicy {
  private sends: Array<{ at: number; threadId: string }> = [];
  private nextAllowedByThread = new Map<string, number>();
  private backoffUntil = 0;

  constructor(
    private readonly cfg: PacerConfig,
    private readonly rng: () => number = Math.random
  ) {}

  /** Giu lich su du dai cho cua so lon nhat (nguoi nhan 10 phut, 60 s). */
  private prune(now: number): void {
    const horizon = now - Math.max(this.cfg.recipientWindowMs, 60_000);
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

  check(now: number, threadId: string): CheckResult {
    this.prune(now);
    if (now < this.backoffUntil) return { ok: false, reason: 'backoff' };
    const next = this.nextAllowedByThread.get(threadId);
    if (next !== undefined && now < next) return { ok: false, reason: 'thread_gap' };
    const lastMinute = this.sends.filter((s) => s.at > now - 60_000).length;
    if (lastMinute >= this.cfg.maxPerMinute) return { ok: false, reason: 'per_minute' };
    const recipients = new Set(
      this.sends.filter((s) => s.at > now - this.cfg.recipientWindowMs).map((s) => s.threadId)
    );
    if (!recipients.has(threadId) && recipients.size >= this.cfg.maxRecipients) {
      return { ok: false, reason: 'recipients' };
    }
    return { ok: true };
  }

  /** Ghi mot lan gui tin (text). Jitter 0..threadJitterMs chon tai day. */
  record(now: number, threadId: string): void {
    this.sends.push({ at: now, threadId });
    const jitter = Math.floor(this.rng() * (this.cfg.threadJitterMs + 1));
    this.nextAllowedByThread.set(threadId, now + this.cfg.threadGapMs + jitter);
  }

  /** Nap lich su gui (khi khoi dong lai) — khong ap jitter, chi khoang cach toi thieu. */
  seedHistory(entries: ReadonlyArray<{ at: number; threadId: string }>): void {
    for (const e of entries) {
      this.sends.push({ at: e.at, threadId: e.threadId });
      const next = e.at + this.cfg.threadGapMs;
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
}

/** Chon tin ke tiep duoc gui: hang doi da sap theo thu tu gui; CHI tin dau
 * cua moi thread duoc xet (giu thu tu trong thread). */
export function pickNext<T extends QueueItem>(now: number, queue: readonly T[], policy: PacerPolicy): T | null {
  const seenThreads = new Set<string>();
  for (const item of queue) {
    if (seenThreads.has(item.threadId)) continue;
    seenThreads.add(item.threadId);
    if (policy.check(now, item.threadId).ok) return item;
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
}

export interface Violation {
  rule: 'thread_gap' | 'per_minute' | 'recipients';
  at: number;
  detail: string;
}

/** Kiem DOC LAP bang §5 tren nhat ky gui (khong dung PacerPolicy): moi cap
 * tin lien tiep cung thread cach >= threadGapMs; moi cua so 60 s <=
 * maxPerMinute; moi cua so recipientWindowMs <= maxRecipients nguoi nhan. */
export function verifySendLog(log: readonly SendLogEntry[], cfg: PacerConfig): Violation[] {
  const v: Violation[] = [];
  const sorted = [...log].sort((a, b) => a.at - b.at);
  const lastByThread = new Map<string, number>();
  for (const e of sorted) {
    const last = lastByThread.get(e.threadId);
    if (last !== undefined && e.at - last < cfg.threadGapMs) {
      v.push({ rule: 'thread_gap', at: e.at, detail: `${e.threadId}: ${e.at - last} ms < ${cfg.threadGapMs}` });
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
      sorted.filter((e) => e.at >= start && e.at < start + cfg.recipientWindowMs).map((e) => e.threadId)
    );
    if (recips.size > cfg.maxRecipients) {
      v.push({ rule: 'recipients', at: start, detail: `${recips.size} nguoi nhan trong cua so tu t=${start}` });
    }
  }
  return v;
}

export interface SimResult {
  log: SendLogEntry[];
  violations: Violation[];
  finishedAtMs: number;
}

/** Gia lap dong ho ao: `messages` tin (moi tin mot threadId) xep hang tai
 * t=0, pacer chay moi tickMs, moi tick toi da MOT tin/tai khoan. */
export function simulatePacer(
  threadIds: readonly string[],
  cfg: PacerConfig,
  rng: () => number,
  policyFactory: (cfg: PacerConfig, rng: () => number) => { pick: (now: number, q: QueueItem[]) => QueueItem | null; record: (now: number, t: string) => void } = (c, r) => {
    const p = new PacerPolicy(c, r);
    return { pick: (now, q) => pickNext(now, q, p), record: (now, t) => p.record(now, t) };
  }
): SimResult {
  const queue: QueueItem[] = threadIds.map((t, i) => ({ id: i + 1, threadId: t }));
  const pacer = policyFactory(cfg, rng);
  const log: SendLogEntry[] = [];
  let now = 0;
  const limit = 24 * 60 * 60 * 1000;
  while (queue.length > 0 && now < limit) {
    const item = pacer.pick(now, queue);
    if (item) {
      pacer.record(now, item.threadId);
      log.push({ at: now, threadId: item.threadId });
      queue.splice(queue.indexOf(item), 1);
    }
    now += cfg.tickMs;
  }
  return { log, violations: verifySendLog(log, cfg), finishedAtMs: now };
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
