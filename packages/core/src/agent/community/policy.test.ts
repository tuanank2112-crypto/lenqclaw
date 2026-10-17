// policy.ts — SPEC-P03 §8, 01-CONTRACTS §7.1–§7.2: moi tool × be mat (G/D/O) co ca cho/cam;
// bang cam §7.2 khong nam trong TOOL_NAMES; phong thu hai lop (assertToolAllowed).
import { describe, expect, it } from 'vitest';
import { ToolNotAllowedError } from '../../domain/errors.js';
import type { Role, TurnKind } from '../../domain/types.js';
import { allowedToolNames, assertToolAllowed, surfaceOf, TOOL_NAMES, TOOL_POLICY, toolsFor, type ToolName } from './policy.js';

const FORBIDDEN_7_2 = [
  'exec', 'shell', 'read_file', 'write_file', 'send_file', 'self_update', 'restart', 'restart_channel', 'disperse_group',
  'change_group_owner', 'add_group_admin', 'remove_group_admin', 'add_group_deputy', 'remove_group_deputy', 'leave_group',
  'send_friend_request', 'list_contacts', 'get_group_chat_history', 'update_config', 'kick_member', 'block_member', 'recall_full_history',
];

const allowed = (kind: TurnKind, role: Role) => new Set<string>(allowedToolNames(kind, role));

describe('TOOL_NAMES', () => {
  it('giao voi danh sach cam §7.2 = rong (22 ten)', () => {
    expect(FORBIDDEN_7_2).toHaveLength(22);
    expect(TOOL_NAMES.filter((n) => FORBIDDEN_7_2.includes(n))).toEqual([]);
  });
  it('khong trung ten; moi ten co dong trong TOOL_POLICY; tool khong ten nao la RAT cua tool cam', () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
    for (const n of TOOL_NAMES) expect(TOOL_POLICY[n]).toBeDefined();
    expect(TOOL_NAMES).toContain('request_member_removal');
    expect(TOOL_NAMES).not.toContain('recall_member_profile'); // D22: da BO
  });
});

type Case = [kind: TurnKind, role: Role, tool: ToolName, ok: boolean, why: string];
const CASES: Case[] = [
  // G: luot nhom
  ['group_mention', 'member', 'search_knowledge', true, 'G moi vai'],
  ['group_mention', 'member', 'send_group_message', true, 'G send'],
  ['group_mention', 'stranger', 'send_group_message', true, 'G stranger nhu member'],
  ['group_mention', 'member', 'recall_group_history', true, 'G recall'],
  ['group_mention', 'member', 'flag_message', true, 'G flag'],
  ['group_mention', 'member', 'delete_message', true, 'G delete (luat nam trong tool)'],
  ['group_mention', 'member', 'warn_member', true, 'G warn'],
  ['group_mention', 'member', 'request_member_removal', true, 'G tao the duyet'],
  ['group_mention', 'member', 'invite_to_private', true, 'G invite'],
  ['group_mention', 'member', 'remember_member_note', true, 'G ghi (khong doc — BB-07)'],
  ['group_mention', 'member', 'handoff_to_owner', true, 'G handoff'],
  ['group_mention', 'member', 'create_poll', false, 'member khong tao poll'],
  ['group_mention', 'owner', 'create_poll', true, 'owner tao poll'],
  ['group_mention', 'moderator', 'create_reminder', true, 'moderator nhac lich'],
  ['group_mention', 'member', 'create_note', false, 'member khong ghi chu nhom'],
  ['group_mention', 'moderator', 'set_group_mode', true, 'moderator doi mode'],
  ['group_mention', 'member', 'set_group_mode', false, 'member khong doi mode'],
  ['group_mention', 'moderator', 'mute_group', true, 'moderator mute'],
  ['group_mention', 'member', 'mute_group', false, 'member khong mute'],
  ['group_mention', 'owner', 'decide_approval', true, 'owner duyet qua /approve'],
  ['group_mention', 'member', 'decide_approval', false, 'member khong duyet'],
  ['group_mention', 'owner', 'list_groups', false, 'list_groups chi O'],
  ['group_mention', 'owner', 'set_group_enabled', false, 'set_group_enabled chi O'],
  ['group_mention', 'owner', 'announce', false, 'announce chi O'],
  ['group_mention', 'owner', 'save_lead', false, 'lead chi D'],
  ['group_mention', 'owner', 'search_memory', false, 'search_memory chi O (BB-07)'],
  ['group_mention', 'owner', 'review_join_request', false, 'review_join chi luot join_review'],
  ['group_ambient_flush', 'member', 'send_group_message', true, 'ambient requester=null => member'],
  ['group_ambient_flush', 'member', 'create_poll', false, 'ambient khong poll'],
  ['group_unanswered', 'member', 'search_knowledge', true, 'unanswered tra cuu'],
  ['group_welcome', 'member', 'send_group_message', true, 'welcome gui'],
  // join review: DUY NHAT review_join_request
  ['group_join_review', 'member', 'review_join_request', true, 'join_review'],
  ['group_join_review', 'member', 'send_group_message', false, 'join_review khong noi'],
  ['group_join_review', 'member', 'search_knowledge', false, 'join_review khong tra cuu'],
  // automation
  ['automation', 'member', 'send_group_message', true, 'automation gui'],
  ['automation', 'member', 'search_knowledge', true, 'automation tra cuu'],
  ['automation', 'member', 'recall_group_history', true, 'automation recall'],
  ['automation', 'member', 'create_poll', true, 'automation poll'],
  ['automation', 'member', 'delete_message', false, 'automation khong xoa'],
  ['automation', 'member', 'handoff_to_owner', false, 'automation khong handoff'],
  // D: DM member
  ['dm', 'member', 'search_knowledge', true, 'D tra cuu'],
  ['dm', 'member', 'describe_capabilities', true, 'D capabilities'],
  ['dm', 'member', 'read_skill', true, 'D skill'],
  ['dm', 'member', 'remember_member_note', true, 'D member ghi chu'],
  ['dm', 'member', 'save_lead', true, 'D lead'],
  ['dm', 'member', 'submit_lead', true, 'D submit'],
  ['dm', 'member', 'handoff_to_owner', true, 'D handoff'],
  ['dm', 'member', 'send_group_message', false, 'D khong noi vao nhom'],
  ['dm', 'member', 'recall_group_history', false, 'D khong doc dem nhom'],
  ['dm', 'member', 'create_poll', false, 'D khong poll'],
  ['dm', 'member', 'list_groups', false, 'D khong liet ke nhom'],
  ['dm', 'member', 'search_memory', false, 'D khong tim tri nho'],
  // D: stranger
  ['dm', 'stranger', 'search_knowledge', true, 'stranger tra cuu'],
  ['dm', 'stranger', 'save_lead', true, 'stranger lead'],
  ['dm', 'stranger', 'submit_lead', true, 'stranger submit'],
  ['dm', 'stranger', 'handoff_to_owner', true, 'stranger handoff'],
  ['dm', 'stranger', 'read_skill', true, 'stranger skill'],
  ['dm', 'stranger', 'describe_capabilities', true, 'stranger capabilities'],
  ['dm', 'stranger', 'remember_member_note', false, 'stranger KHONG ghi chu'],
  // O: DM owner
  ['owner_dm', 'owner', 'list_groups', true, 'O liet ke nhom'],
  ['owner_dm', 'owner', 'set_group_enabled', true, 'O bat/tat nhom'],
  ['owner_dm', 'owner', 'set_group_mode', true, 'O doi mode'],
  ['owner_dm', 'owner', 'mute_group', true, 'O mute'],
  ['owner_dm', 'owner', 'announce', true, 'O thong bao'],
  ['owner_dm', 'owner', 'decide_approval', true, 'O duyet the'],
  ['owner_dm', 'owner', 'schedule_automation', true, 'O lich'],
  ['owner_dm', 'owner', 'search_memory', true, 'O tri nho'],
  ['owner_dm', 'owner', 'write_daily_note', true, 'O ghi chu ngay'],
  ['owner_dm', 'owner', 'daily_report', true, 'O bao cao'],
  ['owner_dm', 'owner', 'remember_member_note', true, 'O ghi chu'],
  ['owner_dm', 'owner', 'search_knowledge', true, 'O tra cuu'],
  ['owner_dm', 'owner', 'send_group_message', false, 'O khong noi truc tiep vao nhom (dung announce)'],
  ['owner_dm', 'owner', 'handoff_to_owner', false, 'O khong tu handoff'],
  ['owner_dm', 'owner', 'save_lead', false, 'O khong lead'],
];

describe('allowedToolNames — moi tool × be mat', () => {
  it('co >= 30 ca', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
  });
  it.each(CASES)('%s/%s %s => %s (%s)', (kind, role, tool, ok) => {
    expect(allowed(kind, role).has(tool)).toBe(ok);
  });
  it('moi tool trong TOOL_NAMES xuat hien o it nhat mot ca cho (bang co nghia)', () => {
    const everAllowed = new Set<string>();
    for (const kind of ['group_mention', 'dm', 'owner_dm', 'group_join_review', 'automation'] as TurnKind[]) {
      for (const role of ['owner', 'moderator', 'member', 'stranger'] as Role[]) for (const n of allowedToolNames(kind, role)) everAllowed.add(n);
    }
    for (const n of TOOL_NAMES) expect(everAllowed.has(n)).toBe(true);
  });
});

describe('surfaceOf / toolsFor / assertToolAllowed', () => {
  it('surfaceOf: dm=D, owner_dm=O, con lai=G', () => {
    expect(surfaceOf('dm')).toBe('D');
    expect(surfaceOf('owner_dm')).toBe('O');
    for (const k of ['group_mention', 'group_ambient_flush', 'group_welcome', 'group_unanswered', 'group_join_review', 'automation'] as TurnKind[]) {
      expect(surfaceOf(k)).toBe('G');
    }
  });
  it('toolsFor chi tra dinh nghia cua tool DUOC PHEP', () => {
    for (const kind of ['group_mention', 'dm', 'owner_dm'] as TurnKind[]) {
      const names = new Set<string>(allowedToolNames(kind, 'member'));
      for (const d of toolsFor(kind, 'member')) expect(names.has(d.name)).toBe(true);
    }
  });
  it('assertToolAllowed nem ToolNotAllowedError voi tool cam / tool la', () => {
    expect(() => assertToolAllowed('dm', 'stranger', 'remember_member_note')).toThrow(ToolNotAllowedError);
    expect(() => assertToolAllowed('group_mention', 'member', 'kick_member')).toThrow(ToolNotAllowedError);
    expect(() => assertToolAllowed('group_mention', 'member', 'send_group_message')).not.toThrow();
  });
  it('stranger o DM: dung tap strangerAllowed', () => {
    const want = TOOL_NAMES.filter((n) => TOOL_POLICY[n].strangerAllowed && TOOL_POLICY[n].surfaces.includes('D')).sort();
    expect([...allowed('dm', 'stranger')].sort()).toEqual(want);
  });
});
