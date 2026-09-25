#!/usr/bin/env node
// scripts/eval_golden.mjs — bo cham golden DUY NHAT cho P03
// (TESTING-ACCEPTANCE.md §3, SPEC-P03-Resident-Agent.md §10.6/§11), VIET LAI
// theo H08 (Đ19-4): `diagnosis`/`responsibility` gio di qua VONG AGENT THAT
// (`routeInboundEvent`) tren DB da migrate+seed+seed:sim, KHONG con goi
// `callModel` mot luot don (R05 §8 — ban cu qua long, khong dung thu agent
// dung/thu tu tool, khong do luat trich dan). Logic cham nam o
// `scripts/eval/score.mjs` (dung chung voi `scripts/eval/red-fake-model.mjs`
// de chung minh may cham biet DO). Can `npm run build -w @lenqclaw/core`
// truoc (doc `packages/core/dist/**`) + `DATABASE_URL` tro toi DB DA
// migrate+seed+seed:sim (DATA_MODE=sim).
//
// Ngu nghia mo hinh (Đ17-e, Đ18/Đ19 + 01-CONTRACTS §2b): thieu credential
// CUA PROVIDER DANG CHON (GEMINI_API_KEY khi MODEL_PROVIDER=gemini — mac
// dinh; ANTHROPIC_API_KEY khi anthropic) => TOAN BO 4 bo (ca `emergency` lop
// 2 va `consent` deu can goi triage that) tra "blocked", KHONG tinh truot,
// ma thoat 3 — KHONG dung DB (tra som). Trong luc chay, ca loi 429/5xx/mang
// (`agent_runs.outcome='error'`) => 'blocked' RIENG LE cho ca do; mot bo co
// >10% ca blocked => CA BO do 'blocked'.

import {
  GOLDEN_DIR,
  loadJsonl,
  hasCredential,
  credentialEnvName,
  currentProvider,
  loadFixtureIds,
  scoreDiagnosisSet,
  scoreResponsibilitySet,
  scoreEmergencySet,
  scoreConsentSet,
  decideExit,
} from './eval/score.mjs';

const TRIAGE_EMERGENCY_MIN_DEFAULT = 0.5;

function triageEmergencyMin() {
  const raw = process.env.TRIAGE_EMERGENCY_MIN?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : TRIAGE_EMERGENCY_MIN_DEFAULT;
}

function printFailures(failures, limit = 20) {
  for (const f of failures.slice(0, limit)) console.log(`  - ${f}`);
  if (failures.length > limit) console.log(`  - ... va ${failures.length - limit} ca khac`);
}

async function main() {
  if (!hasCredential()) {
    console.log(
      `EVAL_GOLDEN: BLOCKED (thieu ${credentialEnvName()}, MODEL_PROVIDER=${currentProvider()}) — khong tinh truot.`
    );
    process.exit(3);
  }

  const path = await import('node:path');
  const { sql, tx, closeDb } = await import('@lenqclaw/core/adapters/db');
  const { simInbound, processInbound } = await import('@lenqclaw/core/sim/sim-transport');
  const { routeInboundEvent } = await import('@lenqclaw/core/agent/resident-agent');
  const { detectEmergency, redactPii } = await import('@lenqclaw/core/agent/pii');
  const { triageMessage } = await import('@lenqclaw/core/agent/triage');
  const { hasExplicitConsent } = await import('@lenqclaw/core/agent/tools/open_service_case');

  let exitCode = 1;
  try {
    const { buildingId, apartmentIds } = await loadFixtureIds(sql);
    const deps = { sql, tx, simInbound, processInbound, routeInboundEvent, buildingId, apartmentIds };

    const emergencyCases = await loadJsonl(path.join(GOLDEN_DIR, 'emergency.jsonl'));
    const consentCases = await loadJsonl(path.join(GOLDEN_DIR, 'consent.jsonl'));
    const diagnosisCases = await loadJsonl(path.join(GOLDEN_DIR, 'diagnosis.jsonl'));
    const responsibilityCases = await loadJsonl(path.join(GOLDEN_DIR, 'responsibility.jsonl'));

    console.log(`provider=${currentProvider()} building=${buildingId} apartments=${apartmentIds.length}`);

    const emergency = await scoreEmergencySet({ detectEmergency, triageMessage }, emergencyCases, triageEmergencyMin());
    console.log(
      `emergency: total=${emergency.total} pass=${emergency.pass} layer1_hits=${emergency.layer1Hits} ` +
        `layer2_calls=${emergency.layer2Calls} layer2_hits=${emergency.layer2Hits} ` +
        `false_positive=${emergency.falsePositive} (${(emergency.falsePositiveRate * 100).toFixed(1)}%) ` +
        `false_negative=${emergency.falseNegative} ok=${emergency.ok}`
    );
    printFailures(emergency.failures);

    const consent = await scoreConsentSet({ hasExplicitConsent, triageMessage, redactPii }, consentCases);
    console.log(
      `consent: total=${consent.total} pass=${consent.pass} false_accept=${consent.falseAccept} ` +
        `recall=${(consent.recall * 100).toFixed(1)}% ok=${consent.ok}`
    );
    printFailures(consent.failures);

    const diagnosis = await scoreDiagnosisSet(deps, diagnosisCases);
    if (diagnosis.blocked) {
      console.log(`diagnosis: blocked (${diagnosis.reason})`);
    } else {
      console.log(
        `diagnosis: total=${diagnosis.total} scored=${diagnosis.scored} pass=${diagnosis.pass} ` +
          `rate=${(diagnosis.rate * 100).toFixed(1)}% avg_questions=${diagnosis.avgQuestions.toFixed(2)} ` +
          `blocked=${diagnosis.blockedCount} ok=${diagnosis.ok}`
      );
      printFailures(diagnosis.failures);
    }

    const responsibility = await scoreResponsibilitySet(deps, responsibilityCases);
    if (responsibility.blocked) {
      console.log(`responsibility: blocked (${responsibility.reason})`);
    } else {
      console.log(
        `responsibility: total=${responsibility.total} scored=${responsibility.scored} pass=${responsibility.pass} ` +
          `rate=${(responsibility.rate * 100).toFixed(1)}% citation_ok=${responsibility.citationOk}/${responsibility.citationChecked} ` +
          `blocked=${responsibility.blockedCount} ok=${responsibility.ok}`
      );
      printFailures(responsibility.failures);
    }

    const runsRows = await sql(
      `select route, count(*)::int as calls, sum(coalesce(input_tokens,0))::bigint as input_tokens,
              sum(coalesce(output_tokens,0))::bigint as output_tokens, avg(latency_ms)::int as avg_latency_ms
       from agent_runs group by route order by route`
    );
    console.log('agent_runs (toan bo DB nay, theo route):');
    for (const r of runsRows) {
      console.log(`  ${r.route}: calls=${r.calls} input_tokens=${r.input_tokens} output_tokens=${r.output_tokens} avg_latency_ms=${r.avg_latency_ms}`);
    }

    exitCode = decideExit({ emergency, consent, diagnosis, responsibility });
    if (exitCode === 3) {
      console.log('EVAL_GOLDEN: BLOCKED (>10% ca cua mot bo loi ha tang) — khong tinh truot.');
    } else if (exitCode === 1) {
      console.error('EVAL_GOLDEN_FAIL: co bo chua dat nguong.');
    } else {
      console.log('EVAL_GOLDEN_OK');
    }
  } finally {
    await closeDb();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`EVAL_GOLDEN_ERROR: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
