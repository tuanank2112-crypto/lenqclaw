#!/usr/bin/env node
// scripts/sim_claims.mjs — TESTING-ACCEPTANCE.md §4 G11 / SPEC-P05-Dispatch.md
// §10.3.1, §10.15: dua 200 "nhan cuoc" dong thoi tren 50 cuoc (4 tho/cuoc)
// vao `claimJob` (BB-05, BB-10) — kiem 0 cuoc co hai nguoi thang.
// `--break`: THAY claimJob bang mot phien ban co y hong NGAY TRONG SCRIPT
// (doc `status` roi UPDATE KHONG dieu kien — kinh dien TOCTOU) de chung minh
// may do nay BIET DO khi luat BB-05 bi vi pham; KHONG dung claimJob that,
// KHONG sua dispatch.ts.
//
// Can `npm run build -w @lenqclaw/core` truoc (doc `packages/core/dist/**`
// qua export `@lenqclaw/core/*`, dong bo mau voi `scripts/eval/red-fake-model.mjs`)
// va `DATABASE_URL` tro toi DB DA migrate + seed (`npm run db:seed` — can
// job_categories nhom `dien_nuoc`). Tu tao du lieu rieng (1 can ho, 1 cu
// dan, 50 cuoc, 200 tho + slot), XOA SACH khi xong (ca khi loi — `finally`).
//
// Ghi chu pham vi (Cau hoi mo R12): G11 doi "pool >= 20 ket noi"; script
// nay dung LAI pool cua adapters/db.ts (CAM import `pg` truc tiep trong
// scripts/** — scripts/check_adapter_boundary.mjs quet ca thu muc nay) —
// pool do KHONG co tham so chinh kich thuoc tu ben ngoai (mac dinh `pg` la
// 10) vi adapters/db.ts nam NGOAI pham vi DUOC GHI cua handoff nay. 200
// `claimJob` van chay dung (Promise.all rong qua pool 10, chi cham hon,
// khong anh huong tinh dung dan duoc do).

const BREAK = process.argv.includes('--break');
const JOB_COUNT = 50;
const VENDORS_PER_JOB = 4;
const CLAIM_COUNT = JOB_COUNT * VENDORS_PER_JOB;

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('SIM_CLAIMS_ERROR: DATABASE_URL chua duoc cau hinh.');
    process.exit(1);
  }

  const { sql, tx, closeDb } = await import('@lenqclaw/core/adapters/db');
  const { claimJob } = await import('@lenqclaw/core/services/dispatch');

  const buildings = await sql(`select id, org_id from buildings limit 1`);
  if (buildings.length === 0) {
    console.error('SIM_CLAIMS_ERROR: khong co dong nao trong buildings — chay "npm run db:seed" truoc.');
    process.exit(1);
  }
  const buildingId = buildings[0].id;

  const categories = await sql(`select code from job_categories where trade_group = 'dien_nuoc' limit 1`);
  if (categories.length === 0) {
    console.error('SIM_CLAIMS_ERROR: khong co job_categories nhom dien_nuoc — chay "npm run db:seed" truoc.');
    process.exit(1);
  }
  const categoryCode = categories[0].code;

  const run = randomSuffix();
  const createdJobIds = [];
  const createdVendorIds = [];
  let apartmentId = null;
  let residentId = null;

  try {
    const aptRows = await sql(
      `insert into apartments (building_id, code, floor) values ($1,$2,0) returning id`,
      [buildingId, `SIMCLAIM-${run}`]
    );
    apartmentId = aptRows[0].id;

    const resRows = await sql(
      `insert into residents (full_name, phone, status) values ('SimClaims Load Test','0900000000','active') returning id`
    );
    residentId = resRows[0].id;

    for (let i = 0; i < JOB_COUNT; i++) {
      const code = `C-${run.slice(0, 2).toUpperCase()}${String(i).padStart(2, '0')}`.slice(0, 8);
      const rows = await sql(
        `insert into jobs (code, building_id, apartment_id, resident_id, category_code, draft, mode, status)
         values ($1,$2,$3,$4,$5,'{}'::jsonb,'quote','published') returning id`,
        [code, buildingId, apartmentId, residentId, categoryCode]
      );
      createdJobIds.push({ id: rows[0].id, code });
    }

    for (let i = 0; i < JOB_COUNT * VENDORS_PER_JOB; i++) {
      const vendorId = await tx(async (q) => {
        const vrows = await q(
          `insert into vendors (full_name, phone, status) values ($1,$2,'active') returning id`,
          [`SimClaims Vendor ${run}-${i}`, `090${String(1000000 + i).slice(0, 7)}`]
        );
        const id = vrows[0].id;
        await q(`insert into vendor_buildings (vendor_id, building_id) values ($1,$2)`, [id, buildingId]);
        await q(`insert into vendor_skills (vendor_id, category_code) values ($1,$2)`, [id, categoryCode]);
        await q(
          `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
           values ($1,$2,'dien_nuoc',false, current_date, current_date + 30, 300000, 'active')`,
          [id, buildingId]
        );
        return id;
      });
      createdVendorIds.push(vendorId);
    }

    const attempts = [];
    for (let j = 0; j < JOB_COUNT; j++) {
      for (let v = 0; v < VENDORS_PER_JOB; v++) {
        attempts.push({ job: createdJobIds[j], vendorId: createdVendorIds[j * VENDORS_PER_JOB + v] });
      }
    }

    const now = new Date();
    let results;
    if (BREAK) {
      results = await Promise.all(
        attempts.map(async (a) => {
          // Ban co y hong: doc `status` RIENG roi UPDATE KHONG dieu kien
          // theo status (khac han cau UPDATE co dieu kien that su cua
          // claimJob) — TOCTOU kinh dien, cho phep NHIEU nguoi cung thang.
          const before = await sql(`select status from jobs where id = $1`, [a.job.id]);
          const wasPublished = before[0]?.status === 'published';
          if (wasPublished) {
            await sql(`update jobs set status = 'held', assigned_vendor_id = $1 where id = $2`, [
              a.vendorId,
              a.job.id,
            ]);
          }
          return { jobId: a.job.id, won: wasPublished };
        })
      );
    } else {
      results = await Promise.all(
        attempts.map(async (a) => {
          const r = await claimJob({ jobCode: a.job.code, vendorId: a.vendorId, now, source: 'agent' });
          return { jobId: a.job.id, won: r.won === true };
        })
      );
    }

    const won = results.filter((r) => r.won).length;
    const lost = results.length - won;

    const wonByJob = new Map();
    for (const r of results) {
      if (!r.won) continue;
      wonByJob.set(r.jobId, (wonByJob.get(r.jobId) ?? 0) + 1);
    }
    const jobsWithTwoWinners = [...wonByJob.values()].filter((n) => n > 1).length;

    const heldEventRows = await sql(
      `select count(*)::int as n from job_events where to_status = 'held' and job_id = any($1::uuid[])`,
      [createdJobIds.map((j) => j.id)]
    );
    const jobEventsHeld = heldEventRows[0]?.n ?? 0;

    console.log(
      `claims=${results.length} won=${won} lost=${lost} jobs_with_two_winners=${jobsWithTwoWinners} job_events_held=${jobEventsHeld}`
    );

    await cleanup(sql, createdJobIds.map((j) => j.id), createdVendorIds, apartmentId, residentId);
    await closeDb();

    process.exit(jobsWithTwoWinners > 0 ? 1 : 0);
  } catch (err) {
    console.error(`SIM_CLAIMS_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    try {
      const { sql: sql2, closeDb: closeDb2 } = await import('@lenqclaw/core/adapters/db');
      await cleanup(sql2, createdJobIds.map((j) => j.id), createdVendorIds, apartmentId, residentId);
      await closeDb2();
    } catch {
      // don dep tot nhat co the — khong che loi goc.
    }
    process.exit(1);
  }
}

async function cleanup(sql, jobIds, vendorIds, apartmentId, residentId) {
  if (jobIds.length > 0) {
    await sql(`delete from job_offers where job_id = any($1::uuid[])`, [jobIds]);
    await sql(`delete from job_events where job_id = any($1::uuid[])`, [jobIds]);
    await sql(`delete from jobs where id = any($1::uuid[])`, [jobIds]);
  }
  if (vendorIds.length > 0) {
    await sql(`delete from vendor_slots where vendor_id = any($1::uuid[])`, [vendorIds]);
    await sql(`delete from vendor_skills where vendor_id = any($1::uuid[])`, [vendorIds]);
    await sql(`delete from vendor_buildings where vendor_id = any($1::uuid[])`, [vendorIds]);
    await sql(`delete from vendors where id = any($1::uuid[])`, [vendorIds]);
  }
  if (residentId) await sql(`delete from residents where id = $1`, [residentId]);
  if (apartmentId) await sql(`delete from apartments where id = $1`, [apartmentId]);
}

main();
