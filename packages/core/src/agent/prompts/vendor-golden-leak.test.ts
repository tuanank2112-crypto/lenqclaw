// packages/core/src/agent/prompts/vendor-golden-leak.test.ts — H13 §7 (SO
// vong 2, R13 🔁): may do CHONG TAI PHAM viec dap an golden lot vao prompt
// ("CẤM chèn đáp án golden vào prompt" — SPEC-P05-Dispatch.md §10.4.1(e)).
// Chuan hoa (NFD bo dau, đ->d, chu thuong, chi giu [a-z0-9 -]) MOI chuoi
// trong ngoac kep cua hai prompt tho (`vendor-triage.ts`, `vendor.ts`) roi
// so BANG NHAU (khong phai chua) voi `text` cua MOI ca trong
// `evals/golden/vendor_intent.jsonl` — trung mot cai la do, ca hai lop mo
// vong deu phai sach (0 trung) de dam bao golden do dung HIEU Y, khong do
// TRI NHO cau chu.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/core/src/agent/prompts -> len 5 cap la goc repo.
const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const GOLDEN_FILE = path.join(ROOT, 'evals', 'golden', 'vendor_intent.jsonl');
const PROMPT_FILES = [
  path.join(__dirname, 'vendor-triage.ts'),
  path.join(__dirname, 'vendor.ts'),
];

/** Chuan hoa dung CONG THUC cua H13 §7: NFD bo dau, đ/Đ -> d/D, chu thuong,
 * chi giu [a-z0-9 -], gop khoang trang. Xuat rieng de test JSON hong doc lap
 * (tuong tu `normalizeVi` cua agent/pii.ts nhung KHONG dung lai file do —
 * pham vi handoff nay chi duoc sua prompt + test moi). */
export function normalizeForLeakCheck(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lay MOI chuoi nam trong ngoac kep "..." cua mot file nguon (khong phan
 * biet do la vi du, nhan enum, hay mau cau). */
export function extractQuotedStrings(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/"([^"]*)"/g)) {
    out.push(m[1]!);
  }
  return out;
}

interface GoldenCase {
  case_id: string;
  text: string;
}

function loadGoldenCases(): GoldenCase[] {
  const raw = readFileSync(GOLDEN_FILE, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as GoldenCase);
}

describe('Chong lot dap an golden vao prompt tho (H13 §7)', () => {
  it('KHONG co chuoi nao trong prompt trung (sau chuan hoa) voi text cua bat ky ca golden nao', () => {
    const cases = loadGoldenCases();
    const goldenNorm = new Map<string, string[]>(); // normalized text -> case_ids
    for (const c of cases) {
      const key = normalizeForLeakCheck(c.text);
      if (key.length === 0) continue;
      const ids = goldenNorm.get(key) ?? [];
      ids.push(c.case_id);
      goldenNorm.set(key, ids);
    }

    const leaks: string[] = [];
    for (const file of PROMPT_FILES) {
      const source = readFileSync(file, 'utf8');
      const quoted = extractQuotedStrings(source);
      for (const q of quoted) {
        const key = normalizeForLeakCheck(q);
        if (key.length === 0) continue;
        const hitIds = goldenNorm.get(key);
        if (hitIds) {
          leaks.push(`${path.basename(file)}: "${q}" == ${hitIds.join(',')} ("${key}")`);
        }
      }
    }

    expect(leaks, `Prompt chua nguyen van cau golden (dap an lot vao prompt):\n${leaks.join('\n')}`).toEqual([]);
  });

  it('golden co it nhat 60 ca (TESTING-ACCEPTANCE §3)', () => {
    expect(loadGoldenCases().length).toBeGreaterThanOrEqual(60);
  });
});
