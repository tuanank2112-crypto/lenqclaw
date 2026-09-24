// packages/core/src/adapters/db.ts — noi DUY NHAT mo ket noi Postgres
// (BB-07, 01-CONTRACTS.md §2, §1). CAM import `pg` o bat ky file nao khac —
// kiem bang scripts/check_adapter_boundary.mjs.

import pg from 'pg';

export type SqlFn = <T = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[]
) => Promise<T[]>;

let pool: pg.Pool | null = null;

/** Tao Pool luoi (lazy) o lan goi dau tien — build KHONG can DATABASE_URL. */
function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL chua duoc cau hinh. Xem specs/OPERATIONS.md §3.');
  }
  pool = new pg.Pool({ connectionString });
  return pool;
}

/** Chay mot cau truy van, tra thang mang row. */
export const sql: SqlFn = async (text, params) => {
  const p = getPool();
  const result = await p.query(text, params as unknown[] | undefined);
  return result.rows;
};

/**
 * Chay `fn` trong mot transaction: BEGIN, goi `fn(q)` voi `q` cung chu ky
 * `sql` nhung chay tren client cua transaction, COMMIT khi thanh cong,
 * ROLLBACK va nem lai loi khi that bai.
 */
export async function tx<T>(fn: (q: SqlFn) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const q: SqlFn = async (text, params) => {
      const result = await client.query(text, params as unknown[] | undefined);
      return result.rows;
    };
    const out = await fn(q);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Dong pool — dung cho test/CLI ket thuc gon, khong treo tien trinh. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
