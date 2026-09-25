// packages/core/src/agent/vendor-triage.test.ts — SPEC-P05-Dispatch.md
// §10.4.1: `parseVendorTriage` thuan (khong DB/model), mau
// agent/triage.test.ts (P03).

import { describe, expect, it } from 'vitest';
import { parseVendorTriage } from './vendor-triage.js';

describe('parseVendorTriage (§10.4.1)', () => {
  it('JSON hop le đầy đủ trường => VendorTriageResult', () => {
    const raw = '{"intent":"claim","intent_confidence":0.92,"job_code":"C-24A7","price_vnd":null,"trade_group":"dien_nuoc"}';
    expect(parseVendorTriage(raw)).toEqual({
      intent: 'claim',
      intent_confidence: 0.92,
      job_code: 'C-24A7',
      price_vnd: null,
      trade_group: 'dien_nuoc',
    });
  });

  it('boc trong markdown ```json ... ``` van parse duoc', () => {
    const raw = '```json\n{"intent":"question","intent_confidence":0.7,"job_code":null,"price_vnd":null,"trade_group":null}\n```';
    expect(parseVendorTriage(raw)?.intent).toBe('question');
  });

  it('JSON hong => null', () => {
    expect(parseVendorTriage('khong phai json')).toBeNull();
  });

  it('intent sai enum => null', () => {
    expect(parseVendorTriage('{"intent":"lam_gi_do","intent_confidence":0.5,"job_code":null,"price_vnd":null,"trade_group":null}')).toBeNull();
  });

  it('intent_confidence ngoai [0,1] => null', () => {
    expect(
      parseVendorTriage('{"intent":"claim","intent_confidence":1.5,"job_code":null,"price_vnd":null,"trade_group":null}')
    ).toBeNull();
  });

  it('job_code/price_vnd/trade_group thieu hoac sai kieu => coi la null (khong lam hong ca object)', () => {
    const result = parseVendorTriage('{"intent":"other","intent_confidence":0.3}');
    expect(result).toEqual({ intent: 'other', intent_confidence: 0.3, job_code: null, price_vnd: null, trade_group: null });
  });

  it('trade_group ngoai 4 gia tri hop le => null', () => {
    const result = parseVendorTriage(
      '{"intent":"slot_request","intent_confidence":0.8,"job_code":null,"price_vnd":null,"trade_group":"khac"}'
    );
    expect(result?.trade_group).toBeNull();
  });
});
