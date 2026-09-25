// apps/zalo-worker/src/tools/pacer-sim.ts — SPEC-P02 §8: gia lap 50 tin ra
// cho 20 nguoi (dong ho ao, 0 mang, 0 DB) ⇒ in thoi diem gui + ket qua kiem
// bang §5 (verifySendLog doc lap voi PacerPolicy). Vi pham > 0 ⇒ exit 1.
// Chay: npx tsx apps/zalo-worker/src/tools/pacer-sim.ts [seed]

import { readPacerConfig } from '../config.js';
import { seededRng, simulatePacer } from '../pacer-policy.js';

const seed = Number(process.argv[2] ?? 2026);
const cfg = readPacerConfig();
const rng = seededRng(seed);
const threads = Array.from({ length: 20 }, (_, i) => `u${String(i + 1).padStart(2, '0')}`);
const targets = [...threads];
while (targets.length < 50) targets.push(threads[Math.floor(rng() * threads.length)]!);

const r = simulatePacer(targets, cfg, seededRng(seed * 7));

console.log(`pacer-sim seed=${seed} messages=${targets.length} recipients=${new Set(targets).size}`);
console.log(`config: ${JSON.stringify(cfg)}`);
console.log('--- thoi diem gui (giay tu t=0) ---');
for (const e of r.log) console.log(`t=${(e.at / 1000).toFixed(0).padStart(5)}s  ${e.threadId}`);

let minGap = Infinity;
const last = new Map<string, number>();
for (const e of r.log) {
  const p = last.get(e.threadId);
  if (p !== undefined) minGap = Math.min(minGap, e.at - p);
  last.set(e.threadId, e.at);
}
let maxPerMinute = 0;
let maxRecipients = 0;
for (const s of r.log) {
  maxPerMinute = Math.max(maxPerMinute, r.log.filter((e) => e.at >= s.at && e.at < s.at + 60_000).length);
  maxRecipients = Math.max(
    maxRecipients,
    new Set(r.log.filter((e) => e.at >= s.at && e.at < s.at + cfg.recipientWindowMs).map((e) => e.threadId)).size
  );
}
console.log('--- kiem bang §5 ---');
console.log(`sent=${r.log.length}/${targets.length}  xong_luc=${(r.log[r.log.length - 1]!.at / 1000).toFixed(0)}s`);
console.log(`khoang_cach_cung_thread_nho_nhat=${minGap === Infinity ? 'n/a' : `${minGap} ms`} (yeu cau >= ${cfg.threadGapMs} ms)`);
console.log(`max_tin_trong_60s=${maxPerMinute} (yeu cau <= ${cfg.maxPerMinute})`);
console.log(`max_nguoi_nhan_trong_${cfg.recipientWindowMs / 60000}_phut=${maxRecipients} (yeu cau <= ${cfg.maxRecipients})`);
console.log(`violations: ${r.violations.length}`);
for (const v of r.violations) console.log(`  ${v.rule} @${v.at}: ${v.detail}`);
process.exit(r.violations.length === 0 && r.log.length === targets.length ? 0 : 1);
