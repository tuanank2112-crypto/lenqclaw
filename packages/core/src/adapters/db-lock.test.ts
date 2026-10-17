// db.ts — D35.11 (R08 G5): ket noi giu advisory lock bat TCP keepAlive de nua-mo/dut am tham van phat hien duoc
// (khong dua vao 'error'/'end' don thuan). Khong can DB: kiem cau hinh client.
import { describe, expect, it } from 'vitest';
import { advisoryLockClientConfig } from './db.js';

describe('advisoryLockClientConfig (D35.11)', () => {
  it('bat keepAlive va giu connectionString', () => {
    const c = advisoryLockClientConfig('postgres://u:p@127.0.0.1:5432/x');
    expect(c.keepAlive).toBe(true);
    expect(c.connectionString).toBe('postgres://u:p@127.0.0.1:5432/x');
  });
  it('keepAliveInitialDelayMillis la so duong nho (<= 30 s) de phat hien som', () => {
    const c = advisoryLockClientConfig('postgres://x');
    expect(c.keepAliveInitialDelayMillis).toBeGreaterThan(0);
    expect(c.keepAliveInitialDelayMillis).toBeLessThanOrEqual(30_000);
  });
});
