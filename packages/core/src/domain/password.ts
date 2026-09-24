// packages/core/src/domain/password.ts — bam mat khau bang `node:crypto`
// scrypt (SPEC-P01-Foundation.md §7). Dinh dang luu: `scrypt$<N>$<saltB64>$<hashB64>`.
// CAM thu vien native (bcrypt).
//
// Dung `scryptSync` (khong qua `promisify`) vi kieu overload cua
// `node:crypto`.`scrypt` khien `util.promisify` chi khop chu ky KHONG nhan
// `options` (N tuy chinh), lam mat kha nang chon cost parameter.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384; // cost parameter (2^14) — mac dinh node:crypto scrypt
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  if (!Number.isFinite(n) || n <= 0) return false;
  const salt = Buffer.from(parts[2]!, 'base64');
  const expected = Buffer.from(parts[3]!, 'base64');
  const derived = scryptSync(password, salt, expected.length, { N: n });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
