// packages/core/src/agent/tools/classify_responsibility.test.ts — G7 (R06
// vong 2): `todayInVietnam()` phai dung mui gio Asia/Ho_Chi_Minh (UTC+7),
// KHONG dung UTC (`new Date().toISOString()`). Test THUAN (`npm test`),
// dung `vi.useFakeTimers()` de canh dung BIEN gio — khong phu thuoc gio
// chay that cua may (CI co the chay bat ky gio nao trong ngay).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayInVietnam } from './classify_responsibility.js';

describe('todayInVietnam (SPEC-P03 §11.4 G7)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('20:00 UTC ngay X => Asia/Ho_Chi_Minh la 03:00 ngay X+1 (UTC+7) — PHAI tra ve X+1, KHONG phai X (bug cu: so theo UTC)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T20:00:00.000Z'));
    expect(todayInVietnam()).toBe('2026-03-15');
    // Doi chieu: neu dung UTC (bug cu) se tra ve '2026-03-14'.
    expect(todayInVietnam()).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it('10:00 UTC (16:00-17:00 VN, con trong ngay) => VN va UTC CUNG mot ngay', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00.000Z'));
    expect(todayInVietnam()).toBe('2026-03-14');
  });

  it('23:59 UTC 31/12 => VN da la 1/1 nam sau (qua nam)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:59:00.000Z'));
    expect(todayInVietnam()).toBe('2027-01-01');
  });

  it('16:59 UTC (ngay truoc bien 17:00) => VN VAN con la ngay do (chua qua ngay)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T16:59:00.000Z'));
    expect(todayInVietnam()).toBe('2026-03-14');
  });
});
