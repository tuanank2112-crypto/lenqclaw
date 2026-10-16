// SPEC-P02 (ke hoach 02) §2: payload tin vao (DM + nhom) theo 01-CONTRACTS §8.2 va
// bang su kien nhom. Thuan, 0 DB, 0 mang (fake-client).
import { describe, expect, it } from 'vitest';
import { buildGroupEventRecord, buildPayload, groupEventMsgId, RECORDED_GROUP_EVENTS, unsupportedText } from './inbound.js';
import { fakeGroupEvent, fakeMessage } from './testing/fake-client.js';

describe('buildPayload', () => {
  it('text DM giu nguyen, du truong §8.2 (mentions rong, quote null)', () => {
    const p = buildPayload(fakeMessage({ threadId: 'u1', content: 'vòi bồn rửa bị rỉ nước' }));
    expect(p.text).toBe('vòi bồn rửa bị rỉ nước');
    expect(p.kind).toBe('text');
    expect(p.mentions).toEqual([]);
    expect(p.quote).toBeNull();
    expect(p.raw).toBeDefined();
  });
  it('anh / sticker / tep / loai la ⇒ "[thành viên gửi <loại> — chưa hỗ trợ]"', () => {
    const img = buildPayload(fakeMessage({ threadId: 'u1', msgType: 'chat.photo', content: { href: 'https://x/y.jpg' } }));
    expect(img.text).toBe('[thành viên gửi ảnh — chưa hỗ trợ]');
    expect(img.unsupported).toBe(true);
    expect(img.kind).toBe('unsupported');
    expect((img.raw as Record<string, unknown>).msgType).toBe('chat.photo');
    expect(unsupportedText('chat.sticker')).toBe('[thành viên gửi sticker — chưa hỗ trợ]');
    expect(unsupportedText('share.file')).toBe('[thành viên gửi tệp — chưa hỗ trợ]');
    expect(unsupportedText('chat.xyz')).toBe('[thành viên gửi tin nhắn loại khác — chưa hỗ trợ]');
  });

  // ---- ca moi P02 (SPEC-P02 §10 hang 1)
  it('tin nhom text ⇒ payload kind=text voi mentions + quote + cli_msg_id + d_name dung §8.2', () => {
    const m = fakeMessage({
      threadId: 'g1',
      threadType: 'group',
      senderUid: 'u-an',
      content: '@Bot giúp mình với',
      cliMsgId: 'cli-77',
      dName: 'Nguyễn Văn An',
      mentions: [{ uid: 'bot-uid', pos: 0, len: 4 }],
      quote: { ownerId: 'bot-uid', globalMsgId: '555', msg: 'tin cũ của bot' },
    });
    const p = buildPayload(m);
    expect(p).toMatchObject({
      kind: 'text',
      text: '@Bot giúp mình với',
      msg_type: 'webchat',
      cli_msg_id: 'cli-77',
      d_name: 'Nguyễn Văn An',
      mentions: [{ uid: 'bot-uid', pos: 0, len: 4 }],
      quote: { owner_id: 'bot-uid', global_msg_id: '555', msg: 'tin cũ của bot' },
    });
  });
  it('sticker nhom ⇒ kind=unsupported, nhan "thành viên", giu cli_msg_id', () => {
    const p = buildPayload(
      fakeMessage({ threadId: 'g1', threadType: 'group', msgType: 'chat.sticker', content: { id: 1 }, cliMsgId: 'cli-9' })
    );
    expect(p.kind).toBe('unsupported');
    expect(p.text).toBe('[thành viên gửi sticker — chưa hỗ trợ]');
    expect(p.cli_msg_id).toBe('cli-9');
    expect(p.unsupported).toBe(true);
  });
});

describe('su kien nhom (§2.2)', () => {
  const cases: Array<[string, string[], string[]]> = [
    ['join', ['u1', 'u2'], ['An', 'Bích']],
    ['join_request', ['u3'], []],
    ['leave', ['u4'], ['Cường']],
    ['remove_member', ['u5'], ['Đức']],
    ['add_admin', ['u6'], ['Em']],
    ['remove_admin', ['u6'], ['Em']],
    ['update_setting', [], []],
    ['update', [], []],
  ];
  for (const [event, uids, names] of cases) {
    it(`${event} ⇒ payload.event="${event}", zalo_msg_id dang gev-<nhom>-${event}-<time>`, () => {
      const rec = buildGroupEventRecord(
        fakeGroupEvent({ groupId: 'g9', event, uids, names, sourceUid: 'admin-1', groupName: 'Nhóm thử', time: '1700000000123' })
      );
      expect(rec).not.toBeNull();
      expect(rec!.msgId).toBe(`gev-g9-${event}-1700000000123`);
      expect(rec!.threadId).toBe('g9');
      expect(rec!.senderUid).toBe('admin-1');
      expect(rec!.payload).toMatchObject({
        kind: 'group_event',
        event,
        uids,
        names,
        source_uid: 'admin-1',
        group_name: 'Nhóm thử',
        time: '1700000000123',
      });
    });
  }
  it('khong co sourceId ⇒ sender_uid="zalo" (khong bao gio "system")', () => {
    const rec = buildGroupEventRecord(fakeGroupEvent({ groupId: 'g9', event: 'update', sourceUid: null }));
    expect(rec!.senderUid).toBe('zalo');
  });
  it('NEW_LINK / pin / board / remind / avatar / block_member / unknown ⇒ KHONG ghi', () => {
    for (const event of [
      'new_link',
      'new_pin_topic',
      'update_pin_topic',
      'reorder_pin_topic',
      'update_board',
      'remove_board',
      'update_topic',
      'unpin_topic',
      'remove_topic',
      'accept_remind',
      'reject_remind',
      'remind_topic',
      'update_avatar',
      'block_member',
      'unknown',
    ]) {
      expect(buildGroupEventRecord(fakeGroupEvent({ groupId: 'g9', event })), event).toBeNull();
    }
    expect([...RECORDED_GROUP_EVENTS].sort()).toEqual(
      ['add_admin', 'join', 'join_request', 'leave', 'remove_admin', 'remove_member', 'update', 'update_setting'].sort()
    );
  });
  it('is_self giu nguyen; cung (nhom, loai, time) ⇒ cung zalo_msg_id (chong trung khi reconnect)', () => {
    const a = fakeGroupEvent({ groupId: 'g1', event: 'join', time: '42', isSelf: true });
    const b = fakeGroupEvent({ groupId: 'g1', event: 'join', time: '42', uids: ['khac'] });
    expect(buildGroupEventRecord(a)!.isSelf).toBe(true);
    expect(groupEventMsgId(a)).toBe(groupEventMsgId(b));
  });
});
