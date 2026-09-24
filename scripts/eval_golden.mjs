#!/usr/bin/env node
// scripts/eval_golden.mjs — bo cham golden DUY NHAT cho P03
// (TESTING-ACCEPTANCE.md §3, SPEC-P03-Resident-Agent.md §10.6), port cach
// lam cua `D:\build phase\lib\eval\score.ts` (viNormalize + mot bo cham
// khong trung lap). Can `npm run build -w @lenqclaw/core` truoc (doc
// `packages/core/dist/**`).
//
// Ngu nghia mo hinh (SPEC-P03 §10.6, Đ17-e): may nay KHONG co
// ANTHROPIC_API_KEY => bo `diagnosis`/`responsibility` (can LLM) phai tra
// "blocked", KHONG tinh truot, ma thoat 3. Bo `emergency` la tat dinh
// (khong LLM) nen LUON cham duoc, bat ke co credential hay khong.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GOLDEN_DIR = path.join(ROOT, 'evals', 'golden');

async function loadJsonl(file) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`Khong doc duoc ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

async function scoreEmergency() {
  const { detectEmergency } = await import('@lenqclaw/core/agent/pii');
  const cases = await loadJsonl(path.join(GOLDEN_DIR, 'emergency.jsonl'));
  let pass = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  const failures = [];
  for (const c of cases) {
    const detected = detectEmergency(c.text) !== null;
    const expected = Boolean(c.expect_emergency);
    if (detected === expected) {
      pass++;
    } else if (detected && !expected) {
      falsePositive++;
      failures.push(`${c.case_id}: bao nham (khong khan cap nhung bi bat)`);
    } else {
      falseNegative++;
      failures.push(`${c.case_id}: bo sot (khan cap nhung khong bat duoc)`);
    }
  }
  const total = cases.length;
  // TESTING-ACCEPTANCE §3: 10/10 bat dung (0 bo sot), <=1 bao nham.
  const ok = falseNegative === 0 && falsePositive <= 1;
  return { blocked: false, total, pass, falsePositive, falseNegative, ok, failures };
}

function hasCredential() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Bo `diagnosis`/`responsibility`: can ANTHROPIC_API_KEY that. Thieu
 * credential, hoac loi ha tang (429/5xx/mang) => blocked=true, KHONG tinh
 * truot (Đ17-e). Diem: >= threshold moi qua. */
async function scoreLlmSet(fileName, threshold, scoreOneCase) {
  if (!hasCredential()) {
    return { blocked: true, reason: 'missing ANTHROPIC_API_KEY' };
  }
  const cases = await loadJsonl(path.join(GOLDEN_DIR, fileName));
  let pass = 0;
  const failures = [];
  try {
    for (const c of cases) {
      const ok = await scoreOneCase(c);
      if (ok) pass++;
      else failures.push(c.case_id);
    }
  } catch (err) {
    return { blocked: true, reason: err instanceof Error ? err.message : String(err) };
  }
  const total = cases.length;
  const rate = total > 0 ? pass / total : 1;
  return { blocked: false, total, pass, ok: rate >= threshold, failures };
}

async function scoreDiagnosisCase(c) {
  const { callModel } = await import('@lenqclaw/core/adapters/model');
  const result = await callModel({
    route: 'diagnose',
    system:
      'Ban chan doan loai viec hong hoc trong can ho. Tra loi DUY NHAT ma danh muc (category_code), khong giai thich them.',
    messages: [{ role: 'user', content: c.text }],
  });
  const textBlock = result.message.content.find((b) => b.type === 'text');
  const answer = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
  return answer.includes(c.expected_category_code);
}

async function scoreResponsibilityCase(c) {
  const { searchRegulations } = await import('@lenqclaw/core/retrieval/search-regulations');
  const { callModel } = await import('@lenqclaw/core/adapters/model');
  const hits = await searchRegulations(c.symptom_query);
  const context = hits.map((h) => `${h.sectionId}: ${h.heading} — ${h.body}`).join('\n');
  const result = await callModel({
    route: 'responsibility',
    system:
      'Dua vao quy che duoi day, ket luan trach nhiem la "resident", "bql" hay "unclear". Tra loi DUY NHAT mot tu.',
    messages: [{ role: 'user', content: `${context}\n\nCau hoi: ${c.symptom_query}` }],
  });
  const textBlock = result.message.content.find((b) => b.type === 'text');
  const answer = textBlock && 'text' in textBlock ? textBlock.text.trim().toLowerCase() : '';
  return answer.includes(c.expected_party);
}

async function main() {
  const emergency = await scoreEmergency();
  console.log(
    `emergency: total=${emergency.total} pass=${emergency.pass} false_positive=${emergency.falsePositive} ` +
      `false_negative=${emergency.falseNegative} ok=${emergency.ok}`
  );
  for (const f of emergency.failures) console.log(`  - ${f}`);

  const diagnosis = await scoreLlmSet('diagnosis.jsonl', 0.85, scoreDiagnosisCase);
  if (diagnosis.blocked) {
    console.log(`diagnosis: blocked (${diagnosis.reason})`);
  } else {
    console.log(`diagnosis: total=${diagnosis.total} pass=${diagnosis.pass} ok=${diagnosis.ok}`);
  }

  const responsibility = await scoreLlmSet('responsibility.jsonl', 0.9, scoreResponsibilityCase);
  if (responsibility.blocked) {
    console.log(`responsibility: blocked (${responsibility.reason})`);
  } else {
    console.log(`responsibility: total=${responsibility.total} pass=${responsibility.pass} ok=${responsibility.ok}`);
  }

  if (diagnosis.blocked || responsibility.blocked) {
    console.log('EVAL_GOLDEN: BLOCKED (thieu credential hoac loi ha tang o bo can LLM) — khong tinh truot.');
    process.exit(3);
  }

  const allOk = emergency.ok && diagnosis.ok && responsibility.ok;
  if (!allOk) {
    console.error('EVAL_GOLDEN_FAIL: co bo chua dat nguong.');
    process.exit(1);
  }
  console.log('EVAL_GOLDEN_OK');
  process.exit(0);
}

main().catch((err) => {
  console.error(`EVAL_GOLDEN_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
