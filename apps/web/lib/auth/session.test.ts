import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSessionCookie, verifySessionCookie, type SessionPayload } from './session';

function decodeBody(cookie: string): SessionPayload {
  const dot = cookie.lastIndexOf('.');
  const body = cookie.slice(0, dot);
  const json = Buffer.from(body, 'base64url').toString('utf8');
  return JSON.parse(json) as SessionPayload;
}

function encodeBody(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

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

  // Vong 2 R01 — muc 11 (theo R02-tham-dinh): mot bo ca am cho
  // verifySessionCookie ma unit test hien co chua phu.

  it('doi payload (role) nhung giu chu ky CU => khong hop le', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_staff');
    const dot = cookie.lastIndexOf('.');
    const oldSignature = cookie.slice(dot + 1);
    const payload = decodeBody(cookie);
    const forgedBody = encodeBody({ ...payload, role: 'bql_admin' });
    const forged = `${forgedBody}.${oldSignature}`;

    expect(await verifySessionCookie(forged)).toBeNull();
  });

  it('doi truong exp nhung giu chu ky CU => khong hop le', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_admin');
    const dot = cookie.lastIndexOf('.');
    const oldSignature = cookie.slice(dot + 1);
    const payload = decodeBody(cookie);
    const forgedBody = encodeBody({ ...payload, exp: Date.now() + 999 * 24 * 60 * 60 * 1000 });
    const forged = `${forgedBody}.${oldSignature}`;

    expect(await verifySessionCookie(forged)).toBeNull();
  });

  it('chu ky rong => khong hop le', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_admin');
    const dot = cookie.lastIndexOf('.');
    const body = cookie.slice(0, dot);

    expect(await verifySessionCookie(`${body}.`)).toBeNull();
  });

  it('thieu phan chu ky (khong co dau cham) => khong hop le', async () => {
    const cookie = await createSessionCookie('staff-1', 'bql_admin');
    const dot = cookie.lastIndexOf('.');
    const bodyOnly = cookie.slice(0, dot);

    expect(await verifySessionCookie(bodyOnly)).toBeNull();
  });

  it('chuoi rac bat ky => khong hop le', async () => {
    expect(await verifySessionCookie('day-la-chuoi-rac-khong-phai-cookie')).toBeNull();
    expect(await verifySessionCookie('...')).toBeNull();
    expect(await verifySessionCookie('a.b.c')).toBeNull();
    expect(await verifySessionCookie('')).toBeNull();
  });
});
