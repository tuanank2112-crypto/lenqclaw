// packages/core/src/dbtests/sim-actions.db.test.ts — SPEC-P02 §7, §10 hang 3: kenh gia lap
// NHOM. `applySimOutbox` thi hanh action tren DB gia lap; `simInbound` mo rong dung payload
// 01-CONTRACTS §8.2. Tu co lap (G29): thread/uid rieng moi test, don outbox queued dang do.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { applySimOutbox } from '../sim/sim-actions.js';
import { BOT_UID_SIM, SimQuoteNotFoundError, simInbound } from '../sim/sim-transport.js';

const ACCOUNT = 'community';

function tid(): string {
  return `sim-act-${randomUUID().slice(0, 8)}`;
}

async function makeGroup(threadId: string): Promise<void> {
  await sql(
    `insert into zalo_groups (zalo_account_id, thread_id, name, enabled) values ($1,$2,'Nhóm sim thử',true) on conflict do nothing`,
    [ACCOUNT, threadId]
  );
}

async function dropGroup(threadId: string): Promise<void> {
  await sql(`delete from group_messages where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, threadId]);
  await sql(`delete from join_requests where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, threadId]);
  await sql(`delete from zalo_groups where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, threadId]); // group_members cascade
}

async function act(threadId: string, body: Record<string, unknown>): Promise<number> {
  return Number(await enqueue({ zaloAccountId: ACCOUNT, threadId, threadType: 'group', kind: 'action', body }));
}

async function row(id: number) {
  return (
    await sql<{ status: string; result: Record<string, unknown> | null; sent_at: string | null; zalo_msg_id: string | null }>(
      `select status, result, sent_at::text, zalo_msg_id from outbox where id=$1`,
      [id]
    )
  )[0]!;
}

async function addMessage(group: string, msgId: string, sender: string): Promise<void> {
  await sql(
    `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, text)
     values ($1,$2,$3,$4,$5,'nội dung')`,
    [ACCOUNT, group, msgId, `cli-${msgId}`, sender]
  );
}

beforeEach(async () => {
  await sql(`update outbox set status = 'cancelled' where status in ('queued','sending')`);
});

afterAll(async () => {
  // G29: simInbound de lai dong `processed_at is null` trong hang doi toan cuc ⇒ danh dau xong de file khac khong an nham.
  await sql(`update inbound_events set processed_at = now() where processed_at is null`);
  await closeDb();
});

describe('applySimOutbox — action tren DB gia lap (§7.2)', () => {
  it('delete_message DUNG uidFrom ⇒ group_messages.deleted_at; outbox sent + result + sent_at', async () => {
    const g = tid();
    await makeGroup(g);
    await addMessage(g, 'm-1', 'sim-mem-2');
    const id = await act(g, { action: 'delete_message', msgId: 'm-1', cliMsgId: 'cli-m-1', uidFrom: 'sim-mem-2', onlyMe: false });
    const r = await applySimOutbox();
    expect(r.delivered).toBeGreaterThanOrEqual(1);
    const o = await row(id);
    expect(o.status).toBe('sent');
    expect(o.result).toEqual({ status: 0 });
    expect(o.sent_at).not.toBeNull();
    const m = await sql<{ deleted_at: string | null }>(`select deleted_at::text from group_messages where thread_id=$1`, [g]);
    expect(m[0]!.deleted_at).not.toBeNull();
    await dropGroup(g);
  });

  it('delete_message SAI uidFrom (uid bot) ⇒ failed, result.error="uidFrom_mismatch", tin KHONG bi xoa', async () => {
    const g = tid();
    await makeGroup(g);
    await addMessage(g, 'm-2', 'sim-mem-3');
    const id = await act(g, { action: 'delete_message', msgId: 'm-2', cliMsgId: 'cli-m-2', uidFrom: BOT_UID_SIM, onlyMe: false });
    const r = await applySimOutbox();
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const o = await row(id);
    expect(o.status).toBe('failed');
    expect(o.result).toEqual({ error: 'uidFrom_mismatch' });
    const m = await sql<{ deleted_at: string | null }>(`select deleted_at::text from group_messages where thread_id=$1`, [g]);
    expect(m[0]!.deleted_at).toBeNull();
    await dropGroup(g);
  });

  it('delete_message tin khong ton tai / thieu cliMsgId ⇒ failed (message_not_found / cli_msg_id_missing)', async () => {
    const g = tid();
    await makeGroup(g);
    const a = await act(g, { action: 'delete_message', msgId: 'khong-co', cliMsgId: 'c', uidFrom: 'u' });
    const b = await act(g, { action: 'delete_message', msgId: 'khong-co', uidFrom: 'u' });
    await applySimOutbox();
    expect((await row(a)).result).toEqual({ error: 'message_not_found' });
    expect((await row(b)).result).toEqual({ error: 'cli_msg_id_missing' });
    await dropGroup(g);
  });

  it('review_join approve ⇒ group_members co dong (left_at null) + join_requests approved; reject ⇒ khong them thanh vien', async () => {
    const g = tid();
    await makeGroup(g);
    await sql(
      `insert into join_requests (zalo_account_id, thread_id, zalo_uid, display_name) values ($1,$2,'sim-new-1','Người Mới'), ($1,$2,'sim-new-2','Bị Từ Chối')`,
      [ACCOUNT, g]
    );
    const ok = await act(g, { action: 'review_join', uids: ['sim-new-1'], approve: true });
    const no = await act(g, { action: 'review_join', uids: ['sim-new-2'], approve: false });
    await applySimOutbox();
    expect((await row(ok)).result).toEqual({ 'sim-new-1': 0 });
    expect((await row(no)).status).toBe('sent');
    const members = await sql<{ zalo_uid: string; display_name: string | null; left_at: string | null }>(
      `select zalo_uid, display_name, left_at::text from group_members where zalo_account_id=$1 and thread_id=$2`,
      [ACCOUNT, g]
    );
    expect(members).toEqual([{ zalo_uid: 'sim-new-1', display_name: 'Người Mới', left_at: null }]);
    const jr = await sql<{ zalo_uid: string; decision: string }>(
      `select zalo_uid, decision from join_requests where thread_id=$1 order by zalo_uid`,
      [g]
    );
    expect(jr).toEqual([
      { zalo_uid: 'sim-new-1', decision: 'approved' },
      { zalo_uid: 'sim-new-2', decision: 'rejected' },
    ]);
    await dropGroup(g);
  });

  it('remove_member ⇒ left_at; block_member ⇒ left_at + deny_users; unblock_member ⇒ go khoi deny_users', async () => {
    const g = tid();
    await makeGroup(g);
    await sql(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role) values ($1,$2,'sim-a','member'), ($1,$2,'sim-b','member')`,
      [ACCOUNT, g]
    );
    const rm = await act(g, { action: 'remove_member', uid: 'sim-a', approvalId: randomUUID() });
    const bl = await act(g, { action: 'block_member', uid: 'sim-b', approvalId: randomUUID() });
    await applySimOutbox();
    expect((await row(rm)).result).toEqual({ errorMembers: [] });
    expect((await row(bl)).status).toBe('sent');
    const m = await sql<{ zalo_uid: string; left: boolean }>(
      `select zalo_uid, left_at is not null as left from group_members where thread_id=$1 order by zalo_uid`,
      [g]
    );
    expect(m).toEqual([
      { zalo_uid: 'sim-a', left: true },
      { zalo_uid: 'sim-b', left: true },
    ]);
    const deny = async () =>
      (await sql<{ deny_users: string[] }>(`select deny_users from zalo_groups where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, g]))[0]!.deny_users;
    expect(await deny()).toEqual(['sim-b']);
    await act(g, { action: 'unblock_member', uid: 'sim-b' });
    await applySimOutbox();
    expect(await deny()).toEqual([]);
    await dropGroup(g);
  });

  it('action co approvalId ⇒ approvals approved → executed (thanh cong) / failed (uidFrom_mismatch)', async () => {
    const g = tid();
    await makeGroup(g);
    await addMessage(g, 'm-9', 'sim-mem-1');
    const mk = async (): Promise<string> =>
      (
        await sql<{ id: string }>(
          `insert into approvals (zalo_account_id, kind, thread_id, target_uid, reason, requested_by, status, expires_at)
           values ($1,'kick_member',$2,'sim-x','thử','agent','approved', now() + interval '1 hour') returning id`,
          [ACCOUNT, g]
        )
      )[0]!.id;
    const okA = await mk();
    const badA = await mk();
    await act(g, { action: 'remove_member', uid: 'sim-x', approvalId: okA });
    await act(g, { action: 'delete_message', msgId: 'm-9', cliMsgId: 'cli-m-9', uidFrom: BOT_UID_SIM, approvalId: badA });
    await applySimOutbox();
    const st = await sql<{ id: string; status: string }>(`select id, status from approvals where id = any($1::uuid[])`, [[okA, badA]]);
    expect(st.find((r) => r.id === okA)!.status).toBe('executed');
    expect(st.find((r) => r.id === badA)!.status).toBe('failed');
    await sql(`delete from approvals where id = any($1::uuid[])`, [[okA, badA]]);
    await dropGroup(g);
  });

  it('text nhom ⇒ sent + zalo_msg_id "sim-out-<id>" + sent_at; dong dem "out-<id>" nhan msgId gia', async () => {
    const g = tid();
    await makeGroup(g);
    const id = Number(
      await enqueue({ zaloAccountId: ACCOUNT, threadId: g, threadType: 'group', kind: 'text', body: { text: 'chào nhóm' } })
    );
    await sql(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, is_self, text) values ($1,$2,$3,$4,true,'chào nhóm')`,
      [ACCOUNT, g, `out-${id}`, BOT_UID_SIM]
    );
    await applySimOutbox();
    const o = await row(id);
    expect(o.status).toBe('sent');
    expect(o.zalo_msg_id).toBe(`sim-out-${id}`);
    expect(o.sent_at).not.toBeNull();
    const gm = await sql<{ zalo_msg_id: string }>(`select zalo_msg_id from group_messages where thread_id=$1`, [g]);
    expect(gm[0]!.zalo_msg_id).toBe(`sim-out-${id}`);
    await dropGroup(g);
  });

  it('sync_group_info ⇒ result tu DB hien co (bot_is_admin giu nguyen), last_synced_at cap nhat; hanh dong la ⇒ failed', async () => {
    const g = tid();
    await makeGroup(g);
    await sql(`update zalo_groups set bot_is_admin = true where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, g]);
    await sql(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name) values
         ($1,$2,'sim-m1','moderator','Hà'), ($1,$2,'sim-m2','member','An')`,
      [ACCOUNT, g]
    );
    const sync = await act(g, { action: 'sync_group_info' });
    const poll = await act(g, { action: 'create_poll', question: 'Q', options: ['a', 'b'] });
    const odd = await act(g, { action: 'frobnicate' });
    await applySimOutbox();
    expect((await row(sync)).result).toEqual({
      name: 'Nhóm sim thử',
      adminIds: ['sim-m1'],
      creatorId: '',
      members: [
        { uid: 'sim-m1', displayName: 'Hà' },
        { uid: 'sim-m2', displayName: 'An' },
      ],
      total: 2,
    });
    expect((await row(poll)).result).toEqual({ poll_id: poll });
    expect((await row(odd)).result).toEqual({ error: 'unknown_action' });
    const grp = await sql<{ bot_is_admin: boolean; synced: boolean }>(
      `select bot_is_admin, last_synced_at is not null as synced from zalo_groups where zalo_account_id=$1 and thread_id=$2`,
      [ACCOUNT, g]
    );
    expect(grp[0]).toEqual({ bot_is_admin: true, synced: true });
    await dropGroup(g);
  });
});

describe('simInbound mo rong — payload §8.2 (§7.1)', () => {
  async function payloadOf(id: number | null): Promise<Record<string, unknown>> {
    return (await sql<{ payload: Record<string, unknown> }>(`select payload from inbound_events where id=$1`, [id]))[0]!.payload;
  }

  it('mentionBot ⇒ mentions[0] = {uid:"sim-bot", pos, len} tro dung "@bot" trong text', async () => {
    const g = tid();
    const r = await simInbound({
      account: ACCOUNT,
      threadId: g,
      threadType: 'group',
      senderUid: 'sim-mem-1',
      senderName: 'Nguyễn Văn An',
      text: 'giúp mình với @bot nhé',
      mentionBot: true,
    });
    const p = await payloadOf(r.id);
    const m = (p.mentions as Array<{ uid: string; pos: number; len: number }>)[0]!;
    expect(m.uid).toBe(BOT_UID_SIM);
    expect(String(p.text).slice(m.pos, m.pos + m.len)).toBe('@bot');
    expect(p).toMatchObject({ kind: 'text', msg_type: 'webchat', d_name: 'Nguyễn Văn An', quote: null });
    expect(String(p.cli_msg_id)).toMatch(/^sim-cli-/);
  });

  it('mentionBot ma text chua co "@bot" ⇒ them "@bot " o dau, pos=0; mentionUids them @uid', async () => {
    const r = await simInbound({
      account: ACCOUNT,
      threadId: tid(),
      threadType: 'group',
      senderUid: 'sim-mem-1',
      text: 'xin chào',
      mentionBot: true,
      mentionUids: ['sim-mem-2'],
    });
    const p = await payloadOf(r.id);
    expect(p.text).toBe('@bot xin chào @sim-mem-2');
    expect(p.mentions).toEqual([
      { uid: BOT_UID_SIM, pos: 0, len: 4 },
      { uid: 'sim-mem-2', pos: 14, len: 10 },
    ]);
  });

  it('quoteMsgId ⇒ quote.owner_id tu group_messages (nguoi gui goc); tin bot (outbox) ⇒ owner = sim-bot; la ⇒ SimQuoteNotFoundError', async () => {
    const g = tid();
    await makeGroup(g);
    await addMessage(g, 'q-1', 'sim-mem-4');
    const a = await simInbound({ account: ACCOUNT, threadId: g, threadType: 'group', senderUid: 'sim-mem-1', text: 'đồng ý', quoteMsgId: 'q-1' });
    expect((await payloadOf(a.id)).quote).toEqual({ owner_id: 'sim-mem-4', global_msg_id: 'q-1', msg: 'nội dung' });

    const outId = Number(await enqueue({ zaloAccountId: ACCOUNT, threadId: g, threadType: 'group', kind: 'text', body: { text: 'bot nói' } }));
    await applySimOutbox();
    const b = await simInbound({ account: ACCOUNT, threadId: g, threadType: 'group', senderUid: 'sim-mem-1', text: 'cảm ơn', quoteMsgId: `sim-out-${outId}` });
    expect((await payloadOf(b.id)).quote).toEqual({ owner_id: BOT_UID_SIM, global_msg_id: `sim-out-${outId}`, msg: 'bot nói' });

    await expect(
      simInbound({ account: ACCOUNT, threadId: g, threadType: 'group', senderUid: 'sim-mem-1', text: 'x', quoteMsgId: 'khong-co' })
    ).rejects.toBeInstanceOf(SimQuoteNotFoundError);
    await dropGroup(g);
  });

  it('event ⇒ payload.kind="group_event", zalo_msg_id "gev-sim-…", uids/names/source_uid/group_name; event ngoai nhom ⇒ loi', async () => {
    const g = tid();
    await makeGroup(g);
    const r = await simInbound({
      account: ACCOUNT,
      threadId: g,
      threadType: 'group',
      senderUid: 'sim-owner',
      text: '',
      event: 'join_request',
      eventUids: ['sim-new-9'],
      eventNames: ['Khách Mới'],
    });
    const row0 = (await sql<{ zalo_msg_id: string; sender_uid: string; payload: Record<string, unknown> }>(
      `select zalo_msg_id, sender_uid, payload from inbound_events where id=$1`,
      [r.id]
    ))[0]!;
    expect(row0.zalo_msg_id).toMatch(/^gev-sim-/);
    expect(row0.sender_uid).toBe('sim-owner');
    expect(row0.payload).toMatchObject({
      kind: 'group_event',
      event: 'join_request',
      uids: ['sim-new-9'],
      names: ['Khách Mới'],
      source_uid: 'sim-owner',
      group_name: 'Nhóm sim thử',
    });
    await expect(
      simInbound({ account: ACCOUNT, threadId: 'sim-dm-x', threadType: 'user', senderUid: 'sim-mem-1', text: '', event: 'join' })
    ).rejects.toThrow(/group/);
    await dropGroup(g);
  });

  it('sticker / anh ⇒ kind="unsupported" + nhan "thành viên"; senderUid="system" van bi tu choi', async () => {
    const r = await simInbound({
      account: ACCOUNT,
      threadId: tid(),
      threadType: 'group',
      senderUid: 'sim-mem-1',
      text: '',
      msgType: 'chat.sticker',
    });
    expect(await payloadOf(r.id)).toMatchObject({
      kind: 'unsupported',
      text: '[thành viên gửi sticker — chưa hỗ trợ]',
      unsupported: true,
      msg_type: 'chat.sticker',
    });
    await expect(
      simInbound({ account: ACCOUNT, threadId: tid(), threadType: 'group', senderUid: 'system', text: 'x' })
    ).rejects.toThrow(/system/);
  });
});
