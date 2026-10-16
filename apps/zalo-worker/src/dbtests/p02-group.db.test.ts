// apps/zalo-worker/src/dbtests/p02-group.db.test.ts — nghiem thu may P02 ke hoach 02
// (SPEC-P02 §10 hang 2 + luong nhom/action tren DB that, zca-js GIA, 0 mang).
// Du lieu tu co lap: moi test dung thread/uid rieng (`uid()`), don dep cuoi test (G29).

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, enqueue, sql } from '@lenqclaw/core';
import { AccountPacer } from '../pacer.js';
import { ZaloActionError, type ZaloSessionLike } from '../client.js';
import * as store from '../store.js';
import { fakeGroupEvent, fakeMessage } from '../testing/fake-client.js';
import { FAST, connectedSession, dropGroup, enqueueId, makeGroup, outboxRow, resetAccount, uid } from './group-helpers.js';

const ACCOUNT = 'community';

beforeEach(async () => {
  await resetAccount();
});

afterAll(async () => {
  await resetAccount();
  // G29: tin/su kien nhom de lai `processed_at is null` trong hang doi toan cuc ⇒ danh dau xong.
  await sql(`update inbound_events set processed_at = now() where processed_at is null`);
  await closeDb();
});

function pacerFor(s: { getSession: () => ZaloSessionLike | null }) {
  return new AccountPacer(ACCOUNT, FAST, () => s.getSession(), { rng: () => 0 });
}

async function auditCount(action: string, target: string): Promise<number> {
  const r = await sql<{ c: number }>(`select count(*)::int as c from audit_log where action = $1 and target = $2`, [action, target]);
  return r[0]!.c;
}

describe('delete_message (SPEC-P02 §4.2, vung cam zaloclaw tool.ts:741)', () => {
  it('uidFrom = NGUOI GUI GOC (group_messages.sender_uid), khong phai uid bot', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const original = 'sender-goc-1';
    const msgId = uid('m');
    await sql(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, text)
       values ('community', $1, $2, $3, $4, 'tin cần xoá')`,
      [group, msgId, `cli-${msgId}`, original]
    );
    // Core lay uidFrom tu group_messages.sender_uid. Che do do: P02_RED_BOT_UID=1
    // gia lap loi zaloclaw (dua uid bot) — test PHAI do.
    const stored = (await sql<{ sender_uid: string }>(`select sender_uid from group_messages where zalo_msg_id=$1`, [msgId]))[0]!.sender_uid;
    const uidFrom = process.env.P02_RED_BOT_UID === '1' ? fake.ownUid : stored;
    const id = await enqueueId({
      zaloAccountId: ACCOUNT,
      threadId: group,
      threadType: 'group',
      kind: 'action',
      body: { action: 'delete_message', msgId, cliMsgId: `cli-${msgId}`, uidFrom, onlyMe: false },
    });
    await pacerFor(s).tick();
    const call = fake.actions.find((a) => a.kind === 'deleteMessage');
    expect(call).toBeDefined();
    const dest = (call!.args as { dest: { data: { uidFrom: string; msgId: string }; type: string } }).dest;
    expect(dest.data.uidFrom).toBe(original);
    expect(dest.data.uidFrom).not.toBe(fake.ownUid);
    expect(dest.data.msgId).toBe(msgId);
    expect(dest.type).toBe('group');
    const row = await outboxRow(id);
    expect(row.status).toBe('sent');
    expect(row.result).toEqual({ status: 0 });
    expect(row.sent_at).not.toBeNull();
    expect(await auditCount('zalo.action', group)).toBe(1); // BB-09: 1 hanh dong = 1 audit, khong ghi noi dung
    await dropGroup(group);
    await s.stop();
  });

  it('thieu cli_msg_id ⇒ failed(cli_msg_id_missing), KHONG goi Zalo, audit zalo.action_failed', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const id = await enqueueId({
      zaloAccountId: ACCOUNT,
      threadId: group,
      threadType: 'group',
      kind: 'action',
      body: { action: 'delete_message', msgId: 'm1', uidFrom: 'someone' },
    });
    await pacerFor(s).tick();
    expect(fake.actions).toEqual([]);
    const row = await outboxRow(id);
    expect(row.status).toBe('failed');
    expect(row.body.fail_reason).toBe('cli_msg_id_missing');
    expect(row.result).toMatchObject({ error: { name: 'InvalidActionError' } });
    expect(await auditCount('zalo.action_failed', group)).toBe(1);
    await dropGroup(group);
    await s.stop();
  });
});

describe('ket qua action ghi vao DB (§4.2, §9)', () => {
  it('ma 166 (review_join) ⇒ zalo_groups.bot_is_admin=false + audit zalo.alert deputy_missing + failed', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    await sql(`update zalo_groups set bot_is_admin = true where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    fake.reviewResult = { 'u-x': 166 };
    const id = await enqueueId({
      zaloAccountId: ACCOUNT,
      threadId: group,
      threadType: 'group',
      kind: 'action',
      body: { action: 'review_join', uids: ['u-x'], approve: true },
    });
    await pacerFor(s).tick();
    expect((await outboxRow(id)).status).toBe('failed');
    const g = await sql<{ bot_is_admin: boolean }>(`select bot_is_admin from zalo_groups where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    expect(g[0]!.bot_is_admin).toBe(false);
    const alerts = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action='zalo.alert' and data->>'kind'='deputy_missing' and data->>'thread'=$1`,
      [group]
    );
    expect(alerts[0]!.c).toBe(1);
    await dropGroup(group);
    await s.stop();
  });

  it('review_join 170/178 ⇒ sent, result ghi ma', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    fake.reviewResult = { a: 170, b: 178 };
    const id = await enqueueId({
      zaloAccountId: ACCOUNT,
      threadId: group,
      threadType: 'group',
      kind: 'action',
      body: { action: 'review_join', uids: ['a', 'b'], approve: true },
    });
    await pacerFor(s).tick();
    const row = await outboxRow(id);
    expect(row.status).toBe('sent');
    expect(row.result).toEqual({ a: 170, b: 178 });
    await dropGroup(group);
    await s.stop();
  });

  it('remove_member co approvalId ⇒ approvals approved → executed (+ audit approval.executed); loi ⇒ failed', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const mkApproval = async (): Promise<string> =>
      (
        await sql<{ id: string }>(
          `insert into approvals (zalo_account_id, kind, thread_id, target_uid, reason, requested_by, status, expires_at)
           values ($1,'kick_member',$2,'u-bad','test','agent','approved', now() + interval '1 hour') returning id`,
          [ACCOUNT, group]
        )
      )[0]!.id;
    const ok = await mkApproval();
    const bad = await mkApproval();
    await enqueue({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'action', body: { action: 'remove_member', uid: 'u-bad', approvalId: ok } });
    await pacerFor(s).tick();
    fake.nextActionError = new ZaloActionError('boom', 100);
    await enqueue({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'action', body: { action: 'remove_member', uid: 'u-bad', approvalId: bad } });
    await pacerFor(s).tick();
    const st = await sql<{ id: string; status: string; executed: boolean }>(
      `select id, status, executed_at is not null as executed from approvals where id = any($1::uuid[])`,
      [[ok, bad]]
    );
    expect(st.find((r) => r.id === ok)).toMatchObject({ status: 'executed', executed: true });
    expect(st.find((r) => r.id === bad)).toMatchObject({ status: 'failed', executed: true });
    expect(await auditCount('approval.executed', ok)).toBe(1);
    expect(await auditCount('approval.failed', bad)).toBe(1);
    await sql(`delete from approvals where id = any($1::uuid[])`, [[ok, bad]]);
    await dropGroup(group);
    await s.stop();
  });
});

describe('sync_group_info ⇒ zalo_groups + group_members (§4.2)', () => {
  it('upsert nhom + thanh vien (memberIds rong ⇒ memVerList); admin ⇒ moderator, khong ha vai; vang mat ⇒ left_at', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    fake.groupInfo = {
      name: 'Cộng đồng AI thử',
      adminIds: [fake.ownUid, 'mod-1'],
      creatorId: 'owner-1',
      memberIds: [],
      memVerList: ['u1_3', 'u2_3', 'mod-1_3'],
      totalMember: 3,
      setting: { joinAppr: 1 },
    };
    fake.memberNames = { u1: 'An', u2: 'Bích', 'mod-1': 'Hà' };
    const id1 = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'action', body: { action: 'sync_group_info' } });
    await pacerFor(s).tick();
    expect((await outboxRow(id1)).status).toBe('sent');
    const g = await sql<{ name: string; bot_is_admin: boolean; last_synced_at: string | null; enabled: boolean }>(
      `select name, bot_is_admin, last_synced_at::text, enabled from zalo_groups where zalo_account_id=$1 and thread_id=$2`,
      [ACCOUNT, group]
    );
    expect(g[0]).toMatchObject({ name: 'Cộng đồng AI thử', bot_is_admin: true, enabled: false }); // nhom moi phat hien: CHUA bat
    expect(g[0]!.last_synced_at).not.toBeNull();
    const members = async () =>
      sql<{ zalo_uid: string; role: string; display_name: string | null; left_at: string | null }>(
        `select zalo_uid, role, display_name, left_at::text from group_members where zalo_account_id=$1 and thread_id=$2 order by zalo_uid`,
        [ACCOUNT, group]
      );
    expect((await members()).map((m) => [m.zalo_uid, m.role, m.display_name, m.left_at])).toEqual([
      ['mod-1', 'moderator', 'Hà', null],
      ['u1', 'member', 'An', null],
      ['u2', 'member', 'Bích', null],
    ]);

    // lan 2: u1 duoc thang vai bang tay (khong nam trong adminIds) ⇒ KHONG ha; u2 roi nhom; bot khong con admin
    await sql(`update group_members set role='moderator' where zalo_account_id=$1 and thread_id=$2 and zalo_uid='u1'`, [ACCOUNT, group]);
    fake.groupInfo = { ...fake.groupInfo, adminIds: ['mod-1'], creatorId: 'owner-1', memVerList: ['u1_4', 'mod-1_4', 'u3_4'], totalMember: 3 };
    fake.memberNames = { u1: 'An', u3: 'Chi', 'mod-1': 'Hà' };
    await enqueue({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'action', body: { action: 'sync_group_info' } });
    await pacerFor(s).tick();
    const after = await members();
    expect(after.map((m) => [m.zalo_uid, m.role, m.left_at === null])).toEqual([
      ['mod-1', 'moderator', true],
      ['u1', 'moderator', true],
      ['u2', 'member', false],
      ['u3', 'member', true],
    ]);
    const g2 = await sql<{ bot_is_admin: boolean }>(`select bot_is_admin from zalo_groups where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    expect(g2[0]!.bot_is_admin).toBe(false);
    await dropGroup(group);
    await s.stop();
  });
});

describe('text nhom: sent_at, link msgId that, ngan sach (§4.3, §5, §10 hang 2)', () => {
  it('markSent ghi sent_at=now() + zalo_msg_id', async () => {
    const group = uid('g');
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'a' } });
    expect((await outboxRow(id)).sent_at).toBeNull();
    await store.markSending(id);
    await store.markSent(id, 'zmsg-1');
    const row = await outboxRow(id);
    expect(row.status).toBe('sent');
    expect(row.zalo_msg_id).toBe('zmsg-1');
    expect(row.sent_at).not.toBeNull();
    await sql(`update outbox set status='cancelled' where id=$1`, [id]);
  });

  it('linkSentGroupMessage: dong dem "out-<id>" doi sang msgId that; id khac khong bi dong', async () => {
    const group = uid('g');
    await makeGroup(group);
    await sql(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, is_self, text) values
         ($1,$2,'out-9001','bot',true,'x'), ($1,$2,'out-9002','bot',true,'y')`,
      [ACCOUNT, group]
    );
    expect(await store.linkSentGroupMessage(9001, 'real-1')).toBe(1);
    const r = await sql<{ zalo_msg_id: string }>(`select zalo_msg_id from group_messages where thread_id=$1 order by id`, [group]);
    expect(r.map((x) => x.zalo_msg_id)).toEqual(['real-1', 'out-9002']);
    expect(await store.linkSentGroupMessage(9001, 'real-2')).toBe(0); // da doi: idempotent
    await dropGroup(group);
  });

  it('groupTextSentLastHour = 20 voi 20 hang sent trong gio + 1 hang 2 gio truoc (so do architect db-checks (c))', async () => {
    const group = uid('g');
    const ids: number[] = [];
    for (let i = 0; i < 21; i++) {
      ids.push(await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: `t${i}` } }));
    }
    await sql(`update outbox set status='sent', sent_at = now() - (id % 50 || ' seconds')::interval where id = any($1) and id <> $2`, [ids, ids[20]]);
    await sql(`update outbox set status='sent', sent_at = now() - interval '2 hours' where id = $1`, [ids[20]]);
    expect(await store.groupTextSentLastHour(ACCOUNT, group, Date.now())).toBe(20);
    expect(await store.groupTextSentLastHour(ACCOUNT, uid('khac'), Date.now())).toBe(0);
    await sql(`update outbox set status='cancelled' where id = any($1)`, [ids]);
  });

  it('gui that: text nhom ⇒ typing → text, group_messages "out-<id>" nhan msgId that, sent_at co gia tri', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'Chào mừng cả nhà' } });
    await sql(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, is_self, text) values ($1,$2,$3,'bot',true,'Chào mừng cả nhà')`,
      [ACCOUNT, group, `out-${id}`]
    );
    await pacerFor(s).tick();
    expect(fake.sent.map((x) => x.kind)).toEqual(['typing', 'text']);
    const row = await outboxRow(id);
    expect(row.status).toBe('sent');
    expect(row.zalo_msg_id).toMatch(/^fake-out-/);
    const gm = await sql<{ zalo_msg_id: string }>(`select zalo_msg_id from group_messages where thread_id=$1`, [group]);
    expect(gm[0]!.zalo_msg_id).toBe(row.zalo_msg_id);
    await dropGroup(group);
    await s.stop();
  });

  it('het ngan sach gio ⇒ hang giu queued (khong huy, khong gui); sau khi cua so truot ⇒ gui', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group, 2);
    for (let i = 0; i < 2; i++) {
      const old = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: `cũ ${i}` } });
      await sql(`update outbox set status='sent', sent_at = now() where id=$1`, [old]);
    }
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'chờ suất' } });
    const pacer = pacerFor(s);
    const r1 = await pacer.tick();
    expect(r1.note).toBe('group_budget');
    expect((await outboxRow(id)).status).toBe('queued');
    expect(fake.sent.filter((x) => x.kind === 'text')).toEqual([]);
    // cache ngan sach 60 s nhung SO DEM doc DB moi tick: day lui 2 tin cu ra khoi cua so
    await sql(`update outbox set sent_at = now() - interval '2 hours' where thread_id=$1 and status='sent'`, [group]);
    await pacer.tick();
    expect((await outboxRow(id)).status).toBe('sent');
    await dropGroup(group);
    await s.stop();
  });

  it('cho ngan sach qua GROUP_TEXT_TTL_MIN ⇒ cancelled(budget_expired) + audit pacer.budget_expired', async () => {
    const { s } = await connectedSession();
    const group = uid('g');
    await makeGroup(group, 1);
    const first = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'dùng hết' } });
    await sql(`update outbox set status='sent', sent_at = now() where id=$1`, [first]);
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'quá hạn' } });
    await sql(`update outbox set created_at = now() - interval '31 minutes' where id=$1`, [id]);
    await pacerFor(s).tick();
    const row = await outboxRow(id);
    expect(row.status).toBe('cancelled');
    expect(row.body.cancel_reason).toBe('budget_expired');
    expect(await auditCount('pacer.budget_expired', group)).toBe(1);
    await dropGroup(group);
    await s.stop();
  });

  it('nhom chua co dong zalo_groups ⇒ cancelled(group_unknown) + audit pacer.group_unknown', async () => {
    const { s } = await connectedSession();
    const group = uid('g');
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'bug o core' } });
    await pacerFor(s).tick();
    expect((await outboxRow(id)).body.cancel_reason).toBe('group_unknown');
    expect(await auditCount('pacer.group_unknown', group)).toBe(1);
    await s.stop();
  });
});

describe('luong vao nhom (§2)', () => {
  it('tin nhom text ⇒ inbound_events payload §8.2 (mentions, quote, cli_msg_id, d_name); outcome group_inserted; khong hen seen du da nhan dien', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    const member = uid('mem');
    await makeGroup(group);
    await sql(`insert into group_members (zalo_account_id, thread_id, zalo_uid, role) values ($1,$2,$3,'member')`, [ACCOUNT, group, member]);
    const m = fakeMessage({
      threadId: group,
      threadType: 'group',
      senderUid: member,
      content: '@Bot cho hỏi',
      dName: 'Lê Hoàng Cường',
      mentions: [{ uid: fake.ownUid, pos: 0, len: 4 }],
      quote: { ownerId: fake.ownUid, globalMsgId: '321', msg: 'tin cũ' },
    });
    fake.emitMessage(m);
    fake.emitMessage(m); // trung
    await s.idle();
    const r = await sql<{ thread_type: string; sender_uid: string; is_self: boolean; payload: Record<string, unknown>; processed_at: string | null }>(
      `select thread_type, sender_uid, is_self, payload, processed_at::text from inbound_events where zalo_account_id=$1 and zalo_msg_id=$2`,
      [ACCOUNT, m.msgId]
    );
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ thread_type: 'group', sender_uid: member, is_self: false, processed_at: null });
    expect(r[0]!.payload).toMatchObject({
      kind: 'text',
      text: '@Bot cho hỏi',
      cli_msg_id: m.cliMsgId,
      d_name: 'Lê Hoàng Cường',
      mentions: [{ uid: fake.ownUid, pos: 0, len: 4 }],
      quote: { owner_id: fake.ownUid, global_msg_id: '321', msg: 'tin cũ' },
    });
    const seen = await sql(`select 1 from outbox where zalo_account_id=$1 and thread_id=$2 and kind='seen'`, [ACCOUNT, group]);
    expect(seen.length).toBe(0);
    await sql(`delete from group_members where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    await dropGroup(group);
    await s.stop();
  });

  it('chu go tay trong nhom (is_self, khong khop outbox) ⇒ luu vet, KHONG tiep quan (conversations khong doi)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    fake.emitMessage(fakeMessage({ threadId: group, threadType: 'group', senderUid: fake.ownUid, isSelf: true, content: 'chủ gõ tay' }));
    await s.idle();
    const ie = await sql<{ processed_at: string | null; payload: Record<string, unknown> }>(
      `select processed_at::text, payload from inbound_events where zalo_account_id=$1 and thread_id=$2`,
      [ACCOUNT, group]
    );
    expect(ie.length).toBe(1);
    expect(ie[0]!.processed_at).not.toBeNull();
    const conv = await sql(`select 1 from conversations where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    expect(conv.length).toBe(0);
    await s.stop();
  });

  it('group_event: JOIN / JOIN_REQUEST / LEAVE / ADD_ADMIN ⇒ dung payload.event, zalo_msg_id gev-…; lap lai ⇒ 1 dong; NEW_LINK ⇒ khong ghi', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    const t = String(Date.now());
    const evs = [
      fakeGroupEvent({ groupId: group, event: 'join', uids: ['n1', 'n2'], names: ['An', 'Bích'], sourceUid: 'inviter', time: t }),
      fakeGroupEvent({ groupId: group, event: 'join_request', uids: ['n3'], names: [], time: t }),
      fakeGroupEvent({ groupId: group, event: 'leave', uids: ['n4'], names: ['Cường'], time: t }),
      fakeGroupEvent({ groupId: group, event: 'add_admin', uids: ['n5'], names: ['Đức'], time: t }),
      fakeGroupEvent({ groupId: group, event: 'new_link', uids: [], names: [], time: t }),
    ];
    for (const ev of evs) fake.emitGroupEvent(ev);
    fake.emitGroupEvent(evs[0]!); // reconnect phat lai
    await s.idle();
    const rows = await sql<{ zalo_msg_id: string; sender_uid: string; thread_type: string; payload: Record<string, unknown> }>(
      `select zalo_msg_id, sender_uid, thread_type, payload from inbound_events where zalo_account_id=$1 and thread_id=$2
       order by payload->>'event'`,
      [ACCOUNT, group]
    );
    // thu tu chen khong dam bao (moi su kien xu ly bat dong bo) ⇒ so theo ten su kien
    expect(rows.map((r) => r.payload.event)).toEqual(['add_admin', 'join', 'join_request', 'leave']);
    expect(rows.map((r) => r.zalo_msg_id)).toEqual(['add_admin', 'join', 'join_request', 'leave'].map((e) => `gev-${group}-${e}-${t}`));
    expect(rows.every((r) => r.thread_type === 'group')).toBe(true);
    const join = rows.find((r) => r.payload.event === 'join')!;
    expect(join.sender_uid).toBe('inviter');
    expect(rows.find((r) => r.payload.event === 'join_request')!.sender_uid).toBe('zalo');
    expect(join.payload).toMatchObject({ kind: 'group_event', uids: ['n1', 'n2'], names: ['An', 'Bích'], source_uid: 'inviter' });
    await s.stop();
  });

  it('undo tin nhom ⇒ payload.undone (giu markUndone)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    const m = fakeMessage({ threadId: group, threadType: 'group', senderUid: 'u-a' });
    fake.emitMessage(m);
    await s.idle();
    fake.handlers!.undo({ threadId: group, isSelf: false, undoneMsgId: m.msgId });
    await s.idle();
    const r = await sql<{ undone: string | null }>(
      `select payload->>'undone' as undone from inbound_events where zalo_account_id=$1 and zalo_msg_id=$2`,
      [ACCOUNT, m.msgId]
    );
    expect(r[0]!.undone).toBe('true');
    await s.stop();
  });
});
