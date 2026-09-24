// packages/core/src/agent/pii.test.ts — test khong can DB (`npm test`):
// detectEmergency (BB-06, tat dinh) + golden `emergency.jsonl` chay ngay
// trong `npm test` (SPEC-P03-Resident-Agent.md §10.6, §9) + redactPii.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectEmergency, normalizeVi, redactPii } from './pii.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const GOLDEN_PATH = path.join(REPO_ROOT, 'evals', 'golden', 'emergency.jsonl');

interface EmergencyCase {
  case_id: string;
  text: string;
  expect_emergency: boolean;
}

function loadGolden(): EmergencyCase[] {
  const content = readFileSync(GOLDEN_PATH, 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as EmergencyCase);
}

describe('normalizeVi', () => {
  it('bo dau, ha chu thuong, gop khoang trang', () => {
    expect(normalizeVi('Cháy  ở   Tầng 3!')).toBe('chay o tang 3');
    expect(normalizeVi('Đèn')).toBe('den');
  });
});

describe('detectEmergency — golden emergency.jsonl (SPEC-P03 §9: 10/10 bat, <=1 bao nham)', () => {
  const cases = loadGolden();

  it('bo golden co du 20 ca (10 khan cap + 10 gan giong)', () => {
    expect(cases.length).toBe(20);
  });

  it.each(cases)('$case_id: expect_emergency=$expect_emergency', (c) => {
    const detected = detectEmergency(c.text) !== null;
    expect({ case_id: c.case_id, detected }).toEqual({ case_id: c.case_id, detected: c.expect_emergency });
  });

  it('tong hop: 0 bo sot, <=1 bao nham', () => {
    let falsePositive = 0;
    let falseNegative = 0;
    for (const c of cases) {
      const detected = detectEmergency(c.text) !== null;
      if (detected && !c.expect_emergency) falsePositive++;
      if (!detected && c.expect_emergency) falseNegative++;
    }
    expect(falseNegative).toBe(0);
    expect(falsePositive).toBeLessThanOrEqual(1);
  });
});

describe('redactPii — che SDT/ma can truoc khi gui model (SPEC-P03 §10.2)', () => {
  it('che so dien thoai dang 0xxxxxxxxx va +84', () => {
    expect(redactPii('Goi em so 0901234567 nhe')).toBe('Goi em so [SĐT] nhe');
    expect(redactPii('sdt +84901234567')).toBe('sdt [SĐT]');
  });

  it('che ma can dang chu-so (vd A-0101)', () => {
    expect(redactPii('Can A-0101 bi hong dieu hoa')).toBe('Can [CĂN] bi hong dieu hoa');
  });

  it('khong che chuoi khong khop mau', () => {
    expect(redactPii('Khong co thong tin nhay cam o day')).toBe('Khong co thong tin nhay cam o day');
  });
});
