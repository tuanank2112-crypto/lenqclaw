// approvals.test.ts (THUAN) — SPEC-P05 §10 hang 3: `hasDecisionEvidence(text, idShort)` >= 12 ca.
import { describe, expect, it } from 'vitest';
import { hasDecisionEvidence, idShortOf } from './approvals.js';

const ID = '1a2b3c4d';
const FULL = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('hasDecisionEvidence', () => {
  const cases: Array<[string, string, 'approve' | 'reject' | null]> = [
    ['duyệt 1a2b3c4d', ID, 'approve'],
    ['ok 1a2b3c4d nhé', ID, 'approve'],
    ['1a2b3c4d', ID, null],
    ['duyệt', ID, null],
    ['từ chối 1a2b3c4d', ID, 'reject'],
    ['không duyệt 1a2b3c4d', ID, 'reject'],
    ['/approve 1a2b3c4d', ID, 'approve'],
    ['/reject 1a2b3c4d', ID, 'reject'],
    ['Đồng ý 1A2B3C4D', ID, 'approve'],
    ['duyệt 99999999', ID, null],
    ['duyet 1a2b3c4d', ID, 'approve'],
    ['tu choi 1a2b3c4d', ID, 'reject'],
    ['duyệt 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', FULL, 'approve'],
    ['duyệt 1a2b3c', ID, 'approve'], // tien to >= 6 ky tu
    ['duyệt 1a2b3', ID, null], // tien to < 6 ky tu
    ['duyệt 1a2b3c4dxyz', ID, null], // khong phai ranh gioi tu cua ma
    ['okay 1a2b3c4d', ID, null], // "okay" khong phai tu "ok" (so bang nhau theo ranh gioi tu)
    ['approved 1a2b3c4d', ID, null],
    ['', ID, null],
    ['duyệt abc', 'abc', null], // ma qua ngan
    // F1 (D41, SPEC-P05 §5.4 thu tu xet): tu do du/phu dinh ⇒ null (hoi lai), KHONG approve
    ['đừng duyệt 1a2b3c4d', ID, null],
    ['chưa duyệt 1a2b3c4d', ID, null],
    ['khoan duyệt 1a2b3c4d', ID, null],
    ['duyệt 1a2b3c4d đợi chút', ID, null],
    ['duyệt từ từ 1a2b3c4d', ID, null],
    ['hủy, duyệt 1a2b3c4d', ID, null],
    ['ok 1a2b3c4d nhưng không chắc', ID, null], // "khong" lan trong cau (SPEC §5.4 buoc 2)
    ['không đồng ý 1a2b3c4d', ID, 'reject'],
    ['khong duyet 1a2b3c4d', ID, 'reject'],
    ['reject 1a2b3c4d', ID, 'reject'],
    ['chưa từ chối 1a2b3c4d', ID, 'reject'], // cum tu choi TUONG MINH xet truoc (buoc 1)
    ['không 1a2b3c4d', ID, null],
    ['/reject 1a2b3c4d đừng', ID, 'reject'],
  ];
  for (const [text, id, want] of cases) {
    it(`"${text}" ⇒ ${want}`, () => {
      expect(hasDecisionEvidence(text, id)).toBe(want);
    });
  }
  it('co >= 12 ca', () => expect(cases.length).toBeGreaterThanOrEqual(12));
  it('idShortOf = 8 ky tu dau uuid', () => expect(idShortOf(FULL)).toBe(ID));
});
