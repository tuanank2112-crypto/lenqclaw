#!/usr/bin/env node
// scripts/seed-sim-for-test.mjs — `npm run test:db` can seed DATA MO PHONG
// (nhom/thanh vien/kho tri thuc `sim-*`, SPEC-P01 §4.2) cho CHINH
// buoc nay, nhung TUYET DOI khong duoc tu gan `DATA_MODE=sim` ben trong
// `db:seed:sim` (do se vo hieu hoa chot chan cua no khi ai do goi
// `npm run db:seed:sim` truc tiep tren DB that). Script nay CHI dat
// `DATA_MODE=sim` cho TIEN TRINH CON cua chinh no (chay boi `test:db`),
// roi goi thang `runSeedSim()` — khong di qua `npm run db:seed:sim`, cross-
// platform (thuan Node/tsx, khong dung cu phap env-var kieu shell POSIX
// nen chay duoc ca Windows lan Linux).

process.env.DATA_MODE = 'sim';

const { runSeedSim } = await import('../packages/core/src/db/seed-sim.ts');
const r = await runSeedSim();
console.log(`seed-sim(test:db): groups=${r.groups} members=${r.members} kb_sections=${r.kbSections}`);
process.exit(0);
