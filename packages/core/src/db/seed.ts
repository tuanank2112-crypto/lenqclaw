// packages/core/src/db/seed.ts — du lieu nen idempotent (SPEC-P01-Foundation.md
// §3): 1 organization, 1 building TOA-A, 20 apartments (5 tang x 4 can),
// zalo_accounts bql/market, 12 job_categories. Du lieu mo phong cu dan/tho/
// ticket 30 ngay la viec P04, KHONG lam o day.

import { pathToFileURL } from 'node:url';
import { sql, tx, closeDb } from '../adapters/db.js';

const ORG_NAME = 'Cong ty Van hanh Demo';
const BUILDING_CODE = 'TOA-A';
const BUILDING_NAME = 'Toa A';
const FLOORS = 5;
const UNITS_PER_FLOOR = 4;

const JOB_CATEGORIES: Array<{
  code: string;
  name_vi: string;
  trade_group: 'dien_nuoc' | 'khoa' | 'dien_lanh' | 'xay_sua';
  default_mode: 'fixed' | 'quote';
  emergency: boolean;
}> = [
  { code: 'ong_nuoc_ro', name_vi: 'Ro ri duong ong nuoc', trade_group: 'dien_nuoc', default_mode: 'fixed', emergency: false },
  { code: 'thiet_bi_ve_sinh', name_vi: 'Thiet bi ve sinh hong', trade_group: 'dien_nuoc', default_mode: 'fixed', emergency: false },
  { code: 'tac_thoat_nuoc', name_vi: 'Tac thoat nuoc', trade_group: 'dien_nuoc', default_mode: 'fixed', emergency: false },
  { code: 'dien_mat_cuc_bo', name_vi: 'Mat dien cuc bo / nhay aptomat', trade_group: 'dien_nuoc', default_mode: 'fixed', emergency: false },
  { code: 'o_cam_cong_tac', name_vi: 'O cam, cong tac, den', trade_group: 'dien_nuoc', default_mode: 'fixed', emergency: false },
  { code: 'khoa_cua', name_vi: 'Khoa cua, mo khoa', trade_group: 'khoa', default_mode: 'fixed', emergency: false },
  { code: 'dieu_hoa_khong_mat', name_vi: 'Dieu hoa khong mat', trade_group: 'dien_lanh', default_mode: 'quote', emergency: false },
  { code: 'dieu_hoa_ve_sinh', name_vi: 'Ve sinh dieu hoa', trade_group: 'dien_lanh', default_mode: 'fixed', emergency: false },
  { code: 'binh_nong_lanh', name_vi: 'Binh nong lanh', trade_group: 'dien_lanh', default_mode: 'quote', emergency: false },
  { code: 'tham_tuong_tran', name_vi: 'Tham tuong, tran', trade_group: 'xay_sua', default_mode: 'quote', emergency: false },
  { code: 'cua_ban_le', name_vi: 'Cua, ban le, tay nam', trade_group: 'xay_sua', default_mode: 'fixed', emergency: false },
  { code: 'khac', name_vi: 'Viec khac (can khao sat)', trade_group: 'xay_sua', default_mode: 'quote', emergency: false },
];

async function seedOrganization(): Promise<string> {
  const existing = await sql<{ id: string }>(`select id from organizations where name = $1 limit 1`, [ORG_NAME]);
  if (existing.length > 0) return existing[0]!.id;
  const created = await sql<{ id: string }>(`insert into organizations (name) values ($1) returning id`, [ORG_NAME]);
  return created[0]!.id;
}

async function seedBuilding(orgId: string): Promise<string> {
  await sql(
    `insert into buildings (org_id, code, name) values ($1,$2,$3) on conflict (org_id, code) do nothing`,
    [orgId, BUILDING_CODE, BUILDING_NAME]
  );
  const rows = await sql<{ id: string }>(`select id from buildings where org_id = $1 and code = $2`, [orgId, BUILDING_CODE]);
  return rows[0]!.id;
}

async function seedApartments(buildingId: string): Promise<void> {
  await tx(async (q) => {
    for (let floor = 1; floor <= FLOORS; floor++) {
      for (let unit = 1; unit <= UNITS_PER_FLOOR; unit++) {
        const code = `A-${String(floor).padStart(2, '0')}${String(unit).padStart(2, '0')}`;
        await q(
          `insert into apartments (building_id, code, floor) values ($1,$2,$3) on conflict (building_id, code) do nothing`,
          [buildingId, code, floor]
        );
      }
    }
  });
}

async function seedZaloAccounts(): Promise<void> {
  await sql(
    `insert into zalo_accounts (id, display_name, session_state) values ($1,$2,'logged_out') on conflict (id) do nothing`,
    ['bql', 'BQL Toa A']
  );
  await sql(
    `insert into zalo_accounts (id, display_name, session_state) values ($1,$2,'logged_out') on conflict (id) do nothing`,
    ['market', 'San Tho Toa A']
  );
}

async function seedJobCategories(): Promise<void> {
  await tx(async (q) => {
    for (const c of JOB_CATEGORIES) {
      await q(
        `insert into job_categories (code, name_vi, trade_group, default_mode, emergency)
         values ($1,$2,$3,$4,$5) on conflict (code) do nothing`,
        [c.code, c.name_vi, c.trade_group, c.default_mode, c.emergency]
      );
    }
  });
}

export interface RunSeedResult {
  jobCategories: number;
  apartments: number;
}

/** Chay toan bo seed nen, idempotent. Xuat rieng de test:db goi truc tiep. */
export async function runSeed(): Promise<RunSeedResult> {
  const orgId = await seedOrganization();
  const buildingId = await seedBuilding(orgId);
  await seedApartments(buildingId);
  await seedZaloAccounts();
  await seedJobCategories();

  const [{ count: categoriesCount }] = await sql<{ count: number }>(`select count(*)::int as count from job_categories`);
  const [{ count: apartmentsCount }] = await sql<{ count: number }>(`select count(*)::int as count from apartments`);

  return { jobCategories: categoriesCount, apartments: apartmentsCount };
}

async function main(): Promise<void> {
  try {
    const result = await runSeed();
    console.log(`seed: job_categories=${result.jobCategories} apartments=${result.apartments}`);
    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error(`SEED_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  }
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  main();
}
