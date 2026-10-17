// packages/core/src/adapters/model.gemini.test.ts — nhanh gemini cua
// `callModel` (01-CONTRACTS.md §2b, handoff H04 goi c). 0 mang: dung
// `setGeminiFetchForTest` de gia lap `fetch`, dung nguyen `Tool`/`MessageParam`
// dang Anthropic o dau vao (§2 giu nguyen chu ky).
import type { ContentBlockParam, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, describe, expect, it } from 'vitest';
import { EmbeddingUnavailableError, ModelUnavailableError } from '../domain/errors.js';
import { callModel, embedTexts, setEmbedFetchForTest, setEmbedRetryDelaysForTest, setGeminiFetchForTest } from './model.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('callModel — nhanh gemini (01-CONTRACTS §2b)', () => {
  afterEach(() => {
    setGeminiFetchForTest(null);
    delete process.env.MODEL_PROVIDER;
    delete process.env.MODEL_DEFAULT;
    delete process.env.MODEL_COMMUNITY;
    delete process.env.MODEL_FALLBACKS;
    delete process.env.GEMINI_API_KEY;
  });

  it('dich system/user/assistant/image/tool_use/tool_result; functionCall => tool_use + stop_reason; key o header khong o URL', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.MODEL_COMMUNITY = 'gemini-test-main';
    process.env.GEMINI_API_KEY = 'secret-key-123';

    const capturedUrls: string[] = [];
    const capturedBodies: unknown[] = [];
    const capturedHeaders: Record<string, string>[] = [];
    const fake: typeof fetch = async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders.push((init?.headers as Record<string, string>) ?? {});
      capturedBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(200, {
        candidates: [
          {
            content: { parts: [{ functionCall: { name: 'my_tool', args: { a: 1 } }, thoughtSignature: 'sig-round1' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, cachedContentTokenCount: 2 },
      });
    };
    setGeminiFetchForTest(fake);

    const tools: Tool[] = [
      {
        name: 'my_tool',
        description: 'mo ta',
        input_schema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false },
      } as Tool,
    ];
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'xin chao' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      },
    ];

    const result = await callModel({ route: 'community', system: 'ban la tro ly', messages, tools });

    // key o header, KHONG co trong URL.
    expect(capturedUrls[0]).not.toContain('secret-key-123');
    expect((capturedHeaders[0] as Record<string, string>)['x-goog-api-key']).toBe('secret-key-123');

    // dich vao: system -> systemInstruction; text/image -> parts; tools -> functionDeclarations.
    const body = capturedBodies[0] as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
      tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
      generationConfig: { maxOutputTokens: number };
    };
    expect(body.systemInstruction.parts[0]!.text).toBe('ban la tro ly');
    // D31 T10 (doi tu Đ19-2: 16000): route community => MODEL_MAX_OUTPUT_TOKENS = 1024 (Gemini: generationConfig.maxOutputTokens).
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
    expect(body.contents[0]!.role).toBe('user');
    expect(body.contents[0]!.parts).toContainEqual({ text: 'xin chao' });
    expect(body.contents[0]!.parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'AAAA' } });
    expect(body.tools[0]!.functionDeclarations[0]!.name).toBe('my_tool');

    // dich ra: functionCall -> tool_use, stop_reason='tool_use', model=candidate chinh.
    expect(result.model).toBe('gemini-test-main');
    expect(result.message.stop_reason).toBe('tool_use');
    const toolUse = result.message.content[0] as { type: string; id: string; name: string; input: unknown };
    expect(toolUse.type).toBe('tool_use');
    expect(toolUse.name).toBe('my_tool');
    expect(toolUse.input).toEqual({ a: 1 });
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(4);
    expect(result.usage.cache_read_input_tokens).toBe(2);

    // luot sau: nap NGUYEN content cua luot truoc (nhu vong tool cua agent lam)
    // + tool_result cho tool_use_id do => thoughtSignature phai duoc gan lai
    // dung o functionCall, va functionResponse phai co dung "name".
    const round2Messages: MessageParam[] = [
      ...messages,
      { role: 'assistant', content: result.message.content as unknown as ContentBlockParam[] },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true }) }],
      },
    ];
    await callModel({ route: 'community', system: 'ban la tro ly', messages: round2Messages, tools });

    const body2 = capturedBodies[1] as { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> };
    const modelTurn = body2.contents[1]!;
    expect(modelTurn.role).toBe('model');
    expect(modelTurn.parts[0]).toMatchObject({
      functionCall: { name: 'my_tool', args: { a: 1 } },
      thoughtSignature: 'sig-round1',
    });
    const userTurn = body2.contents[2]!;
    expect(userTurn.parts[0]).toEqual({
      functionResponse: { name: 'my_tool', response: { content: { ok: true }, is_error: false } },
    });
  });

  it('503 x3 (het retry) o model chinh => thu MODEL_FALLBACKS, thanh cong, model = fallback', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.MODEL_DEFAULT = 'gemini-main-x';
    process.env.MODEL_FALLBACKS = 'gemini-fallback-1';
    process.env.GEMINI_API_KEY = 'k';

    const calledModels: string[] = [];
    const fake: typeof fetch = async (input) => {
      const url = String(input);
      const model = url.includes('gemini-main-x') ? 'gemini-main-x' : 'gemini-fallback-1';
      calledModels.push(model);
      if (model === 'gemini-main-x') return jsonResponse(503, { error: { message: 'overloaded' } });
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok tu fallback' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
    };
    setGeminiFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.model).toBe('gemini-fallback-1');
    // 3 lan goi model chinh (1 + 2 retry) roi 1 lan fallback thanh cong.
    expect(calledModels.filter((m) => m === 'gemini-main-x').length).toBe(3);
    expect(calledModels.filter((m) => m === 'gemini-fallback-1').length).toBe(1);
  }, 15000);

  it('400 => nem loi ngay, khong retry, dung 1 lan fetch', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.MODEL_DEFAULT = 'gemini-bad-request';
    process.env.GEMINI_API_KEY = 'k';

    let fetchCount = 0;
    const fake: typeof fetch = async () => {
      fetchCount += 1;
      return jsonResponse(400, { error: { message: 'invalid argument' } });
    };
    setGeminiFetchForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.not.toBeInstanceOf(ModelUnavailableError);
    expect(fetchCount).toBe(1);
  });

  it('finishReason SAFETY => stop_reason refusal', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.MODEL_DEFAULT = 'gemini-safety';
    process.env.GEMINI_API_KEY = 'k';

    const fake: typeof fetch = async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'khong the tra loi' }] }, finishReason: 'SAFETY' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
    setGeminiFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.message.stop_reason).toBe('refusal');
  });

  it('finishReason MAX_TOKENS => stop_reason max_tokens', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.MODEL_DEFAULT = 'gemini-maxtok';
    process.env.GEMINI_API_KEY = 'k';

    const fake: typeof fetch = async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'dang noi do thi bi cat' }] }, finishReason: 'MAX_TOKENS' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
    setGeminiFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.message.stop_reason).toBe('max_tokens');
  });

  it('MODEL_PROVIDER mac dinh la gemini khi khong dat env', async () => {
    delete process.env.MODEL_PROVIDER;
    process.env.MODEL_DEFAULT = 'gemini-default-check';
    process.env.GEMINI_API_KEY = 'k';

    const fake: typeof fetch = async (input) => {
      expect(String(input)).toContain('gemini-default-check');
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
    };
    setGeminiFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.model).toBe('gemini-default-check');
  });
});

describe('embedTexts (SPEC-P04 §8 hang 2, 01-CONTRACTS §2.2)', () => {
  const vec = (n: number): number[] => Array.from({ length: 1024 }, (_, i) => (i === n ? 1 : 0));
  const ok = (count: number): Response => jsonResponse(200, { embeddings: Array.from({ length: count }, (_, i) => ({ values: vec(i) })) });

  afterEach(() => {
    setEmbedFetchForTest(null);
    setEmbedRetryDelaysForTest(null);
    delete process.env.GEMINI_API_KEY;
    delete process.env.EMBED_PROVIDER;
  });

  it('dich body batchEmbedContents dung: model, content, taskType, outputDimensionality 1024; key o header', async () => {
    process.env.GEMINI_API_KEY = 'embed-key-1';
    const calls: Array<{ url: string; headers: Record<string, string>; body: { requests: Array<Record<string, unknown>> } }> = [];
    setEmbedFetchForTest(async (input, init) => {
      calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
      return ok(2);
    });
    const r = await embedTexts(['xin chao', 'tam biet'], { taskType: 'RETRIEVAL_QUERY' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/^https:\/\/[^/]+\/v1beta\/models\/gemini-embedding-001:batchEmbedContents$/);
    expect(calls[0]!.url).not.toContain('embed-key-1');
    expect(calls[0]!.headers['x-goog-api-key']).toBe('embed-key-1');
    expect(calls[0]!.body.requests).toEqual([
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'xin chao' }] }, taskType: 'RETRIEVAL_QUERY', outputDimensionality: 1024 },
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'tam biet' }] }, taskType: 'RETRIEVAL_QUERY', outputDimensionality: 1024 },
    ]);
    expect(r.vectors).toHaveLength(2);
    expect(r.dim).toBe(1024);
    expect(r.model).toBe('gemini-embedding-001');
  });

  it('taskType mac dinh RETRIEVAL_DOCUMENT; 0 text ⇒ 0 fetch', async () => {
    process.env.GEMINI_API_KEY = 'k';
    let n = 0;
    let task: unknown;
    setEmbedFetchForTest(async (_u, init) => {
      n++;
      task = (JSON.parse(String(init?.body)) as { requests: Array<{ taskType: string }> }).requests[0]!.taskType;
      return ok(1);
    });
    expect((await embedTexts([])).vectors).toEqual([]);
    expect(n).toBe(0);
    await embedTexts(['a']);
    expect(task).toBe('RETRIEVAL_DOCUMENT');
  });

  it('chia batch 100: 230 text ⇒ 3 lan goi (100/100/30), giu thu tu vector', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const sizes: number[] = [];
    setEmbedFetchForTest(async (_u, init) => {
      const n = (JSON.parse(String(init?.body)) as { requests: unknown[] }).requests.length;
      sizes.push(n);
      return ok(n);
    });
    const r = await embedTexts(Array.from({ length: 230 }, (_, i) => `t${i}`));
    expect(sizes).toEqual([100, 100, 30]);
    expect(r.vectors).toHaveLength(230);
  });

  it('503 ⇒ retry 2 lan (tong 3 lan goi) ⇒ EmbeddingUnavailableError; message khong chua key', async () => {
    process.env.GEMINI_API_KEY = 'secret-embed-key';
    setEmbedRetryDelaysForTest([1, 1]);
    let n = 0;
    setEmbedFetchForTest(async () => {
      n++;
      return new Response('boom', { status: 503 });
    });
    const err = await embedTexts(['a']).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(EmbeddingUnavailableError);
    expect((err as Error).message).not.toContain('secret-embed-key');
    expect(n).toBe(3);
  });

  it('429 roi 200 ⇒ thanh cong sau 1 retry; 400 KHONG retry', async () => {
    process.env.GEMINI_API_KEY = 'k';
    setEmbedRetryDelaysForTest([1, 1]);
    let n = 0;
    setEmbedFetchForTest(async () => (++n === 1 ? new Response('x', { status: 429 }) : ok(1)));
    expect((await embedTexts(['a'])).vectors).toHaveLength(1);
    expect(n).toBe(2);
    n = 0;
    setEmbedFetchForTest(async () => {
      n++;
      return new Response('bad', { status: 400 });
    });
    await expect(embedTexts(['a'])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(n).toBe(1);
  });

  it('nhanh khong phai Gemini (openrouter / anthropic / vyce / none) ⇒ nem ngay, 0 fetch', async () => {
    process.env.GEMINI_API_KEY = 'k';
    let n = 0;
    setEmbedFetchForTest(async () => {
      n++;
      return ok(1);
    });
    for (const p of ['openrouter', 'anthropic', 'vyce', 'none']) {
      process.env.EMBED_PROVIDER = p;
      await expect(embedTexts(['a'])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    }
    expect(n).toBe(0);
  });

  it('thieu GEMINI_API_KEY ⇒ nem ngay, 0 fetch', async () => {
    let n = 0;
    setEmbedFetchForTest(async () => {
      n++;
      return ok(1);
    });
    await expect(embedTexts(['a'])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(n).toBe(0);
  });

  it('deadlineAt da qua ⇒ nem, 0 fetch; con it gio ⇒ huy fetch bang AbortSignal (EmbeddingUnavailableError)', async () => {
    process.env.GEMINI_API_KEY = 'k';
    let n = 0;
    setEmbedFetchForTest(
      (_u, init) =>
        new Promise<Response>((_res, rej) => {
          n++;
          init?.signal?.addEventListener('abort', () => rej(new Error('aborted')), { once: true });
        })
    );
    await expect(embedTexts(['a'], { deadlineAt: Date.now() - 5 })).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(n).toBe(0);
    const t0 = Date.now();
    await expect(embedTexts(['a'], { deadlineAt: Date.now() + 120 })).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(n).toBe(1); // het gio ⇒ khong lui roi thu lai
  });

  it('vector sai so chieu (Q3) ⇒ EmbeddingUnavailableError, khong tra vector sai', async () => {
    process.env.GEMINI_API_KEY = 'k';
    setEmbedFetchForTest(async () => jsonResponse(200, { embeddings: [{ values: [0.1, 0.2] }] }));
    await expect(embedTexts(['a'])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it('chong mang that: co fake model gemini ma chua cai fake embed ⇒ nem, 0 fetch', async () => {
    process.env.GEMINI_API_KEY = 'k';
    let n = 0;
    setGeminiFetchForTest(async () => {
      n++;
      return ok(1);
    });
    try {
      await expect(embedTexts(['a'])).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    } finally {
      setGeminiFetchForTest(null);
    }
    expect(n).toBe(0);
  });
});
