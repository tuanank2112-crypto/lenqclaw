#!/usr/bin/env node
// scripts/check_adapter_boundary.mjs — BB-04, BB-07 (SPEC-P01-Foundation.md
// §8): moi loi ra ngoai di qua dung mot adapter. Quet apps/**, packages/**,
// scripts/** (bo node_modules, .next, dist). In "violations: <n>" + tung
// dong "file:line"; n>0 => exit 1.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCOPE_DIRS = ['apps', 'packages', 'scripts'];
const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'dist']);
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

const ADAPTER_DB = path.join('packages', 'core', 'src', 'adapters', 'db.ts');
const ADAPTER_MODEL = path.join('packages', 'core', 'src', 'adapters', 'model.ts');
const ADAPTER_TRANSPORT = path.join('packages', 'core', 'src', 'adapters', 'transport.ts');
const ZALO_WORKER_DIR = path.join('apps', 'zalo-worker');
// May do nay TU CHUA chuoi bao dong (regex, thong bao loi) de phat hien vi
// pham — quet chinh no se tu bao dong gia. Loai tru dung file nay.
const SELF = path.join('scripts', 'check_adapter_boundary.mjs').split(path.sep).join('/');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (INCLUDE_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function relPath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
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
    files.push(...(await walk(full)));
  }

  const violations = [];

  for (const file of files) {
    const rel = relPath(file);
    if (rel === SELF) continue;
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');

    const isDbAdapter = rel === ADAPTER_DB.split(path.sep).join('/');
    const isModelAdapter = rel === ADAPTER_MODEL.split(path.sep).join('/');
    const isTransportAdapter = rel === ADAPTER_TRANSPORT.split(path.sep).join('/');
    const isZaloWorker = rel.startsWith(ZALO_WORKER_DIR.split(path.sep).join('/') + '/');

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      // `import type { ... } from "..."` bi xoa het luc bien dich (khong con
      // o runtime) — khong mang rui ro BB-07 (bi mat/goi thang SDK/driver).
      const isTypeOnlyImport = /^\s*import\s+type\b/.test(line);

      if (!isDbAdapter && !isTypeOnlyImport && /(^|[^\w'"@.-])['"]pg['"]/.test(line) && /(import|require)/.test(line)) {
        violations.push(`${rel}:${lineNo}: import "pg" ngoai adapters/db.ts`);
      }

      if (!isModelAdapter && !isTypeOnlyImport && /@anthropic-ai\/sdk/.test(line) && /(import|require)/.test(line)) {
        violations.push(`${rel}:${lineNo}: import "@anthropic-ai/sdk" ngoai adapters/model.ts`);
      }

      if (!isTransportAdapter && !isZaloWorker && !isTypeOnlyImport && /zca-js/.test(line) && /(import|require)/.test(line)) {
        violations.push(`${rel}:${lineNo}: import "zca-js" ngoai adapters/transport.ts va apps/zalo-worker/**`);
      }

      if (!isTransportAdapter && /insert\s+into\s+outbox/i.test(line)) {
        violations.push(`${rel}:${lineNo}: "insert into outbox" ngoai adapters/transport.ts`);
      }
    });
  }

  for (const v of violations) console.log(v);
  console.log(`violations: ${violations.length}`);
  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`CHECK_ADAPTER_BOUNDARY_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
