// apps/zalo-worker/src/crypto.ts — ma hoa phien Zalo (SPEC-P02 §1, §9.3):
// AES-256-GCM, khoa 32 byte tu env ZALO_SESSION_KEY (hex 64 ky tu hoac
// base64). Ban ro = JSON {cookie, imei, userAgent}. CAM log ban ro, CAM dua
// ban ro/khoa vao thong diep loi (§7).
//
// Dinh dang bytea: [1 byte phien ban = 1][12 byte IV][16 byte tag][ciphertext].
// AAD = id tai khoan ('community') => ban ma cua tai khoan nay khong giai
// ma duoc khi gan nham sang tai khoan kia.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SessionSecret {
  cookie: unknown;
  imei: string;
  userAgent: string;
}

export class SessionKeyError extends Error {
  readonly code = 'SessionKeyError';
}

export class SessionDecryptError extends Error {
  readonly code = 'SessionDecryptError';
  constructor() {
    super('Giai ma phien Zalo that bai (sai khoa, sai tai khoan hoac du lieu hong).');
  }
}

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Doc khoa 32 byte tu chuoi env. Thieu / sai do dai ⇒ SessionKeyError
 * (worker tu choi khoi dong, exit 1). Thong diep KHONG chua gia tri khoa. */
export function parseSessionKey(raw: string | undefined): Buffer {
  const value = (raw ?? '').trim();
  if (!value) throw new SessionKeyError('ZALO_SESSION_KEY chua duoc cau hinh (can 32 byte, hex hoac base64).');
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, 'hex');
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64');
    if (decoded.length === 32) key = decoded;
  }
  if (!key || key.length !== 32) {
    throw new SessionKeyError('ZALO_SESSION_KEY sai do dai: can dung 32 byte (64 ky tu hex hoac base64 cua 32 byte).');
  }
  return key;
}

export function encryptSession(secret: SessionSecret, key: Buffer, accountId: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(accountId, 'utf8'));
  const plain = Buffer.from(JSON.stringify(secret), 'utf8');
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  plain.fill(0);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ct]);
}

export function decryptSession(blob: Buffer, key: Buffer, accountId: string): SessionSecret {
  try {
    if (blob.length < 1 + IV_LEN + TAG_LEN + 1 || blob[0] !== VERSION) throw new Error('format');
    const iv = blob.subarray(1, 1 + IV_LEN);
    const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
    const ct = blob.subarray(1 + IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(accountId, 'utf8'));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    const parsed = JSON.parse(plain.toString('utf8')) as SessionSecret;
    plain.fill(0);
    if (typeof parsed.imei !== 'string' || typeof parsed.userAgent !== 'string' || parsed.cookie === undefined) {
      throw new Error('shape');
    }
    return parsed;
  } catch {
    // Nuot loi goc: loi cua JSON.parse co the trich mot doan ban ro.
    throw new SessionDecryptError();
  }
}
