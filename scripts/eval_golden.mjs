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
//
// Co `--set <ten>[,<ten>]` (H08 §10, Đ29 — cham bu theo route): loc bo nao
// chay; khong cho => du 4 bo nhu cu. Ten khong thuoc emergency|consent|
// diagnosis|responsibility => in loi, exit 2 (kiem TRUOC ca hasCredential,
// khong can DB/credential). Bo khong chay in dong "<ten>: skipped (--set)";
// `decideExit` CHI xet cac bo da chay (xem scripts/eval/run.mjs).

import { parseSetArg, setsLabel } from './eval/args.mjs';
import { runSelectedSets } from './eval/run.mjs';
import {
  GOLDEN_DIR,
  loadJsonl,
  hasCredential,
  credentialEnvName,
  currentProvider,
  loadFixtureIds,
  decideExit,
} from './eval/score.mjs';

const TRIAGE_EMERGENCY_MIN_DEFAULT = 0.5;

function triageEmergencyMin() {
  const raw = process.env.TRIAGE_EMERGENCY_MIN?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : TRIAGE_EMERGENCY_MIN_DEFAULT;
}

async function main() {
  const parsedSet = parseSetArg(process.argv.slice(2));
  if (!parsedSet.ok) {
    console.error(`EVAL_GOLDEN_ARG_ERROR: ${parsedSet.error}`);
    process.exit(2);
  }
  const sets = parsedSet.sets;

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
    const agentDeps = { sql, tx, simInbound, processInbound, routeInboundEvent, buildingId, apartmentIds };

    const cases = {
      emergency: await loadJsonl(path.join(GOLDEN_DIR, 'emergency.jsonl')),
      consent: await loadJsonl(path.join(GOLDEN_DIR, 'consent.jsonl')),
      diagnosis: await loadJsonl(path.join(GOLDEN_DIR, 'diagnosis.jsonl')),
      responsibility: await loadJsonl(path.join(GOLDEN_DIR, 'responsibility.jsonl')),
    };

    console.log(
      `provider=${currentProvider()} building=${buildingId} apartments=${apartmentIds.length} sets=${setsLabel(sets)}`
    );

    const results = await runSelectedSets({
      sets,
      emergencyDeps: { detectEmergency, triageMessage },
      consentDeps: { hasExplicitConsent, triageMessage, redactPii },
      agentDeps,
      cases,
      triageEmergencyMin: triageEmergencyMin(),
    });

    const runsRows = await sql(
      `select route, count(*)::int as calls, sum(coalesce(input_tokens,0))::bigint as input_tokens,
              sum(coalesce(output_tokens,0))::bigint as output_tokens, avg(latency_ms)::int as avg_latency_ms
       from agent_runs group by route order by route`
    );
    console.log('agent_runs (toan bo DB nay, theo route):');
    for (const r of runsRows) {
      console.log(`  ${r.route}: calls=${r.calls} input_tokens=${r.input_tokens} output_tokens=${r.output_tokens} avg_latency_ms=${r.avg_latency_ms}`);
    }

    exitCode = decideExit(results);
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
