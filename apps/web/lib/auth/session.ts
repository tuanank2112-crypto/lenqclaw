// apps/web/lib/auth/session.ts — cookie phien ky HMAC-SHA256 bang
// SESSION_SECRET (SPEC-P01-Foundation.md §7). Dung Web Crypto (khong
// node:crypto) de MOT cai dat chay dung ca o Node route handlers lan Edge
// runtime (middleware.ts goi cung ham nay).

import type { StaffRole } from '@lenqclaw/core';

export const SESSION_COOKIE_NAME = 'lq_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export interface SessionPayload {
  uid: string;
  role: StaffRole;
  exp: number; // epoch ms
}

/** Thieu SESSION_SECRET LUC CHAY (khong phai luc build) => tu choi dang
 * nhap: ham nay chi duoc goi trong request handler, khong o module top-level. */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET chua duoc cau hinh. Xem specs/OPERATIONS.md §3.');
  }
  return secret;
}

function base64urlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const str = atob(withPad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionCookie(uid: string, role: StaffRole): Promise<string> {
  const secret = getSecret();
  const payload: SessionPayload = { uid, role, exp: Date.now() + SESSION_TTL_MS };
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const signature = base64urlEncode(new Uint8Array(sigBuf));
  return `${body}.${signature}`;
}

/** Xac minh cookie phien. `null` khi thieu, sai dinh dang, chu ky khong khop
 * (ke ca lech 1 byte — `crypto.subtle.verify` so sanh hang so thoi gian),
 * het han. */
export async function verifySessionCookie(
  cookieValue: string | undefined | null
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  const secret = getSecret();
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  if (!body || !signature) return null;

  let sigBytes: Uint8Array;
  try {
    sigBytes = base64urlDecode(signature);
  } catch {
    return null;
  }

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, new TextEncoder().encode(body));
  if (!valid) return null;

  try {
    const json = new TextDecoder().decode(base64urlDecode(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
