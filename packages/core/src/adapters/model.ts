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
import { EmbeddingUnavailableError, ModelDeadlineError, ModelUnavailableError } from '../domain/errors.js';
import { readCommunityConfig } from '../services/community-config.js';

// Re-export de noi khac (vd test) khong phai tu import "@anthropic-ai/sdk"
// truc tiep — giu dung MOT diem import SDK trong toan repo (BB-07).
export { APIError, APIConnectionError };

export type ModelRoute = 'community' | 'triage';
export type ModelProvider = 'gemini' | 'anthropic' | 'openrouter' | 'vyce';

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
  /** D24: id luot agent => `agent_runs.turn_id` (= `turn_traces.id`); thieu => NULL (triage, embed). */
  turnId?: string;
  /** D31 (T2): route `community` + 'fast' => `MODEL_COMMUNITY_FAST`; thieu => 'default'. */
  tier?: 'fast' | 'default';
  /** D31 (BB-18): han chot cua luot (epoch ms). Moi lan thu: timeout = min(MODEL_CALL_TIMEOUT_MS, deadlineAt - now). */
  deadlineAt?: number;
}

export interface CallModelResult {
  message: Message;
  usage: Usage;
  model: string;
}

/** Interface toi thieu ma test dung de gia lap client anthropic (`setModelClientForTest`). */
export interface ModelClientLike {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<Message>;
  };
}

let realClient: Anthropic | null = null;
let testClient: ModelClientLike | null = null;
// SPEC-P03 §11.10: route 'triage' PHAI co client/fetch RIENG trong test —
// dung chung `testClient`/`testFetch` cua route 'community' se "an" mot
// phan hoi trong kich ban da soan cho vong tool chinh (lech thu tu, vo test
// co san). Khong cau hinh rieng cho triage => coi nhu KHONG kha dung (nem
// loi ngay, khong cham `testClient`) — `triageMessage` bat loi nay va tra
// `null` (dung ngu nghia "loi/qua han => null" cua §11.10), tuong duong voi
// moi truong test/dev chua co credential that.
let triageTestClient: ModelClientLike | null = null;
let triageTestFetch: typeof fetch | null = null;

function getAnthropicClient(route: ModelRoute = 'community'): ModelClientLike {
  if (route === 'triage') {
    if (triageTestClient) return triageTestClient;
    if (testClient) {
      throw new ModelUnavailableError('triage: chua cau hinh setTriageClientForTest trong moi truong test.');
    }
    if (!realClient) realClient = new Anthropic();
    return realClient;
  }
  if (testClient) return testClient;
  if (!realClient) realClient = new Anthropic();
  return realClient;
}

/** Chi dung trong test: thay client that (nhanh anthropic) bang mot fake
 * khong goi mang. Truyen `null` de go fake, quay lai client that. Ap dung
 * cho MOI route TRU 'triage' (xem `setTriageClientForTest`). */
export function setModelClientForTest(fake: ModelClientLike | null): void {
  testClient = fake;
}

/** Chi dung trong test: fake client RIENG cho route 'triage' (SPEC-P03
 * §11.10) — khong dung chung voi `setModelClientForTest` de tranh vo kich
 * ban da soan cho vong tool chinh. */
export function setTriageClientForTest(fake: ModelClientLike | null): void {
  triageTestClient = fake;
}

/** Chi dung trong test: thay `fetch` that (nhanh gemini) bang mot fake
 * khong goi mang. Truyen `null` de go fake, quay lai `fetch` toan cuc. */
let testFetch: typeof fetch | null = null;
export function setGeminiFetchForTest(fake: typeof fetch | null): void {
  testFetch = fake;
}

/** Nhu tren, rieng cho route 'triage' — xem ghi chu `setTriageClientForTest`. */
export function setTriageFetchForTest(fake: typeof fetch | null): void {
  triageTestFetch = fake;
}

/** Chi dung trong test: thay `fetch` that (nhanh openrouter) bang mot fake
 * khong goi mang. Truyen `null` de go fake, quay lai `fetch` toan cuc.
 * 01-CONTRACTS §2c: route 'triage' dung lai `setTriageFetchForTest` (bang
 * chung, khong rieng nhu gemini). */
let testFetchOpenRouter: typeof fetch | null = null;
export function setOpenRouterFetchForTest(fake: typeof fetch | null): void {
  testFetchOpenRouter = fake;
}

/** Nhu tren, rieng cho nhanh vyce (01-CONTRACTS §2d) — co the dung DE RIENG
 * voi fetch gia cua openrouter (2 bien khac nhau) du dung chung ham dich. */
let testFetchVyce: typeof fetch | null = null;
export function setVyceFetchForTest(fake: typeof fetch | null): void {
  testFetchVyce = fake;
}

const ROUTE_ENV: Record<ModelRoute, string> = {
  community: 'MODEL_COMMUNITY',
  triage: 'MODEL_TRIAGE',
};

const DEFAULT_MODEL_ANTHROPIC = 'claude-opus-5';
const DEFAULT_MODEL_GEMINI = 'gemini-3.6-flash';
const DEFAULT_MODEL_OPENROUTER = 'google/gemini-3.6-flash';
const DEFAULT_MODEL_VYCE = 'deepseek-v4-flash';
const DEFAULT_MODEL_FAST_GEMINI = 'gemini-3.5-flash-lite';
const DEFAULT_MODEL_FAST_OPENROUTER = 'google/gemini-3.5-flash-lite';
const DEFAULT_MODEL_TRIAGE_ANTHROPIC = 'claude-haiku-4-5';
const DEFAULT_MODEL_TRIAGE_GEMINI = 'gemini-3.5-flash-lite';
const DEFAULT_MODEL_TRIAGE_OPENROUTER = 'google/gemini-3.5-flash-lite';
const DEFAULT_MODEL_TRIAGE_VYCE = 'deepseek-v4-flash';
const DEFAULT_FALLBACKS_GEMINI = ['gemini-3-flash-preview', 'gemini-3.5-flash-lite'];
const DEFAULT_FALLBACKS_OPENROUTER = ['google/gemini-3-flash-preview'];
const MAX_OUTPUT_TOKENS = 16000;
const GEMINI_RETRY_DELAYS_MS = [1000, 3000];
const GEMINI_ENDPOINT_HOST = 'https://generativelanguage.googleapis.com/v1beta/models/';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const VYCE_DEFAULT_BASE_URL = 'https://vyceai.com/v1';
const DEFAULT_TRIAGE_TIMEOUT_MS = 4000;

/** 01-CONTRACTS §2b/§2c/§2d: env MODEL_PROVIDER = 'gemini' (mac dinh) |
 * 'anthropic' | 'openrouter' | 'vyce'. Đ24/Đ25: doi mac dinh khoi 'gemini'
 * can nguoi chot. */
export function resolveProvider(): ModelProvider {
  const raw = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'openrouter') return 'openrouter';
  if (raw === 'vyce') return 'vyce';
  return 'gemini';
}

/** model = env MODEL_<ROUTE> ?? MODEL_DEFAULT ?? mac dinh theo provider
 * ('gemini-3.6-flash' khi gemini, 'claude-opus-5' khi anthropic,
 * 'google/gemini-3.6-flash' khi openrouter — 01-CONTRACTS §2c,
 * 'deepseek-v4-flash' khi vyce — 01-CONTRACTS §2d). */
export function resolveModel(
  route: ModelRoute,
  provider: ModelProvider = resolveProvider(),
  tier: 'fast' | 'default' = 'default'
): string {
  // D31 T2: luot tuong tac dung model nhanh (route community + tier 'fast'); anthropic/vyce = model route community.
  if (route === 'community' && tier === 'fast') {
    const fast = process.env.MODEL_COMMUNITY_FAST?.trim();
    if (fast) return fast;
    if (provider === 'gemini') return DEFAULT_MODEL_FAST_GEMINI;
    if (provider === 'openrouter') return DEFAULT_MODEL_FAST_OPENROUTER;
  }
  const perRoute = process.env[ROUTE_ENV[route]]?.trim();
  if (perRoute) return perRoute;
  const def = process.env.MODEL_DEFAULT?.trim();
  if (def) return def;
  if (provider === 'anthropic') return DEFAULT_MODEL_ANTHROPIC;
  if (provider === 'openrouter') return DEFAULT_MODEL_OPENROUTER;
  if (provider === 'vyce') return DEFAULT_MODEL_VYCE;
  return DEFAULT_MODEL_GEMINI;
}

/** SPEC-P03 §11.10: model cho route 'triage' = env MODEL_TRIAGE, mac dinh
 * theo provider — KHONG rơi ve MODEL_DEFAULT (khac `resolveModel` thuong). */
export function resolveTriageModel(provider: ModelProvider = resolveProvider()): string {
  const perRoute = process.env.MODEL_TRIAGE?.trim();
  if (perRoute) return perRoute;
  if (provider === 'anthropic') return DEFAULT_MODEL_TRIAGE_ANTHROPIC;
  if (provider === 'openrouter') return DEFAULT_MODEL_TRIAGE_OPENROUTER;
  if (provider === 'vyce') return DEFAULT_MODEL_TRIAGE_VYCE;
  return DEFAULT_MODEL_TRIAGE_GEMINI;
}

/** MODEL_FALLBACKS (danh sach phay): dat env ap dung cho ca bon nhanh; khong
 * dat ⇒ mac dinh gemini/openrouter co danh sach du phong san, anthropic/vyce
 * RONG (Đ19-2, Đ25). */
function resolveFallbackModels(provider: ModelProvider): string[] {
  const raw = process.env.MODEL_FALLBACKS;
  if (raw !== undefined) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (provider === 'gemini') return DEFAULT_FALLBACKS_GEMINI;
  if (provider === 'openrouter') return DEFAULT_FALLBACKS_OPENROUTER;
  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Gioi han thoi gian cua MOT loi goi `callModel` (D31, BB-18). */
interface CallLimits {
  deadlineAt?: number;
  callTimeoutMs: number;
  minAttemptMs: number;
  /** Triage: mot signal co dinh cho ca loi goi (khong retry). */
  fixed?: AbortSignal;
}

function limitsFor(c: ModelCall): CallLimits {
  const cfg = readCommunityConfig();
  return { deadlineAt: c.deadlineAt, callTimeoutMs: cfg.modelCallTimeoutMs, minAttemptMs: cfg.modelMinAttemptMs };
}

/** Signal cho MOT lan thu; con < MODEL_MIN_ATTEMPT_MS toi han chot => ModelDeadlineError, KHONG goi mang. */
function attemptSignal(l: CallLimits | undefined): AbortSignal | undefined {
  if (!l) return undefined;
  if (l.fixed) return l.fixed;
  let timeout = l.callTimeoutMs;
  if (l.deadlineAt !== undefined) {
    const remaining = l.deadlineAt - Date.now();
    if (remaining < l.minAttemptMs) {
      throw new ModelDeadlineError(`Con ${Math.max(0, Math.round(remaining))} ms toi han chot (< ${l.minAttemptMs} ms) — khong goi model.`);
    }
    timeout = Math.min(timeout, remaining);
  }
  return AbortSignal.timeout(timeout);
}

/** Da toi han chot (du sai so nho) — fetch bi huy vi het gio, khong phai loi mang that. */
function deadlinePassed(l: CallLimits | undefined): boolean {
  return l?.deadlineAt !== undefined && Date.now() >= l.deadlineAt - 25;
}

/** Sau khi cho `ms`, con du gio cho mot lan thu nua khong. */
function timeLeftAfter(l: CallLimits | undefined, ms: number): boolean {
  return l?.deadlineAt === undefined || l.deadlineAt - (Date.now() + ms) >= l.minAttemptMs;
}

/** `max_tokens` / `maxOutputTokens`: route community = MODEL_MAX_OUTPUT_TOKENS (1024, D31 T10); route khac giu tran cu. */
function maxTokensFor(route: ModelRoute): number {
  return route === 'community' ? readCommunityConfig().modelMaxOutputTokens : MAX_OUTPUT_TOKENS;
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
  turnId?: string | null;
  route: ModelRoute;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  latencyMs: number;
  outcome: 'ok' | 'error' | 'deadline';
}): Promise<void> {
  try {
    await sql(
      `insert into agent_runs
        (conversation_id, route, model, input_tokens, output_tokens, cache_read_tokens, latency_ms, outcome, turn_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        row.conversationId,
        row.route,
        row.model,
        row.inputTokens,
        row.outputTokens,
        row.cacheReadTokens,
        row.latencyMs,
        row.outcome,
        row.turnId ?? null,
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
  c: ModelCall,
  limits?: CallLimits
): Promise<{ message: Message; usage: Usage }> {
  const client = getAnthropicClient(c.route);
  const signal = attemptSignal(limits);
  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: maxTokensFor(c.route),
        system: buildSystem(c.system),
        messages: withImages(c.messages, c.images),
        tools: withCacheControlOnLastTool(c.tools),
      },
      signal ? { signal } : undefined
    );
    return { message, usage: message.usage };
  } catch (err) {
    if (signal?.aborted) {
      if (deadlinePassed(limits)) throw new ModelDeadlineError(`Model ${model}: het han chot luot.`);
      throw new ModelUnavailableError(`Model ${model}: qua thoi gian cho (${err instanceof Error ? err.message : 'abort'}).`);
    }
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

async function fetchGeminiOnce(
  model: string,
  body: unknown,
  route: ModelRoute = 'community',
  signal?: AbortSignal
): Promise<GeminiResponseBody> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_ENDPOINT_HOST}${encodeURIComponent(model)}:generateContent`;
  let fetchImpl: typeof fetch;
  if (route === 'triage') {
    if (!triageTestFetch && testFetch) {
      throw new GeminiRetryableError('triage: chua cau hinh setTriageFetchForTest trong moi truong test.');
    }
    fetchImpl = triageTestFetch ?? fetch;
  } else {
    fetchImpl = testFetch ?? fetch;
  }
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      // 01-CONTRACTS §2b: key qua header, CAM dat trong URL.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
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
  // D35.2: doc + parse than nam TRONG phan loai loi: huy khi dang doc than = nhu timeout; than 200 khong phai JSON = retryable.
  try {
    return (await res.json()) as GeminiResponseBody;
  } catch (err) {
    throw new GeminiRetryableError(`Loi doc than phan hoi Gemini ${model}: ${err instanceof Error ? err.name : "unknown"}.`);
  }
}

/** 01-CONTRACTS §2b "Loi": 429/500/503/504/mang/timeout ⇒ retry toi da 2
 * lan, lui 1s roi 3s, roi ModelUnavailableError; 400/401/403/404 ⇒ nem loi
 * goc ngay (khong retry). */
async function callGeminiWithRetry(
  model: string,
  body: unknown,
  route: ModelRoute = 'community',
  limits?: CallLimits
): Promise<GeminiResponseBody> {
  // SPEC-P03 §11.10: route 'triage' KHONG retry, khong MODEL_FALLBACKS — do
  // trung tam o `triageMessage` (mot lan goi, timeout rieng); o day ta van
  // giu duong retry cho cac route khac nguyen ven.
  if (route === 'triage') {
    return fetchGeminiOnce(model, body, route, attemptSignal(limits));
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt++) {
    const signal = attemptSignal(limits); // het gio => ModelDeadlineError, khong goi mang
    try {
      return await fetchGeminiOnce(model, body, route, signal);
    } catch (err) {
      if (!(err instanceof GeminiRetryableError)) throw err;
      if (deadlinePassed(limits)) throw new ModelDeadlineError(`Het han chot khi cho Gemini ${model}.`);
      lastErr = err;
      if (attempt === GEMINI_RETRY_DELAYS_MS.length) break;
      const delay = GEMINI_RETRY_DELAYS_MS[attempt]!;
      if (!timeLeftAfter(limits, delay)) throw new ModelDeadlineError(`Khong du gio de lui ${delay} ms roi thu lai Gemini ${model}.`);
      await sleep(delay);
    }
  }
  throw new ModelUnavailableError(`Model ${model}: ${(lastErr as Error)?.message ?? 'khong kha dung'} sau retry.`);
}

async function callGeminiOnce(model: string, c: ModelCall, limits?: CallLimits): Promise<{ message: Message; usage: Usage }> {
  const messagesWithImages = withImages(c.messages, c.images);
  const body = {
    systemInstruction: { parts: [{ text: c.system }] },
    contents: toGeminiContents(messagesWithImages),
    tools: toGeminiTools(c.tools),
    generationConfig: { maxOutputTokens: maxTokensFor(c.route) },
  };
  const raw = await callGeminiWithRetry(model, body, c.route, limits);
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
// Nhanh OpenAI-compat DUNG CHUNG giua openrouter (01-CONTRACTS §2c, Đ24) va
// vyce (§2d, Đ25) — cung chu ky ModelCall/vao-ra dang Anthropic; CHI
// adapters/model.ts biet dinh dang OpenAI (`/chat/completions`). §2d CAM
// nhan ban phan dich cua §2c ⇒ MOI ham dich/loi/retry duoi day dung CHUNG
// cho ca hai nha cung cap, khac nhau CHI o `OpenAICompatConfig` (url, key,
// header, co gui `provider.data_collection` hay khong).
// ---------------------------------------------------------------------------

interface OAIToolCallOut {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
interface OAITextPart {
  type: 'text';
  text: string;
}
interface OAIImagePart {
  type: 'image_url';
  image_url: { url: string };
}
type OAIContentPart = OAITextPart | OAIImagePart;
interface OAIMessageOut {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OAIContentPart[] | null;
  tool_calls?: OAIToolCallOut[];
  tool_call_id?: string;
}
interface OAIToolCallIn {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}
interface OAIChoice {
  message?: { content?: string | null; tool_calls?: OAIToolCallIn[] };
  finish_reason?: string;
}
interface OAIProviderError {
  code?: number | string;
  message?: string;
}
interface OAIResponseBody {
  choices?: OAIChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  model?: string;
  error?: OAIProviderError;
}

/** Loi retryable dung chung cho ca hai nha cung cap OpenAI-compat
 * (429/500/502/503/504/mang/timeout — 01-CONTRACTS §2c "Loi", ap dung ca
 * §2d qua "dung chung phan loi"). 402 (het credit) KHONG di qua loai nay —
 * nem thang `ModelUnavailableError` (qua `OpenAICompatCreditExhaustedError`)
 * de KHONG retry trong vong nay VA KHONG fallback sang model khac o
 * `callModel`. */
class OpenAICompatRetryableError extends Error {}
class OpenAICompatCreditExhaustedError extends ModelUnavailableError {}

function toolResultBlockToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: string; text: string } => (b as { type?: string })?.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
  return JSON.stringify(content);
}

function blockToOAIContentPart(block: ContentBlockParam): OAIContentPart | null {
  if (block.type === 'text') return { type: 'text', text: block.text };
  if (block.type === 'image') {
    if (block.source.type !== 'base64') return null;
    return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
  }
  return null;
}

/** Gop mot nhom khoi text/image (khong co tool_result) thanh MOT message
 * 'user' — 01-CONTRACTS §2c "Dich vao": chuoi (nhieu khoi text noi "\n")
 * khi KHONG co anh, mang part khi CO anh. */
function flushOAIUserGroup(group: ContentBlockParam[]): OAIMessageOut | null {
  if (group.length === 0) return null;
  const hasImage = group.some((b) => b.type === 'image');
  if (!hasImage) {
    const text = group
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { role: 'user', content: text };
  }
  const parts = group.map(blockToOAIContentPart).filter((p): p is OAIContentPart => p !== null);
  return { role: 'user', content: parts };
}

/** 01-CONTRACTS §2c "Dich vao" (dung chung voi §2d): system dau mang;
 * assistant tool_use ⇒ tool_calls; MOI tool_result ⇒ mot message
 * {role:'tool'} rieng, dat NGAY sau message assistant chua tool_calls, dung
 * thu tu. */
function buildOAIMessages(system: string, messages: MessageParam[]): OAIMessageOut[] {
  const out: OAIMessageOut[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    const blocks: ContentBlockParam[] =
      typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'assistant') {
      const textParts: string[] = [];
      const toolCalls: OAIToolCallOut[] = [];
      for (const b of blocks) {
        if (b.type === 'text') textParts.push(b.text);
        else if (b.type === 'tool_use') {
          toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } });
        }
      }
      const assistantMsg: OAIMessageOut = { role: 'assistant', content: textParts.length > 0 ? textParts.join('\n') : null };
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      out.push(assistantMsg);
      continue;
    }
    // role 'user': xu ly TUNG khoi theo thu tu — gop text/image thanh mot
    // message 'user', gap tool_result thi xa nhom hien tai roi phat MOT
    // message 'tool' rieng cho tool_result do (co the co NHIEU tool_result
    // lien tiep trong CUNG mot luot — moi cai la mot message rieng).
    let group: ContentBlockParam[] = [];
    for (const b of blocks) {
      if (b.type === 'tool_result') {
        const flushed = flushOAIUserGroup(group);
        if (flushed) out.push(flushed);
        group = [];
        const content = toolResultBlockToString(b.content);
        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.is_error ? `ERROR: ${content}` : content });
      } else if (b.type === 'text' || b.type === 'image') {
        group.push(b);
      }
    }
    const tail = flushOAIUserGroup(group);
    if (tail) out.push(tail);
  }
  return out;
}

function toOAITools(tools: Tool[] | undefined): unknown {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/** 01-CONTRACTS §2c "Dich ra" (dung chung voi §2d): co tool_calls ⇒ luon
 * 'tool_use' (bat ke finish_reason); 'length' ⇒ max_tokens; 'content_filter'
 * ⇒ refusal; con lai (kem 'stop') ⇒ end_turn. */
function determineOAIStopReason(choice: OAIChoice | undefined): Message['stop_reason'] {
  const hasToolCalls = (choice?.message?.tool_calls?.length ?? 0) > 0;
  if (hasToolCalls) return 'tool_use';
  const finishReason = choice?.finish_reason;
  if (finishReason === 'length') return 'max_tokens';
  if (finishReason === 'content_filter') return 'refusal';
  return 'end_turn';
}

/** functionCall.arguments khong parse duoc JSON ⇒ input = {} de lop kiem
 * input tool (§2b "Kiem input tool") tra InvalidToolInput thay vi vo o day. */
function oaiMessageToContent(message: OAIChoice['message']): ContentBlockParam[] {
  const out: ContentBlockParam[] = [];
  if (typeof message?.content === 'string' && message.content.length > 0) {
    out.push({ type: 'text', text: message.content, citations: null });
  }
  for (const tc of message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(tc.function.arguments);
      if (parsed && typeof parsed === 'object') input = parsed as Record<string, unknown>;
    } catch {
      input = {};
    }
    out.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
  }
  return out;
}

/** Cau hinh rieng cua tung nha cung cap OpenAI-compat — CHI khac nhau o
 * day, moi logic dich/loi/retry dung CHUNG (§2d "CAM nhan ban"). */
interface OpenAICompatConfig {
  /** Ten hien trong thong bao loi ('OpenRouter' | 'Vyce'). */
  label: string;
  /** Endpoint DAY DU (da ghep base URL + '/chat/completions'). */
  url: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
  /** CHI openrouter (§2c) gui `provider.data_collection:'deny'`; §2d KHONG gui truong nay. */
  includeDataCollectionDeny: boolean;
  /** Fetch gia RIENG cua nha cung cap nay (setOpenRouterFetchForTest / setVyceFetchForTest). */
  testFetch: typeof fetch | null;
}

async function fetchOpenAICompatOnce(
  cfg: OpenAICompatConfig,
  model: string,
  body: unknown,
  route: ModelRoute,
  signal?: AbortSignal
): Promise<OAIResponseBody> {
  let fetchImpl: typeof fetch;
  if (route === 'triage') {
    // 01-CONTRACTS §2c/§2d "Thu nghiem": triage dung lai setTriageFetchForTest
    // — cung ngu nghia "thieu cau hinh rieng cho triage => coi nhu khong kha
    // dung" nhu nhanh gemini (xem ghi chu getAnthropicClient/fetchGeminiOnce).
    if (!triageTestFetch && cfg.testFetch) {
      throw new OpenAICompatRetryableError(`triage (${cfg.label}): chua cau hinh setTriageFetchForTest trong moi truong test.`);
    }
    fetchImpl = triageTestFetch ?? fetch;
  } else {
    fetchImpl = cfg.testFetch ?? fetch;
  }
  let res: Response;
  try {
    res = await fetchImpl(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    throw new OpenAICompatRetryableError(`Loi mang khi goi ${cfg.label} ${model}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 402) {
    const text = await res.text().catch(() => '');
    throw new OpenAICompatCreditExhaustedError(`${cfg.label} ${model} het credit (402), khong retry/fallback: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const status = res.status;
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      throw new OpenAICompatRetryableError(`${cfg.label} ${model} tra loi ${status}.`);
    }
    const text = await res.text().catch(() => '');
    throw new Error(`${cfg.label} ${model} tra loi ${status} (khong retry — loi cau hinh): ${text.slice(0, 300)}`);
  }
  // D35.2: nhu nhanh Gemini; het han luot ⇒ ModelDeadlineError o vong retry.
  let parsed: OAIResponseBody;
  try {
    parsed = (await res.json()) as OAIResponseBody;
  } catch (err) {
    throw new OpenAICompatRetryableError(`Loi doc than phan hoi ${cfg.label} ${model}: ${err instanceof Error ? err.name : "unknown"}.`);
  }
  if (parsed.error) {
    const code = parsed.error.code;
    if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) {
      throw new OpenAICompatRetryableError(`${cfg.label} ${model} body.error ${String(code)}: ${parsed.error.message ?? ''}`);
    }
    if (code === 402) {
      throw new OpenAICompatCreditExhaustedError(`${cfg.label} ${model} body.error 402, khong retry/fallback: ${parsed.error.message ?? ''}`);
    }
    throw new Error(`${cfg.label} ${model} body.error ${String(code)}: ${parsed.error.message ?? ''}`);
  }
  return parsed;
}

/** 01-CONTRACTS §2c "Loi" (dung chung §2d): 429/500/502/503/504/mang/timeout
 * ⇒ retry toi da 2 lan (lui 1s roi 3s) roi ModelUnavailableError, sau do
 * MODEL_FALLBACKS o `callModel`; 402 nem thang tu `fetchOpenAICompatOnce`
 * (khong qua vong nay); 400/401/403/404 nem loi goc. */
async function callOpenAICompatWithRetry(
  cfg: OpenAICompatConfig,
  model: string,
  body: unknown,
  route: ModelRoute,
  limits?: CallLimits
): Promise<OAIResponseBody> {
  if (route === 'triage') {
    return fetchOpenAICompatOnce(cfg, model, body, route, attemptSignal(limits));
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt++) {
    const signal = attemptSignal(limits);
    try {
      return await fetchOpenAICompatOnce(cfg, model, body, route, signal);
    } catch (err) {
      if (!(err instanceof OpenAICompatRetryableError)) throw err;
      if (deadlinePassed(limits)) throw new ModelDeadlineError(`Het han chot khi cho ${cfg.label} ${model}.`);
      lastErr = err;
      if (attempt === GEMINI_RETRY_DELAYS_MS.length) break;
      const delay = GEMINI_RETRY_DELAYS_MS[attempt]!;
      if (!timeLeftAfter(limits, delay)) throw new ModelDeadlineError(`Khong du gio de lui ${delay} ms roi thu lai ${cfg.label} ${model}.`);
      await sleep(delay);
    }
  }
  throw new ModelUnavailableError(`Model ${model}: ${(lastErr as Error)?.message ?? 'khong kha dung'} sau retry.`);
}

async function callOpenAICompatOnce(
  cfg: OpenAICompatConfig,
  model: string,
  c: ModelCall,
  limits?: CallLimits
): Promise<{ message: Message; usage: Usage }> {
  const messagesWithImages = withImages(c.messages, c.images);
  const body: Record<string, unknown> = {
    model,
    messages: buildOAIMessages(c.system, messagesWithImages),
    tools: toOAITools(c.tools),
    max_tokens: maxTokensFor(c.route),
  };
  if (cfg.includeDataCollectionDeny) {
    // 01-CONTRACTS §2c: BAT BUOC — khong cho nha cung cap dung du lieu cu
    // dan de huan luyen (Luat 91/2025). §2d (vyce): KHONG gui truong nay.
    body.provider = { data_collection: 'deny' };
  }
  const raw = await callOpenAICompatWithRetry(cfg, model, body, c.route, limits);
  const choice = raw.choices?.[0];
  const content = oaiMessageToContent(choice?.message);
  const stopReason = determineOAIStopReason(choice);
  const usage: Usage = {
    input_tokens: raw.usage?.prompt_tokens ?? 0,
    output_tokens: raw.usage?.completion_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: raw.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cache_creation: null,
    server_tool_use: null,
    service_tier: null,
  } as unknown as Usage;
  const message = {
    id: `msg_oai_${Date.now()}`,
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

// --- openrouter (§2c): cau hinh + wrapper mong goi ham dung chung o tren ---

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error('OPENROUTER_API_KEY chua duoc cau hinh trong .env.');
  }
  return key;
}

function openRouterBaseUrl(): string {
  const raw = process.env.OPENROUTER_BASE_URL?.trim();
  return raw && raw.length > 0 ? raw : OPENROUTER_DEFAULT_BASE_URL;
}

async function callOpenRouterOnce(model: string, c: ModelCall, limits?: CallLimits): Promise<{ message: Message; usage: Usage }> {
  return callOpenAICompatOnce(
    {
      label: 'OpenRouter',
      url: `${openRouterBaseUrl()}/chat/completions`,
      apiKey: getOpenRouterApiKey(),
      extraHeaders: { 'x-title': 'lenqclaw' },
      includeDataCollectionDeny: true,
      testFetch: testFetchOpenRouter,
    },
    model,
    c,
    limits
  );
}

// --- vyce (§2d, Đ25): cau hinh + wrapper, dung chung ham dich o tren ---

function getVyceApiKey(): string {
  const key = process.env.VYCE_API_KEY?.trim();
  if (!key) {
    throw new Error('VYCE_API_KEY chua duoc cau hinh trong .env.');
  }
  return key;
}

function vyceBaseUrl(): string {
  const raw = process.env.VYCE_BASE_URL?.trim();
  return raw && raw.length > 0 ? raw : VYCE_DEFAULT_BASE_URL;
}

async function callVyceOnce(model: string, c: ModelCall, limits?: CallLimits): Promise<{ message: Message; usage: Usage }> {
  // 01-CONTRACTS §2d "Du lieu": Vyce la proxy ben thu ba, KHONG co cam ket
  // khong luu du lieu ⇒ TU CHOI khi DATA_MODE != 'sim' — nem loi cau hinh
  // NGAY, KHONG goi mang (0 lan fetch).
  if (process.env.DATA_MODE !== 'sim') {
    throw new Error(
      'MODEL_PROVIDER=vyce chi chay khi DATA_MODE=sim (01-CONTRACTS §2d) — proxy ben thu ba khong cam ket khong luu du lieu cu dan.'
    );
  }
  return callOpenAICompatOnce(
    {
      label: 'Vyce',
      url: `${vyceBaseUrl()}/chat/completions`,
      apiKey: getVyceApiKey(),
      includeDataCollectionDeny: false,
      testFetch: testFetchVyce,
    },
    model,
    c,
    limits
  );
}

// ---------------------------------------------------------------------------
// Vao chung: `callModel` — chon nha cung cap, thu MODEL_FALLBACKS khi
// ModelUnavailableError (01-CONTRACTS §2b "Model"), ghi `agent_runs.model`
// = model thuc chay.
// ---------------------------------------------------------------------------

export async function callModel(c: ModelCall): Promise<CallModelResult> {
  const provider = resolveProvider();
  const primaryModel = resolveModel(c.route, provider, c.tier ?? 'default');
  const fallbacks = resolveFallbackModels(provider);
  const candidates = [primaryModel, ...fallbacks];
  const startedAt = Date.now();
  const limits = limitsFor(c);

  const record = (model: string, outcome: 'ok' | 'error' | 'deadline', usage?: Usage) =>
    recordAgentRun({
      conversationId: c.conversationId ?? null,
      turnId: c.turnId ?? null,
      route: c.route,
      model,
      inputTokens: usage ? usage.input_tokens : null,
      outputTokens: usage ? usage.output_tokens : null,
      cacheReadTokens: usage ? usage.cache_read_input_tokens : null,
      latencyMs: Date.now() - startedAt,
      outcome,
    });

  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i]!;
    try {
      const { message, usage } =
        provider === 'anthropic'
          ? await callAnthropicOnce(model, c, limits)
          : provider === 'openrouter'
            ? await callOpenRouterOnce(model, c, limits)
            : provider === 'vyce'
              ? await callVyceOnce(model, c, limits)
              : await callGeminiOnce(model, c, limits);
      await record(model, 'ok', usage);
      return { message, usage, model };
    } catch (err) {
      lastErr = err;
      // D31 (BB-18): het han chot ⇒ DUNG NGAY — khong thu fallback, khong thu lai sau han.
      if (err instanceof ModelDeadlineError) {
        await record(model, 'deadline');
        throw err;
      }
      // 01-CONTRACTS §2c/§2d: 402 (het credit) la ModelUnavailableError nhung KHONG duoc thu MODEL_FALLBACKS.
      const isRetryableAcrossModels = err instanceof ModelUnavailableError && !(err instanceof OpenAICompatCreditExhaustedError);
      const isLastCandidate = i === candidates.length - 1;
      if (isRetryableAcrossModels && !isLastCandidate) {
        // chi thu model du phong khi con du gio cho mot lan thu (D31)
        if (timeLeftAfter(limits, 0)) continue;
        const dl = new ModelDeadlineError('Het gio de thu model du phong.');
        await record(model, 'deadline');
        throw dl;
      }
      await record(model, 'error');
      throw err;
    }
  }
  // Khong the toi day (candidates luon >= 1 phan tu) — giu de TypeScript yen tam.
  throw lastErr instanceof Error ? lastErr : new Error('callModel: khong co model nao de goi.');
}

export interface TriageModelCall {
  system: string;
  messages: MessageParam[];
  conversationId?: string | null;
  /** D31: huy fetch bang `AbortSignal` sau chung nay ms (thay `Promise.race` — fetch khong chay tiep ngam). */
  timeoutMs: number;
}

/** SPEC-P03 §11.10: goi model cho route 'triage' — MOT lan goi DUY NHAT,
 * KHONG retry, KHONG MODEL_FALLBACKS (khac `callModel`, do gia tren toc do
 * quan trong hon do tin cay o day; timeout do `triageMessage` tu quan ly
 * bang Promise.race). Model KHONG roi ve MODEL_DEFAULT (`resolveTriageModel`). */
export async function callTriageModel(c: TriageModelCall): Promise<CallModelResult> {
  const provider = resolveProvider();
  const model = resolveTriageModel(provider);
  const startedAt = Date.now();
  const call: ModelCall = { route: 'triage', system: c.system, messages: c.messages };
  const limits: CallLimits = { callTimeoutMs: c.timeoutMs, minAttemptMs: 0, fixed: AbortSignal.timeout(c.timeoutMs) };
  try {
    const { message, usage } =
      provider === 'anthropic'
        ? await callAnthropicOnce(model, call, limits)
        : provider === 'openrouter'
          ? await callOpenRouterOnce(model, call, limits)
          : provider === 'vyce'
            ? await callVyceOnce(model, call, limits)
            : await callGeminiOnce(model, call, limits);
    await recordAgentRun({
      conversationId: c.conversationId ?? null,
      route: 'triage',
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
      route: 'triage',
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

export { DEFAULT_TRIAGE_TIMEOUT_MS };

// ---------------------------------------------------------------------------
// Embedding (SPEC-P04 §2, 01-CONTRACTS §2.2) — chi nhanh Gemini `batchEmbedContents`.
// ---------------------------------------------------------------------------

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dim: number;
}

export interface EmbedOpts {
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
  /** D31: han chot (epoch ms). Moi lan thu: timeout = min(EMBED_TIMEOUT_MS, deadlineAt - now); het gio ⇒ EmbeddingUnavailableError. */
  deadlineAt?: number;
  /** Tran thoi gian MOI lan thu khi KHONG co `deadlineAt` (nhung tai lieu hang loat); mac dinh EMBED_TIMEOUT_MS. */
  timeoutMs?: number;
}

const EMBED_BATCH = 100;
let embedRetryDelaysMs: number[] = [1000, 3000];
let testFetchEmbed: typeof fetch | null = null;

/** Chi dung trong test: thay `fetch` that cua `embedTexts` bang fake (0 mang). `null` ⇒ go. */
export function setEmbedFetchForTest(fake: typeof fetch | null): void {
  testFetchEmbed = fake;
}

/** Chi dung trong test: doi bang lui retry (mac dinh 1 s, 3 s). */
export function setEmbedRetryDelaysForTest(delays: number[] | null): void {
  embedRetryDelaysMs = delays ?? [1000, 3000];
}

async function embedBatchOnce(url: string, apiKey: string, body: unknown, signal: AbortSignal): Promise<{ retryable: boolean; values?: number[][]; error?: string }> {
  const fetchImpl = testFetchEmbed ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    return { retryable: true, error: `loi mang/timeout (${err instanceof Error ? err.name : 'unknown'})` };
  }
  if (!res.ok) {
    return { retryable: res.status === 429 || res.status >= 500, error: `HTTP ${res.status}` };
  }
  try {
    const json = (await res.json()) as { embeddings?: Array<{ values?: unknown }> };
    const values = (json.embeddings ?? []).map((e) => e.values);
    if (!values.every((v): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number'))) {
      return { retryable: false, error: 'phan hoi khong co embeddings[].values hop le' };
    }
    return { retryable: false, values };
  } catch (err) {
    return { retryable: true, error: `loi doc than phan hoi (${err instanceof Error ? err.name : 'unknown'})` };
  }
}

/**
 * `embedTexts(texts, opts)`: Gemini `batchEmbedContents`, `outputDimensionality = EMBED_DIM`, chia batch 100, retry 2 lan
 * (429/5xx/mang/timeout; lui 1 s, 3 s). Moi that bai ⇒ `EmbeddingUnavailableError` (message KHONG chua key/noi dung).
 * Nhanh khac Gemini (`EMBED_PROVIDER` ≠ 'gemini') hoac thieu `GEMINI_API_KEY` ⇒ nem NGAY, 0 fetch.
 */
export async function embedTexts(texts: string[], opts: EmbedOpts = {}): Promise<EmbedResult> {
  const cfg = readCommunityConfig();
  if (cfg.embedProvider !== 'gemini') {
    throw new EmbeddingUnavailableError(`EMBED_PROVIDER='${cfg.embedProvider}' khong ho tro embedding.`);
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new EmbeddingUnavailableError('Thieu GEMINI_API_KEY cho embedding.');
  // Chong goi mang that trong test: dang chay vitest, hoac da cai fake cho model (vd latency_slo) ma chua cai fake embed ⇒ khong fetch.
  if (!testFetchEmbed && (process.env.VITEST || testFetch || triageTestFetch)) {
    throw new EmbeddingUnavailableError('Moi truong test: chua cau hinh setEmbedFetchForTest — khong goi mang.');
  }
  if (texts.length === 0) return { vectors: [], model: cfg.embedModel, dim: cfg.embedDim };

  const taskType = opts.taskType ?? 'RETRIEVAL_DOCUMENT';
  const url = `${GEMINI_ENDPOINT_HOST}${encodeURIComponent(cfg.embedModel)}:batchEmbedContents`;
  const attemptTimeout = (): number => {
    let t = opts.timeoutMs ?? cfg.embedTimeoutMs;
    if (opts.deadlineAt !== undefined) t = Math.min(opts.timeoutMs ?? cfg.embedTimeoutMs, opts.deadlineAt - Date.now());
    return t;
  };
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    const body = {
      requests: chunk.map((t) => ({
        model: `models/${cfg.embedModel}`,
        content: { parts: [{ text: t }] },
        taskType,
        outputDimensionality: cfg.embedDim,
      })),
    };
    let got: number[][] | null = null;
    let lastErr = 'khong ro';
    for (let attempt = 0; attempt <= embedRetryDelaysMs.length; attempt++) {
      const timeout = attemptTimeout();
      if (timeout <= 0) throw new EmbeddingUnavailableError('Het han chot, bo qua embedding.');
      const r = await embedBatchOnce(url, apiKey, body, AbortSignal.timeout(timeout));
      if (r.values) {
        got = r.values;
        break;
      }
      lastErr = r.error ?? lastErr;
      if (!r.retryable || attempt === embedRetryDelaysMs.length) break;
      const delay = embedRetryDelaysMs[attempt]!;
      if (opts.deadlineAt !== undefined && opts.deadlineAt - (Date.now() + delay) <= 0) break;
      await sleep(delay);
    }
    if (!got) throw new EmbeddingUnavailableError(`Embedding that bai: ${lastErr}.`);
    if (got.length !== chunk.length) throw new EmbeddingUnavailableError('Embedding tra so vector khong khop so text.');
    for (const v of got) {
      if (v.length !== cfg.embedDim) throw new EmbeddingUnavailableError(`Vector ${v.length} chieu, cot can ${cfg.embedDim} (Q3 — dung, khong doi DDL).`);
      vectors.push(v);
    }
  }
  return { vectors, model: cfg.embedModel, dim: cfg.embedDim };
}
