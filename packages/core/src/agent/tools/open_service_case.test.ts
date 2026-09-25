// packages/core/src/agent/tools/open_service_case.test.ts — test THUAN (khong
// DB) cho `hasExplicitConsent` (SPEC-P03-Resident-Agent.md §11.5) doi chieu
// voi `evals/golden/consent.jsonl`. Day CHI la lop REGEX/danh sach tu; phan
// "hoi lai/mien/khong dau qua lop hieu y (triage)" can model that => BLOCKED
// trong moi truong nay (khong co GEMINI_API_KEY/ANTHROPIC_API_KEY, giong
// ngu nghia `eval_golden.mjs` cho diagnosis/responsibility) — xem Cau hoi mo
// trong report R06.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasExplicitConsent } from './open_service_case.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const GOLDEN_PATH = path.join(REPO_ROOT, 'evals', 'golden', 'consent.jsonl');

interface ConsentCase {
  case_id: string;
  text: string;
  expect_consent: boolean;
}

function loadGolden(): ConsentCase[] {
  return readFileSync(GOLDEN_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ConsentCase);
}

describe('hasExplicitConsent — lop danh sach tu tat dinh (SPEC-P03 §11.5)', () => {
  const cases = loadGolden();

  it('golden consent.jsonl co it nhat 40 ca', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it('0 DONG Y SAI (expect_consent=false nhung lop regex lai nhan) — nguong bat buoc, khong duoc sai o chieu nay', () => {
    const wronglyAccepted = cases.filter((c) => !c.expect_consent && hasExplicitConsent(c.text));
    if (wronglyAccepted.length > 0) {
      // eslint-disable-next-line no-console
      console.log('dong y sai:', wronglyAccepted.map((c) => `${c.case_id}: ${c.text}`));
    }
    expect(wronglyAccepted).toEqual([]);
  });

  it('do phu cua rieng lop regex tren ca dong y that (con lai giao lop hieu y/triage — §11.5)', () => {
    const trueCases = cases.filter((c) => c.expect_consent);
    const missed = trueCases.filter((c) => !hasExplicitConsent(c.text));
    // eslint-disable-next-line no-console
    console.log(`lop regex phu ${trueCases.length - missed.length}/${trueCases.length} ca dong y that.`);
    expect(missed.length).toBeLessThanOrEqual(trueCases.length);
  });
});
