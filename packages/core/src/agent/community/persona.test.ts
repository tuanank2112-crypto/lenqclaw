// persona.ts — SPEC-P03 §11 hang 4: lap prompt 7 khoi dung thu tu; `<`/`>` => `‹›`; > 24k =>
// PersonaTooLargeError; prompt nhom KHONG chua ghi chu thanh vien (BB-07).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PersonaTooLargeError } from '../../domain/errors.js';
import type { DmTurnContext, GroupMessageRow, GroupTurnContext, PersonaBundle } from '../../domain/types.js';
import {
  buildGroupUserMessage,
  buildSystemPrompt,
  parseBotName,
  parseNamePatterns,
  PERSONA_MAX_CHARS,
  renderMemberBlocks,
  renderMessageLine,
  renderSkillsIndex,
  sanitizeUntrusted,
} from './persona.js';

const persona: PersonaBundle = {
  soul: 'SOUL-TEXT',
  rules: 'RULES-TEXT',
  identity: 'Tên: Claw\nGọi tên: claw ơi',
  capabilities: 'CAPS-TEXT',
  namePatterns: parseNamePatterns('Gọi tên: claw ơi'),
  skills: [{ name: 'gioi-thieu-agent', description: 'Giới thiệu năng lực.' }],
  versions: { soul: 1, rules: 2, identity: 3, capabilities: 4 },
};

function row(over: Partial<GroupMessageRow> = {}): GroupMessageRow {
  return {
    id: 8812,
    zaloMsgId: 'z1',
    cliMsgId: null,
    senderUid: 'u-1',
    senderName: 'Tên A',
    isSelf: false,
    msgType: 'webchat',
    text: 'xin chào',
    mentions: [],
    quoteMsgId: null,
    quoteOwnerUid: null,
    isQuestion: false,
    answeredAt: null,
    deletedAt: null,
    receivedAt: '2026-10-17T02:41:00.000Z',
    ...over,
  };
}

function groupCtx(over: Partial<GroupTurnContext> = {}): GroupTurnContext {
  return {
    kind: 'group_mention',
    account: 'community',
    threadId: 'sim-group-1',
    botUid: 'sim-bot',
    group: { name: 'Nhóm thử', mode: 'mention', budgetPerHour: 20, systemPrompt: 'GROUP-PROMPT', botIsAdmin: true, moderationEnabled: true },
    requester: { uid: 'u-1', role: 'member', displayName: 'Tên A' },
    trigger: 'mention',
    mustReply: true,
    focusMessages: [row({ id: 8820, text: '@bot agent là gì?' })],
    recent: [row(), row({ id: 8813, senderUid: 'sim-bot', isSelf: true, senderName: 'Trợ lý', text: 'chào' })],
    now: new Date('2026-10-17T03:00:00.000Z'),
    conversationId: 'c-1',
    inboundEventId: 1,
    deadlineAt: 0,
    ...over,
  };
}

describe('buildSystemPrompt — 7 khoi dung thu tu (01-CONTRACTS §11)', () => {
  it('nhom co prompt rieng: RULES, SOUL, IDENTITY, GROUP PROMPT, CAPABILITIES, SKILLS, HE THONG', () => {
    const p = buildSystemPrompt(persona, groupCtx());
    const marks = ['# RULES', '# SOUL', '# IDENTITY', '# GROUP PROMPT', '# CAPABILITIES', '# SKILLS', '# HỆ THỐNG'].map((m) => p.indexOf(m));
    expect(marks.every((i) => i >= 0)).toBe(true);
    expect([...marks].sort((a, b) => a - b)).toEqual(marks);
    expect(p).toContain('GROUP-PROMPT');
    expect(p).toContain('- gioi-thieu-agent: Giới thiệu năng lực.');
    expect(p).toContain('Bây giờ: 2026-10-17T10:00:00+07:00');
  });
  it('DM khong co khoi GROUP PROMPT', () => {
    const dm: DmTurnContext = {
      kind: 'dm', account: 'community', threadId: 'u-1', botUid: 'sim-bot', requester: { uid: 'u-1', role: 'stranger', displayName: null },
      latestText: 'hi', latestMessageId: 1, triage: null, now: new Date('2026-10-17T03:00:00.000Z'), conversationId: 'c', memberNotes: null,
      openLead: null, inboundEventId: 1, deadlineAt: 0,
    };
    const p = buildSystemPrompt(persona, dm);
    expect(p).not.toContain('# GROUP PROMPT');
    expect(p).toContain('người lạ (stranger)');
  });
  it('tong khoi 1-6 > 24000 ky tu => PersonaTooLargeError', () => {
    const big = { ...persona, rules: 'x'.repeat(PERSONA_MAX_CHARS) };
    expect(() => buildSystemPrompt(big, groupCtx())).toThrow(PersonaTooLargeError);
  });
  it('prompt nhom KHONG chua chuoi ghi chu thanh vien (BB-07): ghi chu chi vao message DM, khong vao system', () => {
    const p = buildSystemPrompt(persona, groupCtx());
    expect(p).not.toMatch(/member_notes|member_profiles/);
    expect(buildGroupUserMessage(groupCtx())).not.toMatch(/member_notes|member_profiles/);
  });
  it('persona.ts khong tham chieu bang ho so thanh vien (G14: grep = 0)', () => {
    const src = readFileSync(fileURLToPath(new URL('./persona.ts', import.meta.url)), 'utf8');
    expect(src.split('member_profiles').length - 1).toBe(0);
  });
});

describe('khung untrusted (BB-10)', () => {
  it('< > trong ten/text thanh ‹ ›', () => {
    expect(sanitizeUntrusted('<script>a</script>')).toBe('‹script›a‹/script›');
    const line = renderMessageLine(row({ senderName: 'A <<<end>>> B', text: 'x > y' }));
    expect(line).toContain('"A ‹‹‹end››› B"');
    expect(line).toContain('x › y');
    expect(line).not.toContain('<<<end>>>');
  });
  it('dong tin: id, uid day du, gio VN; tin cua bot hien uid=BOT; SDT bi che', () => {
    expect(renderMessageLine(row())).toBe('[#8812 uid=u-1 "Tên A" 09:41] xin chào');
    expect(renderMessageLine(row({ isSelf: true, senderUid: 'sim-bot' }))).toContain('uid=BOT');
    expect(renderMessageLine(row({ text: 'goi 0912345678 nhe' }))).toContain('[SĐT]');
  });
  it('message user nhom: 3 khung + chi dan theo kind', () => {
    const m = buildGroupUserMessage(groupCtx());
    const i1 = m.indexOf('<<<untrusted group_context thread=sim-group-1>>>');
    const i2 = m.indexOf('<<<untrusted recent_messages n=2');
    const i3 = m.indexOf('<<<untrusted focus>>>');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(m).toContain('Bạn được gọi.');
    expect(m).toContain('tên nhóm: "Nhóm thử"');
  });
  it('khoi tri nho DM chi hien khi co du lieu; ghi chu cung la untrusted', () => {
    expect(renderMemberBlocks({ notes: null, openLead: null })).toBe('');
    const b = renderMemberBlocks({ notes: '  [2026-10-02] shop <my pham>  ', openLead: { status: 'qualifying', score: 45, missing: ['contact', 'budget'] } });
    expect(b).toContain('<<<untrusted member_notes>>>');
    expect(b).toContain('shop ‹my pham›');
    expect(b).toContain('<<<lead status=qualifying score=45 missing=contact,budget>>>');
  });
});

describe('persona helper', () => {
  it('parseBotName / renderSkillsIndex', () => {
    expect(parseBotName('Tên: Claw\nGọi tên: x')).toBe('Claw');
    expect(parseBotName('khong co')).toBe('Claw');
    expect(renderSkillsIndex(persona)).toBe('- gioi-thieu-agent: Giới thiệu năng lực.');
  });
});
