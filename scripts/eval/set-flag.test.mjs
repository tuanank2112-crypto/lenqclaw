#!/usr/bin/env node
// scripts/eval/set-flag.test.mjs — test THUAN cho co --set (H08 §10, Đ29
// trong plan.md: cham bu theo route — chi cham lai bo bi anh huong).
//
// Phan 1 (KHONG DB, KHONG model that): kiem tra `parseSetArg`/`shouldRun`
// (scripts/eval/args.mjs) va viec `runSelectedSets` (scripts/eval/run.mjs)
// CHI goi ham cham cua bo duoc chon, bang ham cham GIA (spy) — chung minh
// "(1) --set diagnosis,responsibility khong goi bo khac" va "(3) khong co
// --set => hanh vi cu" ma khong can DB/credential. "(2) ten la => exit 2"
// kiem CA hai muc: don vi (parseSetArg tra ok:false) VA end-to-end tren CLI
// that (spawn `node scripts/eval_golden.mjs --set bogus`, khong can DB/
// credential vi buoc kiem --set chay TRUOC hasCredential).
//
// Phan 2 (BAT BUOC DATABASE_URL tro DB da migrate+seed+seed:sim, vd
// `lq_h08` rong): chay THAT `scripts/eval/red-fake-model.mjs --set
// responsibility` (client model GIA nhu red-fake-model.mjs cu dung, KHONG
// goi mang/model that) va kiem no van bao DO (RED_TEST_OK, exit 0) khi CHI
// loc mot bo — dung yeu cau H08 §10 dong 4: "red-fake-model van do voi
// --set responsibility".
//
// Chay: node scripts/eval/set-flag.test.mjs (phan 1)
//       DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lq_h08 \
//         node scripts/eval/set-flag.test.mjs (phan 1 + phan 2)
// Exit 0 = tat ca PASS; exit 1 = co FAIL.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSetArg, shouldRun, setsLabel, SET_NAMES } from './args.mjs';
import { runSelectedSets } from './run.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL: ${name} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL: ${name} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// (3) khong co --set => hanh vi cu (du 4 bo)
test('parseSetArg([]) tra ve sets=null, shouldRun true cho ca 4 ten', () => {
  const r = parseSetArg([]);
  assert.equal(r.ok, true);
  assert.equal(r.sets, null);
  for (const name of SET_NAMES) assert.equal(shouldRun(r.sets, name), true);
  assert.equal(setsLabel(r.sets), 'all');
});

test('parseSetArg(["--set","diagnosis,responsibility"]) chi chon 2 bo', () => {
  const r = parseSetArg(['--set', 'diagnosis,responsibility']);
  assert.equal(r.ok, true);
  assert.equal(shouldRun(r.sets, 'diagnosis'), true);
  assert.equal(shouldRun(r.sets, 'responsibility'), true);
  assert.equal(shouldRun(r.sets, 'emergency'), false);
  assert.equal(shouldRun(r.sets, 'consent'), false);
  assert.equal(setsLabel(r.sets), 'diagnosis,responsibility');
});

// (2) ten la — muc don vi
test('parseSetArg(["--set","bogus"]) tra ok:false kem thong bao ten la', () => {
  const r = parseSetArg(['--set', 'bogus']);
  assert.equal(r.ok, false);
  assert.match(r.error, /bogus/);
});

test('parseSetArg(["--set"]) thieu gia tri cung tra ok:false', () => {
  const r = parseSetArg(['--set']);
  assert.equal(r.ok, false);
});

// (1) --set diagnosis,responsibility KHONG goi bo khac — spy, KHONG DB
await testAsync('runSelectedSets({sets:[diagnosis,responsibility]}) khong goi scoreEmergencySet/scoreConsentSet', async () => {
  const calls = { emergency: 0, consent: 0, diagnosis: 0, responsibility: 0 };
  const logs = [];
  const results = await runSelectedSets({
    sets: new Set(['diagnosis', 'responsibility']),
    log: (line) => logs.push(line),
    scorers: {
      scoreEmergencySet: async () => {
        calls.emergency++;
        throw new Error('scoreEmergencySet KHONG duoc goi khi --set khong chua emergency');
      },
      scoreConsentSet: async () => {
        calls.consent++;
        throw new Error('scoreConsentSet KHONG duoc goi khi --set khong chua consent');
      },
      scoreDiagnosisSet: async () => {
        calls.diagnosis++;
        return { blocked: false, total: 1, scored: 1, pass: 1, rate: 1, avgQuestions: 0, blockedCount: 0, ok: true, failures: [] };
      },
      scoreResponsibilitySet: async () => {
        calls.responsibility++;
        return {
          blocked: false,
          total: 1,
          scored: 1,
          pass: 1,
          rate: 1,
          citationChecked: 0,
          citationOk: 0,
          citationRate: 1,
          blockedCount: 0,
          ok: true,
          failures: [],
        };
      },
    },
    emergencyDeps: {},
    consentDeps: {},
    agentDeps: {},
    cases: { emergency: [], consent: [], diagnosis: [], responsibility: [] },
    triageEmergencyMin: 0.5,
  });

  assert.equal(calls.emergency, 0, 'scoreEmergencySet phai KHONG duoc goi');
  assert.equal(calls.consent, 0, 'scoreConsentSet phai KHONG duoc goi');
  assert.equal(calls.diagnosis, 1, 'scoreDiagnosisSet phai duoc goi dung 1 lan');
  assert.equal(calls.responsibility, 1, 'scoreResponsibilitySet phai duoc goi dung 1 lan');
  assert.deepEqual(Object.keys(results).sort(), ['diagnosis', 'responsibility']);
  assert.ok(logs.includes('emergency: skipped (--set)'), 'phai in dong skipped cho emergency');
  assert.ok(logs.includes('consent: skipped (--set)'), 'phai in dong skipped cho consent');
});

test('runSelectedSets voi sets=null (khong --set) goi CA 4 ham cham', async () => {
  const calls = { emergency: 0, consent: 0, diagnosis: 0, responsibility: 0 };
  const stubOk = { blocked: false, ok: true, total: 0, scored: 0, pass: 0, rate: 1, avgQuestions: 0, blockedCount: 0, failures: [] };
  await runSelectedSets({
    sets: null,
    log: () => {},
    scorers: {
      scoreEmergencySet: async () => {
        calls.emergency++;
        return {
          ...stubOk,
          layer1Hits: 0,
          layer2Calls: 0,
          layer2Hits: 0,
          falsePositive: 0,
          falsePositiveRate: 0,
          falseNegative: 0,
        };
      },
      scoreConsentSet: async () => {
        calls.consent++;
        return { ...stubOk, falseAccept: 0, recall: 1 };
      },
      scoreDiagnosisSet: async () => {
        calls.diagnosis++;
        return stubOk;
      },
      scoreResponsibilitySet: async () => {
        calls.responsibility++;
        return { ...stubOk, citationChecked: 0, citationOk: 0, citationRate: 1 };
      },
    },
    emergencyDeps: {},
    consentDeps: {},
    agentDeps: {},
    cases: { emergency: [], consent: [], diagnosis: [], responsibility: [] },
    triageEmergencyMin: 0.5,
  });
  assert.equal(calls.emergency, 1);
  assert.equal(calls.consent, 1);
  assert.equal(calls.diagnosis, 1);
  assert.equal(calls.responsibility, 1);
});

// (2) ten la — muc end-to-end tren CLI that, KHONG can DB/credential vi
// buoc --set kiem TRUOC hasCredential trong scripts/eval_golden.mjs
test('node scripts/eval_golden.mjs --set bogus => exit 2 (khong can DB/credential)', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENROUTER_API_KEY;
  delete env.VYCE_API_KEY;
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ['scripts/eval_golden.mjs', '--set', 'bogus'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2, `exit thuc te=${result.status} stdout=${result.stdout} stderr=${result.stderr}`);
});

console.log(`\nSET_FLAG_TEST (phan 1, khong DB): ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('SET_FLAG_TEST: co FAIL o phan 1 — dung, khong chay phan 2 (DB).');
  process.exit(1);
}

// Phan 2: red-fake-model.mjs --set responsibility van do dung MOT bo khi
// loc — BAT BUOC DATABASE_URL tro DB da migrate+seed+seed:sim rong.
if (!process.env.DATABASE_URL) {
  console.log(
    'SET_FLAG_TEST_DB_MISSING: khong co DATABASE_URL — phan 2 (red-fake-model --set responsibility tren DB) CHUA CHAY. ' +
      'Chay lai voi DATABASE_URL tro DB rong da migrate+seed+seed:sim de co bang chung day du.'
  );
  process.exit(1);
}

console.log('\n=== Phan 2: red-fake-model.mjs --set responsibility (can DATABASE_URL) ===');
const redResult = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/eval/red-fake-model.mjs', '--set', 'responsibility'],
  { cwd: ROOT, env: process.env, encoding: 'utf8', shell: true }
);
console.log(redResult.stdout ?? '');
if (redResult.stderr) console.log(redResult.stderr);
const redOk = redResult.status === 0; // 0 = RED_TEST_OK (may cham bao do dung)
console.log(`SET_FLAG_TEST_DB: red-fake-model --set responsibility exit=${redResult.status} (${redOk ? 'PASS' : 'FAIL'})`);

console.log(`\nSET_FLAG_TEST_FINAL: ${redOk ? 'PASS' : 'FAIL'}`);
process.exit(redOk ? 0 : 1);
