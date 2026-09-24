// packages/core/scripts/require-database-url.ts — chan truoc `test:db`
// (SPEC-P01-Foundation.md §1): thieu DATABASE_URL => exit 1 kem thong bao,
// CAM skip.

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL chua duoc cau hinh. `npm run test:db` can Postgres — ' +
      'xem specs/OPERATIONS.md §3 va SPEC-P01-Foundation.md §1.'
  );
  process.exit(1);
}
