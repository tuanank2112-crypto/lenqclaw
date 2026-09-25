#!/usr/bin/env node
// scripts/eval/red-fake-model.mjs — H08 muc 3c: chung minh may cham
// (`scripts/eval/score.mjs`, dung boi `scripts/eval_golden.mjs`) BIET DO khi
// model tra ve nhan sai/rac. Goi LAI CHINH cac ham cham that (khong tu viet
// lai logic rieng) voi mot client Anthropic GIA (`setModelClientForTest`/
// `setTriageClientForTest` — khong goi mang, khong can credential that) qua
// nhanh MODEL_PROVIDER=anthropic. Ky vong: `decideExit(...) !== 0` (do).
//
// Chay: DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lq_h08 \
//   node --import tsx scripts/eval/red-fake-model.mjs
// Can DB da `npm run db:migrate && npm run db:seed && DATA_MODE=sim npm run db:seed:sim`.
//
// Co `--set <ten>[,<ten>]` (H08 §10, Đ29) — loc bo nao chay, dung chung logic
// `scripts/eval/args.mjs`/`run.mjs` voi CLI that. Khong cho => du 4 bo nhu cu.

process.env.MODEL_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'fake-key-red-test-not-real';

import path from 'node:path';
import { parseSetArg, setsLabel } from './args.mjs';
import { runSelectedSets } from './run.mjs';
import { GOLDEN_DIR, loadJsonl, loadFixtureIds, decideExit } from './score.mjs';

function fakeMessage(content, stopReason = 'end_turn') {
  return {
    id: `msg_fake_${Math.random().toString(36).slice(2, 8)}`,
    content,
    model: 'claude-opus-5',
    role: 'assistant',
    stop_reason: stopReason,
    stop_sequence: null,
    type: 'message',
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      input_tokens: 1,
      output_tokens: 1,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

/** Model "rac": KHONG BAO GIO goi tool, chi tra mot cau vo nghia — nen agent
 * KHONG BAO GIO tao/hoan tat job. Danh gia diagnosis/responsibility se ra
 * 0% ma khong can biet ky vong la gi. */
function makeGarbageDiagnoseClient() {
  return {
    messages: {
      async create() {
        return fakeMessage([{ type: 'text', text: 'asdkjqwe rac rac khong lien quan', citations: null }]);
      },
    },
  };
}

/** Client triage "rac": tra JSON KHONG hop schema => `parseTriageResult`
 * luon tra `null` => lop 2 KHONG BAO GIO bat duoc gi (khan cap dua vao lop 2
 * se bo sot het; dong y dua vao lop 2 se khong duoc nhan). */
function makeGarbageTriageClient() {
  return {
    messages: {
      async create() {
        return fakeMessage([{ type: 'text', text: 'day khong phai JSON hop le {{{', citations: null }]);
      },
    },
  };
}

async function main() {
  const parsedSet = parseSetArg(process.argv.slice(2));
  if (!parsedSet.ok) {
    console.error(`RED_TEST_ARG_ERROR: ${parsedSet.error}`);
    process.exit(2);
  }
  const sets = parsedSet.sets;

  const { sql, tx, closeDb } = await import('@lenqclaw/core/adapters/db');
  const { simInbound, processInbound } = await import('@lenqclaw/core/sim/sim-transport');
  const { routeInboundEvent } = await import('@lenqclaw/core/agent/resident-agent');
  const { detectEmergency, redactPii } = await import('@lenqclaw/core/agent/pii');
  const { triageMessage } = await import('@lenqclaw/core/agent/triage');
  const { hasExplicitConsent } = await import('@lenqclaw/core/agent/tools/open_service_case');
  const { setModelClientForTest, setTriageClientForTest } = await import('@lenqclaw/core/adapters/model');

  setModelClientForTest(makeGarbageDiagnoseClient());
  setTriageClientForTest(makeGarbageTriageClient());

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

    console.log(`[RED] sets=${setsLabel(sets)}`);

    const results = await runSelectedSets({
      sets,
      emergencyDeps: { detectEmergency, triageMessage },
      consentDeps: { hasExplicitConsent, triageMessage, redactPii },
      agentDeps,
      cases,
      triageEmergencyMin: 0.5,
      log: (line) => console.log(`[RED] ${line}`),
    });

    exitCode = decideExit(results);
    if (exitCode === 0) {
      console.error('RED_TEST_FAIL: model gia/rac van duoc cham OK (exit 0) — may cham KHONG biet do.');
    } else {
      console.log(`RED_TEST_OK: may cham bao do dung nhu ky vong (exit ${exitCode} != 0).`);
    }
  } finally {
    await closeDb();
  }
  // §3c chi doi hoi CHUNG MINH may cham biet do (exit khac 0 khi model gia/
  // rac) — luon thoat 0 O CHINH kich ban RED nay khi chung minh thanh cong,
  // de phan biet voi "kich ban RED bi loi ha tang / khong chay duoc".
  process.exit(exitCode === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`RED_TEST_ERROR: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
