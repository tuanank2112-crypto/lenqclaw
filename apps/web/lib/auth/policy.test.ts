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

  // SPEC-P04-Vendor-Console.md §8.1 — moi o bang mot `it`.
  it('/api/tickets/*: admin duoc', () => {
    expect(canAccess('bql_admin', '/api/tickets/1/decision')).toBe(true);
  });
  it('/api/tickets/*: staff duoc', () => {
    expect(canAccess('bql_staff', '/api/tickets/1/decision')).toBe(true);
  });
  it('/api/tickets/*: guard bi tu choi', () => {
    expect(canAccess('guard', '/api/tickets/1/decision')).toBe(false);
  });
  it('/vendors/*: admin duoc', () => {
    expect(canAccess('bql_admin', '/vendors')).toBe(true);
  });
  it('/vendors/*: staff bi tu choi', () => {
    expect(canAccess('bql_staff', '/vendors')).toBe(false);
  });
  it('/vendors/*: guard bi tu choi', () => {
    expect(canAccess('guard', '/vendors')).toBe(false);
  });
  it('/api/vendors/*: admin duoc', () => {
    expect(canAccess('bql_admin', '/api/vendors/1/status')).toBe(true);
  });
  it('/api/vendors/*: staff bi tu choi', () => {
    expect(canAccess('bql_staff', '/api/vendors/1/status')).toBe(false);
  });
  it('/api/vendors/*: guard bi tu choi', () => {
    expect(canAccess('guard', '/api/vendors/1/status')).toBe(false);
  });
  it('/jobs/*: admin duoc', () => {
    expect(canAccess('bql_admin', '/jobs/C-0001')).toBe(true);
  });
  it('/jobs/*: staff duoc', () => {
    expect(canAccess('bql_staff', '/jobs/C-0001')).toBe(true);
  });
  it('/jobs/*: guard bi tu choi', () => {
    expect(canAccess('guard', '/jobs')).toBe(false);
  });
  it('R02-tham-dinh D6: khop theo RANH GIOI DOAN, khong theo tien to', () => {
    // /ticketsX khong phai /tickets hay /tickets/... => duong khac => tu choi
    expect(canAccess('bql_admin', '/ticketsX')).toBe(false);
    expect(canAccess('bql_staff', '/ticketsX')).toBe(false);
    // /gatekeeper khong phai /gate hay /gate/... => tu choi
    expect(canAccess('bql_admin', '/gatekeeper')).toBe(false);
    expect(canAccess('guard', '/gatekeeper')).toBe(false);
    // /devices khong phai /dev hay /dev/... => tu choi (ke ca admin)
    expect(canAccess('bql_admin', '/devices')).toBe(false);
    // dung doan van hoat dong binh thuong
    expect(canAccess('bql_admin', '/tickets')).toBe(true);
    expect(canAccess('guard', '/gate')).toBe(true);
  });
});
