import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUnavailableError } from '../domain/errors.js';
import { APIConnectionError, APIError, callModel, setModelClientForTest, type ModelClientLike } from './model.js';

function fakeMessage(model: string): Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [],
    model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 12,
      output_tokens: 3,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Message;
}

describe('callModel (adapters/model.ts)', () => {
  afterEach(() => {
    setModelClientForTest(null);
    delete process.env.MODEL_DEFAULT;
    delete process.env.MODEL_COMMUNITY;
    delete process.env.MODEL_PROVIDER;
  });

  it('dung dung model theo route va gan cache_control tren system', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    process.env.MODEL_COMMUNITY = 'claude-test-community';
    const captured: { body?: { model: string; system: unknown; max_tokens: number } } = {};
    const fake: ModelClientLike = {
      messages: {
        create: async (body) => {
          captured.body = body as { model: string; system: unknown; max_tokens: number };
          return fakeMessage(body.model);
        },
      },
    };
    setModelClientForTest(fake);

    const result = await callModel({ route: 'community', system: 'ban la tro ly cong dong', messages: [{ role: 'user', content: 'xin chao' }] });

    expect(result.model).toBe('claude-test-community');
    // Đ19-2: max_tokens = 16000 ca hai nhanh.
    expect(captured.body?.max_tokens).toBe(16000);
    expect(Array.isArray(captured.body?.system)).toBe(true);
    const systemBlocks = captured.body!.system as Array<{ cache_control?: { type: string } }>;
    expect(systemBlocks[systemBlocks.length - 1]!.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('529 sau retry cua SDK => ModelUnavailableError', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    const fake: ModelClientLike = {
      messages: {
        create: async () => {
          throw new APIError(529, {}, 'overloaded_error', new Headers());
        },
      },
    };
    setModelClientForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [] })
    ).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it('429 => ModelUnavailableError', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    const fake: ModelClientLike = {
      messages: {
        create: async () => {
          throw new APIError(429, {}, 'rate_limited', new Headers());
        },
      },
    };
    setModelClientForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [] })
    ).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it('R02-tham-dinh G3: loi mang/timeout (APIConnectionError) => ModelUnavailableError, khong rot tho', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    const fake: ModelClientLike = {
      messages: {
        create: async () => {
          throw new APIConnectionError({ message: 'ECONNRESET' });
        },
      },
    };
    setModelClientForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [] })
    ).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it('R02-tham-dinh D7: images duoc dua vao content block cua tin nhan cuoi', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    let captured: MessageCreateParamsNonStreaming | null = null;
    const fake: ModelClientLike = {
      messages: {
        create: async (body) => {
          captured = body as MessageCreateParamsNonStreaming;
          return fakeMessage(body.model);
        },
      },
    };
    setModelClientForTest(fake);

    await callModel({
      route: 'community',
      system: 'he thong',
      messages: [{ role: 'user', content: 'day la anh may hong' }],
      images: [{ mediaType: 'image/png', base64: 'AAAA' }],
    });

    const lastMessage = captured!.messages[captured!.messages.length - 1]!;
    expect(Array.isArray(lastMessage.content)).toBe(true);
    const blocks = lastMessage.content as Array<{ type: string; source?: { type: string; media_type: string; data: string } }>;
    expect(blocks.some((b) => b.type === 'text')).toBe(true);
    const imageBlock = blocks.find((b) => b.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock!.source).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAAA' });
  });
});
