// packages/core/src/agent/pii.test.ts — test khong can DB (`npm test`):
// detectEmergency lop 1 (SPEC-P03-Resident-Agent.md §11.1) + golden
// `emergency.jsonl` + `redactPii`.
//
// §11.1: "Nguong (trong npm test, khong model): 0 bao nham tren bo gan-giong
// + 0/70 ca golden diagnosis/responsibility. Do phu cua lop 1 chi ghi so,
// khong chan cong — phu la viec cua lop 2." => lop 1 KHONG con bi doi "0 bo
// sot" tren TOAN BO emergency.jsonl nhu ban Đ20 cu; chi con 2 dieu kien
// CUNG bat buoc: (a) 0 bao nham tren cac ca `expect_emergency:false`
// (bo gan-giong) cua chinh emergency.jsonl; (b) 0/70 ca golden
// diagnosis.jsonl+responsibility.jsonl bi bat nham la khan cap.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectEmergency, normalizeVi, redactPii } from './pii.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const GOLDEN_DIR = path.join(REPO_ROOT, 'evals', 'golden');

interface EmergencyCase {
  case_id: string;
  text: string;
  expect_emergency: boolean;
}

function loadJsonl<T>(file: string): T[] {
  const content = readFileSync(path.join(GOLDEN_DIR, file), 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

describe('normalizeVi', () => {
  it('bo dau, ha chu thuong, gop khoang trang', () => {
    expect(normalizeVi('Cháy  ở   Tầng 3!')).toBe('chay o tang 3');
    expect(normalizeVi('Đèn')).toBe('den');
  });
});

describe('detectEmergency — lop 1 tat dinh (SPEC-P03 §11.1)', () => {
  const cases = loadJsonl<EmergencyCase>('emergency.jsonl');
  const nearMiss = cases.filter((c) => !c.expect_emergency);
  const emergencyCases = cases.filter((c) => c.expect_emergency);

  it('golden emergency.jsonl co it nhat 100 ca (>=50 khan cap + >=50 gan giong)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
    expect(emergencyCases.length).toBeGreaterThanOrEqual(50);
    expect(nearMiss.length).toBeGreaterThanOrEqual(50);
  });

  it('0 bao nham tren bo GAN GIONG (expect_emergency=false) — nguong bat buoc cua lop 1', () => {
    const falsePositives = nearMiss.filter((c) => detectEmergency(c.text) !== null);
    if (falsePositives.length > 0) {
      // eslint-disable-next-line no-console
      console.log('false positives:', falsePositives.map((c) => `${c.case_id}: ${c.text}`));
    }
    expect(falsePositives.length).toBe(0);
  });

  it('0/70 ca golden diagnosis.jsonl+responsibility.jsonl bi lop 1 bat nham khan cap', () => {
    const diag = loadJsonl<{ case_id: string; text: string }>('diagnosis.jsonl');
    const resp = loadJsonl<{ case_id: string; symptom_query: string }>('responsibility.jsonl');
    const fd = diag.filter((c) => detectEmergency(c.text) !== null);
    const fr = resp.filter((c) => detectEmergency(c.symptom_query) !== null);
    expect(fd.length + fr.length).toBe(0);
  });

  it('do phu lop 1 tren bo khan cap (chi ghi so, KHONG chan cong)', () => {
    const missed = emergencyCases.filter((c) => detectEmergency(c.text) === null);
    // eslint-disable-next-line no-console
    console.log(`lop 1 phu ${emergencyCases.length - missed.length}/${emergencyCases.length} ca khan cap (con lai giao lop 2).`);
    expect(missed.length).toBeLessThanOrEqual(emergencyCases.length);
  });
});

describe('redactPii — che SDT/ma can truoc khi gui model (SPEC-P03 §11.3)', () => {
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

  it('giu nguyen ma cuoc cua chinh cu dan khi opts.keepJobCodes (G8)', () => {
    expect(redactPii('Cuoc C-2345 cua em sao roi', { keepJobCodes: ['C-2345'] })).toContain('C-2345');
  });
});
