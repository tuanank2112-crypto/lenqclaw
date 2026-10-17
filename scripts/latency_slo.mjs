#!/usr/bin/env node
// scripts/latency_slo.mjs — G23 (TESTING-ACCEPTANCE §4, SPEC-D31 §1/§16): do SLO toc do tra loi tren kenh gia lap.
//   node --env-file=.env --import tsx scripts/latency_slo.mjs --n 20 [--fake-delay-ms X] [--block-ms Y]
// Tao 2 nhom sim, chay dispatcher THAT (runDispatcher, RUNNER_CONCURRENCY tu env), gui n tin phiem (lan fast) + n cau
// hoi tai lieu (lan rag) + 1 ca HOL (tin KHONG goi bot cung nhom 300 ms truoc, + tuy chon thread khac treo --block-ms),
// roi do `reply_latency.runtime_ms` (= outbox.created_at − inbound_events.received_at) theo lan.
//   Model THAT (mac dinh: MODEL_COMMUNITY_FAST / provider cua .env) hoac model GIA tre --fake-delay-ms (ca DO).
//   Ngung dat: p95 runtime fast ≤ 3500, rag ≤ 12500; deadline_hit ≤ 5%/lan; phan lan dung ≥ 90%; ca HOL ≤ 3500.
//   Exit 0 dat · 1 truot · 3 blocked (thieu credential, preflight model that loi > 10%, hoac > 10% luot do loi model that 429/5xx — agent_runs 'error'
//   hoac 'deadline' ket thuc som < 60% ngan sach lan) · 2 loi su dung/he thong.

import { randomUUID } from 'node:crypto';

const FAST_MAX_MS = 3500;
const RAG_MAX_MS = 12500;
const DEADLINE_HIT_MAX = 0.05;
const LANE_ACCURACY_MIN = 0.9;
const BLOCKED_ERROR_RATE = 0.1;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const N = Number(arg('n', 20));
const FAKE_DELAY = arg('fake-delay-ms', null) === null ? null : Number(arg('fake-delay-ms'));
const BLOCK_MS = Number(arg('block-ms', 0));
if (!Number.isInteger(N) || N < 1 || (FAKE_DELAY !== null && !(FAKE_DELAY >= 0)) || !(BLOCK_MS >= 0)) {
  console.error('G23_USAGE: --n <so nguyen >= 1> [--fake-delay-ms <ms>] [--block-ms <ms>]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

if (!process.env.DATABASE_URL) {
  console.error('G23_ERROR: thieu DATABASE_URL (chay voi --env-file=.env).');
  process.exit(2);
}
process.env.DATA_MODE = process.env.DATA_MODE || 'sim';

// ---- credential model THAT ----
const realMode = FAKE_DELAY === null;
if (realMode) {
  const provider = (process.env.MODEL_PROVIDER || 'gemini').toLowerCase();
  const keyName = { gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', vyce: 'VYCE_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[provider];
  const key = keyName ? (process.env[keyName] || '').trim() : '';
  if (!key || /^changeme|^sk-ant-changeme/i.test(key)) {
    console.log(`G23 RESULT: BLOCKED (thieu credential ${keyName ?? provider}; khong chay model that)`);
    process.exit(3);
  }
}

const core = await import('../packages/core/src/adapters/db.ts');
const { sql, closeDb } = core;
const { simInbound } = await import('../packages/core/src/sim/sim-transport.ts');
const { routeInboundEvent } = await import('../packages/core/src/agent/community/router.ts');
const { runDispatcher } = await import('../packages/core/src/runner/inbound-runner.ts');
const { readCommunityConfig } = await import('../packages/core/src/services/community-config.ts');
const { runSeed } = await import('../packages/core/src/db/seed.ts');
const { runSeedSim } = await import('../packages/core/src/db/seed-sim.ts');
const { invalidatePersonaCache } = await import('../packages/core/src/agent/community/persona.ts');
const modelMod = await import('../packages/core/src/adapters/model.ts');

// ---- model GIA (ca do): tre co dinh, ton trong init.signal, quyet dinh lan theo noi dung ----
function installFake(delayMs) {
  process.env.MODEL_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'fake-g23';
  process.env.MODEL_FALLBACKS = '';
  const wait = (signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error('aborted'));
      });
    });
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  const community = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    await wait(init?.signal ?? undefined);
    const parts = body.contents.flatMap((c) => c.parts);
    const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('\n');
    const responses = parts.filter((p) => p.functionResponse).map((p) => p.functionResponse.name);
    const focus = (text.split('<<<untrusted focus>>>')[1] ?? '');
    const id = /\[#(\d+) uid=/.exec(focus)?.[1];
    const usage = { promptTokenCount: 10, candidatesTokenCount: 5 };
    const call = (name, args) => json({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] }, finishReason: 'STOP' }], usageMetadata: usage });
    const last = responses[responses.length - 1];
    if (last === 'send_group_message') return json({ candidates: [{ content: { parts: [{ text: 'xong' }] }, finishReason: 'STOP' }], usageMetadata: usage });
    if (last === 'search_knowledge') return call('send_group_message', { text: 'Theo tài liệu: agent tự chọn công cụ, chatbot kịch bản thì không.', ...(id ? { reply_to_msg_id: id } : {}) });
    if (focus.includes('(theo tài liệu)')) return call('search_knowledge', { query: 'AI agent khác chatbot kịch bản' });
    return call('send_group_message', { text: 'Chào bạn, mình đây!', ...(id ? { reply_to_msg_id: id } : {}) });
  };
  const triage = async (_url, init) => {
    await wait(init?.signal ?? undefined);
    return json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: 'ok', confidence: 0.9, is_question: false, question_confidence: 0.1, lead_intent: false, lead_confidence: 0.1, wants_private: false }) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
  };
  modelMod.setGeminiFetchForTest(community);
  modelMod.setTriageFetchForTest(triage);
}
if (!realMode) installFake(FAKE_DELAY);

// ---- preflight model THAT: 5 loi goi ngan truoc khi do; > 10% loi (401/429/5xx/mang) ⇒ BLOCKED (exit 3), khong do ----
let preflightErrors = 0;
if (realMode) {
  const PRE = 5;
  const errs = [];
  for (let i = 0; i < PRE; i++) {
    try {
      await modelMod.callModel({
        route: 'community',
        tier: 'fast',
        system: 'Trả lời đúng một chữ: ok',
        messages: [{ role: 'user', content: 'ok?' }],
      });
    } catch (err) {
      preflightErrors += 1;
      errs.push(err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 160) : String(err).slice(0, 160));
    }
  }
  if (preflightErrors / PRE > BLOCKED_ERROR_RATE) {
    console.log(JSON.stringify({ preflight: { calls: PRE, errors: preflightErrors, first_error: errs[0] ?? null } }));
    console.log(`G23 RESULT: BLOCKED (model that loi ${preflightErrors}/${PRE} lan goi thu > 10%: 401/429/5xx/mang — khong do SLO)`);
    await closeDb();
    process.exit(3);
  }
}

// ---- du lieu ----
await runSeed();
await runSeedSim();
invalidatePersonaCache();
const cfg = readCommunityConfig();
const tag = randomUUID().slice(0, 8);
const gA = `slo-a-${tag}`;
const gB = `slo-b-${tag}`;
for (const [id, mod] of [[gA, true], [gB, false]]) {
  await sql(
    `insert into zalo_groups (zalo_account_id, thread_id, name, enabled, mode, moderation_enabled, budget_per_hour)
     values ('community', $1, $2, true, 'mention', $3, 1000)`,
    [id, `Nhóm đo SLO ${id}`, mod]
  );
}
await sql(`update inbound_events set processed_at = now() where processed_at is null`);

const startedAt = new Date();
const ctl = new AbortController();
const dispatcher = runDispatcher({
  signal: ctl.signal,
  concurrency: cfg.runnerConcurrency,
  intervalMs: cfg.runnerPollMs,
  timers: false,
  heartbeat: false,
  handler: async (e) => {
    if (e.zaloMsgId.startsWith('slo-block-')) {
      await sleep(BLOCK_MS); // handler treo o nhom khac (ca do 3)
      return;
    }
    await routeInboundEvent(e);
  },
});

async function send(thread, uid, text, mentionBot, prefix = 'slo') {
  const msgId = `${prefix}-${randomUUID()}`;
  const r = await simInbound({ account: 'community', threadId: thread, threadType: 'group', senderUid: uid, text, msgId, mentionBot });
  return r.id;
}

async function waitTurn(eventId, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await sql(
      `select t.id::text as id, t.lane, t.outcome, t.deadline_hit,
              (extract(epoch from (o.created_at - t.received_at)) * 1000)::int as runtime_ms
         from turn_traces t
         left join lateral (select * from outbox x where x.inbound_event_id = t.inbound_event_id and x.kind = 'text'
                             order by x.id limit 1) o on true
        where t.inbound_event_id = $1`,
      [eventId]
    );
    if (r[0]) return r[0];
    await sleep(25);
  }
  return null;
}

const CASUAL = 'Chào bạn, hôm nay bạn thế nào?';
const RAG_Q = 'Cho mình hỏi AI agent khác chatbot kịch bản ở điểm nào? (theo tài liệu)';
const samples = { fast: [], rag: [] };
let errorTurns = 0;
let totalTurns = 0;

async function measure(kind, uid) {
  const text = kind === 'fast' ? CASUAL : RAG_Q;
  const id = await send(gA, uid, text, true);
  const row = await waitTurn(id);
  totalTurns += 1;
  if (!row) {
    samples[kind].push({ missing: true, runtime_ms: null, lane: null, deadline_hit: false, outcome: 'timeout' });
    return;
  }
  // model that LOI (429/5xx/401…) khac model CHAM: agent_runs 'error', hoac 'deadline' ket thuc SOM (< 60% ngan sach cua lan —
  // khong du gio lui retry sau loi) ⇒ dem cho nguong "blocked". Model cham that (deadline sat ngan sach) van la SLO truot.
  if (realMode && row.outcome === 'model_down') {
    const budget = row.lane === 'rag' ? cfg.laneRagDeadlineMs : cfg.laneFastDeadlineMs;
    const runs = await sql(`select outcome, latency_ms from agent_runs where turn_id = $1::uuid and route = 'community'`, [row.id]);
    if (runs.some((r) => r.outcome === 'error' || (r.outcome === 'deadline' && r.latency_ms < 0.6 * budget))) errorTurns += 1;
  }
  samples[kind].push(row);
}

for (let i = 0; i < N; i++) await measure('fast', `sim-mem-${(i % 4) + 1}`);
for (let i = 0; i < N; i++) await measure('rag', `sim-mem-${(i % 4) + 1}`);

// ---- ca HOL: thread khac treo (tuy chon) + tin KHONG goi bot cung nhom 300 ms truoc tin goi bot ----
let hol = null;
{
  if (BLOCK_MS > 0) await send(gB, 'sim-mem-5', 'tin lam treo handler', false, 'slo-block');
  await sleep(50);
  await send(gA, 'sim-mem-2', 'mọi người ơi tối nay ai rảnh không?', false);
  await sleep(300);
  const id = await send(gA, 'sim-mem-1', CASUAL, true);
  hol = await waitTurn(id);
  totalTurns += 1;
  if (realMode && hol?.outcome === 'model_down') {
    const runs = await sql(`select outcome, latency_ms from agent_runs where turn_id = $1::uuid and route = 'community'`, [hol.id]);
    if (runs.some((r) => r.outcome === 'error' || (r.outcome === 'deadline' && r.latency_ms < 0.6 * cfg.laneFastDeadlineMs))) errorTurns += 1;
  }
}

ctl.abort();
await dispatcher;

// ---- tong ket ----
const summary = {};
const fails = [];
for (const lane of ['fast', 'rag']) {
  const rows = samples[lane].filter((r) => !r.missing);
  const rt = rows.map((r) => r.runtime_ms).filter((x) => x !== null);
  const dl = rows.length ? rows.filter((r) => r.deadline_hit).length / rows.length : 1;
  const correct = rows.length ? rows.filter((r) => r.lane === lane).length / samples[lane].length : 0;
  const p95 = pct(rt, 95);
  summary[lane] = { n: samples[lane].length, answered: rt.length, p50: pct(rt, 50), p95, deadline_hit_rate: Number(dl.toFixed(3)), lane_accuracy: Number(correct.toFixed(3)) };
  const max = lane === 'fast' ? FAST_MAX_MS : RAG_MAX_MS;
  if (p95 === null) fails.push(`${lane}: khong co tin tra loi nao`);
  else if (p95 > max) fails.push(`${lane}: p95 runtime ${p95} ms > ${max}`);
  if (dl > DEADLINE_HIT_MAX) fails.push(`${lane}: deadline_hit ${(dl * 100).toFixed(1)}% > 5%`);
  if (correct < LANE_ACCURACY_MIN) fails.push(`${lane}: phan lan dung ${(correct * 100).toFixed(1)}% < 90%`);
}
const holMs = hol?.runtime_ms ?? null;
summary.hol = { runtime_ms: holMs, lane: hol?.lane ?? null, outcome: hol?.outcome ?? 'timeout' };
if (holMs === null) fails.push('HOL: khong co tin tra loi');
else if (holMs > FAST_MAX_MS) fails.push(`HOL: runtime ${holMs} ms > ${FAST_MAX_MS}`);

const errorRate = totalTurns ? errorTurns / totalTurns : 0;
const config = {
  mode: realMode ? 'real' : `fake(${FAKE_DELAY}ms)`,
  n: N,
  concurrency: cfg.runnerConcurrency,
  lane_fast_deadline_ms: cfg.laneFastDeadlineMs,
  lane_rag_deadline_ms: cfg.laneRagDeadlineMs,
  block_ms: BLOCK_MS,
  provider: process.env.MODEL_PROVIDER || 'gemini',
  model_fast: process.env.MODEL_COMMUNITY_FAST || '(mac dinh theo provider)',
  since: startedAt.toISOString(),
};
console.log(JSON.stringify({ config, summary, error_rate: Number(errorRate.toFixed(3)) }, null, 2));

await sql(`update inbound_events set processed_at = coalesce(processed_at, now()) where thread_id = any($1::text[])`, [[gA, gB]]);
// dong dem `out-<outbox_id>` cua nhom do khong duoc de lai (test khac dung id co dinh `out-9001`)
await sql(`delete from group_messages where thread_id = any($1::text[])`, [[gA, gB]]);
await closeDb();

if (realMode && errorRate > BLOCKED_ERROR_RATE) {
  console.log(`G23 RESULT: BLOCKED (${(errorRate * 100).toFixed(1)}% luot do loi model that 429/5xx/401… > 10% — khong ket luan SLO)`);
  process.exit(3);
}
if (fails.length > 0) {
  for (const f of fails) console.log(`G23 FAIL: ${f}`);
  console.log('G23 RESULT: FAIL');
  process.exit(1);
}
console.log('G23 RESULT: PASS');
process.exit(0);
