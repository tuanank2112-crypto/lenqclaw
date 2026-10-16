// apps/zalo-worker/src/tools/pacer-sim.ts — gia lap pacer (dong ho ao, 0 mang, 0 DB) ⇒ in
// thoi diem gui + ket qua kiem bang pacer (verifySendLog doc lap voi PacerPolicy). Vi pham > 0 ⇒ exit 1.
//   mac dinh   : 50 tin ra cho 20 nguoi (DM), bang §5 ke hoach 01.
//   --group    : 100 tin vao 1 nhom (`sim-group-1`), ngan sach 20 tin/gio (BB-08, SPEC-P02 §5, §10 hang 5).
// Chay: node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts [--group] [seed]

import { readPacerConfig } from '../config.js';
import { BUDGET_WINDOW_MS, seededRng, simulatePacer } from '../pacer-policy.js';

const args = process.argv.slice(2);
const group = args.includes('--group');
const seedArg = args.find((a) => /^\d+$/.test(a));
const seed = Number(seedArg ?? 2026);
const cfg = readPacerConfig();

function runDm(): number {
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
  return r.violations.length === 0 && r.log.length === targets.length ? 0 : 1;
}

function runGroup(): number {
  const budget = 20;
  const total = 100;
  const targets = Array.from({ length: total }, () => 'sim-group-1');
  const r = simulatePacer(targets, cfg, seededRng(seed * 7), undefined, { budgetPerHour: budget });

  console.log(`pacer-sim --group seed=${seed} messages=${total} group=sim-group-1 budget_per_hour=${budget}`);
  console.log(`config: ${JSON.stringify(cfg)}`);
  console.log('--- thoi diem gui (giay tu t=0) ---');
  for (const e of r.log) console.log(`t=${(e.at / 1000).toFixed(0).padStart(6)}s  ${e.threadId}`);

  let minGap = Infinity;
  for (let i = 1; i < r.log.length; i++) minGap = Math.min(minGap, r.log[i]!.at - r.log[i - 1]!.at);
  const firstHour = r.log.filter((e) => e.at < BUDGET_WINDOW_MS).length;
  const secondHour = r.log.filter((e) => e.at >= BUDGET_WINDOW_MS && e.at < 2 * BUDGET_WINDOW_MS).length;
  let maxWindow = 0;
  for (const s of r.log) {
    maxWindow = Math.max(maxWindow, r.log.filter((e) => e.at >= s.at && e.at < s.at + BUDGET_WINDOW_MS).length);
  }
  console.log('--- kiem BB-08 ---');
  console.log(`sent=${r.log.length}/${total}  xong_luc=${(r.finishedAtMs / 3_600_000).toFixed(2)}h`);
  console.log(`first_hour: ${firstHour}`);
  console.log(`second_hour: ${secondHour}`);
  console.log(`min_gap_ms: ${minGap === Infinity ? 'n/a' : minGap} (yeu cau >= ${cfg.groupGapMs})`);
  console.log(`max_tin_trong_moi_cua_so_1_gio: ${maxWindow} (yeu cau <= ${budget})`);
  console.log(`violations: ${r.violations.length}`);
  for (const v of r.violations) console.log(`  ${v.rule} @${v.at}: ${v.detail}`);
  const ok = r.violations.length === 0 && r.log.length === total && firstHour === budget && minGap >= cfg.groupGapMs;
  return ok ? 0 : 1;
}

process.exit(group ? runGroup() : runDm());
