// packages/core/src/db/seed-sim.ts — du lieu MO PHONG cho P03
// (SPEC-P03-Resident-Agent.md §10.5): CHI chay khi `DATA_MODE=sim`,
// idempotent (chay 2 lan => so dong khong doi). Chay SAU `npm run db:seed`
// (can building TOA-A + apartments + job_categories da co).

import { pathToFileURL } from 'node:url';
import { sql, tx, closeDb } from '../adapters/db.js';

interface KbSectionSeed {
  sectionId: string;
  heading: string;
  marker: 'BQL' | 'CƯ DÂN';
  body: string;
}

// QC-DEMO (approved, con hieu luc) — 12 muc phan dinh trach nhiem, ke ca MOT
// cap mau thuan co y (sec05/sec06: cung chu de "tham tran tu can tren"
// nhung ket luan nguoc nhau) de test BB-03 (SPEC-P03 §10.6 "test BB-03").
const QC_DEMO_SECTIONS: KbSectionSeed[] = [
  {
    sectionId: 'sec01',
    heading: 'Ống cấp nước chung/đứng',
    marker: 'BQL',
    body: '[TRÁCH NHIỆM: BQL] Đường ống cấp nước chung/đứng ngoài căn hộ thuộc trách nhiệm bảo trì của Ban quản lý.',
  },
  {
    sectionId: 'sec02',
    heading: 'Ống nước trong căn hộ',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Đường ống nước sau đồng hồ, nằm trong phạm vi căn hộ, do cư dân tự chi trả sửa chữa.',
  },
  {
    sectionId: 'sec03',
    heading: 'Hệ thống điện trước công tơ',
    marker: 'BQL',
    body: '[TRÁCH NHIỆM: BQL] Hệ thống điện trước công tơ (đường trục, tủ điện tầng) thuộc trách nhiệm Ban quản lý.',
  },
  {
    sectionId: 'sec04',
    heading: 'Hệ thống điện sau công tơ (trong căn)',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Hệ thống điện sau công tơ, trong phạm vi căn hộ, do cư dân tự chi trả sửa chữa.',
  },
  {
    sectionId: 'sec05',
    heading: 'Thấm trần từ căn trên (do đường ống chung)',
    marker: 'BQL',
    body: '[TRÁCH NHIỆM: BQL] Thấm trần do rò rỉ đường ống chung của toà nhà thuộc trách nhiệm Ban quản lý.',
  },
  {
    sectionId: 'sec06',
    heading: 'Thấm trần từ căn trên (do sử dụng của căn trên)',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Thấm trần do sinh hoạt/sử dụng của căn hộ tầng trên thuộc trách nhiệm cư dân liên quan, không phải Ban quản lý.',
  },
  {
    sectionId: 'sec07',
    heading: 'Cửa căn hộ (khoá, bản lề trong căn)',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Cửa, khoá, bản lề của căn hộ do cư dân tự bảo trì, sửa chữa.',
  },
  {
    sectionId: 'sec08',
    heading: 'Thiết bị vệ sinh trong căn',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Thiết bị vệ sinh (bồn cầu, vòi sen, lavabo) trong căn hộ do cư dân tự bảo trì.',
  },
  {
    sectionId: 'sec09',
    heading: 'Điều hoà trong căn',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Điều hoà, máy lạnh lắp đặt riêng trong căn hộ do cư dân tự bảo trì, vệ sinh.',
  },
  {
    sectionId: 'sec10',
    heading: 'Hành lang, khu vực chung',
    marker: 'BQL',
    body: '[TRÁCH NHIỆM: BQL] Hành lang, sảnh, khu vực chung của toà nhà thuộc trách nhiệm Ban quản lý.',
  },
  {
    sectionId: 'sec11',
    heading: 'Thang máy, thang bộ',
    marker: 'BQL',
    body: '[TRÁCH NHIỆM: BQL] Thang máy, thang bộ thuộc trách nhiệm bảo trì của Ban quản lý.',
  },
  {
    sectionId: 'sec12',
    heading: 'Ổ cắm, công tắc, đèn trong căn',
    marker: 'CƯ DÂN',
    body: '[TRÁCH NHIỆM: CƯ DÂN] Ổ cắm, công tắc, đèn chiếu sáng trong căn hộ do cư dân tự bảo trì, sửa chữa.',
  },
];

async function seedKbDocuments(): Promise<void> {
  await tx(async (q) => {
    await q(
      `insert into kb_documents (id, title, version, status, effective_from, effective_to)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set title = excluded.title, status = excluded.status,
         effective_from = excluded.effective_from, effective_to = excluded.effective_to`,
      ['QC-DEMO', 'MÔ PHỎNG — Quy chế phân định trách nhiệm sửa chữa', '1.0', 'approved', '2020-01-01', null]
    );
    await q(
      `insert into kb_documents (id, title, version, status, effective_from, effective_to)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set title = excluded.title, status = excluded.status,
         effective_from = excluded.effective_from, effective_to = excluded.effective_to`,
      ['QC-DEMO-DEP', 'MÔ PHỎNG — Quy định cũ đã thay thế (deprecated)', '0.1', 'deprecated', '2019-01-01', null]
    );
    await q(
      `insert into kb_documents (id, title, version, status, effective_from, effective_to)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set title = excluded.title, status = excluded.status,
         effective_from = excluded.effective_from, effective_to = excluded.effective_to`,
      ['QC-DEMO-EXP', 'MÔ PHỎNG — Quy định cũ đã hết hiệu lực', '0.1', 'approved', '2015-01-01', '2020-01-01']
    );

    for (const s of QC_DEMO_SECTIONS) {
      await q(
        `insert into kb_sections (document_id, section_id, heading, body)
         values ('QC-DEMO',$1,$2,$3)
         on conflict (document_id, section_id) do update set heading = excluded.heading, body = excluded.body`,
        [s.sectionId, s.heading, s.body]
      );
    }
    await q(
      `insert into kb_sections (document_id, section_id, heading, body)
       values ('QC-DEMO-DEP','sec01',$1,$2)
       on conflict (document_id, section_id) do update set heading = excluded.heading, body = excluded.body`,
      ['Quy định cũ về thấm trần (đã thay thế)', '[TRÁCH NHIỆM: BQL] (Quy định cũ, đã bị thay thế bởi QC-DEMO.)']
    );
    await q(
      `insert into kb_sections (document_id, section_id, heading, body)
       values ('QC-DEMO-EXP','sec01',$1,$2)
       on conflict (document_id, section_id) do update set heading = excluded.heading, body = excluded.body`,
      ['Quy định cũ về điện trong căn (hết hiệu lực 2020)', '[TRÁCH NHIỆM: CƯ DÂN] (Quy định cũ, hết hiệu lực từ 2020-01-01.)']
    );
  });
}

interface ResidentSeed {
  uid: string;
  fullName: string;
  phone: string;
  status: 'active' | 'pending';
  apartmentCode: string;
}

const RESIDENTS: ResidentSeed[] = [
  { uid: 'sim-res-1', fullName: 'Nguyễn Văn A', phone: '0901000001', status: 'active', apartmentCode: 'A-0101' },
  { uid: 'sim-res-2', fullName: 'Trần Thị B', phone: '0901000002', status: 'active', apartmentCode: 'A-0102' },
  { uid: 'sim-res-3', fullName: 'Lê Văn C', phone: '0901000003', status: 'active', apartmentCode: 'A-0103' },
  { uid: 'sim-res-9', fullName: 'Phạm Thị D', phone: '0901000009', status: 'pending', apartmentCode: 'A-0104' },
];

async function seedResidents(buildingId: string): Promise<number> {
  let count = 0;
  for (const r of RESIDENTS) {
    const existing = await sql<{ party_id: string }>(
      `select party_id from zalo_identities where zalo_account_id = 'bql' and zalo_uid = $1`,
      [r.uid]
    );
    if (existing.length > 0) {
      await sql(`update residents set status = $1, full_name = $2, phone = $3 where id = $4`, [
        r.status,
        r.fullName,
        r.phone,
        existing[0]!.party_id,
      ]);
      count++;
      continue;
    }
    const apartments = await sql<{ id: string }>(`select id from apartments where building_id = $1 and code = $2`, [
      buildingId,
      r.apartmentCode,
    ]);
    if (apartments.length === 0) {
      throw new Error(`seed-sim: khong tim thay can ho ${r.apartmentCode} — chay "npm run db:seed" truoc.`);
    }
    await tx(async (q) => {
      const rows = await q<{ id: string }>(
        `insert into residents (full_name, phone, status, consent_at) values ($1,$2,$3, now()) returning id`,
        [r.fullName, r.phone, r.status]
      );
      const residentId = rows[0]!.id;
      await q(
        `insert into resident_apartments (resident_id, apartment_id, role) values ($1,$2,'owner')
         on conflict do nothing`,
        [residentId, apartments[0]!.id]
      );
      await q(
        `insert into zalo_identities (zalo_account_id, zalo_uid, party_type, party_id) values ('bql',$1,'resident',$2)
         on conflict (zalo_account_id, zalo_uid) do nothing`,
        [r.uid, residentId]
      );
    });
    count++;
  }
  return count;
}

const FIXED_PRICE_CATEGORIES: Array<{ code: string; p25: number; p50: number; p75: number }> = [
  { code: 'ong_nuoc_ro', p25: 150000, p50: 250000, p75: 400000 },
  { code: 'thiet_bi_ve_sinh', p25: 150000, p50: 300000, p75: 500000 },
  { code: 'tac_thoat_nuoc', p25: 150000, p50: 200000, p75: 350000 },
  { code: 'dien_mat_cuc_bo', p25: 100000, p50: 200000, p75: 350000 },
  { code: 'o_cam_cong_tac', p25: 100000, p50: 180000, p75: 300000 },
  { code: 'khoa_cua', p25: 150000, p50: 250000, p75: 400000 },
];

async function seedPriceBook(buildingId: string): Promise<void> {
  for (const c of FIXED_PRICE_CATEGORIES) {
    await sql(
      `insert into price_book (category_code, building_id, p25, p50, p75, sample_size, source)
       values ($1,$2,$3,$4,$5,0,'seed')
       on conflict (category_code, building_id) do update set p25 = excluded.p25, p50 = excluded.p50, p75 = excluded.p75`,
      [c.code, buildingId, c.p25, c.p50, c.p75]
    );
  }
}

export interface RunSeedSimResult {
  kbSections: number;
  residents: number;
  priceBookRows: number;
}

export async function runSeedSim(): Promise<RunSeedSimResult> {
  if (process.env.DATA_MODE !== 'sim') {
    throw new Error('db:seed:sim CHI chay khi DATA_MODE=sim (SPEC-P03-Resident-Agent.md §10.5).');
  }

  const buildings = await sql<{ id: string }>(`select id from buildings where code = 'TOA-A' limit 1`);
  if (buildings.length === 0) {
    throw new Error('seed-sim: khong tim thay toa TOA-A — chay "npm run db:seed" truoc.');
  }
  const buildingId = buildings[0]!.id;

  await seedKbDocuments();
  const residentsCount = await seedResidents(buildingId);
  await seedPriceBook(buildingId);

  const [{ count: kbSectionsCount }] = await sql<{ count: number }>(
    `select count(*)::int as count from kb_sections`
  );
  const [{ count: priceBookCount }] = await sql<{ count: number }>(
    `select count(*)::int as count from price_book where building_id = $1`,
    [buildingId]
  );

  return { kbSections: kbSectionsCount, residents: residentsCount, priceBookRows: priceBookCount };
}

async function main(): Promise<void> {
  try {
    const result = await runSeedSim();
    console.log(
      `seed-sim: kb_sections=${result.kbSections} residents=${result.residents} price_book=${result.priceBookRows}`
    );
    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error(`SEED_SIM_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  }
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  main();
}
