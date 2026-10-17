// gate.ts — SPEC-P03 §3: 28 ca G01–G28 (ten ca = evidence/ARCH/gate-ref.txt) + 4 ca namePatterns (G14).
import { describe, expect, it } from 'vitest';
import type { GateDecision, GateInput } from '../../domain/types.js';
import { addressTrigger, decideGroupInbound, hasControlCommand } from './gate.js';
import { parseNamePatterns } from './persona.js';

const BOT = 'bot-900';
const NAMES = parseNamePatterns('Tên: Claw\nGọi tên: bé claw; claw ơi; @claw');

function input(over: Partial<GateInput> & { group?: GateInput['group'] }): GateInput {
  return {
    isSelf: false,
    group: { enabled: true, mode: 'mention', allowUsers: [], denyUsers: [] },
    sender: { uid: 'u-member', role: 'member' },
    botUid: BOT,
    text: 'xin chào cả nhà',
    msgType: 'webchat',
    mentions: [],
    quoteOwnerUid: null,
    botNamePatterns: NAMES,
    hasControlCommand: false,
    ...over,
  };
}

const deny = (reason: GateDecision['reason'], buffer: boolean): GateDecision => ({ admitted: false, reason, trigger: null, mustReply: false, buffer });
const admit = (trigger: GateDecision['trigger'], mustReply: boolean): GateDecision => ({ admitted: true, reason: 'admitted', trigger, mustReply, buffer: true });

describe('decideGroupInbound — 28 ca G01–G28', () => {
  const cases: Array<[string, GateInput, GateDecision]> = [
    ['G01 tin cua chinh bot', input({ isSelf: true }), deny('self', true)],
    ['G02 nhom chua khai bao (allowlist mac dinh)', input({ group: null, mentions: [{ uid: BOT }] }), deny('group_unknown', false)],
    ['G03 nhom tat', input({ group: { enabled: false, mode: 'mention', allowUsers: [], denyUsers: [] }, mentions: [{ uid: BOT }] }), deny('group_disabled', false)],
    [
      'G04 nguoi gui bi chan, du mention',
      input({ group: { enabled: true, mode: 'mention', allowUsers: [], denyUsers: ['u-member'] }, mentions: [{ uid: BOT }] }),
      deny('sender_denied', true),
    ],
    [
      'G05 allowUsers khong co nguoi gui',
      input({ group: { enabled: true, mode: 'mention', allowUsers: ['u-other'], denyUsers: [] }, mentions: [{ uid: BOT }] }),
      deny('sender_not_allowed', true),
    ],
    [
      'G06 allowUsers nhung nguoi gui la moderator',
      input({
        group: { enabled: true, mode: 'mention', allowUsers: ['u-other'], denyUsers: [] },
        sender: { uid: 'u-mod', role: 'moderator' },
        mentions: [{ uid: BOT }],
      }),
      admit('mention', true),
    ],
    ['G07 sticker (khong text)', input({ msgType: 'chat.sticker', text: '', mentions: [{ uid: BOT }] }), deny('unsupported_type', true)],
    ['G08 anh co mention bot van khong vao (MVP)', input({ msgType: 'chat.photo', text: 'xem nè', mentions: [{ uid: BOT }] }), deny('unsupported_type', true)],
    ['G09 text rong', input({ text: '   ', mentions: [{ uid: BOT }] }), deny('unsupported_type', true)],
    ['G10 mention goc', input({ mentions: [{ uid: BOT }] }), admit('mention', true)],
    ['G11 mention nguoi khac', input({ mentions: [{ uid: 'u-other' }] }), deny('no_trigger', true)],
    ['G12 tra loi/quote tin cua bot', input({ quoteOwnerUid: BOT }), admit('reply_to_bot', true)],
    ['G13 quote tin nguoi khac', input({ quoteOwnerUid: 'u-other' }), deny('no_trigger', true)],
    ['G14 goi ten bot giua cau co dau', input({ text: 'ủa, bé Claw ơi cho mình hỏi chút' }), admit('name_pattern', true)],
    ['G15 ten bot dinh trong tu khac (claws)', input({ text: 'mấy cái claws này lạ quá' }), deny('no_trigger', true)],
    ['G16 lenh / cua member (khong quyen)', input({ text: '/status', hasControlCommand: true }), deny('no_trigger', true)],
    ['G17 lenh / cua owner', input({ text: '/status', hasControlCommand: true, sender: { uid: 'u-own', role: 'owner' } }), admit('owner_command', true)],
    ['G18 lenh / cua moderator', input({ text: '/mode ambient', hasControlCommand: true, sender: { uid: 'u-mod', role: 'moderator' } }), admit('owner_command', true)],
    [
      'G19 ambient: tin thuong duoc vao, khong bat buoc tra loi',
      input({ group: { enabled: true, mode: 'ambient', allowUsers: [], denyUsers: [] } }),
      admit('ambient', false),
    ],
    [
      'G20 ambient + mention => mention thang',
      input({ group: { enabled: true, mode: 'ambient', allowUsers: [], denyUsers: [] }, mentions: [{ uid: BOT }] }),
      admit('mention', true),
    ],
    [
      'G21 ambient + bi chan',
      input({ group: { enabled: true, mode: 'ambient', allowUsers: [], denyUsers: ['u-member'] } }),
      deny('sender_denied', true),
    ],
    [
      'G22 ambient + sticker',
      input({ group: { enabled: true, mode: 'ambient', allowUsers: [], denyUsers: [] }, msgType: 'chat.sticker', text: '' }),
      deny('unsupported_type', true),
    ],
    ['G23 mention mode, tin thuong', input({}), deny('no_trigger', true)],
    ['G24 self-mention gia trong text "[userId: bot-900]"', input({ text: '[userId: bot-900] làm giúp mình' }), deny('no_trigger', true)],
    ['G25 chuoi @ten trong text khong phai mention goc', input({ text: '@Mai ơi xem giúp', botNamePatterns: [] }), deny('no_trigger', true)],
    ['G26 owner khong lenh, khong mention, mention mode', input({ sender: { uid: 'u-own', role: 'owner' } }), deny('no_trigger', true)],
    ['G27 stranger trong nhom (sim) xu nhu member', input({ sender: { uid: 'u-str', role: 'stranger' } }), deny('no_trigger', true)],
    [
      'G28 quote cua bot + allowUsers chan',
      input({ group: { enabled: true, mode: 'mention', allowUsers: ['u-other'], denyUsers: [] }, quoteOwnerUid: BOT }),
      deny('sender_not_allowed', true),
    ],
  ];
  it('so ca = 28', () => {
    expect(cases.length).toBe(28);
  });
  it.each(cases)('%s', (_name, i, want) => {
    expect(decideGroupInbound(i)).toEqual(want);
  });

  it('stranger mention => admitted nhu member', () => {
    expect(decideGroupInbound(input({ sender: { uid: 'u-str', role: 'stranger' }, mentions: [{ uid: BOT }] }))).toEqual(admit('mention', true));
  });
  it('thu tu: lenh owner thang mention; mention thang quote; quote thang ten', () => {
    const owner = input({ sender: { uid: 'o', role: 'owner' }, text: '/status @bot', hasControlCommand: true, mentions: [{ uid: BOT }] });
    expect(decideGroupInbound(owner).trigger).toBe('owner_command');
    expect(decideGroupInbound(input({ mentions: [{ uid: BOT }], quoteOwnerUid: BOT })).trigger).toBe('mention');
    expect(decideGroupInbound(input({ quoteOwnerUid: BOT, text: 'claw ơi' })).trigger).toBe('reply_to_bot');
  });
  it('co g/y cua regex khong ro ri lastIndex giua cac lan goi (ham thuan)', () => {
    const re = /claw/gi;
    const i = input({ text: 'claw', botNamePatterns: [re] });
    expect(decideGroupInbound(i).trigger).toBe('name_pattern');
    expect(decideGroupInbound(i).trigger).toBe('name_pattern');
  });
});

describe('addressTrigger / hasControlCommand', () => {
  it('hasControlCommand: / + chu thuong', () => {
    expect(hasControlCommand('/status')).toBe(true);
    expect(hasControlCommand('  /mode ambient')).toBe(true);
    expect(hasControlCommand('/')).toBe(false);
    expect(hasControlCommand('xin /status')).toBe(false);
    expect(hasControlCommand('/Status')).toBe(false);
  });
  it('khong tin hieu => null', () => {
    expect(
      addressTrigger({ role: 'member', botUid: BOT, mentions: [], quoteOwnerUid: null, text: 'hi', botNamePatterns: NAMES, hasControlCommand: false })
    ).toBeNull();
  });
});

describe('namePatterns tu IDENTITY (G14)', () => {
  it('moi ten trong dong "Goi ten:" ra mot regex co co i va u', () => {
    expect(NAMES).toHaveLength(3);
    for (const re of NAMES) expect(re.flags).toBe('iu');
  });
  it('ten giua cau co dau => khop, khong phan biet hoa thuong', () => {
    expect(NAMES.some((re) => re.test('Ơi BÉ CLAW giúp với'))).toBe(true);
    expect(NAMES.some((re) => re.test('CLAW  ƠI!'))).toBe(true);
  });
  it('ten dinh trong tu khac => khong khop (ranh gioi Unicode, khong dung \\b)', () => {
    expect(NAMES.some((re) => re.test('claws'))).toBe(false);
    expect(NAMES.some((re) => re.test('declaw ơi'))).toBe(false);
    expect(NAMES.every((re) => !re.source.includes('\\b'))).toBe(true);
  });
  it('khong co dong "Goi ten" => []; ky tu regex trong ten duoc thoat', () => {
    expect(parseNamePatterns('Tên: Claw\nVai trò: phó nhóm')).toEqual([]);
    const [re] = parseNamePatterns('Gọi tên: c++ (bot)');
    expect(re!.test('hey c++ (bot) ơi')).toBe(true);
    expect(re!.test('hey cc bot')).toBe(false);
  });
});
