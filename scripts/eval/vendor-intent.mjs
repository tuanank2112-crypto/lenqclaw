#!/usr/bin/env node
// scripts/eval/vendor-intent.mjs — SPEC-P05-Dispatch.md §10.4.1,
// TESTING-ACCEPTANCE.md §3 (`vendor_intent.jsonl`, Đ27). Cham lop hieu y THO
// (`triageVendorMessage`) + luoi tat dinh (`agent/vendor-intent.ts`) BANG
// MODEL THAT — khong qua agent/tool (khac `eval_golden.mjs`: bo nay khong
// can vong tool, chi can hieu-y + luoi tat dinh dung theo tung ca).
//
// Ngu nghia ma thoat (giong `eval_golden.mjs`, KHONG duoc sua file do):
// thieu credential cua provider dang chon => BLOCKED, exit 3, khong dung DB.
// >10% ca loi ha tang (429/5xx/mang, do qua `agent_runs.outcome='error'`
// route 'triage') => BLOCKED, exit 3. Dat ca 4 nguong => exit 0. Trai lai
// => exit 1.
//
// Can DATABASE_URL (da migrate) vi `callTriageModel` ghi `agent_runs` moi
// lan goi (dinh nghia trong adapters/model.ts, khong sua duoc o day).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredential, credentialEnvName, currentProvider, loadJsonl } from './score.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const GOLDEN_FILE = path.join(ROOT, 'evals', 'golden', 'vendor_intent.jsonl');

const CLAIM_RECALL_MIN = 0.95;
const PRICE_EXACT_MIN = 0.9;
const BLOCKED_ERROR_RATE_MAX = 0.1;

function vendorIntentMin() {
  const raw = process.env.VENDOR_INTENT_MIN?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0.6;
}

async function main() {
  if (!hasCredential()) {
    console.log(
      `EVAL_VENDOR_INTENT: BLOCKED (thieu ${credentialEnvName()}, MODEL_PROVIDER=${currentProvider()}) — khong tinh truot.`
    );
    process.exit(3);
  }

  const { sql, closeDb } = await import('@lenqclaw/core/adapters/db');
  const { triageVendorMessage } = await import('@lenqclaw/core/agent/vendor-triage');
  const { extractJobCodes, matchesClaimPhrase, parsePriceVnd } = await import('@lenqclaw/core/agent/vendor-intent');

  const cases = await loadJsonl(GOLDEN_FILE);
  console.log(`provider=${currentProvider()} cases=${cases.length} VENDOR_INTENT_MIN=${vendorIntentMin()}`);

  const errBeforeRows = await sql(`select count(*)::int as c from agent_runs where route = 'triage' and outcome = 'error'`);
  const errBefore = errBeforeRows[0]?.c ?? 0;

  const threshold = vendorIntentMin();
  let claimTotal = 0;
  let claimHits = 0;
  let falseClaimCount = 0;
  let quoteTotal = 0;
  let priceHits = 0;
  let codeFails = 0;
  const failures = [];

  for (const c of cases) {
    const triage = await triageVendorMessage(c.text, [], null);

    const codesFound = extractJobCodes(c.text);
    const codeOk = c.expect_job_code ? codesFound.includes(c.expect_job_code) : codesFound.length === 0;
    if (!codeOk) {
      codeFails++;
      failures.push(`${c.case_id}: code_exact sai (ky vong ${c.expect_job_code ?? 'khong co'}, luoi tra [${codesFound.join(',')}])`);
    }

    // §10.4.4: bang chung "claim" la luoi (cum BANG NHAU) HOAC model dat
    // nguong — DUNG chinh dieu kien tool claim_job dung de gate.
    const claimEvidence =
      matchesClaimPhrase(c.text, c.expect_job_code ?? null) ||
      (!!triage && triage.intent === 'claim' && triage.intent_confidence >= threshold);

    if (c.expect_intent === 'claim') {
      claimTotal++;
      if (claimEvidence) claimHits++;
      else failures.push(`${c.case_id}: bo sot claim ("${c.text}")`);
    } else if (claimEvidence) {
      falseClaimCount++;
      failures.push(`${c.case_id}: nhan nham thanh claim ("${c.text}", ky vong ${c.expect_intent})`);
    }

    if (c.expect_intent === 'quote' && c.expect_price_vnd != null) {
      quoteTotal++;
      const priceFromText = parsePriceVnd(c.text);
      const priceOk = priceFromText === c.expect_price_vnd || (!!triage && triage.price_vnd === c.expect_price_vnd);
      if (priceOk) priceHits++;
      else failures.push(`${c.case_id}: gia sai (ky vong ${c.expect_price_vnd}, luoi=${priceFromText}, model=${triage?.price_vnd ?? 'null'})`);
    }
  }

  const errAfterRows = await sql(`select count(*)::int as c from agent_runs where route = 'triage' and outcome = 'error'`);
  const errAfter = errAfterRows[0]?.c ?? 0;
  const errCount = errAfter - errBefore;
  const errRate = cases.length > 0 ? errCount / cases.length : 0;

  const claimRecall = claimTotal > 0 ? claimHits / claimTotal : 1;
  const priceExact = quoteTotal > 0 ? priceHits / quoteTotal : 1;
  const codeExact = cases.length > 0 ? (cases.length - codeFails) / cases.length : 1;

  console.log(
    `claim_recall=${claimRecall.toFixed(3)} (${claimHits}/${claimTotal}) false_claim=${falseClaimCount} price_exact=${priceExact.toFixed(3)} (${priceHits}/${quoteTotal}) code_exact=${codeExact.toFixed(3)} model_errors=${errCount}/${cases.length} (${(errRate * 100).toFixed(1)}%)`
  );
  for (const f of failures) console.log(`  - ${f}`);

  await closeDb();

  if (errRate > BLOCKED_ERROR_RATE_MAX) {
    console.log(`EVAL_VENDOR_INTENT: BLOCKED (${(errRate * 100).toFixed(1)}% ca loi ha tang model >10%) — khong tinh truot.`);
    process.exit(3);
  }

  const ok = claimRecall >= CLAIM_RECALL_MIN && falseClaimCount === 0 && priceExact >= PRICE_EXACT_MIN && codeExact === 1;
  if (ok) {
    console.log('EVAL_VENDOR_INTENT: PASS');
    process.exit(0);
  }
  console.log('EVAL_VENDOR_INTENT: FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error(`EVAL_VENDOR_INTENT_ERROR: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
