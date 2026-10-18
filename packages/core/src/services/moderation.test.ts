// moderation.test.ts (THUAN) — decideVerdict (SPEC-P05 §3, D41/F5): model `ok` BAC luoi hard; triage null ⇒ luoi van quyet.
import { describe, expect, it } from 'vitest';
import type { CommunityTriage } from '../domain/types.js';
import type { GridResult } from './moderation-grid.js';
import { decideVerdict } from './moderation.js';

const cfg = { scamMin: 0.85, spamMin: 0.75 };
const tri = (verdict: CommunityTriage['verdict'], confidence: number): CommunityTriage =>
  ({ verdict, confidence, is_question: false, question_confidence: 0.1, lead_intent: false, lead_confidence: 0.1, wants_private: false });
const scam: GridResult = { hits: ['scam_phrase'], hard: true };
const burst: GridResult = { hits: ['repeat_burst'], hard: true };

describe('decideVerdict — F5 (model bac luoi)', () => {
  it('scam_phrase + triage ok ⇒ ok, ghi nhan luoi bi bac (audit o ben goi)', () => {
    const d = decideVerdict(scam, tri('ok', 0.9), cfg);
    expect(d.verdict).toBe('ok');
    expect(d.overruled).toEqual(['scam_phrase']);
  });
  it('repeat_burst + triage ok ⇒ ok, bi bac', () => {
    const d = decideVerdict(burst, tri('ok', 0.9), cfg);
    expect(d.verdict).toBe('ok');
    expect(d.overruled).toEqual(['repeat_burst']);
  });
  it('triage null (qua han / tin goi bot) ⇒ luoi van quyet: scam 0.95 source grid, khong bi bac', () => {
    const d = decideVerdict(scam, null, cfg);
    expect(d).toMatchObject({ verdict: 'scam', confidence: 0.95, source: 'grid' });
    expect(d.overruled ?? []).toEqual([]);
  });
  it('triage khong phai ok (spam) ⇒ luoi hard van quyet, khong bi bac', () => {
    const d = decideVerdict(burst, tri('spam', 0.8), cfg);
    expect(d).toMatchObject({ verdict: 'spam', source: 'grid' });
    expect(d.overruled ?? []).toEqual([]);
  });
  it('hit mem khong ai bac: link_flood + triage ok ⇒ ok, khong overruled', () => {
    const d = decideVerdict({ hits: ['link_flood'], hard: false }, tri('ok', 0.9), cfg);
    expect(d.verdict).toBe('ok');
    expect(d.overruled ?? []).toEqual([]);
  });
  it('scam_phrase + repeat_burst cung luc + triage ok ⇒ ok, ghi ca hai hit bi bac', () => {
    const d = decideVerdict({ hits: ['repeat_burst', 'scam_phrase'], hard: true }, tri('ok', 0.95), cfg);
    expect(d.verdict).toBe('ok');
    expect(d.overruled).toEqual(['repeat_burst', 'scam_phrase']);
  });
  it('hit mem + triage null ⇒ unsure (khong doi)', () => {
    expect(decideVerdict({ hits: ['mass_mention'], hard: false }, null, cfg).verdict).toBe('unsure');
  });
});
