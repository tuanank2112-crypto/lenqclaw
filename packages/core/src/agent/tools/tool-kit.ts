// packages/core/src/agent/tools/tool-kit.ts — kieu dung chung cho tool cua
// agent (01-CONTRACTS.md §7, SPEC-P03-Resident-Agent.md §10.3/§10.8).
//
// Ghi chu ky thuat: `@anthropic-ai/sdk@0.68.0` (.d.ts that, da tra —
// node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts) KHONG co
// truong `strict` tren `Tool` (chi `Tool.InputSchema` co index signature
// `[k: string]: unknown`, ban than `Tool` thi khong) — SPEC-P03 §10.8 doi
// "strict: true o cap dinh nghia tool". Giai phap: MO RONG kieu bang giao
// (`&`), KHONG dinh nghia lai `Tool` (dung nguyen kieu SDK cho moi truong
// khac). Truong `strict` van len JSON gui API nhu binh thuong.
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { ToolContext } from '../tool-context.js';

export type ToolDefinition = Tool & { strict: true };

export interface AgentTool<TInput = Record<string, unknown>, TOutput = unknown> {
  readonly definition: ToolDefinition;
  run(ctx: ToolContext, input: TInput): Promise<TOutput>;
}
