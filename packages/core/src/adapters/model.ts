// packages/core/src/adapters/model.ts — noi DUY NHAT goi LLM (BB-07,
// 01-CONTRACTS.md §2, §2b). CAM import "@anthropic-ai/sdk" o file khac —
// kiem bang scripts/check_adapter_boundary.mjs. CAM chuoi
// "generativelanguage.googleapis.com" / import "@google/genai" o file khac —
// cung may do do kiem.
//
// Doi chieu voi node_modules/@anthropic-ai/sdk@0.68.0 (.d.ts that, khong
// doan): `Anthropic.messages.create` nhan `system?: string | TextBlockParam[]`,
// `tools?: Tool[]` (moi phan tu co `cache_control?: CacheControlEphemeral`),
// tra `Message` co `usage: Usage` (`input_tokens`, `output_tokens`,
// `cache_creation_input_tokens`, `cache_read_input_tokens`). Loi 429/5xx sau
// khi SDK tu retry het luot se nem `APIError` (co `.status`).
//
// Đ18/Đ19 (2026-09-24/25, 01-CONTRACTS §2b): `MODEL_PROVIDER=gemini` la
// MAC DINH — chi `adapters/model.ts` chon va dich, `callModel` giu NGUYEN
// chu ky (core/agent/tool KHONG biet nha cung cap). Nhanh `anthropic` van
// chay duoc qua env. `GEMINI_API_KEY` CHI doc trong file nay.

import Anthropic from '@anthropic-ai/sdk';
import { APIConnectionError, APIError } from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
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
export { APIError, APIConnectionError };

export type ModelRoute = 'diagnose' | 'responsibility' | 'acceptance' | 'vendor_parse' | 'compose';
export type ModelProvider = 'gemini' | 'anthropic';

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

/** Interface toi thieu ma test dung de gia lap client anthropic (`setModelClientForTest`). */
export interface ModelClientLike {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Message>;
  };
}

let realClient: Anthropic | null = null;
let testClient: ModelClientLike | null = null;

function getAnthropicClient(): ModelClientLike {
  if (testClient) return testClient;
  if (!realClient) realClient = new Anthropic();
  return realClient;
}

/** Chi dung trong test: thay client that (nhanh anthropic) bang mot fake
 * khong goi mang. Truyen `null` de go fake, quay lai client that. */
export function setModelClientForTest(fake: ModelClientLike | null): void {
  testClient = fake;
}

/** Chi dung trong test: thay `fetch` that (nhanh gemini) bang mot fake
 * khong goi mang. Truyen `null` de go fake, quay lai `fetch` toan cuc. */
let testFetch: typeof fetch | null = null;
export function setGeminiFetchForTest(fake: typeof fetch | null): void {
  testFetch = fake;
}

const ROUTE_ENV: Record<ModelRoute, string> = {
  diagnose: 'MODEL_DIAGNOSE',
  responsibility: 'MODEL_RESPONSIBILITY',
  acceptance: 'MODEL_ACCEPTANCE',
  vendor_parse: 'MODEL_VENDOR_PARSE',
  compose: 'MODEL_COMPOSE',
};

const DEFAULT_MODEL_ANTHROPIC = 'claude-opus-5';
const DEFAULT_MODEL_GEMINI = 'gemini-3.6-flash';
const DEFAULT_FALLBACKS_GEMINI = ['gemini-3-flash-preview', 'gemini-3.5-flash-lite'];
const MAX_OUTPUT_TOKENS = 16000;
const GEMINI_RETRY_DELAYS_MS = [1000, 3000];
const GEMINI_ENDPOINT_HOST = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** 01-CONTRACTS §2b: env MODEL_PROVIDER = 'gemini' (mac dinh) | 'anthropic'. */
export function resolveProvider(): ModelProvider {
  const raw = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  return raw === 'anthropic' ? 'anthropic' : 'gemini';
}

/** model = env MODEL_<ROUTE> ?? MODEL_DEFAULT ?? mac dinh theo provider
 * ('gemini-3.6-flash' khi gemini, 'claude-opus-5' khi anthropic). */
export function resolveModel(route: ModelRoute, provider: ModelProvider = resolveProvider()): string {
  const perRoute = process.env[ROUTE_ENV[route]]?.trim();
  if (perRoute) return perRoute;
  const def = process.env.MODEL_DEFAULT?.trim();
  if (def) return def;
  return provider === 'anthropic' ? DEFAULT_MODEL_ANTHROPIC : DEFAULT_MODEL_GEMINI;
}

/** MODEL_FALLBACKS (danh sach phay): dat env ap dung cho ca hai nhanh; khong
 * dat ⇒ mac dinh gemini co danh sach du phong san, anthropic RONG (Đ19-2). */
function resolveFallbackModels(provider: ModelProvider): string[] {
  const raw = process.env.MODEL_FALLBACKS;
  if (raw !== undefined) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return provider === 'gemini' ? DEFAULT_FALLBACKS_GEMINI : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSystem(system: string): TextBlockParam[] {
  // cache_control BAT BUOC tren khoi system (01-CONTRACTS §2) — day la khoi
  // system duy nhat nen no cung la khoi cuoi. Chi ap dung nhanh anthropic;
  // Gemini bo cache_control (cache ngam, 01-CONTRACTS §2b).
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

function withCacheControlOnLastTool(tools: Tool[] | undefined): Tool[] | undefined {
  if (!tools || tools.length === 0) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
  );
}

/**
 * R02-tham-dinh D7: `ModelCall.images` (01-CONTRACTS §2) truoc day bi bo
 * qua lang le — anh khong bao gio toi request that. Dua anh thanh cac
 * `image` content block, noi vao CUOI noi dung cua tin nhan CUOI CUNG
 * (chuyen `content` dang chuoi thanh mang truoc khi noi). Khong tao tin
 * nhan moi vi tin cuoi thuong la vai `user` mo ta trieu chung kem anh.
 * Dung chung cho ca hai nhanh — nhanh gemini dich tiep tu ket qua nay.
 */
function withImages(messages: MessageParam[], images: ImageRef[] | undefined): MessageParam[] {
  if (!images || images.length === 0) return messages;
  if (messages.length === 0) {
    throw new Error('callModel: co images nhung messages rong — khong co tin nhan nao de gan anh vao.');
  }
  const imageBlocks: ContentBlockParam[] = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
  }));
  const out = messages.slice();
  const lastIndex = out.length - 1;
  const last = out[lastIndex]!;
  const existingContent: ContentBlockParam[] =
    typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
  out[lastIndex] = { ...last, content: [...existingContent, ...imageBlocks] };
  return out;
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
    // Khong co DATABASE_URL (vd unit test voi client/fetch gia) — bo qua
    // ghi agent_runs, khong lam vo lan goi model. Test co DB kiem hanh vi
    // ghi rieng (test:db).
  }
}

// ---------------------------------------------------------------------------
// Nhanh anthropic (giu hanh vi hien co, SPEC-P03 §10.8) — noi loi APIError/
// APIConnectionError thanh ModelUnavailableError (retryable) de vong fallback
// chung o `callModel` xu ly; loi khac nem nguyen.
// ---------------------------------------------------------------------------

async function callAnthropicOnce(
  model: string,
  c: ModelCall
): Promise<{ message: Message; usage: Usage }> {
  const client = getAnthropicClient();
  try {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystem(c.system),
      messages: withImages(c.messages, c.images),
      tools: withCacheControlOnLastTool(c.tools),
    });
    return { message, usage: message.usage };
  } catch (err) {
    // R02-tham-dinh G3: loi mang/timeout (`APIConnectionError`, ke ca
    // `APIConnectionTimeoutError` — la lop con) cung phai thanh
    // `ModelUnavailableError`, khong chi 429/5xx — caller §9 dua vao kieu
    // loi nay de xin loi cu dan thay vi de rot APIConnectionError tho.
    if (err instanceof APIConnectionError) {
      throw new ModelUnavailableError(`Model ${model}: loi ket noi/timeout sau retry cua SDK (${err.message}).`);
    }
    if (err instanceof APIError) {
      const status = err.status;
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        throw new ModelUnavailableError(`Model ${model} tra loi ${status} sau retry cua SDK.`);
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Nhanh gemini (01-CONTRACTS §2b, Đ18/Đ19)
// ---------------------------------------------------------------------------

interface GeminiInlineData {
  mimeType: string;
  data: string;
}
interface GeminiFunctionCall {
  name: string;
  args?: unknown;
}
interface GeminiFunctionResponse {
  name: string;
  response: { content: unknown; is_error?: boolean };
}
interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  thoughtSignature?: string;
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}
interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

/** Bang `tool_use.id -> {name, thoughtSignature}` trong bo nho tien trinh
 * (01-CONTRACTS §2b "Chu ky suy nghi"). Lich su nap tu DB chi co text nen
 * khong can chu ky; bang nay chi phai voi cac vong tool dang chay TRONG
 * tien trinh hien tai. */
const geminiToolUseInfo = new Map<string, { name: string; thoughtSignature?: string }>();
let geminiToolUseCounter = 0;

function nextGeminiToolUseId(): string {
  geminiToolUseCounter += 1;
  return `toolu_gm_${geminiToolUseCounter}`;
}

function mediaTypeToMimeType(mediaType: string): string {
  return mediaType;
}

function blockToGeminiParts(block: ContentBlockParam): GeminiPart[] {
  switch (block.type) {
    case 'text':
      return [{ text: block.text }];
    case 'image': {
      if (block.source.type !== 'base64') return [];
      return [{ inlineData: { mimeType: mediaTypeToMimeType(block.source.media_type), data: block.source.data } }];
    }
    case 'tool_use': {
      const info = geminiToolUseInfo.get(block.id);
      return [
        {
          functionCall: { name: block.name, args: block.input },
          ...(info?.thoughtSignature ? { thoughtSignature: info.thoughtSignature } : {}),
        },
      ];
    }
    case 'tool_result': {
      const info = geminiToolUseInfo.get(block.tool_use_id);
      const rawContent = block.content;
      let content: unknown = rawContent;
      if (typeof rawContent === 'string') {
        try {
          content = JSON.parse(rawContent);
        } catch {
          content = rawContent;
        }
      } else if (Array.isArray(rawContent)) {
        content = rawContent
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('\n');
      }
      return [
        {
          functionResponse: {
            name: info?.name ?? 'unknown_tool',
            response: { content, is_error: block.is_error ?? false },
          },
        },
      ];
    }
    default:
      return [];
  }
}

/** Dich `MessageParam[]` (dang Anthropic, §2) sang `contents` cua Gemini
 * (01-CONTRACTS §2b "Dich vao"): user/assistant ⇒ user/model; bo cache_control. */
function toGeminiContents(messages: MessageParam[]): GeminiContent[] {
  return messages.map((m) => {
    const role: GeminiContent['role'] = m.role === 'assistant' ? 'model' : 'user';
    const blocks: ContentBlockParam[] =
      typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    const parts = blocks.flatMap(blockToGeminiParts);
    return { role, parts };
  });
}

function toGeminiTools(tools: Tool[] | undefined): unknown {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.input_schema,
      })),
    },
  ];
}

/** 01-CONTRACTS §2b "Dich ra": SAFETY/PROHIBITED_CONTENT/BLOCKLIST/blockReason
 * ⇒ refusal; MAX_TOKENS ⇒ max_tokens; co functionCall ⇒ tool_use; con lai end_turn. */
function determineStopReason(
  candidate: GeminiCandidate | undefined,
  promptFeedback: GeminiResponseBody['promptFeedback']
): Message['stop_reason'] {
  const finishReason = candidate?.finishReason;
  if (
    promptFeedback?.blockReason ||
    finishReason === 'SAFETY' ||
    finishReason === 'PROHIBITED_CONTENT' ||
    finishReason === 'BLOCKLIST'
  ) {
    return 'refusal';
  }
  if (finishReason === 'MAX_TOKENS') return 'max_tokens';
  const hasFunctionCall = (candidate?.content?.parts ?? []).some((p) => p.functionCall);
  return hasFunctionCall ? 'tool_use' : 'end_turn';
}

function geminiPartsToContent(parts: GeminiPart[] | undefined): ContentBlockParam[] {
  const out: ContentBlockParam[] = [];
  for (const p of parts ?? []) {
    if (p.functionCall) {
      const id = nextGeminiToolUseId();
      geminiToolUseInfo.set(id, { name: p.functionCall.name, thoughtSignature: p.thoughtSignature });
      out.push({ type: 'tool_use', id, name: p.functionCall.name, input: (p.functionCall.args ?? {}) as Record<string, unknown> });
    } else if (typeof p.text === 'string') {
      out.push({ type: 'text', text: p.text, citations: null });
    }
  }
  return out;
}

/** Loi retryable theo bang §2b (429/500/503/504, mang, timeout). */
class GeminiRetryableError extends Error {}

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error('GEMINI_API_KEY chua duoc cau hinh trong .env.');
  }
  return key;
}

async function fetchGeminiOnce(model: string, body: unknown): Promise<GeminiResponseBody> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_ENDPOINT_HOST}${encodeURIComponent(model)}:generateContent`;
  const fetchImpl = testFetch ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      // 01-CONTRACTS §2b: key qua header, CAM dat trong URL.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GeminiRetryableError(`Loi mang khi goi Gemini ${model}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const status = res.status;
    if (status === 429 || status === 500 || status === 503 || status === 504) {
      throw new GeminiRetryableError(`Gemini ${model} tra loi ${status}.`);
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini ${model} tra loi ${status} (khong retry — loi cau hinh): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as GeminiResponseBody;
}

/** 01-CONTRACTS §2b "Loi": 429/500/503/504/mang/timeout ⇒ retry toi da 2
 * lan, lui 1s roi 3s, roi ModelUnavailableError; 400/401/403/404 ⇒ nem loi
 * goc ngay (khong retry). */
async function callGeminiWithRetry(model: string, body: unknown): Promise<GeminiResponseBody> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetchGeminiOnce(model, body);
    } catch (err) {
      if (!(err instanceof GeminiRetryableError)) throw err;
      lastErr = err;
      if (attempt === GEMINI_RETRY_DELAYS_MS.length) break;
      await sleep(GEMINI_RETRY_DELAYS_MS[attempt]!);
    }
  }
  throw new ModelUnavailableError(`Model ${model}: ${(lastErr as Error)?.message ?? 'khong kha dung'} sau retry.`);
}

async function callGeminiOnce(model: string, c: ModelCall): Promise<{ message: Message; usage: Usage }> {
  const messagesWithImages = withImages(c.messages, c.images);
  const body = {
    systemInstruction: { parts: [{ text: c.system }] },
    contents: toGeminiContents(messagesWithImages),
    tools: toGeminiTools(c.tools),
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
  const raw = await callGeminiWithRetry(model, body);
  const candidate = raw.candidates?.[0];
  const content = geminiPartsToContent(candidate?.content?.parts);
  const stopReason = determineStopReason(candidate, raw.promptFeedback);
  const usage: Usage = {
    input_tokens: raw.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: raw.usageMetadata?.cachedContentTokenCount ?? 0,
    cache_creation: null,
    server_tool_use: null,
    service_tier: null,
  } as unknown as Usage;
  const message = {
    id: `msg_gm_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  } as unknown as Message;
  return { message, usage };
}

// ---------------------------------------------------------------------------
// Vao chung: `callModel` — chon nha cung cap, thu MODEL_FALLBACKS khi
// ModelUnavailableError (01-CONTRACTS §2b "Model"), ghi `agent_runs.model`
// = model thuc chay.
// ---------------------------------------------------------------------------

export async function callModel(c: ModelCall): Promise<CallModelResult> {
  const provider = resolveProvider();
  const primaryModel = resolveModel(c.route, provider);
  const fallbacks = resolveFallbackModels(provider);
  const candidates = [primaryModel, ...fallbacks];
  const startedAt = Date.now();

  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i]!;
    try {
      const { message, usage } = provider === 'anthropic' ? await callAnthropicOnce(model, c) : await callGeminiOnce(model, c);
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
      lastErr = err;
      const isRetryableAcrossModels = err instanceof ModelUnavailableError;
      const isLastCandidate = i === candidates.length - 1;
      if (isRetryableAcrossModels && !isLastCandidate) {
        continue; // 01-CONTRACTS §2b: thu model du phong tiep theo trong CUNG loi goi.
      }
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
      throw err;
    }
  }
  // Khong the toi day (candidates luon >= 1 phan tu) — giu de TypeScript yen tam.
  throw lastErr instanceof Error ? lastErr : new Error('callModel: khong co model nao de goi.');
}
