// packages/core/src/services/pii-gate.ts — chan PII truoc khi gui tin cho
// tho (SPEC-P05-Dispatch.md §10.10, BB-02/BB-11). Thuan (khong cham DB) —
// `sendVendorMessage` (services/vendor-messages.ts) goi ham nay TRUOC
// `enqueue`.
//
// R12 Q2 (P05-C): `agent/pii.ts` nay da xuat `PHONE_RE`/`APT_GENERIC_RE` —
// import lai o day thay vi lap regex rieng nhu ban P05-B cu.

import { PiiGateError } from '../domain/errors.js';
import { PHONE_RE as PHONE_RE_GLOBAL, APT_GENERIC_RE as APT_GENERIC_RE_GLOBAL } from '../agent/pii.js';

export interface ResidentGuard {
  phone: string | null;
  fullName: string | null;
  apartmentCode: string;
  apartmentCodes: readonly string[];
  keepJobCodes: readonly string[];
}

// Tao lai TU NGUON chuoi cua agent/pii.ts KHONG co co global (chi dung
// .test(), tranh bug lastIndex cua regex global khi tai su dung).
const PHONE_RE = new RegExp(PHONE_RE_GLOBAL.source, PHONE_RE_GLOBAL.flags.replace('g', ''));
const APT_GENERIC_RE = new RegExp(APT_GENERIC_RE_GLOBAL.source, APT_GENERIC_RE_GLOBAL.flags.replace('g', ''));

function withJobCodesHidden(text: string, keepJobCodes: readonly string[]): string {
  let working = text.normalize('NFKC');
  (keepJobCodes ?? []).filter(Boolean).forEach((code, i) => {
    working = working.split(code).join(`\u0000KEEP${i}\u0000`);
  });
  return working;
}

function looseCodePattern(code: string): RegExp | null {
  const loose = code.replace(/[.\-\s]/g, '');
  if (loose.length === 0) return null;
  const pattern = loose
    .split('')
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[.\\-\\s]*');
  return new RegExp(pattern, 'iu');
}

/**
 * Nem `PiiGateError` neu `text` (du dinh gui cho tho, KHONG phai reveal)
 * chua thong tin ca nhan cu dan (SPEC-P05-Dispatch.md §10.10):
 * (1) chuoi so cua `guard.phone` (bo moi ky tu khong phai so, so tren text
 *     da bo ky tu phan cach) xuat hien;
 * (2) `guard.fullName` (NFC, khong phan biet hoa thuong, >=5 ky tu) xuat hien;
 * (3) bat ky ma trong `guard.apartmentCodes` (so khop long nhu
 *     `redactKnownApartmentCodes`) xuat hien;
 * (4) mau chung PHONE_RE/APT_GENERIC_RE khop.
 * Ma cuoc trong `guard.keepJobCodes` duoc thay bang placeholder truoc khi
 * so, tranh bao nham (ma cuoc co the trung hinh dang mau can chung).
 */
export function assertNoResidentPii(text: string, guard: ResidentGuard): void {
  const working = withJobCodesHidden(text, guard.keepJobCodes ?? []);

  if (guard.phone) {
    const phoneDigits = guard.phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length >= 8) {
      const textDigits = working.replace(/[^0-9]/g, '');
      if (textDigits.includes(phoneDigits)) {
        throw new PiiGateError('Tin cho tho chua so dien thoai cua cu dan.');
      }
    }
  }

  if (guard.fullName && guard.fullName.trim().length >= 5) {
    const nameNorm = guard.fullName.normalize('NFC').toLowerCase();
    const textNorm = working.normalize('NFC').toLowerCase();
    if (textNorm.includes(nameNorm)) {
      throw new PiiGateError('Tin cho tho chua ten cu dan.');
    }
  }

  for (const code of guard.apartmentCodes ?? []) {
    if (!code) continue;
    const re = looseCodePattern(code);
    if (re && re.test(working)) {
      throw new PiiGateError('Tin cho tho chua ma can cua cu dan.');
    }
  }

  if (PHONE_RE.test(working)) {
    throw new PiiGateError('Tin cho tho khop mau so dien thoai.');
  }
  if (APT_GENERIC_RE.test(working)) {
    throw new PiiGateError('Tin cho tho khop mau ma can.');
  }
}
