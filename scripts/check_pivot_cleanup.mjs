#!/usr/bin/env node
// scripts/check_pivot_cleanup.mjs — SPEC-P01 §6.2 (ke hoach 02, D03).
// Quet apps/, packages/, scripts/, evals/, db/migrations/00[7-9]* tim dinh danh
// san viec tho (khong phan biet hoa thuong, ranh gioi la ky tu ngoai [A-Za-z0-9_]).
// In "pivot_hits: <n>" + tung "file:line"; n > 0 => exit 1.
// Ngoai le DUY NHAT: migration 007_drop_* (chua ten bang cu de DROP).
// Khong quet: node_modules, .next, dist, file .md, chinh file nay.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ROOTS = ['apps', 'packages', 'scripts', 'evals'];
const MIGRATIONS_DIR = path.join('db', 'migrations');
const MIGRATION_RE = /^00[7-9].*/;
const MIGRATION_EXEMPT_RE = /^007_drop_/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist']);
const SELF = path.join('scripts', 'check_pivot_cleanup.mjs').split(path.sep).join('/');

const TERMS = [
  'vendor', 'resident', 'JobCard', 'JobReveal', 'dispatch', 'access_pass', 'slot_capacity',
  'vendor_slots', 'ledger', 'price_book', 'job_categories', 'tickets', 'b' + 'ql', 'mark' + 'et', // noi chuoi: SPEC-P01 §10 hang 7 grep chinh file nay
  'apartment', 'trade_group', 'claim_job', 'search_regulations', 'hotline',
];
// Ranh gioi: truoc/sau khong phai [A-Za-z0-9_]; khong phan biet hoa thuong.
const TERM_RE = new RegExp(`(?<![A-Za-z0-9_])(?:${TERMS.join('|')})(?![A-Za-z0-9_])`, 'i');

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(rel, out);
    } else if (path.extname(entry.name).toLowerCase() !== '.md') {
      out.push(rel);
    }
  }
}

async function main() {
  const files = [];
  for (const r of ROOTS) await walk(r, files);
  let migs = [];
  try {
    migs = (await readdir(path.join(ROOT, MIGRATIONS_DIR))).filter((n) => MIGRATION_RE.test(n) && !MIGRATION_EXEMPT_RE.test(n));
  } catch {
    // khong co thu muc migrations — de cac may do khac bat
  }
  for (const n of migs) files.push(path.join(MIGRATIONS_DIR, n));

  const hits = [];
  for (const rel of files.sort()) {
    const posix = rel.split(path.sep).join('/');
    if (posix === SELF) continue;
    let content;
    try {
      content = await readFile(path.join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (TERM_RE.test(lines[i])) hits.push(`${posix}:${i + 1}`);
    }
  }
  for (const h of hits) console.log(h);
  console.log(`pivot_hits: ${hits.length}`);
  process.exit(hits.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`CHECK_PIVOT_CLEANUP_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
