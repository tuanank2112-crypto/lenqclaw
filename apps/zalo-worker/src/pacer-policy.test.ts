// SPEC-P02 §5, §8: gia lap 50 tin / 20 nguoi ⇒ khong vi pham bang §5; bo
// kiem (verifySendLog) phai DO tren pacer hong (khong gioi han).
import { describe, expect, it } from 'vitest';
import { PACER_DEFAULTS } from './config.js';
import {
  PacerPolicy,
  pickNext,
  seededRng,
  simulatePacer,
  splitText,
  typingDelayMs,
  seenDelayMs,
  verifySendLog,
} from './pacer-policy.js';

function fiftyToTwenty(seed: number): string[] {
  const rng = seededRng(seed);
  const threads = Array.from({ length: 20 }, (_, i) => `u${String(i + 1).padStart(2, '0')}`);
  const out = [...threads]; // moi nguoi it nhat 1 tin
  while (out.length < 50) out.push(threads[Math.floor(rng() * threads.length)]!);
  return out;
}

describe('pacer — gia lap 50 tin / 20 nguoi (§8)', () => {
  for (const seed of [1, 2, 3, 42, 2026]) {
    it(`seed ${seed}: gui het 50 tin, 0 vi pham`, () => {
      const r = simulatePacer(fiftyToTwenty(seed), PACER_DEFAULTS, seededRng(seed * 7));
      expect(r.log.length).toBe(50);
      expect(r.violations).toEqual([]);
      expect(new Set(r.log.map((e) => e.threadId)).size).toBe(20);
    });
  }

  it('bo kiem DO khi pacer khong gioi han (ca 3 luat)', () => {
    const naive = () => ({ pick: (_now: number, q: { id: number; threadId: string }[]) => q[0] ?? null, record: () => {} });
    const r = simulatePacer(fiftyToTwenty(1), PACER_DEFAULTS, seededRng(1), naive);
    const rules = new Set(r.violations.map((v) => v.rule));
    expect(rules.has('per_minute')).toBe(true);
    expect(rules.has('recipients')).toBe(true);
    expect(rules.has('thread_gap')).toBe(true);
  });
});

describe('PacerPolicy', () => {
  it('cung thread: >= 3 s + jitter', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0.5);
    p.record(0, 'a');
    expect(p.check(2999, 'a')).toEqual({ ok: false, reason: 'thread_gap' });
    expect(p.check(3999, 'a')).toEqual({ ok: false, reason: 'thread_gap' });
    expect(p.check(4000, 'a').ok).toBe(true);
    expect(p.check(0, 'b').ok).toBe(true);
  });
  it('<= 10 tin/phut toan tai khoan', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0);
    for (let i = 0; i < 10; i++) p.record(i * 1000, `t${i}`);
    expect(p.check(10_000, 'x')).toEqual({ ok: false, reason: 'per_minute' });
    expect(p.check(60_001, 'x').ok).toBe(true);
  });
  it('<= 15 nguoi nhan / 10 phut; nguoi cu van nhan duoc', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0);
    for (let i = 0; i < 15; i++) p.record(i * 7000, `t${i}`);
    const now = 15 * 7000 + 60_000;
    expect(p.check(now, 'new')).toEqual({ ok: false, reason: 'recipients' });
    expect(p.check(now, 't3').ok).toBe(true);
    expect(p.check(600_001, 'new').ok).toBe(true);
  });
  it('backoff 30 phut chan moi tin', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0);
    p.backoff(1000);
    expect(p.check(1000 + 1_799_999, 'a')).toEqual({ ok: false, reason: 'backoff' });
    expect(p.check(1000 + 1_800_000, 'a').ok).toBe(true);
  });
  it('pickNext chi xet tin dau moi thread (giu thu tu)', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0);
    p.record(0, 'a');
    const q = [
      { id: 1, threadId: 'a' },
      { id: 2, threadId: 'a' },
      { id: 3, threadId: 'b' },
    ];
    expect(pickNext(1000, q, p)?.id).toBe(3);
  });
  it('seedHistory: khoi dong lai van ton trong gioi han/phut', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0);
    p.seedHistory(Array.from({ length: 10 }, (_, i) => ({ at: i * 100, threadId: `s${i}` })));
    expect(p.check(2000, 'z')).toEqual({ ok: false, reason: 'per_minute' });
  });
});

describe('tach tin / tre', () => {
  it('tin dai tach thanh doan <= 1800 ky tu, ghep lai du noi dung', () => {
    const word = 'sửa vòi nước ';
    const long = word.repeat(400); // ~5200 ky tu
    const parts = splitText(long, 1800);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const p of parts) expect(Array.from(p).length).toBeLessThanOrEqual(1800);
    expect(parts.join(' ').replace(/\s+/g, ' ').trim()).toBe(long.replace(/\s+/g, ' ').trim());
    expect(splitText('ngắn', 1800)).toEqual(['ngắn']);
  });
  it('dang go 1–3 s ti le do dai; da xem 2–6 s', () => {
    expect(typingDelayMs(0, PACER_DEFAULTS)).toBe(1000);
    expect(typingDelayMs(900, PACER_DEFAULTS)).toBe(2000);
    expect(typingDelayMs(5000, PACER_DEFAULTS)).toBe(3000);
    expect(seenDelayMs(PACER_DEFAULTS, () => 0)).toBe(2000);
    expect(seenDelayMs(PACER_DEFAULTS, () => 0.999999)).toBe(6000);
  });
  it('verifySendLog bat khoang cach cung thread', () => {
    expect(
      verifySendLog(
        [
          { at: 0, threadId: 'a' },
          { at: 1000, threadId: 'a' },
        ],
        PACER_DEFAULTS
      ).map((v) => v.rule)
    ).toEqual(['thread_gap']);
  });
});
