// packages/core/src/services/pii-gate.test.ts — SPEC-P05-Dispatch.md §10.10.

import { describe, expect, it } from 'vitest';
import { assertNoResidentPii } from './pii-gate.js';
import { PiiGateError } from '../domain/errors.js';

const GUARD = {
  phone: '0901234567',
  fullName: 'Nguyễn Văn A',
  apartmentCode: 'A-0101',
  apartmentCodes: ['A-0101', 'A-0102'],
  keepJobCodes: ['C-24A7'],
};

describe('assertNoResidentPii', () => {
  it('van ban sach (chi ma cuoc) => khong nem', () => {
    expect(() => assertNoResidentPii('CUỐC C-24A7: đã có thợ nhận lúc 10:05.', GUARD)).not.toThrow();
  });

  it('SDT (co/khong dau phan cach) => PiiGateError', () => {
    expect(() => assertNoResidentPii('Gọi 0901234567 giúp em', GUARD)).toThrow(PiiGateError);
    expect(() => assertNoResidentPii('Gọi 0901.234.567 giúp em', GUARD)).toThrow(PiiGateError);
    expect(() => assertNoResidentPii('Gọi 0901 234 567 giúp em', GUARD)).toThrow(PiiGateError);
  });

  it('ten cu dan (khong phan biet hoa thuong, NFC) => PiiGateError', () => {
    expect(() => assertNoResidentPii('anh nguyễn văn a đang chờ', GUARD)).toThrow(PiiGateError);
  });

  it('ma can (so khop long) => PiiGateError', () => {
    expect(() => assertNoResidentPii('căn a - 01 - 01 nhé', GUARD)).toThrow(PiiGateError);
    expect(() => assertNoResidentPii('can A.01.02', GUARD)).toThrow(PiiGateError);
  });

  it('mau chung PHONE_RE/APT_GENERIC_RE (so khac guard) van bi chan', () => {
    expect(() => assertNoResidentPii('Gọi 0987654321 giúp em', GUARD)).toThrow(PiiGateError);
    expect(() => assertNoResidentPii('căn B-0203 nhé', GUARD)).toThrow(PiiGateError);
  });

  it('ma cuoc trong keepJobCodes duoc giu, khong bi hieu nham la ma can', () => {
    expect(() => assertNoResidentPii('CUỐC C-24A7 đã đăng, chờ thợ nhận.', GUARD)).not.toThrow();
  });
});
