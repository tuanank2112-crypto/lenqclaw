// scripts/check_adapter_boundary.mjs — D35.8 (R08 N7): may quet BB-15/BB-16/BB-17 bat them import gian tiep (re-export),
// ten ngoai allowlist §12.1, import() khong literal, va canh THUAN (graph/edges.ts). Moi luat co ca "do" tren cay gia
// (BOUNDARY_ROOT) — 0 sua repo that. Cay gia chi dung file toi thieu; may quet duyet theo noi dung file.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'check_adapter_boundary.mjs');
const GRAPH = 'packages/core/src/agent/community/graph';
const roots: string[] = [];

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bnd-'));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}
function run(root: string): { code: number; out: string } {
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, BOUNDARY_ROOT: root }, encoding: 'utf8' });
  return { code: r.status ?? -1, out: r.stdout + r.stderr };
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

const BASE: Record<string, string> = {
  'packages/core/src/adapters/transport.ts': "export const enqueue = 1;\n",
  'packages/core/src/agent/community/group-post.ts': "import { enqueue } from '../../adapters/transport.js';\nexport const postGroupText = () => enqueue;\n",
  [`${GRAPH}/edges.ts`]: "import { END } from '@langchain/langgraph';\nexport const x = (n: number) => n + 1;\nexport { END };\n",
  [`${GRAPH}/state.ts`]: "import { Annotation } from '@langchain/langgraph';\nexport const A = Annotation;\n",
};

describe('check_adapter_boundary — cay sach', () => {
  it('cay toi thieu hop le => violations: 0, exit 0', () => {
    const r = run(tree(BASE));
    expect(r.out).toContain('violations: 0');
    expect(r.code).toBe(0);
  });
});

describe('D35.8 — import gian tiep toi module outbox (node outbox cam)', () => {
  it('node agent import file co ghi outbox (group-post) => vi pham', () => {
    const r = run(tree({ ...BASE, [`${GRAPH}/nodes/agent.ts`]: "import { postGroupText } from '../../group-post.js';\nvoid postGroupText;\n" }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/nodes\/agent\.ts/);
  });
  it('node agent import file RE-EXPORT tu transport => vi pham', () => {
    const r = run(
      tree({
        ...BASE,
        'packages/core/src/agent/community/barrel.ts': "export { enqueue } from '../../adapters/transport.js';\n",
        [`${GRAPH}/nodes/agent.ts`]: "import { enqueue } from '../../barrel.js';\nvoid enqueue;\n",
      })
    );
    expect(r.code).toBe(1);
  });
  it('node deliver (outbox duoc phep) import group-post => KHONG vi pham', () => {
    const r = run(tree({ ...BASE, [`${GRAPH}/nodes/deliver.ts`]: "import { postGroupText } from '../../group-post.js';\nvoid postGroupText;\n" }));
    expect(r.out).toContain('violations: 0');
    expect(r.code).toBe(0);
  });
});

describe('D35.8 — allowlist ten tu @langchain/langgraph (01-CONTRACTS §12.1)', () => {
  it('import messagesStateReducer => vi pham', () => {
    const r = run(
      tree({
        ...BASE,
        [`${GRAPH}/state.ts`]: "import { Annotation, messagesStateReducer } from '@langchain/langgraph';\nvoid messagesStateReducer;\nexport const A = Annotation;\n",
      })
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('messagesStateReducer');
  });
  it('import namespace * => vi pham', () => {
    const r = run(tree({ ...BASE, [`${GRAPH}/state.ts`]: "import * as lg from '@langchain/langgraph';\nexport const A = lg;\n" }));
    expect(r.code).toBe(1);
  });
  it('Annotation, StateGraph, START, END (alias), GraphRecursionError, type Foo => hop le', () => {
    const r = run(
      tree({
        ...BASE,
        [`${GRAPH}/state.ts`]:
          "import { Annotation, StateGraph, START, END as FINISH, GraphRecursionError, type Foo } from '@langchain/langgraph';\nexport const A = [Annotation, StateGraph, START, FINISH, GraphRecursionError];\n",
      })
    );
    expect(r.out).toContain('violations: 0');
  });
});

describe('D35.8 — import()/require() khong literal', () => {
  it('import(CP) voi CP la bien => vi pham', () => {
    const r = run(
      tree({
        ...BASE,
        [`${GRAPH}/pipeline.ts`]: "const CP = ['@langchain', 'langgraph-checkpoint'].join('/');\nvoid import(CP);\n",
      })
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('khong literal');
  });
  it('template co ${} trong import() => vi pham', () => {
    const r = run(tree({ ...BASE, 'packages/core/src/x.ts': 'const n = "a";\nvoid import(`./${n}.js`);\n' }));
    expect(r.code).toBe(1);
  });
  it('import("./literal.js") hop le; nhac import(foo) trong comment khong tinh', () => {
    const r = run(tree({ ...BASE, 'packages/core/src/x.ts': '// import(foo) chi la comment\nvoid import("./y.js");\n' }));
    expect(r.out).toContain('violations: 0');
  });
});

describe('D35.8 — canh THUAN: graph/edges.ts (BB-16)', () => {
  it('edges.ts import adapters/* => vi pham', () => {
    const r = run(tree({ ...BASE, [`${GRAPH}/edges.ts`]: "import { enqueue } from '../../../adapters/transport.js';\nvoid enqueue;\n" }));
    expect(r.code).toBe(1);
    expect(r.out).toContain('edges.ts');
  });
  it('edges.ts import services/* => vi pham', () => {
    const r = run(
      tree({ ...BASE, 'packages/core/src/services/s.ts': 'export const s = 1;\n', [`${GRAPH}/edges.ts`]: "import { s } from '../../../services/s.js';\nvoid s;\n" })
    );
    expect(r.code).toBe(1);
  });
  it('edges.ts dung Date.now() / new Date( / Math.random( / process. / fetch( => vi pham', () => {
    for (const bad of ['Date.now()', 'new Date()', 'Math.random()', 'process.env.X', 'fetch("x")']) {
      const r = run(tree({ ...BASE, [`${GRAPH}/edges.ts`]: `export const f = () => ${bad};\n` }));
      expect(r.code, bad).toBe(1);
    }
  });
  it('edges.ts nhac Date.now() CHI trong comment => hop le', () => {
    const r = run(tree({ ...BASE, [`${GRAPH}/edges.ts`]: '// THUAN: khong Date.now(), khong fetch(\nexport const f = (n: number) => n;\n' }));
    expect(r.out).toContain('violations: 0');
  });
});

describe('truong hop cu van do', () => {
  it('MemorySaver trong packages/ => vi pham (BB-17)', () => {
    const r = run(tree({ ...BASE, 'packages/core/src/y.ts': 'const m = new MemorySaver();\n' }));
    expect(r.code).toBe(1);
  });
  it('@langchain/core import => vi pham', () => {
    const r = run(tree({ ...BASE, 'packages/core/src/y.ts': "import { x } from '@langchain/core/messages';\nvoid x;\n" }));
    expect(r.code).toBe(1);
  });
});
