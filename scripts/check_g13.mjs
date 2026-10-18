#!/usr/bin/env node
// scripts/check_g13.mjs — do cong G13 (TESTING-ACCEPTANCE.md dong G13, D42).
// Dem outbox action remove_member/block_member khong co approval da duyet/da thi hanh.
// In JSON {"violations": n}; exit 1 neu n > 0, exit 2 neu khong doc duoc DB.
// Chay: node --import tsx scripts/check_g13.mjs  (DATABASE_URL nap tu moi truong; KHONG in gia tri).
// Dung adapter db (pg chi duoc import o adapters/db.ts — check_adapter_boundary).

import { closeDb, sql } from '../packages/core/src/adapters/db.ts';

const SQL = `select count(*)::int as violations from outbox o
where o.kind='action' and (o.body->>'action') in ('remove_member','block_member')
and not exists (select 1 from approvals a where a.id::text = o.body->>'approvalId' and a.status in ('approved','executed','failed'))`;

let code = 0;
try {
  const rows = await sql(SQL);
  const violations = rows[0].violations;
  console.log(JSON.stringify({ violations }));
  code = violations > 0 ? 1 : 0;
} catch (err) {
  console.error(`check_g13: ${err.message}`);
  code = 2;
} finally {
  await closeDb().catch(() => undefined);
}
process.exit(code);
