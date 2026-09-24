#!/usr/bin/env node
// scripts/check_agent_tools.mjs — BB-01, BB-02 (SPEC-P01-Foundation.md §8).
// (a) JobCard khong duoc chua khoa PII; (b) ten tool agent khong duoc nam
// trong danh sach cam. In "pii_keys_in_jobcard: <n>" va "forbidden_tools: <n>";
// tong > 0 => exit 1.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TYPES_FILE = path.join(ROOT, 'packages', 'core', 'src', 'domain', 'types.ts');
const TOOLS_DIR = path.join(ROOT, 'packages', 'core', 'src', 'agent', 'tools');

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

function extractJobCardBlock(source) {
  const marker = 'type JobCard = {';
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const end = source.indexOf('};', start);
  if (end === -1) return null;
  return source.slice(start, end + 2);
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
    const re = new RegExp(`\\b${key}\\b\\s*:`, 'g');
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
    } else if (['.ts', '.tsx'].includes(path.extname(entry.name))) {
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
      const re = new RegExp(`name\\s*:\\s*['"]${name}['"]`, 'g');
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
