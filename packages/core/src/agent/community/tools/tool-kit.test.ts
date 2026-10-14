// tool-kit.ts — 01-CONTRACTS §2.1 "Kiem input tool". Dung 2 definition GIA
// (khong import tool that: chua co tool nao o P01).
import { describe, expect, it } from 'vitest';
import { InvalidToolInputError } from '../../../domain/errors.js';
import { assertValidToolInput, validateToolInput, type ToolDefinition } from './tool-kit.js';

const noteTool: ToolDefinition = {
  name: 'fake_note',
  description: 'tool gia de test',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { reason: { type: 'string' } },
    required: ['reason'],
    additionalProperties: false,
  },
};

const draftTool: ToolDefinition = {
  name: 'fake_draft',
  description: 'tool gia nhieu kieu truong',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: ['string', 'null'] },
      tags: { type: 'array' },
      level: { type: 'string', enum: ['low', 'mid', 'high'] },
      ids: { type: 'array' },
      count: { type: 'integer' },
    },
    required: ['level'],
    additionalProperties: false,
  },
};

describe('validateToolInput / assertValidToolInput (tool-kit.ts)', () => {
  it('input hop le => khong loi', () => {
    expect(validateToolInput(noteTool, { reason: 'x' })).toEqual([]);
    expect(() => assertValidToolInput(noteTool, { reason: 'x' })).not.toThrow();
  });

  it('thieu truong bat buoc => InvalidToolInputError, code InvalidToolInput', () => {
    expect(validateToolInput(noteTool, {}).some((e) => e.includes('reason'))).toBe(true);
    expect(() => assertValidToolInput(noteTool, {})).toThrow(InvalidToolInputError);
    try {
      assertValidToolInput(noteTool, {});
    } catch (err) {
      expect((err as { code?: string }).code).toBe('InvalidToolInput');
    }
  });

  it('sai kieu truong => bao loi', () => {
    expect(validateToolInput(noteTool, { reason: 123 }).some((e) => e.includes('reason'))).toBe(true);
  });

  it('input khong phai object (array/null/string) => bao loi', () => {
    expect(validateToolInput(noteTool, null).length).toBeGreaterThan(0);
    expect(validateToolInput(noteTool, []).length).toBeGreaterThan(0);
    expect(validateToolInput(noteTool, 'oops').length).toBeGreaterThan(0);
  });

  it('khoa la (additionalProperties:false) => bao loi', () => {
    expect(validateToolInput(noteTool, { reason: 'x', extra_field: 1 }).some((e) => e.includes('extra_field'))).toBe(true);
  });

  it('sai enum => bao loi', () => {
    expect(validateToolInput(draftTool, { level: 'khong_hop_le' }).some((e) => e.includes('level'))).toBe(true);
  });

  it('input hop le nhieu kieu (string|null, array, enum, integer) => khong loi', () => {
    expect(validateToolInput(draftTool, { topic: null, tags: ['a', 'b'], level: 'mid', ids: [1, 2], count: 2 })).toEqual([]);
    expect(validateToolInput(draftTool, { level: 'low', count: 1.5 }).some((e) => e.includes('count'))).toBe(true);
  });
});
