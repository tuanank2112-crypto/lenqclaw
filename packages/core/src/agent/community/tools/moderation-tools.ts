// tool kiem duyet (SPEC-P05 §4.2, 01-CONTRACTS §7.1): `flag_message` · `delete_message` · `warn_member` · `request_member_removal`.
// Luat nam TRONG tool (BB-06): agent chi DE NGHI kick/block (the duyet), khong bao gio thi hanh; khong dong toi owner/moderator;
// khong xoa tin > 24 gio / thieu cli_msg_id / bot khong la admin. Khong ghi noi dung tin vao audit.

import { sql } from '../../../adapters/db.js';
import {
  ActionNotPermittedError,
  GroupBudgetExceededError,
  InvalidToolInputError,
  MessageNotInBufferError,
  UnknownMemberError,
} from '../../../domain/errors.js';
import { createApproval } from '../../../services/approvals.js';
import { audit } from '../../../services/audit.js';
import { readCommunityConfig } from '../../../services/community-config.js';
import { applyModeration, DELETE_MAX_AGE_MS, recordAgentWarn, warnsInLastHour } from '../../../services/moderation.js';
import { enqueueAction } from '../../../services/outbox-actions.js';
import { findBufferedMessage, getGroup } from '../buffer.js';
import { postGroupText } from '../group-post.js';
import { WARN_MEMBER_TEXT } from '../prompts/system.js';
import { resolveRole } from '../roles.js';
import { requireGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

function parseMsgId(raw: string): number {
  const m = /^#?(\d{1,15})$/.exec(raw.trim());
  if (!m) throw new InvalidToolInputError(`msg_id phải là số id của tin (vd 8820, số sau dấu #), nhận "${raw.slice(0, 40)}".`);
  return Number(m[1]);
}

const reasonOf = (raw: string): string => {
  const r = raw.trim();
  if (r === '') throw new InvalidToolInputError('reason không được rỗng.');
  return r.slice(0, 300);
};

async function groupOrThrow(account: 'community', threadId: string) {
  const group = await getGroup(account, threadId);
  if (!group) throw new ActionNotPermittedError('Nhóm chưa được khai báo.');
  return group;
}

// ---------------------------------------------------------------------------
// flag_message
// ---------------------------------------------------------------------------

const flagDef: ToolDefinition = {
  name: 'flag_message',
  description:
    'Đánh dấu MỘT tin trong đệm nhóm là vi phạm (spam, scam, ad, harass) hoặc ok. Hệ thống tự áp thang cảnh cáo (cảnh cáo → xoá → đề nghị mời ra/chặn qua thẻ duyệt). Dùng cho tin lừa đảo/spam, kể cả khi tin đó gọi tên bạn; sau đó trả lời một câu từ chối ngắn nếu người ta đang gọi bạn.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      msg_id: { type: 'string', description: 'Số id (sau dấu #) của tin.' },
      verdict: { type: 'string', enum: ['spam', 'scam', 'ad', 'harass', 'ok'], description: 'Phán quyết.' },
      reason: { type: 'string', description: 'Lý do ngắn.' },
    },
    required: ['msg_id', 'verdict', 'reason'],
    additionalProperties: false,
  },
};

export const flagMessageTool: AgentTool<{ msg_id: string; verdict: 'spam' | 'scam' | 'ad' | 'harass' | 'ok'; reason: string }> = {
  definition: flagDef,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'flag_message');
    reasonOf(input.reason);
    const group = await groupOrThrow(g.account, g.threadId);
    if (!group.moderationEnabled) throw new ActionNotPermittedError('Nhóm này đã tắt kiểm duyệt.');
    const row = await findBufferedMessage(g.account, g.threadId, parseMsgId(input.msg_id));
    if (!row) throw new MessageNotInBufferError();
    if (row.isSelf) throw new ActionNotPermittedError('Không đánh dấu tin của chính bạn.');
    if (input.verdict === 'ok') return { flagged: false, note: 'verdict ok ⇒ không ghi nhận.' };
    const role = await resolveRole(g.account, row.senderUid, g.threadId);
    const out = await applyModeration({
      account: g.account,
      group,
      row,
      senderRole: role,
      verdict: input.verdict,
      confidence: 0.8,
      source: 'agent',
      now: new Date(),
      inboundEventId: g.inboundEventId,
    });
    await audit(sql, { actorType: 'agent', actorId: g.requester?.uid ?? null, action: 'moderation.flag', target: g.threadId, data: { verdict: input.verdict, action: out.action, exempt: out.exempt } });
    return { flagged: true, exempt: out.exempt, action: out.action, deleted: out.deleted };
  },
};

// ---------------------------------------------------------------------------
// delete_message
// ---------------------------------------------------------------------------

const deleteDef: ToolDefinition = {
  name: 'delete_message',
  description:
    'Xoá MỘT tin trong nhóm (không qua thang cảnh cáo). Chỉ khi nhóm bật kiểm duyệt và bạn là phó nhóm; tin phải còn trong đệm, không quá 24 giờ, không phải của chủ/quản trị viên.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      msg_id: { type: 'string', description: 'Số id (sau dấu #) của tin.' },
      reason: { type: 'string', description: 'Lý do ngắn.' },
    },
    required: ['msg_id', 'reason'],
    additionalProperties: false,
  },
};

export const deleteMessageTool: AgentTool<{ msg_id: string; reason: string }> = {
  definition: deleteDef,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'delete_message');
    reasonOf(input.reason);
    const group = await groupOrThrow(g.account, g.threadId);
    if (!group.moderationEnabled) throw new ActionNotPermittedError('Nhóm này đã tắt kiểm duyệt.');
    if (!group.botIsAdmin) throw new ActionNotPermittedError('Bạn chưa là phó nhóm nên không xoá được tin.');
    const row = await findBufferedMessage(g.account, g.threadId, parseMsgId(input.msg_id));
    if (!row) throw new MessageNotInBufferError();
    if (!row.isSelf) {
      const role = await resolveRole(g.account, row.senderUid, g.threadId);
      if (role === 'owner' || role === 'moderator') throw new ActionNotPermittedError('Không xoá tin của chủ hoặc quản trị viên.');
    }
    if (Date.now() - new Date(row.receivedAt).getTime() > DELETE_MAX_AGE_MS) throw new ActionNotPermittedError('Tin quá 24 giờ, không xoá được.');
    if (!row.cliMsgId) throw new ActionNotPermittedError('Tin thiếu cli_msg_id nên không xoá được.');
    await sql(`update group_messages set deleted_at = now(), delete_reason = 'agent' where id = $1 and deleted_at is null`, [row.id]);
    const outboxId = await enqueueAction({
      account: g.account,
      threadId: g.threadId,
      action: 'delete_message',
      msgId: row.zaloMsgId,
      cliMsgId: row.cliMsgId,
      uidFrom: row.senderUid,
      onlyMe: false,
      inboundEventId: g.inboundEventId,
    });
    await audit(sql, { actorType: 'agent', actorId: g.requester?.uid ?? null, action: 'moderation.agent_delete', target: g.threadId, data: { message_id: row.id } });
    return { queued: true, outbox_id: outboxId };
  },
};

// ---------------------------------------------------------------------------
// warn_member
// ---------------------------------------------------------------------------

const warnDef: ToolDefinition = {
  name: 'warn_member',
  description: 'Nhắc nhở công khai MỘT thành viên trong nhóm (mention họ). Có ngân sách cảnh cáo mỗi giờ; không dùng với chủ/quản trị viên.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      uid: { type: 'string', description: 'uid đầy đủ của thành viên.' },
      reason: { type: 'string', description: 'Lý do ngắn, lịch sự.' },
    },
    required: ['uid', 'reason'],
    additionalProperties: false,
  },
};

export const warnMemberTool: AgentTool<{ uid: string; reason: string }> = {
  definition: warnDef,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'warn_member');
    const reason = reasonOf(input.reason);
    const m = await sql<{ zalo_uid: string }>(
      `select zalo_uid from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and left_at is null`,
      [g.account, g.threadId, input.uid]
    );
    if (m.length === 0) throw new UnknownMemberError();
    const role = await resolveRole(g.account, input.uid, g.threadId);
    if (role === 'owner' || role === 'moderator') throw new ActionNotPermittedError('Không cảnh cáo chủ hoặc quản trị viên.');
    const now = new Date();
    if ((await warnsInLastHour(g.account, g.threadId, now)) >= readCommunityConfig().modWarnPerHour) {
      throw new GroupBudgetExceededError('Hết ngân sách cảnh cáo của nhóm trong giờ này.');
    }
    const r = await postGroupText(g, { text: WARN_MEMBER_TEXT(reason), mentionUids: [input.uid], by: 'tool' });
    await recordAgentWarn({ account: g.account, threadId: g.threadId, uid: input.uid, now });
    return { warned: true, outbox_id: r.outboxId };
  },
};

// ---------------------------------------------------------------------------
// request_member_removal
// ---------------------------------------------------------------------------

const removalDef: ToolDefinition = {
  name: 'request_member_removal',
  description:
    'Đề nghị mời ra khỏi nhóm (kick) hoặc chặn (block) MỘT thành viên. Chỉ TẠO THẺ DUYỆT gửi cho chủ — bạn không thi hành được; chờ người duyệt.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      uid: { type: 'string', description: 'uid đầy đủ của thành viên.' },
      kind: { type: 'string', enum: ['kick', 'block'], description: 'kick = mời ra, block = chặn vào lại.' },
      reason: { type: 'string', description: 'Lý do ngắn.' },
    },
    required: ['uid', 'kind', 'reason'],
    additionalProperties: false,
  },
};

export const requestMemberRemovalTool: AgentTool<{ uid: string; kind: 'kick' | 'block'; reason: string }> = {
  definition: removalDef,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'request_member_removal');
    const reason = reasonOf(input.reason);
    if (input.uid === g.botUid) throw new ActionNotPermittedError('Không đề nghị mời chính bạn ra khỏi nhóm.');
    const m = await sql<{ zalo_uid: string }>(
      `select zalo_uid from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and left_at is null`,
      [g.account, g.threadId, input.uid]
    );
    if (m.length === 0) throw new UnknownMemberError();
    const role = await resolveRole(g.account, input.uid, g.threadId);
    if (role === 'owner' || role === 'moderator') throw new ActionNotPermittedError('Không đề nghị mời chủ hoặc quản trị viên ra khỏi nhóm.');
    const card = await createApproval({
      account: g.account,
      kind: input.kind === 'kick' ? 'kick_member' : 'block_member',
      threadId: g.threadId,
      targetUid: input.uid,
      reason,
      requestedBy: 'agent',
      requesterUid: g.requester?.uid ?? null,
      now: new Date(),
    });
    return { status: 'pending_approval', approval_id: card.id };
  },
};
