// Bang chung DO tam thoi (khong thuoc repo) cho scripts/eval/vendor-intent.mjs:
// model tra RAC (JSON hong) => parseVendorTriage/triageVendorMessage tra null
// cho MOI ca => claim_recall tut duoi nguong tren cac ca claim khong khop
// luoi tat dinh (BANG NHAU) => script phai bao FAIL/exit khac 0.
process.env.MODEL_PROVIDER = 'anthropic';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lq_h13';

const { setTriageClientForTest } = await import('file:///D:/lenqclaw/packages/core/src/adapters/model.ts');
const { triageVendorMessage } = await import('file:///D:/lenqclaw/packages/core/src/agent/vendor-triage.ts');
const { matchesClaimPhrase } = await import('file:///D:/lenqclaw/packages/core/src/agent/vendor-intent.ts');
const { closeDb } = await import('file:///D:/lenqclaw/packages/core/src/adapters/db.ts');
const fs = await import('node:fs/promises');

setTriageClientForTest({
  messages: {
    async create() {
      return {
        id: 'msg_fake',
        content: [{ type: 'text', text: 'rac khong phai json', citations: null }],
        model: 'fake',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, input_tokens: 1, output_tokens: 1, server_tool_use: null, service_tier: null },
      };
    },
  },
});

const raw = await fs.readFile('D:/lenqclaw/evals/golden/vendor_intent.jsonl', 'utf8');
const cases = raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));

let claimTotal = 0;
let claimHits = 0;
let falseClaimCount = 0;
const threshold = 0.6;

for (const c of cases) {
  const triage = await triageVendorMessage(c.text, [], null);
  const claimEvidence =
    matchesClaimPhrase(c.text, c.expect_job_code ?? null) ||
    (!!triage && triage.intent === 'claim' && triage.intent_confidence >= threshold);
  if (c.expect_intent === 'claim') {
    claimTotal++;
    if (claimEvidence) claimHits++;
  } else if (claimEvidence) {
    falseClaimCount++;
  }
}

const claimRecall = claimTotal > 0 ? claimHits / claimTotal : 1;
console.log(`[RED] model tra rac (JSON hong) => triageVendorMessage() luon null.`);
console.log(`[RED] claim_recall=${claimRecall.toFixed(3)} (${claimHits}/${claimTotal}) — nguong that ${'>= 0.95'} => ${claimRecall >= 0.95 ? 'DAT (SAI, phai la DO)' : 'KHONG DAT (dung — may cham biet do)'}`);
console.log(`[RED] false_claim=${falseClaimCount}`);
await closeDb();
process.exit(claimRecall >= 0.95 && falseClaimCount === 0 ? 0 : 1);
