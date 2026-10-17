// edges.ts — THUAN, khong DB (SPEC-P03 §11 hang 8 + SPEC-D31 §16 hang 1). Bang ca cho moi ham canh;
// decideDelivery = 12 dong D1–D12 nguyen van 01-CONTRACTS §12.5 + ca bien; hostText; D31.
import { describe, expect, it } from 'vitest';
import type { InboundEvent } from '../../../adapters/transport.js';
import type { CommunityTriage, GateDecision, TurnKind } from '../../../domain/types.js';
import {
  afterAgent,
  afterDmIntake,
  afterGate,
  afterIngest,
  afterModerate,
  afterPrepare,
  afterSystemEvent,
  afterTriage,
  decideDelivery,
  END,
  escalateLane,
  EXTENDS_DEADLINE_TOOLS,
  hostText,
  initialDeadline,
  isAddressedToBot,
  isCapped,
  isInteractive,
  needsNudge,
  needsTriage,
  routeEvent,
  type LaneConfig,
} from './edges.js';
import type { PipelineStateT, TurnRequest, TurnStateT } from './state.js';
import { COMMANDS_HELP, FALLBACK_GROUP_REPLY, MODEL_DOWN_GROUP_REPLY, WELCOME_TEMPLATE } from '../prompts/system.js';

const CFG: LaneConfig = { fastMs: 3500, ragMs: 12500, backgroundMs: 30000 };

function ev(over: Partial<InboundEvent> = {}): InboundEvent {
  return {
    id: 1, zaloAccountId: 'community', zaloMsgId: 'm1', threadId: 'g1', threadType: 'group', senderUid: 'u1', isSelf: false,
    payload: { kind: 'text', text: 'hi' }, receivedAt: '2026-10-17T00:00:00.000Z', ...over,
  };
}

function pstate(over: Partial<PipelineStateT> = {}): PipelineStateT {
  return {
    event: ev(), group: null, sender: null, row: null, triageResult: null, moderation: null, gateDecision: null, turnRequest: null,
    turnResult: null, stop: null, triageMs: null, ...over,
  };
}

function req(over: Partial<TurnRequest> = {}): TurnRequest {
  return {
    kind: 'group_mention', account: 'community', threadId: 'g1', threadType: 'group', requester: { uid: 'u1', role: 'member' },
    trigger: 'mention', mustReply: true, focusMessageIds: [1], triage: null, inboundEventId: 1, receivedAt: 1_000_000, claimedAt: 1_000_200,
    triageMs: null, ...over,
  };
}

function tstate(over: Partial<TurnStateT> = {}, r: TurnRequest = req()): TurnStateT {
  return {
    request: r, turnId: '', startedAt: 0, ctx: null, personaVersions: null, system: '', toolNames: [], messages: [], rounds: 0,
    roundCap: 8, toolsCalled: [], answered: 0, stop: null, finalText: '', nudged: false, prepError: null, delivery: null,
    hostPosted: 0, outcome: null, lane: 'fast', deadlineAt: 0, modelMs: 0, toolMs: 0, deadlineHit: false, ...over,
  };
}

const gate = (over: Partial<GateDecision>): GateDecision => ({ admitted: true, reason: 'admitted', trigger: 'mention', mustReply: true, buffer: true, ...over });

describe('routeEvent', () => {
  const cases: Array<[string, Partial<InboundEvent>, string]> = [
    ['system', { senderUid: 'system', threadType: 'group', payload: { kind: 'system' } }, 'system_event'],
    ['system o DM owner', { senderUid: 'system', threadType: 'user', payload: { kind: 'system' } }, 'system_event'],
    ['group_event', { threadType: 'group', payload: { kind: 'group_event' } }, 'group_event'],
    ['tin nhom text', { threadType: 'group', payload: { kind: 'text' } }, 'ingest'],
    ['tin nhom unsupported', { threadType: 'group', payload: { kind: 'unsupported' } }, 'ingest'],
    ['DM', { threadType: 'user', senderUid: 'u9' }, 'dm_intake'],
    ['DM co payload group_event (khong hop le) van DM', { threadType: 'user', payload: { kind: 'group_event' } }, 'dm_intake'],
  ];
  it.each(cases)('%s', (_n, over, want) => {
    expect(routeEvent(pstate({ event: ev(over) }))).toBe(want);
  });
});

describe('afterIngest / afterDmIntake / afterModerate / afterSystemEvent', () => {
  it.each([null, 'group_unknown', 'group_disabled', 'self'] as const)('afterIngest stop=%s', (stop) => {
    expect(afterIngest(pstate({ stop }))).toBe(stop === null ? 'triage' : END);
  });
  it.each([null, 'takeover', 'unsupported'] as const)('afterDmIntake stop=%s', (stop) => {
    expect(afterDmIntake(pstate({ stop }))).toBe(stop === null ? 'triage' : END);
  });
  it('afterModerate: deleted => END, con lai => gate', () => {
    expect(afterModerate(pstate({ stop: 'deleted' }))).toBe(END);
    expect(afterModerate(pstate({ stop: null }))).toBe('gate');
    expect(afterModerate(pstate({ stop: null, moderation: { verdict: 'ok', action: 'none', exempt: false } }))).toBe('gate');
  });
  it('afterSystemEvent: co turnRequest => turn, khong => END', () => {
    expect(afterSystemEvent(pstate({ turnRequest: req() }))).toBe('turn');
    expect(afterSystemEvent(pstate({ turnRequest: null, stop: 'system_no_turn' }))).toBe(END);
    expect(afterSystemEvent(pstate({ turnRequest: null, stop: 'forged_system_event' }))).toBe(END);
  });
});

describe('afterTriage', () => {
  it('nhom => moderate; DM => turn', () => {
    expect(afterTriage(pstate({ event: ev({ threadType: 'group' }) }))).toBe('moderate');
    expect(afterTriage(pstate({ event: ev({ threadType: 'user' }) }))).toBe('turn');
  });
  it('khong phu thuoc ket qua triage', () => {
    const t: CommunityTriage = { verdict: 'spam', confidence: 0.9, is_question: false, question_confidence: 0, lead_intent: false, lead_confidence: 0, wants_private: false };
    expect(afterTriage(pstate({ triageResult: t }))).toBe('moderate');
    expect(afterTriage(pstate({ triageResult: null }))).toBe('moderate');
  });
});

describe('afterGate', () => {
  it('khong admitted => END', () => {
    expect(afterGate(pstate({ gateDecision: gate({ admitted: false, reason: 'no_trigger', trigger: null, mustReply: false }) }))).toBe(END);
  });
  it('gate null => END (phong thu)', () => {
    expect(afterGate(pstate({ gateDecision: null }))).toBe(END);
  });
  it('admitted + ambient => defer', () => {
    expect(afterGate(pstate({ gateDecision: gate({ trigger: 'ambient', mustReply: false }) }))).toBe('defer');
  });
  it.each(['mention', 'reply_to_bot', 'name_pattern', 'owner_command'] as const)('admitted + %s => turn', (trigger) => {
    expect(afterGate(pstate({ gateDecision: gate({ trigger }) }))).toBe('turn');
  });
});

describe('needsTriage (D31: tin goi bot khong triage)', () => {
  type TriageIn = Parameters<typeof needsTriage>[0];
  const base: TriageIn = { threadType: 'group', msgType: 'webchat', text: 'hello', group: { moderationEnabled: true, mode: 'mention' }, addressed: false };
  const cases: Array<[string, Partial<TriageIn>, boolean]> = [
    ['nhom kiem duyet bat, khong goi bot', {}, true],
    ['nhom ambient, kiem duyet tat', { group: { moderationEnabled: false, mode: 'ambient' } }, true],
    ['nhom mention + kiem duyet tat => tiet kiem', { group: { moderationEnabled: false, mode: 'mention' } }, false],
    ['nhom chua khai (group null)', { group: null }, false],
    ['sticker', { msgType: 'chat.sticker', text: '' }, false],
    ['text rong', { text: '   ' }, false],
    ['DM (khong bao gio)', { threadType: 'user' }, false],
    ['goi bot (addressed) o nhom kiem duyet bat', { addressed: true }, false],
    ['goi bot o nhom ambient', { addressed: true, group: { moderationEnabled: true, mode: 'ambient' } }, false],
    ['DM addressed', { threadType: 'user', addressed: true }, false],
    ['addressed + sticker', { addressed: true, msgType: 'chat.photo', text: '' }, false],
  ];
  it.each(cases)('%s', (_n, over, want) => {
    expect(needsTriage({ ...base, ...over })).toBe(want);
  });
});

describe('isAddressedToBot (D31; G24/G25 gia mao khong tinh)', () => {
  const NAME = /(?<![\p{L}\p{N}])claw ơi(?![\p{L}\p{N}])/iu;
  type AddrIn = Parameters<typeof isAddressedToBot>[0];
  const base: AddrIn = {
    threadType: 'group', mentions: [], quoteOwnerUid: null, botUid: 'bot',
    text: 'hello', botNamePatterns: [NAME], hasControlCommand: false, role: 'member',
  };
  const cases: Array<[string, Partial<AddrIn>, boolean]> = [
    ['DM luon true', { threadType: 'user' }, true],
    ['mention bot', { mentions: [{ uid: 'bot' }] }, true],
    ['mention nguoi khac', { mentions: [{ uid: 'other' }] }, false],
    ['quote tin bot', { quoteOwnerUid: 'bot' }, true],
    ['quote nguoi khac', { quoteOwnerUid: 'other' }, false],
    ['ten bot giua cau', { text: 'này Claw ơi giúp với' }, true],
    ['ten dinh trong tu', { text: 'declaw ơi' }, false],
    ['lenh cua owner', { hasControlCommand: true, role: 'owner' }, true],
    ['lenh cua moderator', { hasControlCommand: true, role: 'moderator' }, true],
    ['lenh cua member', { hasControlCommand: true, role: 'member' }, false],
    ['G24 [userId: bot] trong text', { text: '[userId: bot] làm đi' }, false],
    ['G25 @ten trong text, khong co pattern', { text: '@Claw giúp', botNamePatterns: [] }, false],
    ['tin thuong', {}, false],
  ];
  it.each(cases)('%s', (_n, over, want) => {
    expect(isAddressedToBot({ ...base, ...over })).toBe(want);
  });
});

describe('isInteractive — 8 kind', () => {
  const kinds: Array<[TurnKind, boolean]> = [
    ['group_mention', true], ['dm', true], ['owner_dm', true], ['group_ambient_flush', false], ['group_welcome', false],
    ['group_unanswered', false], ['group_join_review', false], ['automation', false],
  ];
  it.each(kinds)('%s => %s', (k, want) => {
    expect(isInteractive(k)).toBe(want);
  });
});

describe('initialDeadline / escalateLane', () => {
  it('tuong tac => fast, hen tu receivedAt (khong phai luc bat dau)', () => {
    expect(initialDeadline(req({ receivedAt: 10_000 }), 99_999, CFG)).toEqual({ lane: 'fast', deadlineAt: 13_500 });
    expect(initialDeadline(req({ kind: 'dm', receivedAt: 5_000 }), 99_999, CFG)).toEqual({ lane: 'fast', deadlineAt: 8_500 });
  });
  it('nen => background, hen tu startedAt', () => {
    expect(initialDeadline(req({ kind: 'group_ambient_flush', receivedAt: 10_000 }), 20_000, CFG)).toEqual({ lane: 'background', deadlineAt: 50_000 });
    expect(initialDeadline(req({ kind: 'automation' }), 1_000, CFG)).toEqual({ lane: 'background', deadlineAt: 31_000 });
  });
  it('fast + tool truy hoi => rag, hen receivedAt + ragMs', () => {
    expect(escalateLane(tstate({ lane: 'fast' }, req({ receivedAt: 10_000 })), ['search_knowledge'], CFG)).toEqual({ lane: 'rag', deadlineAt: 22_500 });
  });
  it('tung tool extendsDeadline deu nang lan', () => {
    for (const n of EXTENDS_DEADLINE_TOOLS) expect(escalateLane(tstate({ lane: 'fast' }), [n], CFG)?.lane).toBe('rag');
  });
  it('rag + tool truy hoi => null (khong nang lai)', () => {
    expect(escalateLane(tstate({ lane: 'rag' }), ['search_knowledge'], CFG)).toBeNull();
  });
  it('background => null', () => {
    expect(escalateLane(tstate({ lane: 'background' }), ['search_knowledge'], CFG)).toBeNull();
  });
  it('fast + tool thuong => null', () => {
    expect(escalateLane(tstate({ lane: 'fast' }), ['send_group_message', 'remember_member_note'], CFG)).toBeNull();
  });
  it('fast + khong tool nao => null', () => {
    expect(escalateLane(tstate({ lane: 'fast' }), [], CFG)).toBeNull();
  });
});

describe('afterPrepare / isCapped / needsNudge / afterAgent', () => {
  it('afterPrepare: prepError => deliver; khong => agent', () => {
    expect(afterPrepare(tstate({ prepError: 'persona_invalid' }))).toBe('deliver');
    expect(afterPrepare(tstate({ prepError: null }))).toBe('agent');
  });
  it('isCapped: tool_use va rounds >= roundCap', () => {
    expect(isCapped(tstate({ stop: 'tool_use', rounds: 8, roundCap: 8 }))).toBe(true);
    expect(isCapped(tstate({ stop: 'tool_use', rounds: 7, roundCap: 8 }))).toBe(false);
    expect(isCapped(tstate({ stop: 'end_turn', rounds: 8, roundCap: 8 }))).toBe(false);
  });
  const nudgeBase = { stop: 'end_turn' as const, answered: 0, finalText: '', nudged: false };
  it('needsNudge: mention bat buoc, chua tra loi, khong text, chua nhac, stop end_turn/max_tokens', () => {
    expect(needsNudge(tstate(nudgeBase))).toBe(true);
    expect(needsNudge(tstate({ ...nudgeBase, stop: 'max_tokens' }))).toBe(true);
  });
  it('needsNudge: welcome cung nhac', () => {
    expect(needsNudge(tstate(nudgeBase, req({ kind: 'group_welcome', mustReply: true })))).toBe(true);
  });
  it.each([
    ['da tra loi', { answered: 1 }],
    ['co text cuoi', { finalText: 'xin chao' }],
    ['da nhac', { nudged: true }],
    ['refusal', { stop: 'refusal' as const }],
    ['model_down', { stop: 'model_down' as const }],
    ['tool_use', { stop: 'tool_use' as const }],
  ])('needsNudge false: %s', (_n, over) => {
    expect(needsNudge(tstate({ ...nudgeBase, ...over }))).toBe(false);
  });
  it('needsNudge false: ambient / DM / mustReply=false', () => {
    expect(needsNudge(tstate(nudgeBase, req({ kind: 'group_ambient_flush', mustReply: false })))).toBe(false);
    expect(needsNudge(tstate(nudgeBase, req({ kind: 'dm', mustReply: false })))).toBe(false);
    expect(needsNudge(tstate(nudgeBase, req({ kind: 'group_mention', mustReply: false })))).toBe(false);
  });
  it('afterAgent: tool_use con vong => tools', () => {
    expect(afterAgent(tstate({ stop: 'tool_use', rounds: 0 }))).toBe('tools');
    expect(afterAgent(tstate({ stop: 'tool_use', rounds: 7, roundCap: 8 }))).toBe('tools');
  });
  it('afterAgent: tool_use cham tran => deliver (khong nudge)', () => {
    expect(afterAgent(tstate({ stop: 'tool_use', rounds: 8, roundCap: 8 }))).toBe('deliver');
  });
  it('afterAgent: can nhac => nudge; con lai => deliver', () => {
    expect(afterAgent(tstate(nudgeBase))).toBe('nudge');
    expect(afterAgent(tstate({ ...nudgeBase, nudged: true }))).toBe('deliver');
    expect(afterAgent(tstate({ ...nudgeBase, finalText: 'x' }))).toBe('deliver');
    expect(afterAgent(tstate({ stop: 'model_down' }))).toBe('deliver');
    expect(afterAgent(tstate({ stop: 'refusal' }))).toBe('deliver');
  });
  it('afterAgent: roundCap sau nudge = rounds + 2 van cho 2 vong tools', () => {
    expect(afterAgent(tstate({ stop: 'tool_use', rounds: 8, roundCap: 10 }))).toBe('tools');
  });
});

describe('decideDelivery — 12 dong D1–D12 (01-CONTRACTS §12.5)', () => {
  const dmReq = (kind: 'dm' | 'owner_dm' = 'dm') => req({ kind, mustReply: false, threadType: 'user', trigger: null, requester: { uid: 'u1', role: 'member' } });
  const cases: Array<[string, TurnStateT, string, string]> = [
    ['D1 persona_invalid (nhom)', tstate({ prepError: 'persona_invalid' }), 'persona_invalid', 'error'],
    ['D1 persona_invalid uu tien hon model_down', tstate({ prepError: 'persona_invalid', stop: 'model_down' }), 'persona_invalid', 'error'],
    ['D2 join_review da duyet', tstate({ answered: 1 }, req({ kind: 'group_join_review', mustReply: false })), 'none', 'replied'],
    ['D3 join_review im', tstate({ stop: 'end_turn' }, req({ kind: 'group_join_review', mustReply: false })), 'join_default', 'fallback'],
    ['D3 join_review model sap', tstate({ stop: 'model_down' }, req({ kind: 'group_join_review', mustReply: false })), 'join_default', 'model_down'],
    ['D3 join_review refusal', tstate({ stop: 'refusal' }, req({ kind: 'group_join_review', mustReply: false })), 'join_default', 'refusal'],
    ['D3 join_review cham tran', tstate({ stop: 'tool_use', rounds: 8 }, req({ kind: 'group_join_review', mustReply: false })), 'join_default', 'fallback'],
    ['D4 model_down mention', tstate({ stop: 'model_down' }), 'model_down', 'model_down'],
    ['D4 model_down ambient', tstate({ stop: 'model_down' }, req({ kind: 'group_ambient_flush', mustReply: false })), 'model_down', 'model_down'],
    ['D4 model_down DM', tstate({ stop: 'model_down' }, dmReq()), 'model_down', 'model_down'],
    ['D5 DM refusal', tstate({ stop: 'refusal' }, dmReq()), 'dm_empty', 'refusal'],
    ['D6 DM co text', tstate({ stop: 'end_turn', finalText: 'chào bạn' }, dmReq()), 'dm_reply', 'replied'],
    ['D6 owner_dm co text', tstate({ stop: 'end_turn', finalText: 'xong' }, dmReq('owner_dm')), 'dm_reply', 'replied'],
    ['D7 DM rong', tstate({ stop: 'end_turn', finalText: '' }, dmReq()), 'dm_empty', 'fallback'],
    ['D7 DM cham tran co text', tstate({ stop: 'tool_use', rounds: 8, finalText: 'x' }, dmReq()), 'dm_empty', 'fallback'],
    ['D8 da tra loi bang tool', tstate({ answered: 1, stop: 'end_turn' }), 'none', 'replied'],
    ['D8 da tra loi + text cuoi => khong auto_post', tstate({ answered: 2, finalText: 'x' }), 'none', 'replied'],
    ['D9 ambient im', tstate({ stop: 'end_turn', finalText: 'rieng tu' }, req({ kind: 'group_ambient_flush', mustReply: false })), 'none', 'silent'],
    ['D9 unanswered im', tstate({ stop: 'end_turn' }, req({ kind: 'group_unanswered', mustReply: false })), 'none', 'silent'],
    ['D10 mention refusal', tstate({ stop: 'refusal' }), 'fallback', 'refusal'],
    ['D11 mention co text, khong tran => auto_post', tstate({ stop: 'end_turn', finalText: 'tra loi' }), 'auto_post', 'auto_posted'],
    ['D12 mention rong sau nudge', tstate({ stop: 'end_turn', nudged: true }), 'fallback', 'fallback'],
    ['D12 mention cham tran co text => fallback', tstate({ stop: 'tool_use', rounds: 8, finalText: 'x' }), 'fallback', 'fallback'],
    ['D12 welcome rong', tstate({ stop: 'end_turn', nudged: true }, req({ kind: 'group_welcome', mustReply: true })), 'fallback', 'fallback'],
  ];
  it.each(cases)('%s', (_n, t, delivery, outcome) => {
    expect(decideDelivery(t)).toEqual({ delivery, outcome });
  });
  it('12 dong D1..D12 deu duoc phu (ten ca bat dau bang D1..D12)', () => {
    for (let i = 1; i <= 12; i++) expect(cases.some(([n]) => n.startsWith(`D${i} `))).toBe(true);
  });
});

describe('hostText', () => {
  const v = { names: ['An', 'Bích'], groupName: 'Nhóm X', botName: 'Claw' };
  it('welcome (ca hai ly do) => WELCOME_TEMPLATE', () => {
    const r = req({ kind: 'group_welcome' });
    expect(hostText(r, 'fallback', v)).toBe(WELCOME_TEMPLATE(v.names, v.groupName, v.botName));
    expect(hostText(r, 'model_down', v)).toBe(WELCOME_TEMPLATE(v.names, v.groupName, v.botName));
    expect(hostText(r, 'fallback', v)).toContain('An, Bích');
  });
  it('lenh owner + model_down => COMMANDS_HELP; lenh owner + fallback => FALLBACK', () => {
    const r = req({ trigger: 'owner_command' });
    expect(hostText(r, 'model_down', v)).toBe(COMMANDS_HELP);
    expect(hostText(r, 'fallback', v)).toBe(FALLBACK_GROUP_REPLY);
  });
  it('model_down thuong / fallback thuong', () => {
    expect(hostText(req(), 'model_down', v)).toBe(MODEL_DOWN_GROUP_REPLY);
    expect(hostText(req(), 'fallback', v)).toBe(FALLBACK_GROUP_REPLY);
  });
  it('hang so dung nguyen van SPEC', () => {
    expect(FALLBACK_GROUP_REPLY).toBe('Mình chưa trả lời được ngay, bạn chờ mình một chút nhé.');
    expect(MODEL_DOWN_GROUP_REPLY).toBe('Mình đang gặp trục trặc kỹ thuật, bạn hỏi lại sau ít phút nhé.');
  });
});
