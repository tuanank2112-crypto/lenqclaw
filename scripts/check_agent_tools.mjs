#!/usr/bin/env node
// scripts/check_agent_tools.mjs — BB-01, BB-02 (SPEC-P01-Foundation.md §8).
// Vong 2 (R02-tham-dinh D2): (a) tim khoi `type JobCard = {...}` bang DEM
// NGOAC (khong dung "}};" dau tien — mot kieu object long ben trong se lam
// sai vi tri ket thuc), khoa PII cho phep tuy chon (`phone?:`), co nhay
// ('phone': / "phone":); (b) quet ten tool cam trong agent/tools/** ca file
// .js/.mjs/.cjs, cho phep khoa co nhay va gia tri dang template literal.
// In "pii_keys_in_jobcard: <n>" va "forbidden_tools: <n>"; tong > 0 => exit 1.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TYPES_FILE = path.join(ROOT, 'packages', 'core', 'src', 'domain', 'types.ts');
const TOOLS_DIR = path.join(ROOT, 'packages', 'core', 'src', 'agent', 'tools');
const TOOLS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

const FORBIDDEN_JOBCARD_KEYS = [
  'apartment',
  'apartment_code',
  'apartment_id',
  'floor',
  'phone',
  'resident_phone',
  'resident_name',
  'full_name',
  'access_pass_code',
];

const FORBIDDEN_TOOL_NAMES = ['exec', 'shell', 'read_file', 'write_file', 'list_contacts', 'approve_ticket', 'update_config'];

/**
 * Tim khoi noi dung giua ngoac `{` mo dau va ngoac `}` KHOP no bang dem
 * do sau — chiu duoc kieu object literal long ben trong (vd
 * `price_band: [number, number] | null` khong co ngoac nhon nhung mot
 * truong `meta: { a: number }` thi co, va khong duoc lam sai vi tri dong).
 */
function extractBalancedBlock(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  return null; // khong can bang — file loi cu phap, de tsc bat rieng
}

function extractJobCardBlock(source) {
  const marker = 'type JobCard = ';
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) return null;
  const braceIdx = source.indexOf('{', markerIdx);
  if (braceIdx === -1) return null;
  return extractBalancedBlock(source, braceIdx);
}

async function checkJobCard() {
  let source;
  try {
    source = await readFile(TYPES_FILE, 'utf8');
  } catch {
    console.error(`CHECK_AGENT_TOOLS_ERROR: khong doc duoc ${path.relative(ROOT, TYPES_FILE)}`);
    process.exit(1);
  }
  const block = extractJobCardBlock(source);
  if (!block) {
    console.error('CHECK_AGENT_TOOLS_ERROR: khong tim thay khai bao "type JobCard = {...}" trong domain/types.ts');
    process.exit(1);
  }
  const hits = [];
  for (const key of FORBIDDEN_JOBCARD_KEYS) {
    // Khoa co the: tran (`phone:`), tuy chon (`phone?:`), co nhay don/kep
    // (`'phone':`, `"phone":`), voi khoang trang tuy y quanh `?`/`:`.
    const re = new RegExp(`['"]?\\b${key}\\b['"]?\\s*\\?\\s*:|['"]?\\b${key}\\b['"]?\\s*:`, 'g');
    if (re.test(block)) hits.push(key);
  }
  return hits;
}

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (TOOLS_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

async function checkForbiddenTools() {
  let exists = true;
  try {
    await stat(TOOLS_DIR);
  } catch {
    exists = false;
  }
  if (!exists) return [];

  const files = await walk(TOOLS_DIR);
  const hits = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const name of FORBIDDEN_TOOL_NAMES) {
      // Khoa `name` co the tran hoac co nhay (`"name":`); gia tri co the
      // nhay don/kep hoac template literal (`` `exec` ``).
      const re = new RegExp(`['"]?\\bname\\b['"]?\\s*:\\s*['"\`]${name}['"\`]`, 'g');
      if (re.test(content)) hits.push(`${path.relative(ROOT, file)}: tool "${name}"`);
    }
  }
  return hits;
}

async function main() {
  const piiHits = await checkJobCard();
  const toolHits = await checkForbiddenTools();

  for (const h of piiHits) console.log(`pii_key: ${h}`);
  for (const h of toolHits) console.log(`forbidden_tool: ${h}`);

  console.log(`pii_keys_in_jobcard: ${piiHits.length}`);
  console.log(`forbidden_tools: ${toolHits.length}`);

  process.exit(piiHits.length + toolHits.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`CHECK_AGENT_TOOLS_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
