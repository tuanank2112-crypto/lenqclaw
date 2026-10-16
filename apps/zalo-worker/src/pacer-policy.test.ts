// SPEC-P02 §5, §8: gia lap 50 tin / 20 nguoi ⇒ khong vi pham bang §5; bo
// kiem (verifySendLog) phai DO tren pacer hong (khong gioi han).
import { describe, expect, it } from 'vitest';
import { PACER_DEFAULTS } from './config.js';
import {
  BUDGET_WINDOW_MS,
  mentionsForFirstChunk,
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

// ---- ca moi P02 (ke hoach 02, SPEC-P02 §5, §10 hang 1) ----

describe('pacer nhom + ngan sach (BB-08)', () => {
  const hundred = Array.from({ length: 100 }, () => 'sim-group-1');
  for (const seed of [1, 2, 7, 2026]) {
    it(`seed ${seed}: 100 tin / 1 nhom, ngan sach 20/gio ⇒ first_hour=20, min_gap >= 8000, 0 vi pham`, () => {
      const r = simulatePacer(hundred, PACER_DEFAULTS, seededRng(seed), undefined, { budgetPerHour: 20 });
      expect(r.log.length).toBe(100);
      expect(r.log.filter((e) => e.at < BUDGET_WINDOW_MS).length).toBe(20);
      let minGap = Infinity;
      for (let i = 1; i < r.log.length; i++) minGap = Math.min(minGap, r.log[i]!.at - r.log[i - 1]!.at);
      expect(minGap).toBeGreaterThanOrEqual(8000);
      expect(r.violations).toEqual([]);
      expect(verifySendLog(r.log, PACER_DEFAULTS, { budgetPerHour: 20 })).toEqual([]);
    });
  }

  it('bo kiem DO khi khong gioi han: group_gap va group_budget', () => {
    const naive = () => ({ pick: (_now: number, q: { id: number; threadId: string }[]) => q[0] ?? null, record: () => {} });
    const r = simulatePacer(hundred.slice(0, 40), PACER_DEFAULTS, seededRng(1), naive, { budgetPerHour: 20 });
    const rules = new Set(r.violations.map((v) => v.rule));
    expect(rules.has('group_gap')).toBe(true);
    expect(rules.has('group_budget')).toBe(true);
  });

  it('khoang cach nhom = groupGapMs + jitter [0, groupJitterMs]; DM giu 3 s', () => {
    const p = new PacerPolicy(PACER_DEFAULTS, () => 0.5);
    p.record(0, 'g', true);
    p.record(0, 'u', false);
    expect(p.check(8000, 'g', true)).toEqual({ ok: false, reason: 'group_gap' }); // 8000 + 1500
    expect(p.check(9499, 'g', true)).toEqual({ ok: false, reason: 'group_gap' });
    expect(p.check(9500, 'g', true).ok).toBe(true);
    expect(p.check(4000, 'u', false).ok).toBe(true); // 3000 + 1000
  });

  it('nhom KHONG tinh vao recipients (15 nguoi nhan DM van con cho)', () => {
    const p = new PacerPolicy({ ...PACER_DEFAULTS, maxPerMinute: 99 }, () => 0);
    for (let i = 0; i < 20; i++) p.record(i * 100, `sim-group-${i}`, true);
    expect(p.check(5000, 'u-new', false).ok).toBe(true);
  });

  it('action tinh maxPerMinute nhung khong tinh recipients / gian cach', () => {
    const p = new PacerPolicy({ ...PACER_DEFAULTS, maxPerMinute: 2 }, () => 0);
    p.recordAction(0, 'g');
    p.recordAction(1000, 'g');
    expect(p.checkAction(2000)).toEqual({ ok: false, reason: 'per_minute' });
    expect(p.check(2000, 'g', true)).toEqual({ ok: false, reason: 'per_minute' });
    expect(p.checkAction(61_000).ok).toBe(true);
    expect(p.check(61_000, 'g', true).ok).toBe(true); // action khong dat gian cach
  });

  it('mentionsForFirstChunk: chi giu mention nam tron trong doan dau, doi pos', () => {
    const text = '  @An xin chào cả nhà @Bích';
    const chunk0 = '@An xin chào'; // sau khi cat + trim
    const m = [
      { uid: 'an', pos: 2, len: 3 },
      { uid: 'bich', pos: 21, len: 5 },
    ];
    expect(mentionsForFirstChunk(text, chunk0, m)).toEqual([{ uid: 'an', pos: 0, len: 3 }]);
    expect(mentionsForFirstChunk(text, 'khong co trong text', m)).toEqual([]);
  });
});
