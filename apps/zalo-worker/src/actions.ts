// apps/zalo-worker/src/actions.ts — thi hanh MOT hang outbox `action` / `react`
// bang ZaloSessionLike (SPEC-P02 ke hoach 02 §4.2, 01-CONTRACTS §8.3). Chi goi
// API + tra ket qua rut gon; ghi trang thai outbox/audit/approval la viec cua
// pacer.ts. Worker KHONG quyet nghiep vu: moi tham so den tu body do core ghi.
//
// VUNG CAM (SPEC-P02 §8): khong co nhanh cho hanh dong nguy hiem (giai tan
// nhom, doi chu nhom, pho nhom, roi nhom, gui tep…) — `default` ⇒ `unknown_action`.
// Thieu `cliMsgId`/`uidFrom` khi xoa tin ⇒ `cli_msg_id_missing`, KHONG doan.

import type { AccountId } from './config.js';
import type { OutboxRow } from './store.js';
import * as store from './store.js';
import type { ZaloSessionLike } from './client.js';

/** Body hang `action` sai/thieu truong ⇒ `failed(<reason>)`, khong goi Zalo. */
export class InvalidActionError extends Error {
  readonly code = 'InvalidActionError';
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'InvalidActionError';
  }
}

export interface ActionOutcome {
  ok: boolean;
  /** Ket qua rut gon, ghi vao `outbox.result` (KHONG chua noi dung tin). */
  result: Record<string, unknown>;
  failReason?: string;
  /** Ma Zalo (vd 166) neu co. */
  code?: number | null;
  /** Zalo bao thieu quyen (166) ⇒ pacer dat `bot_is_admin=false` + bao dong. */
  botNotAdmin?: boolean;
}

type Body = Record<string, unknown>;

function reqStr(v: unknown, reason: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new InvalidActionError(reason);
  return v;
}

function reqStrArray(v: unknown, reason: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string' || x.length === 0)) {
    throw new InvalidActionError(reason);
  }
  return v as string[];
}

const BAD = 'invalid_action_body';

/** Ma `reviewPendingMemberRequest`: 0 xong · 170 khong con trong danh sach · 178 da trong nhom (coi la xong) · 166 thieu quyen. */
const REVIEW_DONE = new Set([0, 170, 178]);

/** Thi hanh mot hang `action` (kind='action') hoac `react`. Nem `ZaloActionError` /
 * `ZaloRateLimitError` / loi mang tu session; `InvalidActionError` khi body sai. */
export async function executeAction(
  account: AccountId,
  session: ZaloSessionLike,
  row: OutboxRow,
  deps: { applyGroupSync: typeof store.applyGroupSync } = { applyGroupSync: store.applyGroupSync }
): Promise<ActionOutcome> {
  const body = row.body as Body;
  const groupId = row.thread_id;

  if (row.kind === 'react') {
    const r = (body.react ?? null) as Body | null;
    if (!r) throw new InvalidActionError(BAD);
    await session.addReaction(reqStr(r.icon, BAD), {
      data: { msgId: reqStr(r.msgId, BAD), cliMsgId: reqStr(r.cliMsgId, 'cli_msg_id_missing') },
      threadId: row.thread_id,
      type: row.thread_type,
    });
    return { ok: true, result: {} };
  }

  switch (body.action) {
    case 'delete_message': {
      const msgId = reqStr(body.msgId, BAD);
      const cliMsgId = reqStr(body.cliMsgId, 'cli_msg_id_missing');
      const uidFrom = reqStr(body.uidFrom, 'cli_msg_id_missing');
      const r = await session.deleteMessage({ data: { msgId, cliMsgId, uidFrom }, threadId: groupId, type: 'group' }, false);
      return r.status === 0
        ? { ok: true, result: { status: r.status } }
        : { ok: false, result: { status: r.status }, failReason: `delete_status_${r.status}`, code: r.status };
    }
    case 'remove_member': {
      const uid = reqStr(body.uid, BAD);
      const r = await session.removeMember(uid, groupId);
      return r.errorMembers.includes(uid)
        ? { ok: false, result: { errorMembers: r.errorMembers }, failReason: 'remove_member_failed' }
        : { ok: true, result: { errorMembers: r.errorMembers } };
    }
    case 'block_member': {
      await session.blockMember(reqStr(body.uid, BAD), groupId);
      return { ok: true, result: {} };
    }
    case 'unblock_member': {
      await session.unblockMember(reqStr(body.uid, BAD), groupId);
      return { ok: true, result: {} };
    }
    case 'review_join': {
      const uids = reqStrArray(body.uids, BAD);
      if (typeof body.approve !== 'boolean') throw new InvalidActionError(BAD);
      const codes = await session.reviewJoin(uids, body.approve, groupId);
      const values = Object.values(codes);
      if (values.includes(166)) {
        return { ok: false, result: codes, failReason: 'insufficient_permission', code: 166, botNotAdmin: true };
      }
      const bad = values.find((c) => !REVIEW_DONE.has(c));
      return bad === undefined
        ? { ok: true, result: codes }
        : { ok: false, result: codes, failReason: `review_code_${bad}`, code: bad };
    }
    case 'create_poll': {
      const options = reqStrArray(body.options, BAD);
      const r = await session.createPoll(
        {
          question: reqStr(body.question, BAD),
          options,
          ...(typeof body.expiredTime === 'number' ? { expiredTime: body.expiredTime } : {}),
          ...(typeof body.allowMultiChoices === 'boolean' ? { allowMultiChoices: body.allowMultiChoices } : {}),
          ...(typeof body.isAnonymous === 'boolean' ? { isAnonymous: body.isAnonymous } : {}),
        },
        groupId
      );
      return { ok: true, result: { poll_id: r.poll_id } };
    }
    case 'lock_poll': {
      if (typeof body.pollId !== 'number') throw new InvalidActionError(BAD);
      await session.lockPoll(body.pollId);
      return { ok: true, result: {} };
    }
    case 'create_reminder': {
      const repeat = body.repeat;
      if (repeat !== 0 && repeat !== 1 && repeat !== 2 && repeat !== 3) throw new InvalidActionError(BAD);
      if (typeof body.startTime !== 'number') throw new InvalidActionError(BAD);
      const r = await session.createReminder(
        {
          title: reqStr(body.title, BAD),
          startTime: body.startTime,
          repeat,
          ...(typeof body.emoji === 'string' && body.emoji.length > 0 ? { emoji: body.emoji } : {}),
        },
        row.thread_id,
        row.thread_type
      );
      return { ok: true, result: { id: r.id } };
    }
    case 'remove_reminder': {
      await session.removeReminder(reqStr(body.reminderId, BAD), row.thread_id, row.thread_type);
      return { ok: true, result: {} };
    }
    case 'create_note': {
      const r = await session.createNote(
        { title: reqStr(body.title, BAD), ...(typeof body.pinAct === 'boolean' ? { pinAct: body.pinAct } : {}) },
        groupId
      );
      return { ok: true, result: { id: r.id } };
    }
    case 'update_group_settings': {
      const s = (body.settings ?? null) as Body | null;
      if (!s || typeof s !== 'object') throw new InvalidActionError(BAD);
      const settings: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean } = {};
      for (const k of ['joinAppr', 'lockSendMsg', 'lockCreatePoll', 'lockCreatePost'] as const) {
        if (typeof s[k] === 'boolean') settings[k] = s[k] as boolean;
      }
      if (Object.keys(settings).length === 0) throw new InvalidActionError(BAD);
      await session.updateGroupSettings(settings, groupId);
      return { ok: true, result: {} };
    }
    case 'sync_group_info': {
      const info = await session.getGroupInfo(groupId);
      // zca-js >= 2.1 hay tra `memberIds` rong; `memVerList` co dang "<uid>_<phien ban>" (mau zaloclaw tool.ts:127-132).
      const ids =
        info.memberIds.length > 0 ? info.memberIds : info.memVerList.map((s) => s.split('_')[0]!).filter((s) => s.length > 0);
      const profiles = ids.length > 0 ? await session.getMembersInfo(ids) : {};
      const members = ids.map((uid) => {
        const p = profiles[uid];
        return { uid, displayName: p ? p.displayName || p.zaloName : '' };
      });
      const result = {
        name: info.name,
        adminIds: info.adminIds,
        creatorId: info.creatorId,
        members,
        total: info.totalMember,
      };
      await deps.applyGroupSync(account, groupId, result, session.ownUid);
      return { ok: true, result };
    }
    default:
      throw new InvalidActionError('unknown_action');
  }
}
