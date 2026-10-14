#!/usr/bin/env node
// scripts/check_agent_tools.mjs — BB-01, BB-06 (SPEC-P01 §6.1, ke hoach 02).
// In dung 3 dong tren stdout (chi tiet tung vi pham ra stderr); tong > 0 => exit 1:
//   forbidden_tools: <n>   ten tool cam (01-CONTRACTS §7.2, 22 ten) trong packages/core/src/agent/**
//                          (tru *.test.ts): `name: '<x>'` — nhay don/kep/template, khoa co nhay.
//   forbidden_actions: <n> chuoi `action: '<x>'` voi x thuoc 8 hanh dong cam, quet
//                          packages/core/src/** + apps/zalo-worker/src/**.
//   unlisted_tools: <n>    moi `name: '...'` trong agent/community/tools/*.ts (tru test,
//                          tool-kit.ts, index.ts) PHAI thuoc ten khai trong
//                          agent/community/policy.ts (cung bieu thuc `name:\s*['"]...['"]`);
//                          chua co tool/policy => 0.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const AGENT_DIR = path.join(ROOT, 'packages', 'core', 'src', 'agent');
const TOOLS_DIR = path.join(AGENT_DIR, 'community', 'tools');
const POLICY_FILE = path.join(AGENT_DIR, 'community', 'policy.ts');
const ACTION_SCAN_DIRS = [path.join(ROOT, 'packages', 'core', 'src'), path.join(ROOT, 'apps', 'zalo-worker', 'src')];

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

// 01-CONTRACTS §7.2 — 22 ten.
const FORBIDDEN_TOOL_NAMES = [
  'exec', 'shell', 'read_file', 'write_file', 'send_file', 'self_update', 'restart', 'restart_channel',
  'disperse_group', 'change_group_owner', 'add_group_admin', 'remove_group_admin', 'add_group_deputy',
  'remove_group_deputy', 'leave_group', 'send_friend_request', 'list_contacts', 'get_group_chat_history',
  'update_config', 'kick_member', 'block_member', 'recall_full_history',
];

const FORBIDDEN_ACTIONS = [
  'disperse_group', 'change_group_owner', 'add_group_deputy', 'remove_group_deputy',
  'leave_group', 'send_file', 'self_update', 'restart',
];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (CODE_EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const isTest = (file) => /\.test\.[a-z]+$/.test(file);
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const lineOf = (content, index) => content.slice(0, index).split('\n').length;

/** Tim `name: '<x>'` (khoa co the co nhay; gia tri nhay don/kep/template) voi x thuoc `names`. */
function findNameHits(content, names) {
  const hits = [];
  for (const name of names) {
    const re = new RegExp(`['"]?\\bname\\b['"]?\\s*:\\s*['"\`]${name}['"\`]`, 'g');
    for (const m of content.matchAll(re)) hits.push({ name, line: lineOf(content, m.index ?? 0) });
  }
  return hits;
}

async function checkForbiddenTools() {
  const hits = [];
  for (const file of await walk(AGENT_DIR)) {
    if (isTest(file)) continue;
    const content = await readFile(file, 'utf8');
    for (const h of findNameHits(content, FORBIDDEN_TOOL_NAMES)) hits.push(`${rel(file)}:${h.line}: tool "${h.name}"`);
  }
  return hits;
}

async function checkForbiddenActions() {
  const hits = [];
  for (const dir of ACTION_SCAN_DIRS) {
    for (const file of await walk(dir)) {
      const content = await readFile(file, 'utf8');
      for (const action of FORBIDDEN_ACTIONS) {
        const re = new RegExp(`\\baction\\b['"]?\\s*:\\s*['"\`]${action}['"\`]`, 'g');
        for (const m of content.matchAll(re)) hits.push(`${rel(file)}:${lineOf(content, m.index ?? 0)}: action "${action}"`);
      }
    }
  }
  return hits;
}

const NAME_RE = /name:\s*['"]([a-z_]+)['"]/g;

async function checkUnlistedTools() {
  let listed = new Set();
  try {
    const policy = await readFile(POLICY_FILE, 'utf8');
    listed = new Set([...policy.matchAll(NAME_RE)].map((m) => m[1]));
  } catch {
    // chua co policy.ts (P01) — khong co tool nao de doi chieu
  }
  const hits = [];
  for (const file of await walk(TOOLS_DIR)) {
    const base = path.basename(file);
    if (isTest(file) || base === 'tool-kit.ts' || base === 'index.ts') continue;
    const content = await readFile(file, 'utf8');
    for (const m of content.matchAll(NAME_RE)) {
      if (!listed.has(m[1])) hits.push(`${rel(file)}:${lineOf(content, m.index ?? 0)}: tool "${m[1]}" khong thuoc TOOL_NAMES`);
    }
  }
  return hits;
}

async function main() {
  const tools = await checkForbiddenTools();
  const actions = await checkForbiddenActions();
  const unlisted = await checkUnlistedTools();

  for (const h of [...tools, ...actions, ...unlisted]) console.error(`violation: ${h}`);
  console.log(`forbidden_tools: ${tools.length}`);
  console.log(`forbidden_actions: ${actions.length}`);
  console.log(`unlisted_tools: ${unlisted.length}`);

  process.exit(tools.length + actions.length + unlisted.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`CHECK_AGENT_TOOLS_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
