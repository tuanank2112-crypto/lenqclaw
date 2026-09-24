import { describe, expect, it } from 'vitest';
import { canAccess } from './policy';

describe('canAccess (SPEC-P01-Foundation.md §7)', () => {
  it('/login va /api/auth/* mo cho moi vai, ke ca chua dang nhap', () => {
    for (const role of [null, 'bql_admin', 'bql_staff', 'guard'] as const) {
      expect(canAccess(role, '/login')).toBe(true);
      expect(canAccess(role, '/api/auth/login')).toBe(true);
    }
  });

  it('chua dang nhap: chi /login va /api/auth/* duoc phep', () => {
    expect(canAccess(null, '/')).toBe(false);
    expect(canAccess(null, '/tickets')).toBe(false);
    expect(canAccess(null, '/gate')).toBe(false);
    expect(canAccess(null, '/admin')).toBe(false);
    expect(canAccess(null, '/dev/sim')).toBe(false);
  });

  it('/ mo cho ca 3 vai da dang nhap', () => {
    expect(canAccess('bql_admin', '/')).toBe(true);
    expect(canAccess('bql_staff', '/')).toBe(true);
    expect(canAccess('guard', '/')).toBe(true);
  });

  it('/tickets/*: admin+staff duoc, guard bi tu choi', () => {
    expect(canAccess('bql_admin', '/tickets')).toBe(true);
    expect(canAccess('bql_staff', '/tickets/123')).toBe(true);
    expect(canAccess('guard', '/tickets')).toBe(false);
  });

  it('/gate/*: admin+guard duoc, staff bi tu choi', () => {
    expect(canAccess('bql_admin', '/gate')).toBe(true);
    expect(canAccess('guard', '/gate/entry')).toBe(true);
    expect(canAccess('bql_staff', '/gate')).toBe(false);
  });

  it('/admin/*, /dev/*: chi bql_admin', () => {
    expect(canAccess('bql_admin', '/admin/x')).toBe(true);
    expect(canAccess('bql_admin', '/dev/sim')).toBe(true);
    expect(canAccess('bql_staff', '/admin/x')).toBe(false);
    expect(canAccess('guard', '/dev/sim')).toBe(false);
  });

  it('duong khac: mac dinh tu choi cho ca 3 vai', () => {
    expect(canAccess('bql_admin', '/khong-ton-tai')).toBe(false);
    expect(canAccess('bql_staff', '/khong-ton-tai')).toBe(false);
    expect(canAccess('guard', '/khong-ton-tai')).toBe(false);
  });
});
