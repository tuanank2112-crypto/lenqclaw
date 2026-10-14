// SPEC-P02 §9.3, §9.5: ma hoa/giai ma phien (sai khoa ⇒ loi, khong ro ban ro).
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSession, encryptSession, parseSessionKey, SessionDecryptError, SessionKeyError } from './crypto.js';

const SECRET = {
  cookie: [{ key: 'zpw_sek', value: 'COOKIE-PLAINTEXT-MARKER' }],
  imei: 'IMEI-PLAINTEXT-MARKER',
  userAgent: 'UA-MARKER',
};

describe('parseSessionKey', () => {
  it('thieu ⇒ SessionKeyError', () => {
    expect(() => parseSessionKey(undefined)).toThrow(SessionKeyError);
    expect(() => parseSessionKey('   ')).toThrow(SessionKeyError);
  });
  it('hex 64 ky tu ⇒ 32 byte', () => {
    expect(parseSessionKey('ab'.repeat(32)).length).toBe(32);
  });
  it('base64 cua 32 byte ⇒ 32 byte', () => {
    const k = randomBytes(32);
    expect(parseSessionKey(k.toString('base64')).equals(k)).toBe(true);
  });
  it('sai do dai ⇒ SessionKeyError, thong diep KHONG chua gia tri khoa', () => {
    const bad = randomBytes(31).toString('base64');
    let msg = '';
    try {
      parseSessionKey(bad);
    } catch (e) {
      expect(e).toBeInstanceOf(SessionKeyError);
      msg = (e as Error).message;
    }
    expect(msg).not.toContain(bad);
    expect(() => parseSessionKey('change-me-32-byte-key-hex-or-base64')).toThrow(SessionKeyError);
  });
});

describe('encryptSession / decryptSession (AES-256-GCM)', () => {
  const key = randomBytes(32);

  it('vong di-ve dung', () => {
    const blob = encryptSession(SECRET, key, 'community');
    expect(decryptSession(blob, key, 'community')).toEqual(SECRET);
  });

  it('ban ma KHONG chua ban ro; hai lan ma hoa khac nhau (IV ngau nhien)', () => {
    const a = encryptSession(SECRET, key, 'community');
    const b = encryptSession(SECRET, key, 'community');
    expect(a.toString('latin1')).not.toContain('COOKIE-PLAINTEXT-MARKER');
    expect(a.toString('latin1')).not.toContain('IMEI-PLAINTEXT-MARKER');
    expect(a.equals(b)).toBe(false);
  });

  it('sai khoa ⇒ SessionDecryptError, thong diep khong ro ban ro', () => {
    const blob = encryptSession(SECRET, key, 'community');
    let err: unknown;
    try {
      decryptSession(blob, randomBytes(32), 'community');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SessionDecryptError);
    expect(String((err as Error).message)).not.toMatch(/MARKER/);
  });

  it('sai tai khoan (AAD) ⇒ SessionDecryptError', () => {
    const blob = encryptSession(SECRET, key, 'community');
    expect(() => decryptSession(blob, key, 'other-account')).toThrow(SessionDecryptError);
  });

  it('du lieu bi sua 1 byte ⇒ SessionDecryptError', () => {
    const blob = encryptSession(SECRET, key, 'community');
    blob[blob.length - 1] ^= 0x01;
    expect(() => decryptSession(blob, key, 'community')).toThrow(SessionDecryptError);
    expect(() => decryptSession(Buffer.from([1, 2, 3]), key, 'community')).toThrow(SessionDecryptError);
  });
});
