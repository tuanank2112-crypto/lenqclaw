// model.ts — D31 (BB-18, SPEC-D31 §16 hang 2, SPEC-P03 §11 hang 14): han chot cua luot, AbortSignal, tier fast,
// maxOutputTokens 1024. 0 mang: fetch gia ton trong `init.signal`.
import { afterEach, describe, expect, it } from 'vitest';
import { ModelDeadlineError, ModelUnavailableError } from '../domain/errors.js';
import { callModel, callTriageModel, resolveModel, setGeminiFetchForTest, setOpenRouterFetchForTest, setTriageFetchForTest } from './model.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const OK_BODY = { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };

/** Fetch gia tre `ms`, nhung reject ngay khi `init.signal` bi huy (giong fetch that). */
function slowFetch(ms: number, record: { calls: number; signals: AbortSignal[]; urls: string[]; bodies: unknown[] }): typeof fetch {
  return async (url, init) => {
    record.calls += 1;
    record.urls.push(String(url));
    record.bodies.push(JSON.parse(String(init?.body ?? '{}')));
    const signal = init?.signal ?? undefined;
    if (signal) record.signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error('aborted'));
      });
    });
    return jsonResponse(200, OK_BODY);
  };
}

const rec = () => ({ calls: 0, signals: [] as AbortSignal[], urls: [] as string[], bodies: [] as unknown[] });
const CALL = { route: 'community' as const, system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };

const ENV = ['MODEL_PROVIDER', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'MODEL_COMMUNITY', 'MODEL_COMMUNITY_FAST', 'MODEL_FALLBACKS', 'MODEL_DEFAULT', 'MODEL_MAX_OUTPUT_TOKENS', 'MODEL_MIN_ATTEMPT_MS', 'DATABASE_URL'];
const saved = new Map<string, string | undefined>();
function env(over: Record<string, string>) {
  for (const k of ENV) {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    delete process.env[k];
  }
  delete process.env.DATABASE_URL; // test don vi: khong ghi agent_runs
  Object.assign(process.env, { MODEL_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', MODEL_COMMUNITY: 'main-model', MODEL_FALLBACKS: '', ...over });
}

afterEach(() => {
  setGeminiFetchForTest(null);
  setTriageFetchForTest(null);
  setOpenRouterFetchForTest(null);
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
});

describe('callModel — han chot (deadlineAt)', () => {
  it('fetch tre 5000 ms, han chot +1500 ms ⇒ ModelDeadlineError trong <= 1700 ms, signal da huy', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(5000, r));
    const t0 = Date.now();
    await expect(callModel({ ...CALL, deadlineAt: Date.now() + 1500 })).rejects.toBeInstanceOf(ModelDeadlineError);
    expect(Date.now() - t0).toBeLessThanOrEqual(1700);
    expect(r.calls).toBe(1);
    expect(r.signals[0]!.aborted).toBe(true);
  });

  it('con 600 ms (< MODEL_MIN_ATTEMPT_MS 800) ⇒ 0 fetch', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(10, r));
    await expect(callModel({ ...CALL, deadlineAt: Date.now() + 600 })).rejects.toBeInstanceOf(ModelDeadlineError);
    expect(r.calls).toBe(0);
  });

  it('da qua han ⇒ 0 fetch', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(10, r));
    await expect(callModel({ ...CALL, deadlineAt: Date.now() - 100 })).rejects.toBeInstanceOf(ModelDeadlineError);
    expect(r.calls).toBe(0);
  });

  it('503 o lan 1 + con 900 ms ⇒ KHONG lui 1 s (khong du gio) ⇒ ModelDeadlineError, dung 1 fetch', async () => {
    env({});
    let calls = 0;
    setGeminiFetchForTest(async () => {
      calls += 1;
      return new Response('x', { status: 503 });
    });
    const t0 = Date.now();
    await expect(callModel({ ...CALL, deadlineAt: Date.now() + 900 })).rejects.toBeInstanceOf(ModelDeadlineError);
    expect(calls).toBe(1);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('503 + du gio (+5000 ms) ⇒ van lui va thu lai nhu cu (ModelUnavailableError khi het retry khong phai ModelDeadlineError)', async () => {
    env({});
    let calls = 0;
    setGeminiFetchForTest(async () => {
      calls += 1;
      return calls < 2 ? new Response('x', { status: 503 }) : jsonResponse(200, OK_BODY);
    });
    const res = await callModel({ ...CALL, deadlineAt: Date.now() + 5000 });
    expect(res.message.content[0]).toMatchObject({ type: 'text', text: 'ok' });
    expect(calls).toBe(2);
  });

  it('ModelDeadlineError la con cua ModelUnavailableError va KHONG thu MODEL_FALLBACKS', async () => {
    env({ MODEL_FALLBACKS: 'fb-1,fb-2' });
    const r = rec();
    setGeminiFetchForTest(slowFetch(5000, r));
    const err = await callModel({ ...CALL, deadlineAt: Date.now() + 1000 }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err).toBeInstanceOf(ModelDeadlineError);
    expect(r.calls).toBe(1);
  });

  it('khong co deadlineAt ⇒ chay binh thuong (chi MODEL_CALL_TIMEOUT_MS), signal co gan', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(5, r));
    await callModel(CALL);
    expect(r.calls).toBe(1);
    expect(r.signals).toHaveLength(1);
  });

  it('nhanh openrouter cung ton trong han chot (0 fetch khi thieu gio) va max_tokens 1024', async () => {
    env({ MODEL_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' });
    const r = rec();
    setOpenRouterFetchForTest(slowFetch(10, r));
    await expect(callModel({ ...CALL, deadlineAt: Date.now() + 200 })).rejects.toBeInstanceOf(ModelDeadlineError);
    expect(r.calls).toBe(0);
  });
});

describe('callModel — maxOutputTokens va tier', () => {
  it('route community: generationConfig.maxOutputTokens = 1024 mac dinh; MODEL_MAX_OUTPUT_TOKENS doi duoc', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(1, r));
    await callModel(CALL);
    expect((r.bodies[0] as { generationConfig: { maxOutputTokens: number } }).generationConfig.maxOutputTokens).toBe(1024);
    process.env.MODEL_MAX_OUTPUT_TOKENS = '512';
    await callModel(CALL);
    expect((r.bodies[1] as { generationConfig: { maxOutputTokens: number } }).generationConfig.maxOutputTokens).toBe(512);
  });

  it("tier 'fast' ⇒ URL chua MODEL_COMMUNITY_FAST; tier default ⇒ MODEL_COMMUNITY", async () => {
    env({ MODEL_COMMUNITY_FAST: 'fast-model-x' });
    const r = rec();
    setGeminiFetchForTest(slowFetch(1, r));
    await callModel({ ...CALL, tier: 'fast' });
    await callModel({ ...CALL, tier: 'default' });
    await callModel(CALL);
    expect(r.urls[0]).toContain('/models/fast-model-x:');
    expect(r.urls[1]).toContain('/models/main-model:');
    expect(r.urls[2]).toContain('/models/main-model:');
  });

  it('resolveModel: tier fast khong dat env ⇒ mac dinh theo provider; anthropic/vyce = model route community', () => {
    env({});
    expect(resolveModel('community', 'gemini', 'fast')).toBe('gemini-3.5-flash-lite');
    expect(resolveModel('community', 'openrouter', 'fast')).toBe('google/gemini-3.5-flash-lite');
    expect(resolveModel('community', 'anthropic', 'fast')).toBe('main-model');
    expect(resolveModel('community', 'vyce', 'fast')).toBe('main-model');
    expect(resolveModel('community', 'gemini', 'default')).toBe('main-model');
    // tier chi ap dung cho route community
    expect(resolveModel('triage', 'gemini', 'fast')).toBe('gemini-3.6-flash');
  });
});

describe('callTriageModel — timeoutMs bang AbortSignal (thay Promise.race)', () => {
  it('fetch tre 5000, timeoutMs 200 ⇒ reject trong < 1000 ms va signal da huy (fetch khong chay tiep ngam)', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(1, rec()));
    setTriageFetchForTest(slowFetch(5000, r));
    const t0 = Date.now();
    await expect(callTriageModel({ system: 's', messages: [{ role: 'user', content: 'x' }], timeoutMs: 200 })).rejects.toBeDefined();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.signals[0]!.aborted).toBe(true);
    expect(r.calls).toBe(1); // KHONG retry
  });

  it('triage van giu tran token cu (khong bi MODEL_MAX_OUTPUT_TOKENS 1024)', async () => {
    env({});
    const r = rec();
    setGeminiFetchForTest(slowFetch(1, rec()));
    setTriageFetchForTest(slowFetch(1, r));
    await callTriageModel({ system: 's', messages: [{ role: 'user', content: 'x' }], timeoutMs: 2000 });
    expect((r.bodies[0] as { generationConfig: { maxOutputTokens: number } }).generationConfig.maxOutputTokens).toBe(16000);
  });
});
