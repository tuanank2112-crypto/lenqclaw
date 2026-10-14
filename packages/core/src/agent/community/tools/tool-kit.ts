// packages/core/src/agent/community/tools/tool-kit.ts — kieu dung chung cho tool
// cua agent (01-CONTRACTS.md §7).
//
// Ghi chu ky thuat: `@anthropic-ai/sdk@0.68.0` (.d.ts that —
// node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts) KHONG co
// truong `strict` tren `Tool` (chi `Tool.InputSchema` co index signature
// `[k: string]: unknown`, ban than `Tool` thi khong). Giai phap: MO RONG kieu
// bang giao (`&`), KHONG dinh nghia lai `Tool`. Truong `strict` van len JSON
// gui API nhu binh thuong.
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { ToolContext } from '../../../domain/types.js';
import { InvalidToolInputError } from '../../../domain/errors.js';

export type ToolDefinition = Tool & { strict: true };

export interface AgentTool<TInput = Record<string, unknown>, TOutput = unknown, TCtx = ToolContext> {
  readonly definition: ToolDefinition;
  run(ctx: TCtx, input: TInput): Promise<TOutput>;
}

// ---------------------------------------------------------------------------
// 01-CONTRACTS §2.1 / §7: Gemini khong co `strict` cap API nen PHAI tu kiem
// `input` theo `input_schema` (required, kieu, enum, khoa la) truoc khi chay
// tool — sai => InvalidToolInputError (ma `InvalidToolInput`). Vong tool
// (`community/turn.ts`, P03) goi `assertValidToolInput` truoc `tool.run`.
// ---------------------------------------------------------------------------

interface JsonSchemaProp {
  type?: string | string[];
  enum?: unknown[];
  [k: string]: unknown;
}

interface JsonObjectSchema {
  type?: string;
  properties?: unknown;
  required?: string[] | null;
  additionalProperties?: unknown;
  [k: string]: unknown;
}

function matchesJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true; // kieu la khong biet duoc (vd 'any') => khong chan
  }
}

/** Kiem `input` theo `definition.input_schema` (required, kieu, enum, khoa
 * la — object bac 1, du cho 8 tool cua P03). Tra mang loi rong neu hop le. */
export function validateToolInput(definition: ToolDefinition, input: unknown): string[] {
  const schema = definition.input_schema as JsonObjectSchema;
  const errors: string[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return [`input phai la object, nhan duoc ${input === null ? 'null' : typeof input}`];
  }
  const obj = input as Record<string, unknown>;
  const properties = (schema.properties ?? {}) as Record<string, JsonSchemaProp>;
  const required = schema.required ?? [];
  const additionalProperties = schema.additionalProperties;

  for (const key of required) {
    if (!(key in obj)) errors.push(`thieu truong bat buoc "${key}"`);
  }

  for (const [key, value] of Object.entries(obj)) {
    const propSchema = properties[key];
    if (!propSchema) {
      if (additionalProperties === false) errors.push(`khoa la "${key}" khong co trong input_schema`);
      continue;
    }
    if (propSchema.type) {
      const types = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
      const ok = types.some((t) => matchesJsonType(value, t));
      if (!ok) errors.push(`truong "${key}" sai kieu, ky vong ${types.join('|')}`);
    }
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      errors.push(`truong "${key}" phai thuoc enum [${propSchema.enum.map(String).join(', ')}]`);
    }
  }

  return errors;
}

/** Nem `InvalidToolInputError` neu `input` khong hop le theo `input_schema`
 * cua `definition` (01-CONTRACTS §2b). */
export function assertValidToolInput(definition: ToolDefinition, input: unknown): void {
  const errors = validateToolInput(definition, input);
  if (errors.length > 0) {
    throw new InvalidToolInputError(`Tool "${definition.name}": ${errors.join('; ')}`);
  }
}
