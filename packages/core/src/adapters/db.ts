// packages/core/src/adapters/db.ts — noi DUY NHAT mo ket noi Postgres
// (BB-07, 01-CONTRACTS.md §2, §1). CAM import `pg` o bat ky file nao khac —
// kiem bang scripts/check_adapter_boundary.mjs.

import pg from 'pg';

export type SqlFn = <T = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[]
) => Promise<T[]>;

/**
 * R02-tham-dinh G1: kieu RIENG cho `q` cua `tx()` — mot ham `SqlFn` thuong
 * (vd `sql` cua pool) khong tu dong gan duoc vao tham so kieu `TxSqlFn`
 * (thieu marker `__tx`), nen `transitionJob` (services/job-state.ts) — noi
 * PHAI ghi `job_events` cung mot transaction voi UPDATE trang thai — khong
 * the vo tinh nhan nham `sql` cua pool luc bien dich. `tx()` gan marker
 * that o runtime (khong chi la ep kieu) de `transitionJob` con kiem duoc
 * ca khi bi ep kieu `as any`.
 */
export type TxSqlFn = SqlFn & { readonly __tx: true };

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
export async function tx<T>(fn: (q: TxSqlFn) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const rawQ: SqlFn = async (text, params) => {
      const result = await client.query(text, params as unknown[] | undefined);
      return result.rows;
    };
    const q = Object.assign(rawQ, { __tx: true as const }) as TxSqlFn;
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

// ---------------------------------------------------------------------------
// D31 (BB-19): khoa mot ban — advisory lock Postgres tren ket noi RIENG
// ---------------------------------------------------------------------------

export interface AdvisoryLock {
  release(): Promise<void>;
}

/** D35.11 (R08 G5): cau hinh client giu khoa — bat TCP keepAlive de ket noi nua-mo bi phat hien (khong chi dua vao 'error'/'end'). */
export function advisoryLockClientConfig(connectionString: string): pg.ClientConfig {
  return { connectionString, keepAlive: true, keepAliveInitialDelayMillis: 10_000 };
}

/**
 * Giu `pg_try_advisory_lock(hashtextextended(name, 0))` tren mot `pg.Client` RIENG (khong lay tu pool) suot doi tien
 * trinh. Khoa dang bi giu boi ban khac ⇒ dong client, tra `null`. Ket noi giu khoa dut (`error`/`end`) khi dang giu ⇒
 * goi `onLost` (caller: dung nhan viec, exit 1 — supervisor khoi dong lai va lay lai khoa).
 */
export async function holdAdvisoryLock(
  name: 'lenqclaw:runner' | 'lenqclaw:worker:community',
  onLost: (err: Error) => void
): Promise<AdvisoryLock | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL chua duoc cau hinh. Xem specs/OPERATIONS.md §3.');
  const client = new pg.Client(advisoryLockClientConfig(connectionString));
  await client.connect();
  let held = false;
  let released = false;
  const lost = (err?: Error) => {
    if (!held || released) return;
    held = false;
    onLost(err ?? new Error('Ket noi giu advisory lock da dong.'));
  };
  client.on('error', (err) => lost(err));
  client.on('end', () => lost());
  try {
    const res = await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtextextended($1, 0)) as ok', [name]);
    if (!res.rows[0]?.ok) {
      released = true;
      await client.end().catch(() => undefined);
      return null;
    }
  } catch (err) {
    released = true;
    await client.end().catch(() => undefined);
    throw err;
  }
  held = true;
  return {
    async release() {
      if (released) return;
      released = true;
      held = false;
      try {
        await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [name]);
      } catch {
        /* ket noi da dut — khoa tu nha */
      }
      await client.end().catch(() => undefined);
    },
  };
}

