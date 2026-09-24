import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSessionCookie, verifySessionCookie } from './session';

describe('session cookie (HMAC-SHA256, SPEC-P01-Foundation.md §7)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tao roi xac minh => dung uid/role', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_admin');
    const payload = await verifySessionCookie(cookie);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe('staff-1');
    expect(payload!.role).toBe('bql_admin');
  });

  it('sua 1 byte trong chu ky => khong hop le', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_admin');
    const dot = cookie.lastIndexOf('.');
    const body = cookie.slice(0, dot);
    const signature = cookie.slice(dot + 1);
    const lastChar = signature.at(-1);
    const replacement = lastChar === 'A' ? 'B' : 'A';
    const tampered = `${body}.${signature.slice(0, -1)}${replacement}`;

    expect(await verifySessionCookie(tampered)).toBeNull();
  });

  it('het han => khong hop le', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_admin');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(await verifySessionCookie(cookie)).toBeNull();
  });

  it('thieu cookie => null', async () => {
    expect(await verifySessionCookie(undefined)).toBeNull();
    expect(await verifySessionCookie(null)).toBeNull();
  });
});
