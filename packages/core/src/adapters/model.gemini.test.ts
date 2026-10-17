// packages/core/src/adapters/model.gemini.test.ts — nhanh gemini cua
// `callModel` (01-CONTRACTS.md §2b, handoff H04 goi c). 0 mang: dung
// `setGeminiFetchForTest` de gia lap `fetch`, dung nguyen `Tool`/`MessageParam`
// dang Anthropic o dau vao (§2 giu nguyen chu ky).
import type { ContentBlockParam, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUnavailableError } from '../domain/errors.js';
import { callModel, setGeminiFetchForTest } from './model.js';

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
