// SPEC-P02 §9.2: /zalo va /api/zalo/* chi admin (middleware dung canAccess).
import { describe, expect, it } from 'vitest';
import { canAccess } from '../../../lib/auth/policy';

describe('canAccess — /zalo, /api/zalo/*', () => {
  it('chi admin', () => {
    for (const p of ['/zalo', '/api/zalo/community/login', '/api/zalo/status']) {
      expect(canAccess('admin', p)).toBe(true);
      expect(canAccess('operator', p)).toBe(false);
      expect(canAccess(null, p)).toBe(false);
    }
  });
  it('ranh gioi doan duong dan: /zalox khong khop', () => {
    expect(canAccess('admin', '/zalox')).toBe(false);
  });
});
