// packages/core/src/adapters/model.ts — noi DUY NHAT goi LLM (BB-07,
// 01-CONTRACTS.md §2). CAM import "@anthropic-ai/sdk" o file khac — kiem
// bang scripts/check_adapter_boundary.mjs.
//
// Doi chieu voi node_modules/@anthropic-ai/sdk@0.68.0 (.d.ts that, khong
// doan): `Anthropic.messages.create` nhan `system?: string | TextBlockParam[]`,
// `tools?: Tool[]` (moi phan tu co `cache_control?: CacheControlEphemeral`),
// tra `Message` co `usage: Usage` (`input_tokens`, `output_tokens`,
// `cache_creation_input_tokens`, `cache_read_input_tokens`). Loi 429/5xx sau
// khi SDK tu retry het luot se nem `APIError` (co `.status`).

import Anthropic from '@anthropic-ai/sdk';
import { APIError } from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  TextBlockParam,
  Tool,
  Usage,
} from '@anthropic-ai/sdk/resources/messages';
import { sql } from './db.js';
import { ModelUnavailableError } from '../domain/errors.js';

// Re-export de noi khac (vd test) khong phai tu import "@anthropic-ai/sdk"
// truc tiep — giu dung MOT diem import SDK trong toan repo (BB-07).
export { APIError };

export type ModelRoute = 'diagnose' | 'responsibility' | 'acceptance' | 'vendor_parse' | 'compose';

export interface ImageRef {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  base64: string;
}

export interface ModelCall {
  route: ModelRoute;
  system: string;
  messages: MessageParam[];
  tools?: Tool[];
  images?: ImageRef[];
  /** Gan vao agent_runs.conversation_id neu co (tuy chon — P01 chua co agent thuc). */
  conversationId?: string | null;
}

export interface CallModelResult {
  message: Message;
  usage: Usage;
  model: string;
}

/** Interface toi thieu ma test dung de gia lap client (`setModelClientForTest`). */
export interface ModelClientLike {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Message>;
  };
}

let realClient: Anthropic | null = null;
let testClient: ModelClientLike | null = null;

function getClient(): ModelClientLike {
  if (testClient) return testClient;
  if (!realClient) realClient = new Anthropic();
  return realClient;
}

/** Chi dung trong test: thay client that bang mot fake khong goi mang.
 * Truyen `null` de go fake, quay lai client that. */
export function setModelClientForTest(fake: ModelClientLike | null): void {
  testClient = fake;
}

const ROUTE_ENV: Record<ModelRoute, string> = {
  diagnose: 'MODEL_DIAGNOSE',
  responsibility: 'MODEL_RESPONSIBILITY',
  acceptance: 'MODEL_ACCEPTANCE',
  vendor_parse: 'MODEL_VENDOR_PARSE',
  compose: 'MODEL_COMPOSE',
};

const DEFAULT_MODEL = 'claude-opus-5';

/** model = env MODEL_<ROUTE> ?? MODEL_DEFAULT ?? 'claude-opus-5' (01-CONTRACTS §2). */
export function resolveModel(route: ModelRoute): string {
  const perRoute = process.env[ROUTE_ENV[route]]?.trim();
  if (perRoute) return perRoute;
  const def = process.env.MODEL_DEFAULT?.trim();
  if (def) return def;
  return DEFAULT_MODEL;
}

function buildSystem(system: string): TextBlockParam[] {
  // cache_control BAT BUOC tren khoi system (01-CONTRACTS §2) — day la khoi
  // system duy nhat nen no cung la khoi cuoi.
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

function withCacheControlOnLastTool(tools: Tool[] | undefined): Tool[] | undefined {
  if (!tools || tools.length === 0) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
  );
}

async function recordAgentRun(row: {
  conversationId: string | null;
  route: ModelRoute;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  latencyMs: number;
  outcome: 'ok' | 'error';
}): Promise<void> {
  try {
    await sql(
      `insert into agent_runs
        (conversation_id, route, model, input_tokens, output_tokens, cache_read_tokens, latency_ms, outcome)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        row.conversationId,
        row.route,
        row.model,
        row.inputTokens,
        row.outputTokens,
        row.cacheReadTokens,
        row.latencyMs,
        row.outcome,
      ]
    );
  } catch {
    // Khong co DATABASE_URL (vd unit test voi client gia) — bo qua ghi
    // agent_runs, khong lam vo lan goi model. Test co DB kiem hanh vi ghi
    // rieng (test:db).
  }
}

export async function callModel(c: ModelCall): Promise<CallModelResult> {
  const model = resolveModel(c.route);
  const client = getClient();
  const startedAt = Date.now();
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystem(c.system),
      messages: c.messages,
      tools: withCacheControlOnLastTool(c.tools),
    });
    const usage = message.usage;
    await recordAgentRun({
      conversationId: c.conversationId ?? null,
      route: c.route,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      latencyMs: Date.now() - startedAt,
      outcome: 'ok',
    });
    return { message, usage, model };
  } catch (err) {
    await recordAgentRun({
      conversationId: c.conversationId ?? null,
      route: c.route,
      model,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      latencyMs: Date.now() - startedAt,
      outcome: 'error',
    });
    if (err instanceof APIError) {
      const status = err.status;
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        throw new ModelUnavailableError(`Model ${model} tra loi ${status} sau retry cua SDK.`);
      }
    }
    throw err;
  }
}
