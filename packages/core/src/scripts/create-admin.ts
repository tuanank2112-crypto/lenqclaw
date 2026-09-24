// packages/core/src/scripts/create-admin.ts — tao tai khoan nhan vien web
// (SPEC-P01-Foundation.md §7). Dung:
//   echo "mat-khau" | npm run create-admin -- --email a@b.c --role bql_admin
// Mat khau BAT BUOC doc tu stdin — CAM nhan qua tham so dong lenh
// (OPERATIONS.md §6.2).

import { sql, closeDb } from '../adapters/db.js';
import { hashPassword } from '../domain/password.js';
import type { StaffRole } from '../domain/types.js';

const ROLES: StaffRole[] = ['bql_admin', 'bql_staff', 'guard'];

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a && a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val !== undefined) out[key] = val;
      i++;
    }
  }
  return out;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const role = args.role as StaffRole | undefined;

  if (!email || !role) {
    console.error('Dung: npm run create-admin -- --email <email> --role <bql_admin|bql_staff|guard>');
    process.exit(2);
  }
  if (!ROLES.includes(role)) {
    console.error(`--role phai la mot trong: ${ROLES.join(', ')}`);
    process.exit(2);
  }

  const password = await readStdin();
  if (!password) {
    console.error('Mat khau rong — doc tu stdin, vd: echo "mat-khau" | npm run create-admin -- --email a@b.c --role bql_admin');
    process.exit(2);
  }

  const passwordHash = await hashPassword(password);
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,$2,$3) returning id`,
    [email, passwordHash, role]
  );
  console.log(`create-admin: ${email} (${role}) id=${rows[0]!.id}`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`CREATE_ADMIN_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  await closeDb();
  process.exit(1);
});
