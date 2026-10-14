// packages/core/src/services/vn-time.test.ts — ham gio VN thuan:
// 5 ca da chay thu boi architect + isBusinessHours/isOfficeHours/vnDateString.

import { describe, expect, it } from 'vitest';
import { computePublishExpiry, isBusinessHours, isOfficeHours, vnDateString } from './vn-time.js';

function vn(iso: string): Date {
  // iso vd '2026-09-25T10:00:00' hieu la GIO VN (+07:00).
  return new Date(`${iso}+07:00`);
}

describe('computePublishExpiry (ham gio VN thuan)', () => {
  it('10:00 => 10:45 (trong gio, +45p)', () => {
    const r = computePublishExpiry(vn('2026-09-25T10:00:00'), 45);
    expect(r.toISOString()).toBe(vn('2026-09-25T10:45:00').toISOString());
  });
  it('20:30 => 21:15 (van con trong [07:00,21:00) luc bat dau)', () => {
    const r = computePublishExpiry(vn('2026-09-25T20:30:00'), 45);
    expect(r.toISOString()).toBe(vn('2026-09-25T21:15:00').toISOString());
  });
  it('21:30 => 08:00 hom sau', () => {
    const r = computePublishExpiry(vn('2026-09-25T21:30:00'), 45);
    expect(r.toISOString()).toBe(vn('2026-09-26T08:00:00').toISOString());
  });
  it('05:00 => 08:00 cung ngay', () => {
    const r = computePublishExpiry(vn('2026-09-25T05:00:00'), 45);
    expect(r.toISOString()).toBe(vn('2026-09-25T08:00:00').toISOString());
  });
  it('00:00 ngay 1/10 => 08:00 1/10', () => {
    const r = computePublishExpiry(vn('2026-10-01T00:00:00'), 45);
    expect(r.toISOString()).toBe(vn('2026-10-01T08:00:00').toISOString());
  });
});

describe('isBusinessHours / isOfficeHours / vnDateString', () => {
  it('isBusinessHours [07:00,21:00)', () => {
    expect(isBusinessHours(vn('2026-09-25T06:59:00'))).toBe(false);
    expect(isBusinessHours(vn('2026-09-25T07:00:00'))).toBe(true);
    expect(isBusinessHours(vn('2026-09-25T20:59:00'))).toBe(true);
    expect(isBusinessHours(vn('2026-09-25T21:00:00'))).toBe(false);
  });
  it('isOfficeHours [08:00,18:00) moi ngay', () => {
    expect(isOfficeHours(vn('2026-09-27T09:00:00'))).toBe(true); // chu nhat van tinh
    expect(isOfficeHours(vn('2026-09-25T07:59:00'))).toBe(false);
    expect(isOfficeHours(vn('2026-09-25T17:59:00'))).toBe(true);
    expect(isOfficeHours(vn('2026-09-25T18:00:00'))).toBe(false);
  });
  it('vnDateString tra ngay VN dang YYYY-MM-DD', () => {
    expect(vnDateString(vn('2026-09-25T23:59:00'))).toBe('2026-09-25');
    expect(vnDateString(vn('2026-09-25T00:00:00'))).toBe('2026-09-25');
  });
});
