// packages/core/src/agent/tools/tool-kit.test.ts — 01-CONTRACTS §2b "Kiem
// input tool" (handoff H04, goi b). Kiem tren input_schema THAT cua tool da
// co (chi doc `index.ts`, khong sua) — tool-kit.ts la file DUY NHAT duoc
// sua trong `agent/tools/**` theo handoff.
import { describe, expect, it } from 'vitest';
import { InvalidToolInputError } from '../../domain/errors.js';
import { handoffToStaffTool } from './handoff_to_staff.js';
import { saveJobDraftTool } from './save_job_draft.js';
import { assertValidToolInput, validateToolInput } from './tool-kit.js';

describe('validateToolInput / assertValidToolInput (tool-kit.ts, 01-CONTRACTS §2b)', () => {
  it('input hop le => khong loi', () => {
    const errors = validateToolInput(handoffToStaffTool.definition, { reason: 'model_refusal' });
    expect(errors).toEqual([]);
    expect(() => assertValidToolInput(handoffToStaffTool.definition, { reason: 'model_refusal' })).not.toThrow();
  });

  it('thieu truong bat buoc => InvalidToolInputError', () => {
    const errors = validateToolInput(handoffToStaffTool.definition, {});
    expect(errors.some((e) => e.includes('reason'))).toBe(true);
    expect(() => assertValidToolInput(handoffToStaffTool.definition, {})).toThrow(InvalidToolInputError);
    try {
      assertValidToolInput(handoffToStaffTool.definition, {});
    } catch (err) {
      expect((err as { code?: string }).code).toBe('InvalidToolInput');
    }
  });

  it('sai kieu truong => bao loi', () => {
    const errors = validateToolInput(handoffToStaffTool.definition, { reason: 123 });
    expect(errors.some((e) => e.includes('reason'))).toBe(true);
  });

  it('input khong phai object (array/null/string) => bao loi', () => {
    expect(validateToolInput(handoffToStaffTool.definition, null).length).toBeGreaterThan(0);
    expect(validateToolInput(handoffToStaffTool.definition, []).length).toBeGreaterThan(0);
    expect(validateToolInput(handoffToStaffTool.definition, 'oops').length).toBeGreaterThan(0);
  });

  it('khoa la (additionalProperties:false) => bao loi', () => {
    const errors = validateToolInput(handoffToStaffTool.definition, { reason: 'x', extra_field: 1 });
    expect(errors.some((e) => e.includes('extra_field'))).toBe(true);
  });

  it('sai enum (save_job_draft.urgency) => bao loi', () => {
    const validInput = {
      category_code: null,
      symptoms: ['ro nuoc'],
      location_in_unit: 'nha ve sinh',
      urgency: 'khong_hop_le',
      photo_ids: [],
      questions_asked: 1,
      confidence_note: 'chua ro',
    };
    const errors = validateToolInput(saveJobDraftTool.definition, validInput);
    expect(errors.some((e) => e.includes('urgency'))).toBe(true);
  });

  it('input hop le cua save_job_draft (nhieu kieu: string/array/enum/integer) => khong loi', () => {
    const validInput = {
      category_code: 'plumbing',
      symptoms: ['ro nuoc', 'mui hoi'],
      location_in_unit: 'nha ve sinh',
      urgency: 'soon',
      photo_ids: [1, 2],
      questions_asked: 2,
      confidence_note: 'kha chac',
    };
    expect(validateToolInput(saveJobDraftTool.definition, validInput)).toEqual([]);
  });
});
