// packages/core/src/db/migrate.ts — runner migrations (goi qua adapters/db.ts,
// BB-07). SPEC-P01-Foundation.md §3. Chay: `npm run db:migrate` (tu root).
// `runMigrations()` xuat rieng de test:db goi truc tiep, khong qua subprocess.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql, tx, closeDb } from '../adapters/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/core/src/db -> repo root
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', '..', 'db', 'migrations');

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

interface MigrationFile {
  file: string;
  content: string;
  checksum: string;
}

async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    out.push({ file, content, checksum: sha256(content) });
  }
  return out;
}

export class MigrationChecksumError extends Error {}

export interface RunMigrationsResult {
  applied: number;
  appliedFiles: string[];
}

/** Chay cac migration CHUA duoc ghi nhan, tra `{applied, appliedFiles}`.
 * File da ap dung ma checksum doi => nem `MigrationChecksumError` (khong
 * chay them file nao). */
export async function runMigrations(dir: string = MIGRATIONS_DIR): Promise<RunMigrationsResult> {
  const migrations = await loadMigrations(dir);

  await sql(
    `create table if not exists schema_migrations (
       version text primary key,
       checksum text not null,
       applied_at timestamptz not null default now()
     )`
  );

  const recordedRows = await sql<{ version: string; checksum: string }>(
    `select version, checksum from schema_migrations`
  );
  const recorded = new Map(recordedRows.map((r) => [r.version, r.checksum]));

  for (const m of migrations) {
    const seenChecksum = recorded.get(m.file);
    if (seenChecksum && seenChecksum !== m.checksum) {
      throw new MigrationChecksumError(
        `${m.file} da duoc ap dung nhung noi dung file da doi ke tu do. ` +
          'Migration chi duoc THEM, khong duoc sua file da chay (OPERATIONS.md §7).'
      );
    }
  }

  const appliedFiles: string[] = [];
  for (const m of migrations) {
    if (recorded.has(m.file)) continue;
    await tx(async (q) => {
      await q(m.content);
      await q(`insert into schema_migrations (version, checksum) values ($1,$2)`, [m.file, m.checksum]);
    });
    appliedFiles.push(m.file);
  }

  return { applied: appliedFiles.length, appliedFiles };
}

async function main(): Promise<void> {
  try {
    const result = await runMigrations();
    for (const f of result.appliedFiles) console.log(`-- applying ${f}`);
    console.log(`applied: ${result.applied}`);
    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error(`MIGRATE_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  }
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  main();
}
