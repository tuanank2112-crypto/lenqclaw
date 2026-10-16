// SPEC-P02 §4.2 + §8 + §9: thi hanh action bang FakeSession (0 mang, 0 DB —
// applyGroupSync duoc tiem vao).
import { describe, expect, it } from 'vitest';
import { executeAction, InvalidActionError } from './actions.js';
import type { GroupSyncResult, OutboxRow } from './store.js';
import { FakeSession } from './testing/fake-client.js';

const OWN = 'bot-uid';

function session(): FakeSession {
  return new FakeSession(OWN, { cookie: [], imei: 'i', userAgent: 'u' });
}

function row(body: Record<string, unknown>, over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 1,
    thread_id: 'g1',
    thread_type: 'group',
    kind: 'action',
    body,
    attempts: 0,
    staff_takeover: false,
    created_ms: Date.now(),
    ...over,
  };
}

const noSync = { applyGroupSync: async () => ({ botIsAdmin: false }) };

describe('delete_message', () => {
  it('goi deleteMessage voi uidFrom = NGUOI GUI GOC trong body (khong phai uid bot), type=group, onlyMe=false', async () => {
    const s = session();
    const out = await executeAction(
      'community',
      s,
      row({ action: 'delete_message', msgId: 'm1', cliMsgId: 'c1', uidFrom: 'nguoi-gui-goc', onlyMe: false })
    );
    expect(out.ok).toBe(true);
    const call = s.actions[0]!;
    expect(call.kind).toBe('deleteMessage');
    const a = call.args as { dest: { data: { uidFrom: string; msgId: string; cliMsgId: string }; threadId: string; type: string }; onlyMe: boolean };
    expect(a.dest.data).toEqual({ msgId: 'm1', cliMsgId: 'c1', uidFrom: 'nguoi-gui-goc' });
    expect(a.dest.data.uidFrom).not.toBe(OWN);
    expect(a.dest.threadId).toBe('g1');
    expect(a.dest.type).toBe('group');
    expect(a.onlyMe).toBe(false);
  });
  it('thieu cliMsgId hoac uidFrom ⇒ cli_msg_id_missing, KHONG goi Zalo, KHONG doan bang msgId', async () => {
    for (const body of [
      { action: 'delete_message', msgId: 'm1', uidFrom: 'u' },
      { action: 'delete_message', msgId: 'm1', cliMsgId: 'c1' },
      { action: 'delete_message', msgId: 'm1', cliMsgId: '', uidFrom: 'u' },
    ]) {
      const s = session();
      await expect(executeAction('community', s, row(body))).rejects.toMatchObject({ reason: 'cli_msg_id_missing' });
      expect(s.actions).toEqual([]);
    }
  });
  it('status != 0 ⇒ ok=false (failed), ghi status', async () => {
    const s = session();
    s.deleteStatus = 7;
    const out = await executeAction('community', s, row({ action: 'delete_message', msgId: 'm', cliMsgId: 'c', uidFrom: 'u' }));
    expect(out).toMatchObject({ ok: false, result: { status: 7 }, failReason: 'delete_status_7' });
  });
});

describe('review_join', () => {
  const body = { action: 'review_join', uids: ['u1', 'u2'], approve: true };
  it('ma 166 ⇒ failed + botNotAdmin (bot_is_admin=false)', async () => {
    const s = session();
    s.reviewResult = { u1: 166 };
    const out = await executeAction('community', s, row(body));
    expect(out).toMatchObject({ ok: false, botNotAdmin: true, code: 166, failReason: 'insufficient_permission' });
    expect(out.result).toEqual({ u1: 166, u2: 0 });
  });
  it('170 (khong con trong danh sach) / 178 (da vao) ⇒ coi la XONG, khong botNotAdmin', async () => {
    const s = session();
    s.reviewResult = { u1: 170, u2: 178 };
    const out = await executeAction('community', s, row(body));
    expect(out.ok).toBe(true);
    expect(out.botNotAdmin).toBeUndefined();
    expect(out.result).toEqual({ u1: 170, u2: 178 });
    expect((s.actions[0]!.args as { approve: boolean; groupId: string }).approve).toBe(true);
  });
});

describe('remove_member / block / poll / reminder / note / settings', () => {
  it('remove_member: errorMembers chua uid ⇒ failed; rong ⇒ ok', async () => {
    const s = session();
    s.removeErrorMembers = ['u9'];
    const bad = await executeAction('community', s, row({ action: 'remove_member', uid: 'u9', approvalId: 'a' }));
    expect(bad).toMatchObject({ ok: false, failReason: 'remove_member_failed', result: { errorMembers: ['u9'] } });
    s.removeErrorMembers = [];
    expect((await executeAction('community', s, row({ action: 'remove_member', uid: 'u9', approvalId: 'a' }))).ok).toBe(true);
  });
  it('block/unblock/lock_poll/remove_reminder/update_group_settings ⇒ result {} va dung ham', async () => {
    const s = session();
    await executeAction('community', s, row({ action: 'block_member', uid: 'u1', approvalId: 'a' }));
    await executeAction('community', s, row({ action: 'unblock_member', uid: 'u1' }));
    await executeAction('community', s, row({ action: 'lock_poll', pollId: 77 }));
    await executeAction('community', s, row({ action: 'remove_reminder', reminderId: 'r1' }));
    await executeAction('community', s, row({ action: 'update_group_settings', settings: { joinAppr: true, lockSendMsg: false, bogus: 1 } }));
    expect(s.actions.map((a) => a.kind)).toEqual(['blockMember', 'unblockMember', 'lockPoll', 'removeReminder', 'updateGroupSettings']);
    expect((s.actions[4]!.args as { o: object }).o).toEqual({ joinAppr: true, lockSendMsg: false });
  });
  it('create_poll / create_reminder / create_note ⇒ tra poll_id / id', async () => {
    const s = session();
    const poll = await executeAction('community', s, row({ action: 'create_poll', question: 'Họp khi nào?', options: ['T7', 'CN'], isAnonymous: true }));
    expect(typeof poll.result.poll_id).toBe('number');
    const rem = await executeAction('community', s, row({ action: 'create_reminder', title: 'Họp', startTime: 1_800_000_000_000, repeat: 0 }));
    expect(String(rem.result.id)).toMatch(/^rem-/);
    const note = await executeAction('community', s, row({ action: 'create_note', title: 'Nội quy', pinAct: true }));
    expect(String(note.result.id)).toMatch(/^note-/);
  });
  it('body sai (thieu truong / sai kieu) ⇒ invalid_action_body, khong goi Zalo', async () => {
    const s = session();
    for (const body of [
      { action: 'remove_member' },
      { action: 'review_join', uids: [], approve: true },
      { action: 'review_join', uids: ['u'], approve: 'yes' },
      { action: 'create_reminder', title: 't', startTime: 1, repeat: 9 },
      { action: 'update_group_settings', settings: {} },
    ]) {
      await expect(executeAction('community', s, row(body))).rejects.toBeInstanceOf(InvalidActionError);
    }
    expect(s.actions).toEqual([]);
  });
});

describe('sync_group_info', () => {
  it('memberIds=[] ⇒ lay uid tu memVerList ("<uid>_<phien ban>"), goi getMembersInfo voi dung uid', async () => {
    const s = session();
    s.groupInfo = {
      name: 'Cộng đồng AI',
      adminIds: [OWN, 'mod-1'],
      creatorId: 'owner-1',
      memberIds: [],
      memVerList: ['u1_5', 'u2_7', 'mod-1_2'],
      totalMember: 3,
      setting: { joinAppr: 1 },
    };
    s.memberNames = { u1: 'An', u2: 'Bích', 'mod-1': 'Hà' };
    let applied: { groupId: string; result: GroupSyncResult; ownUid: string } | null = null;
    const out = await executeAction('community', s, row({ action: 'sync_group_info' }), {
      applyGroupSync: async (_acc, groupId, result, ownUid) => {
        applied = { groupId, result, ownUid };
        return { botIsAdmin: true };
      },
    });
    expect(s.actions.map((a) => a.kind)).toEqual(['getGroupInfo', 'getMembersInfo']);
    expect((s.actions[1]!.args as { uids: string[] }).uids).toEqual(['u1', 'u2', 'mod-1']);
    expect(out.ok).toBe(true);
    expect(out.result).toEqual({
      name: 'Cộng đồng AI',
      adminIds: [OWN, 'mod-1'],
      creatorId: 'owner-1',
      members: [
        { uid: 'u1', displayName: 'An' },
        { uid: 'u2', displayName: 'Bích' },
        { uid: 'mod-1', displayName: 'Hà' },
      ],
      total: 3,
    });
    expect(applied).toMatchObject({ groupId: 'g1', ownUid: OWN });
  });
  it('memberIds co san ⇒ dung memberIds, bo qua memVerList', async () => {
    const s = session();
    s.groupInfo = { ...s.groupInfo, memberIds: ['a', 'b'], memVerList: ['x_1'], totalMember: 2 };
    await executeAction('community', s, row({ action: 'sync_group_info' }), noSync);
    expect((s.actions[1]!.args as { uids: string[] }).uids).toEqual(['a', 'b']);
  });
});

describe('vung cam §8', () => {
  it('hanh dong cam / la ⇒ unknown_action, 0 lan goi Zalo', async () => {
    const forbidden = ['disperse_group', 'change_group_owner', 'add_group_deputy', 'remove_group_deputy', 'leave_group', 'send_file', 'frobnicate'];
    for (const name of forbidden) {
      const s = session();
      await expect(executeAction('community', s, row({ ['action']: name }))).rejects.toMatchObject({ reason: 'unknown_action' });
      expect(s.actions, name).toEqual([]);
    }
  });
});
