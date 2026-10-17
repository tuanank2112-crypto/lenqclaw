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
// BOUNDARY_ROOT: chi dung cho test cua chinh may quet (cay gia trong thu muc tam) — mac dinh la goc repo.
const ROOT = process.env.BOUNDARY_ROOT ? path.resolve(process.env.BOUNDARY_ROOT) : path.join(__dirname, '..');
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
// Test cua chinh may quet (D35.8) chua cac doan MA VI PHAM dang chuoi (cay gia) — loai tru nhu SELF.
const SELF_TEST = 'packages/core/src/boundary.test.ts';
// 01-CONTRACTS §2b: chuoi endpoint Gemini CHI duoc xuat hien trong
// adapters/model.ts (goi H04, goi c).
const GEMINI_HOST = 'generativelanguage.googleapis.com';
// 01-CONTRACTS §2c: chuoi endpoint OpenRouter CHI duoc xuat hien trong
// adapters/model.ts (goi H10, goi c).
const OPENROUTER_HOST = 'openrouter.ai';
// 01-CONTRACTS §2d: chuoi endpoint Vyce CHI duoc xuat hien trong
// adapters/model.ts (goi H11, goi c).
const VYCE_HOST = 'vyceai.com';

// --- P03 / D28 (BB-15, BB-17) + D32 (BB-20): ranh gioi node do thi LangGraph, cam checkpoint/LangSmith,
// Telegram chi o adapters/alert.ts. SPEC-P03 §11 hang 12.
const GRAPH_DIR = 'packages/core/src/agent/community/graph';
const NODES_DIR = `${GRAPH_DIR}/nodes`;
const ADAPTER_ALERT = 'packages/core/src/adapters/alert.ts';
// Node co cot outbox ✗ (01-CONTRACTS §12.3): KHONG import adapters/transport, services/outbox-actions, services/approvals.
const OUTBOX_FORBIDDEN_NODES = new Set(['ingest', 'triage', 'gate', 'defer', 'turn', 'agent', 'nudge', 'trace']);
const OUTBOX_MODULES = new Set([
  'packages/core/src/adapters/transport',
  'packages/core/src/services/outbox-actions',
  'packages/core/src/services/approvals',
]);
// D35.8 (R08 N7): ten duoc phep import tu '@langchain/langgraph' (01-CONTRACTS §12.1) — MOI ten khac (messagesStateReducer,
// Command, Send, interrupt, MemorySaver...) la vi pham, ke ca import namespace/default.
const LANGGRAPH_ALLOWED_NAMES = new Set(['Annotation', 'StateGraph', 'START', 'END', 'GraphRecursionError']);
// Canh THUAN (BB-16): graph/edges.ts khong import adapters/* hay services/* va khong dung I/O, dong ho, ngau nhien.
const EDGES_FILE = `${GRAPH_DIR}/edges.ts`;
const EDGES_FORBIDDEN_PREFIXES = ['packages/core/src/adapters/', 'packages/core/src/services/'];
const EDGES_FORBIDDEN_IDENTS = [
  { re: /\bDate\.now\b/, label: 'Date.now' },
  { re: /\bnew\s+Date\b/, label: 'new Date' },
  { re: /\bMath\.random\b/, label: 'Math.random' },
  { re: /\bprocess\./, label: 'process.' },
  { re: /\bfetch\s*\(/, label: 'fetch(' },
  { re: /\bawait\b/, label: 'await' },
  { re: /\bsql\s*\(/, label: 'sql(' },
  { re: /\bsetTimeout\b/, label: 'setTimeout' },
  { re: /\bconsole\./, label: 'console.' },
];
const MODEL_MODULE = 'packages/core/src/adapters/model';
const TRIAGE_MODULE = 'packages/core/src/agent/community/triage';

/** Giai specifier tuong doi thanh duong dan goc repo (bo duoi .js/.ts); specifier goi (khong './') giu nguyen. */
function resolveSpec(fromRel, spec) {
  if (!spec.startsWith('.')) return spec;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec.replace(/\.(js|ts)$/, '')));
}
// Danh dinh cam trong TOAN packages/ (sau khi bo comment): checkpointer, store, interrupt, Command, Send, MessagesAnnotation.
const FORBIDDEN_LANGGRAPH_IDENTS = [
  { re: /\bMemorySaver\b/, label: 'MemorySaver' },
  { re: /\bPostgresSaver\b/, label: 'PostgresSaver' },
  { re: /\bInMemoryStore\b/, label: 'InMemoryStore' },
  { re: /\bMessagesAnnotation\b/, label: 'MessagesAnnotation' },
  { re: /\binterrupt\s*\(/, label: 'interrupt(' },
  { re: /\bnew\s+Command\s*\(/, label: 'new Command(' },
  { re: /\bSend\s*\(/, label: 'Send(' },
  { re: /\bcheckpointer\s*:/, label: 'checkpointer:' },
];

/** Chi quet MA: bo comment khoi + dong (thong bao/hang trong chuoi van con — chap nhan, quet muc bao dong). */
function stripComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** Specifier thuoc nhom `@langchain/*` (tru dung `@langchain/langgraph`) hoac `langsmith` bi cam (BB-17). */
function isForbiddenLangchainSpecifier(spec) {
  if (spec === '@langchain/langgraph') return false;
  if (spec.startsWith('@langchain/langgraph-checkpoint')) return true;
  if (spec.startsWith('@langchain/langgraph/')) return true; // prebuilt, web, ...
  if (spec.startsWith('@langchain/')) return true; // @langchain/core/*, @langchain/<provider>
  return spec === 'langsmith' || spec.startsWith('langsmith/');
}

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
const isGenaiSpecifier = makeMatcher(['@google/genai'], ['@google/genai/']);

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
    refs.push({ specifier, index: m.index, typeOnly, keyword, middle });
  }

  const callRe = /\b(require|import)\s*\(\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2\s*\)/g;
  while ((m = callRe.exec(content))) {
    refs.push({ specifier: m[3], index: m.index, typeOnly: false, keyword: m[1] });
  }

  return refs;
}

/** Ten duoc import/re-export trong mot cau `import|export … from` (bo `type`, lay phan truoc `as`); `*` / default ⇒ '*'. */
function importedNames(middle) {
  const names = [];
  const brace = /\{([\s\S]*)\}/.exec(middle);
  const head = brace ? middle.slice(0, brace.index) : middle;
  if (/\*/.test(head)) names.push('*');
  else if (/[A-Za-z_$]/.test(head.replace(/\btype\b/g, ''))) names.push('default');
  if (brace) {
    for (const part of brace[1].split(',')) {
      const p = part.trim();
      if (p === '' || /^type\s/.test(p)) continue;
      names.push(p.split(/\s+as\s+/)[0].trim());
    }
  }
  return names;
}

/** `import(x)` / `require(x)` ma doi so KHONG phai chuoi literal thuan (bien, noi chuoi, template co `${`). Tra mang offset. */
function findNonLiteralDynamicImports(code) {
  const out = [];
  const re = /\b(import|require)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const start = m.index + m[0].length;
    const end = code.indexOf(')', start);
    const arg = (end === -1 ? code.slice(start) : code.slice(start, end)).trim();
    const literal = /^(['"])[^'"\\]*\1$/.test(arg) || /^`[^`$\\]*`$/.test(arg);
    if (!literal) out.push(m.index);
  }
  return out;
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

  // D35.8: tien xu ly — tap "file ghi outbox": file (khong phai test) import/re-export THANG mot module outbox.
  // Node outbox cam khong duoc import file nhu vay (chan nap gian tiep / re-export).
  const contents = new Map();
  const outboxWriters = new Set();
  for (const file of files) {
    const rel = relPath(file);
    if (rel === SELF || rel === SELF_TEST) continue;
    const content = await readFile(file, 'utf8');
    contents.set(file, content);
    if (/\.test\.[a-z]+$/.test(rel)) continue;
    for (const ref of extractReferences(content)) {
      if (!ref.typeOnly && OUTBOX_MODULES.has(resolveSpec(rel, ref.specifier))) outboxWriters.add(rel.replace(/\.[a-z]+$/, ''));
    }
  }

  for (const file of files) {
    const rel = relPath(file);
    if (rel === SELF || rel === SELF_TEST) continue;
    const content = contents.get(file);

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
      if (!isModelAdapter && isGenaiSpecifier(ref.specifier)) {
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

    // ---- BB-15 / BB-17 / BB-20 ----
    const inPackages = rel.startsWith('packages/');
    const isTestFile = /\.test\.[a-z]+$/.test(rel);
    const nodeMatch = rel.startsWith(`${NODES_DIR}/`) ? path.basename(rel).replace(/\.[a-z]+$/, '') : null;
    for (const ref of refs) {
      const lineNo = lineAt(content, ref.index);
      // (c) cam goi/thu vien: ke ca import type khong duoc (an toan hon) — ngoai tru typeOnly cua goi duoc phep.
      if (inPackages && !ref.typeOnly && isForbiddenLangchainSpecifier(ref.specifier)) {
        violations.push(`${rel}:${lineNo}: ${ref.keyword} "${ref.specifier}" bi cam (BB-17: chi Annotation/StateGraph/START/END/GraphRecursionError tu "@langchain/langgraph")`);
      }
      if (ref.typeOnly) continue;
      // (a) node outbox ✗
      if (nodeMatch !== null && OUTBOX_FORBIDDEN_NODES.has(nodeMatch) && OUTBOX_MODULES.has(resolveSpec(rel, ref.specifier))) {
        violations.push(`${rel}:${lineNo}: node "${nodeMatch}" (outbox ✗) import "${ref.specifier}" (BB-15)`);
      }
      // (a') import GIAN TIEP: node outbox ✗ import file ma chinh file do import/re-export module outbox (vd group-post, barrel).
      if (nodeMatch !== null && OUTBOX_FORBIDDEN_NODES.has(nodeMatch) && !isTestFile && outboxWriters.has(resolveSpec(rel, ref.specifier))) {
        violations.push(`${rel}:${lineNo}: node "${nodeMatch}" (outbox ✗) import GIAN TIEP "${ref.specifier}" — file nay ghi outbox (BB-15)`);
      }
      // (c') ten tu '@langchain/langgraph' ngoai allowlist §12.1 (kể cả namespace/default)
      if (inPackages && !isTestFile && ref.specifier === '@langchain/langgraph' && ref.middle !== undefined) {
        for (const name of importedNames(ref.middle)) {
          if (!LANGGRAPH_ALLOWED_NAMES.has(name)) {
            violations.push(`${rel}:${lineNo}: ten "${name}" tu "@langchain/langgraph" ngoai allowlist 01-CONTRACTS §12.1 (BB-17)`);
          }
        }
      }
      // canh THUAN: edges.ts khong import adapters/* va services/* (BB-16)
      if (rel === EDGES_FILE && EDGES_FORBIDDEN_PREFIXES.some((p) => resolveSpec(rel, ref.specifier).startsWith(p))) {
        violations.push(`${rel}:${lineNo}: graph/edges.ts (canh THUAN) import "${ref.specifier}" (BB-16)`);
      }
      // (b) callModel chi o nodes/agent.ts; triageCommunityMessage chi o nodes/triage.ts
      if (rel.startsWith(`${GRAPH_DIR}/`) && !isTestFile) {
        if (resolveSpec(rel, ref.specifier) === MODEL_MODULE && rel !== `${NODES_DIR}/agent.ts`) {
          violations.push(`${rel}:${lineNo}: import "${ref.specifier}" ngoai graph/nodes/agent.ts (BB-15)`);
        }
        if (resolveSpec(rel, ref.specifier) === TRIAGE_MODULE && rel !== `${NODES_DIR}/triage.ts`) {
          violations.push(`${rel}:${lineNo}: import "${ref.specifier}" ngoai graph/nodes/triage.ts (BB-15)`);
        }
      }
    }
    if (inPackages) {
      const code = stripComments(content);
      for (const { re, label } of FORBIDDEN_LANGGRAPH_IDENTS) {
        const m = re.exec(code);
        if (m) violations.push(`${rel}:${lineAt(code, m.index)}: dinh danh "${label}" bi cam (BB-17: khong checkpointer/Store/interrupt/Command/Send/MessagesAnnotation)`);
      }
      // D35.8: import()/require() khong literal ⇒ khong kiem duoc specifier (lach luat BB-17)
      for (const at of findNonLiteralDynamicImports(code)) {
        violations.push(`${rel}:${lineAt(code, at)}: import()/require() khong literal (BB-17: khong kiem duoc specifier)`);
      }
      if (rel === EDGES_FILE) {
        for (const { re, label } of EDGES_FORBIDDEN_IDENTS) {
          const m = re.exec(code);
          if (m) violations.push(`${rel}:${lineAt(code, m.index)}: graph/edges.ts (canh THUAN) dung "${label}" (BB-16: khong I/O, dong ho, ngau nhien)`);
        }
      }
    }
    if (rel !== ADAPTER_ALERT) {
      for (const needle of ['api.telegram.org', 'TELEGRAM_BOT_TOKEN']) {
        let from = 0;
        let at;
        while ((at = content.indexOf(needle, from)) !== -1) {
          violations.push(`${rel}:${lineAt(content, at)}: chuoi "${needle}" ngoai adapters/alert.ts (BB-20)`);
          from = at + needle.length;
        }
      }
    }

    if (!isModelAdapter) {
      let searchFrom = 0;
      let idx;
      while ((idx = content.indexOf(GEMINI_HOST, searchFrom)) !== -1) {
        violations.push(`${rel}:${lineAt(content, idx)}: chuoi "${GEMINI_HOST}" ngoai adapters/model.ts`);
        searchFrom = idx + GEMINI_HOST.length;
      }
      let searchFromOr = 0;
      let idxOr;
      while ((idxOr = content.indexOf(OPENROUTER_HOST, searchFromOr)) !== -1) {
        violations.push(`${rel}:${lineAt(content, idxOr)}: chuoi "${OPENROUTER_HOST}" ngoai adapters/model.ts`);
        searchFromOr = idxOr + OPENROUTER_HOST.length;
      }
      let searchFromVyce = 0;
      let idxVyce;
      while ((idxVyce = content.indexOf(VYCE_HOST, searchFromVyce)) !== -1) {
        violations.push(`${rel}:${lineAt(content, idxVyce)}: chuoi "${VYCE_HOST}" ngoai adapters/model.ts`);
        searchFromVyce = idxVyce + VYCE_HOST.length;
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
