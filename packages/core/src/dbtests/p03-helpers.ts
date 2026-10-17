// dbtests/p03-helpers.ts — khung dung chung cho test DB cua P03 (model gia theo kich ban `setGeminiFetchForTest`,
// nhom/thanh vien tao moi moi test de khong dung nhau, ham gui tin + doc ket qua). KHONG phai file test.

import { randomUUID } from 'node:crypto';
import { sql } from '../adapters/db.js';
import { setGeminiFetchForTest, setTriageFetchForTest } from '../adapters/model.js';
import { routeInboundEvent } from '../agent/community/router.js';
import { invalidatePersonaCache } from '../agent/community/persona.js';
import { drainInbound } from '../runner/inbound-runner.js';
import { processInbound, simInbound, type SimInboundArgs } from '../sim/sim-transport.js';

// ---------------------------------------------------------------------------
// Model gia
// ---------------------------------------------------------------------------

export type Step =
  | { kind: 'text'; text: string }
  | { kind: 'tools'; calls: Array<{ name: string; args: Record<string, unknown> }> }
  | { kind: 'empty' }
  | { kind: 'refusal' }
  | { kind: 'http'; status: number }
  /** 200 + than khong phai JSON (proxy tra HTML). */
  | { kind: 'bad_json' }
  /** 200 header ngay, than treo toi khi AbortSignal huy (R08 B5). */
  | { kind: 'stall_body' }
  | { kind: 'delay'; ms: number; then: Step }
  | { kind: 'fn'; fn: (body: GeminiBody, text: string) => Step };

export const T = (text: string): Step => ({ kind: 'text', text });
export const TOOLS = (...calls: Array<{ name: string; args: Record<string, unknown> }>): Step => ({ kind: 'tools', calls });
export const EMPTY: Step = { kind: 'empty' };
export const REFUSAL: Step = { kind: 'refusal' };
export const HTTP = (status: number): Step => ({ kind: 'http', status });
export const BAD_JSON: Step = { kind: 'bad_json' };
export const STALL_BODY: Step = { kind: 'stall_body' };
export const DELAY = (ms: number, then: Step): Step => ({ kind: 'delay', ms, then });
/** Buoc tinh theo body that (vd lay id tin kich hoat de quote). */
export const FN = (fn: (body: GeminiBody, text: string) => Step): Step => ({ kind: 'fn', fn });

/** Toan bo text trong `contents` (de tim khoi/id). */
export function bodyText(body: GeminiBody): string {
  return body.contents.flatMap((c) => c.parts.map((p) => (typeof p.text === 'string' ? p.text : ''))).join('\n');
}

/** id (`#id`) cua tin dau tien trong khoi focus cua luot nhom. */
export function focusId(body: GeminiBody): string {
  const focus = bodyText(body).split('<<<untrusted focus>>>')[1] ?? '';
  const m = /\[#(\d+) uid=/.exec(focus);
  if (!m) throw new Error('khong tim thay tin trong khoi focus');
  return m[1]!;
}

interface Script {
  key: string;
  steps: Step[];
  /** Het buoc thi lap lai buoc cuoi (vong tool vo han). */
  repeatLast: boolean;
  used: number;
  bodies: GeminiBody[];
}

export interface GeminiBody {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
  tools?: Array<{ functionDeclarations: Array<{ name: string }> }>;
  generationConfig?: { maxOutputTokens?: number };
}

const scripts = new Map<string, Script>();
const unmatched: GeminiBody[] = [];

/** Dang ky kich ban cho lan goi co body chua `key` (thread id / chuoi duy nhat). */
export function script(key: string, steps: Step[], opts: { repeatLast?: boolean } = {}): Script {
  const s: Script = { key, steps, repeatLast: opts.repeatLast === true, used: 0, bodies: [] };
  scripts.set(key, s);
  return s;
}

export function modelCalls(key: string): number {
  return scripts.get(key)?.used ?? 0;
}
export function modelBodies(key: string): GeminiBody[] {
  return scripts.get(key)?.bodies ?? [];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function geminiResponse(step: Exclude<Step, { kind: 'delay' } | { kind: 'http' } | { kind: 'fn' } | { kind: 'bad_json' } | { kind: 'stall_body' }>): Response {
  const usage = { promptTokenCount: 100, candidatesTokenCount: 20 };
  switch (step.kind) {
    case 'text':
      return json(200, { candidates: [{ content: { parts: [{ text: step.text }] }, finishReason: 'STOP' }], usageMetadata: usage });
    case 'tools':
      return json(200, {
        candidates: [{ content: { parts: step.calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })) }, finishReason: 'STOP' }],
        usageMetadata: usage,
      });
    case 'empty':
      return json(200, { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }], usageMetadata: usage });
    case 'refusal':
      return json(200, { candidates: [{ finishReason: 'SAFETY' }], usageMetadata: usage });
  }
}

async function play(step: Step, signal: AbortSignal | undefined, body: GeminiBody): Promise<Response> {
  if (step.kind === 'http') return new Response('err', { status: step.status });
  if (step.kind === 'bad_json') return new Response('<html>proxy</html>', { status: 200 });
  if (step.kind === 'stall_body') {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"candidates":['));
        signal?.addEventListener('abort', () => c.error(signal.reason ?? new Error('aborted')), { once: true });
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (step.kind === 'fn') return play(step.fn(body, bodyText(body)), signal, body);
  if (step.kind === 'delay') {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, step.ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(signal.reason ?? new Error('aborted'));
        },
        { once: true }
      );
    });
    return play(step.then, signal, body);
  }
  return geminiResponse(step);
}

const fakeCommunityFetch: typeof fetch = async (_url, init) => {
  const raw = String(init?.body ?? '');
  const body = JSON.parse(raw) as GeminiBody;
  // uu tien key DAI NHAT khop (thread id cu the truoc chuoi chung)
  const keys = [...scripts.keys()].sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (!raw.includes(k)) continue;
    const s = scripts.get(k)!;
    s.bodies.push(body);
    const idx = s.used;
    s.used += 1;
    const step = s.steps[Math.min(idx, s.steps.length - 1)];
    if (!step || (idx >= s.steps.length && !s.repeatLast)) return geminiResponse({ kind: 'text', text: 'ok (het kich ban)' });
    return play(step, init?.signal ?? undefined, body);
  }
  unmatched.push(body);
  return geminiResponse({ kind: 'text', text: 'ok (khong kich ban)' });
};

/** Triage gia: moi tin la binh thuong, khong phai cau hoi. */
const fakeTriageFetch: typeof fetch = async () =>
  json(200, {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                verdict: 'ok',
                confidence: 0.9,
                is_question: false,
                question_confidence: 0.1,
                lead_intent: false,
                lead_confidence: 0.1,
                wants_private: false,
              }),
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
  });

const ENV_KEYS = ['MODEL_PROVIDER', 'GEMINI_API_KEY', 'MODEL_COMMUNITY', 'MODEL_COMMUNITY_FAST', 'MODEL_TRIAGE', 'MODEL_FALLBACKS', 'MODEL_DEFAULT', 'DATA_MODE'] as const;
const savedEnv = new Map<string, string | undefined>();

export function installFakeModel(): void {
  for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);
  process.env.MODEL_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.MODEL_COMMUNITY = 'gemini-fake-main';
  process.env.MODEL_FALLBACKS = ''; // khong chuoi fallback ⇒ retry ngan
  delete process.env.MODEL_DEFAULT;
  delete process.env.MODEL_COMMUNITY_FAST;
  process.env.DATA_MODE = 'sim';
  setGeminiFetchForTest(fakeCommunityFetch);
  setTriageFetchForTest(fakeTriageFetch);
  invalidatePersonaCache();
}

export function uninstallFakeModel(): void {
  setGeminiFetchForTest(null);
  setTriageFetchForTest(null);
  for (const k of ENV_KEYS) {
    const v = savedEnv.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  scripts.clear();
  unmatched.length = 0;
}

export function resetScripts(): void {
  scripts.clear();
  unmatched.length = 0;
}

// ---------------------------------------------------------------------------
// Du lieu
// ---------------------------------------------------------------------------

export const ACCOUNT = 'community' as const;

export function uniq(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export async function mkGroup(
  over: {
    mode?: 'mention' | 'ambient';
    enabled?: boolean;
    moderation?: boolean;
    denyUsers?: string[];
    allowUsers?: string[];
    budget?: number;
    ambientBudget?: number;
    systemPrompt?: string | null;
    members?: Array<{ uid: string; role?: 'member' | 'moderator'; name?: string }>;
  } = {}
): Promise<string> {
  const id = uniq('p03g');
  await sql(
    `insert into zalo_groups (zalo_account_id, thread_id, name, enabled, mode, moderation_enabled, deny_users, allow_users, budget_per_hour,
                              ambient_turns_per_hour, system_prompt)
     values ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9,$10,$11)`,
    [
      ACCOUNT,
      id,
      `Nhóm test ${id}`,
      over.enabled ?? true,
      over.mode ?? 'mention',
      over.moderation ?? false,
      over.denyUsers ?? [],
      over.allowUsers ?? [],
      over.budget ?? 20,
      over.ambientBudget ?? 12,
      over.systemPrompt ?? null,
    ]
  );
  for (const m of over.members ?? []) {
    await sql(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name) values ($1,$2,$3,$4,$5)
       on conflict do nothing`,
      [ACCOUNT, id, m.uid, m.role ?? 'member', m.name ?? m.uid]
    );
  }
  return id;
}

/** Gui tin vao nhom/DM roi xu ly DUNG MOT su kien cu nhat qua pipeline. */
export async function send(args: Omit<SimInboundArgs, 'account' | 'threadType'> & { threadType?: 'user' | 'group' }): Promise<{ id: number | null; msgId: string }> {
  const msgId = args.msgId ?? `p03-${randomUUID()}`;
  const r = await simInbound({ ...args, account: ACCOUNT, threadType: args.threadType ?? 'group', msgId });
  return { id: r.id, msgId };
}

export async function runAll(): Promise<number> {
  return drainInbound(routeInboundEvent);
}

export async function runOne(handler = routeInboundEvent): Promise<number> {
  return (await processInbound(handler)).processed;
}

/** Rut sach hang doi cu (voi model gia dang chay) de test sau do khong an nham su kien cu. */
export async function drainStale(): Promise<void> {
  await drainInbound(routeInboundEvent);
}

export async function count(text: string, params: unknown[] = []): Promise<number> {
  const r = await sql<{ c: number }>(`select count(*)::int as c from (${text}) t`, params);
  return r[0]!.c;
}

export interface OutboxText {
  id: number;
  kind: string;
  body: { text?: string; quote?: { msgId: string }; mentions?: unknown[] };
}
export async function outboxFor(threadId: string, kinds: string[] = ['text']): Promise<OutboxText[]> {
  return sql<OutboxText>(`select id::int as id, kind, body from outbox where thread_id = $1 and kind = any($2::text[]) order by id`, [threadId, kinds]);
}

export interface TraceRow {
  id: string;
  outcome: string;
  rounds: number;
  sent: number;
  kind: string;
  tools: string[];
}
export async function tracesFor(threadId: string): Promise<TraceRow[]> {
  return sql<TraceRow>(`select id, outcome, rounds, sent, kind, tools from turn_traces where thread_id = $1 order by created_at, id`, [threadId]);
}

export async function agentRunsForThread(threadId: string, route = 'community'): Promise<number> {
  return count(
    `select 1 from agent_runs r join turn_traces t on t.id = r.turn_id where t.thread_id = $1 and r.route = $2`,
    [threadId, route]
  );
}

export async function auditCount(action: string, target: string): Promise<number> {
  return count(`select 1 from audit_log where action = $1 and target = $2`, [action, target]);
}
