#!/usr/bin/env node
// scripts/check_adapter_boundary.mjs — BB-04, BB-07 (SPEC-P01-Foundation.md
// §8). Vong 2 (R02-tham-dinh D1): quet THEO NOI DUNG CA FILE (khong theo
// tung dong) de bat import/require/re-export/dynamic import trai nhieu
// dong, template literal, subpath (`pg/*`, `pg-pool`, `@anthropic-ai/sdk/*`,
// `zca-js/*`), va "insert into outbox" co xuong dong/nhay/`public.`/comment/
// noi chuoi xen giua. In "violations: <n>" + tung dong "file:line"; n>0 =>
// exit 1.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCOPE_DIRS = ['apps', 'packages', 'scripts'];
// CHI loai node_modules/.next luon luon; "dist" chi loai khi no la thu muc
// OUTPUT BUILD thuc su (khong nam duoi mot thu muc "src") — mot thu muc
// nguon TEN LA "dist" (vd packages/core/src/dist/probe.ts) VAN phai quet.
const ALWAYS_EXCLUDE = new Set(['node_modules', '.next']);
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

const ADAPTER_DB = path.join('packages', 'core', 'src', 'adapters', 'db.ts').split(path.sep).join('/');
const ADAPTER_MODEL = path.join('packages', 'core', 'src', 'adapters', 'model.ts').split(path.sep).join('/');
const ADAPTER_TRANSPORT = path.join('packages', 'core', 'src', 'adapters', 'transport.ts').split(path.sep).join('/');
const ZALO_WORKER_DIR = path.join('apps', 'zalo-worker').split(path.sep).join('/');
// May do nay TU CHUA chuoi bao dong (regex, thong bao loi) — quet chinh no
// se tu bao dong gia. Loai tru dung file nay.
const SELF = path.join('scripts', 'check_adapter_boundary.mjs').split(path.sep).join('/');

async function walk(dir, insideSrc) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ALWAYS_EXCLUDE.has(entry.name)) continue;
    if (entry.name === 'dist' && !insideSrc) continue; // dist thuc su (ngoai src/) => bo qua
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nextInsideSrc = insideSrc || entry.name === 'src';
      files.push(...(await walk(full, nextInsideSrc)));
    } else if (INCLUDE_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function relPath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function lineAt(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// specPrefixes: mang cac dieu kien "specifier khop" — moi phan tu la mot ham
// (spec:string) => boolean, cho phep khop chinh xac ('pg', 'pg-pool') hoac
// subpath ('pg/...', '@anthropic-ai/sdk/...', 'zca-js/...').
function makeMatcher(exact, prefixes) {
  const exactSet = new Set(exact);
  return (spec) => exactSet.has(spec) || prefixes.some((p) => spec.startsWith(p));
}

const isPgSpecifier = makeMatcher(['pg', 'pg-pool'], ['pg/']);
const isAnthropicSpecifier = makeMatcher(['@anthropic-ai/sdk'], ['@anthropic-ai/sdk/']);
const isZcaSpecifier = makeMatcher(['zca-js'], ['zca-js/']);

/**
 * Tra ve mang { specifier, index, typeOnly } — moi phan tu la MOT tham
 * chieu module trong file (import ... from '...', export ... from '...',
 * require(...), import(...)). `[\s\S]` thay `.` de xuyen dong (import/
 * require bi ngat dong). `typeOnly=true` chi khi ca cau lenh la
 * `import type ...` / `export type ...` — loai khoi kiem tra vi bi xoa het
 * luc bien dich, khong con o runtime (khong mang rui ro BB-07).
 */
function extractReferences(content) {
  const refs = [];

  const fromRe = /\b(import|export)\b([\s\S]*?)\bfrom\s*(['"`])((?:(?!\3)[^\\]|\\.)*)\3/g;
  let m;
  while ((m = fromRe.exec(content))) {
    const keyword = m[1];
    const middle = m[2];
    const specifier = m[4];
    const typeOnly = /^\s*type\b/.test(middle);
    refs.push({ specifier, index: m.index, typeOnly, keyword });
  }

  const callRe = /\b(require|import)\s*\(\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2\s*\)/g;
  while ((m = callRe.exec(content))) {
    refs.push({ specifier: m[3], index: m.index, typeOnly: false, keyword: m[1] });
  }

  return refs;
}

/**
 * "insert into outbox" du buc: bo comment, bo nhay ('/"/`), bo `${`/`}`/`+`
 * (noi chuoi/template), gop khoang trang — roi do tren mot BE MAT CHINH TAC.
 * Bat duoc: nhieu khoang trang/tab, xuong dong, dinh danh co nhay
 * ("outbox"), `public.outbox`, comment xen giua, noi chuoi ('...'+'...').
 */
function findOutboxInsertOffsets(content) {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/[`'"]/g, ' ')
    .replace(/\$\{|\}/g, ' ')
    .replace(/\+/g, ' ');

  const re = /insert\s+into\s+(public\s*\.\s*)?outbox\b/gi;
  const offsets = [];
  let m;
  while ((m = re.exec(stripped))) {
    offsets.push(m.index);
  }
  return offsets;
}

async function main() {
  const files = [];
  for (const dir of SCOPE_DIRS) {
    const full = path.join(ROOT, dir);
    try {
      await stat(full);
    } catch {
      continue;
    }
    files.push(...(await walk(full, false)));
  }

  const violations = [];

  for (const file of files) {
    const rel = relPath(file);
    if (rel === SELF) continue;
    const content = await readFile(file, 'utf8');

    const isDbAdapter = rel === ADAPTER_DB;
    const isModelAdapter = rel === ADAPTER_MODEL;
    const isTransportAdapter = rel === ADAPTER_TRANSPORT;
    const isZaloWorker = rel === ZALO_WORKER_DIR || rel.startsWith(ZALO_WORKER_DIR + '/');

    const refs = extractReferences(content);
    for (const ref of refs) {
      if (ref.typeOnly) continue;
      const lineNo = lineAt(content, ref.index);

      if (!isDbAdapter && isPgSpecifier(ref.specifier)) {
        violations.push(`${rel}:${lineNo}: ${ref.keyword} "${ref.specifier}" ngoai adapters/db.ts`);
      }
      if (!isModelAdapter && isAnthropicSpecifier(ref.specifier)) {
        violations.push(`${rel}:${lineNo}: ${ref.keyword} "${ref.specifier}" ngoai adapters/model.ts`);
      }
      if (!isTransportAdapter && !isZaloWorker && isZcaSpecifier(ref.specifier)) {
        violations.push(`${rel}:${lineNo}: ${ref.keyword} "${ref.specifier}" ngoai adapters/transport.ts va apps/zalo-worker/**`);
      }
    }

    if (!isTransportAdapter) {
      for (const offset of findOutboxInsertOffsets(content)) {
        violations.push(`${rel}: "insert into outbox" (be mat chinh tac, ~offset ${offset}) ngoai adapters/transport.ts`);
      }
    }
  }

  for (const v of violations) console.log(v);
  console.log(`violations: ${violations.length}`);
  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`CHECK_ADAPTER_BOUNDARY_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
