// SPEC-P02 §9.2: /zalo va /api/zalo/* chi bql_admin (middleware dung canAccess).
import { describe, expect, it } from 'vitest';
import { canAccess } from '../../../lib/auth/policy';

describe('canAccess — /zalo, /api/zalo/*', () => {
  it('chi bql_admin', () => {
    for (const p of ['/zalo', '/api/zalo/bql/login', '/api/zalo/status']) {
      expect(canAccess('bql_admin', p)).toBe(true);
      expect(canAccess('bql_staff', p)).toBe(false);
      expect(canAccess('guard', p)).toBe(false);
      expect(canAccess(null, p)).toBe(false);
    }
  });
  it('ranh gioi doan duong dan: /zalox khong khop', () => {
    expect(canAccess('bql_admin', '/zalox')).toBe(false);
  });
});
