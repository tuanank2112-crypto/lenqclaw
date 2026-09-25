// SPEC-P02 §9.1: tin khong phai text ⇒ noi dung thay the co dau, giu du payload.
import { describe, expect, it } from 'vitest';
import { buildPayload, unsupportedText } from './inbound.js';
import { fakeMessage } from './testing/fake-client.js';

describe('buildPayload', () => {
  it('text giu nguyen', () => {
    const p = buildPayload(fakeMessage({ threadId: 'u1', content: 'vòi bồn rửa bị rỉ nước' }));
    expect(p.text).toBe('vòi bồn rửa bị rỉ nước');
    expect(p.kind).toBe('text');
    expect(p.raw).toBeDefined();
  });
  it('anh / sticker / tep / loai la ⇒ "[cư dân gửi <loại> — chưa hỗ trợ]"', () => {
    const img = buildPayload(fakeMessage({ threadId: 'u1', msgType: 'chat.photo', content: { href: 'https://x/y.jpg' } }));
    expect(img.text).toBe('[cư dân gửi ảnh — chưa hỗ trợ]');
    expect(img.unsupported).toBe(true);
    expect((img.raw as Record<string, unknown>).msgType).toBe('chat.photo');
    expect(unsupportedText('chat.sticker')).toBe('[cư dân gửi sticker — chưa hỗ trợ]');
    expect(unsupportedText('share.file')).toBe('[cư dân gửi tệp — chưa hỗ trợ]');
    expect(unsupportedText('chat.xyz')).toBe('[cư dân gửi tin nhắn loại khác — chưa hỗ trợ]');
  });
});
