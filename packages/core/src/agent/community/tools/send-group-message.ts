// tool `send_group_message` — CACH DUY NHAT agent len tieng trong nhom (BB-05). Luat nam TRONG tool:
// ctx nhom; ngan sach gio (BB-08, GroupBudgetExceededError); reply_to phai co trong dem
// (MessageNotInBufferError); mention_uids phai la thanh vien con hieu luc (UnknownMemberError).
// Co `answers`: node `tools` cong TurnState.answered khi chay thanh cong (D28).

import { InvalidToolInputError } from '../../../domain/errors.js';
import { MENTION_MAX, postGroupText, GROUP_TEXT_MAX } from '../group-post.js';
import { requireGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const definition: ToolDefinition = {
  name: 'send_group_message',
  description:
    'Gửi một tin vào nhóm hiện tại. Đây là cách DUY NHẤT để nói trong nhóm. Dùng reply_to_msg_id (số sau dấu # của tin) để trích dẫn tin đang trả lời; dùng mention_uids (uid đầy đủ) để nhắc thành viên — hệ thống tự dựng @Tên.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Nội dung tin (tối đa 4000 ký tự).' },
      reply_to_msg_id: { type: 'string', description: 'Số id (sau dấu #) của tin cần trích dẫn.' },
      mention_uids: { type: 'array', items: { type: 'string' }, description: 'Tối đa 5 uid thành viên cần nhắc.' },
    },
    required: ['text'],
    additionalProperties: false,
  },
};

interface Input {
  text: string;
  reply_to_msg_id?: string;
  mention_uids?: string[];
}

function parseMsgId(raw: string): number {
  const m = /^#?(\d{1,15})$/.exec(raw.trim());
  if (!m) throw new InvalidToolInputError(`reply_to_msg_id phải là số id của tin (vd 8820), nhận "${raw.slice(0, 40)}".`);
  return Number(m[1]);
}

export const sendGroupMessageTool: AgentTool<Input> = {
  definition,
  answers: true,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'send_group_message');
    const text = input.text.trim();
    if (text === '') throw new InvalidToolInputError('text không được rỗng.');
    if (text.length > GROUP_TEXT_MAX) throw new InvalidToolInputError(`text dài quá ${GROUP_TEXT_MAX} ký tự.`);
    if ((input.mention_uids?.length ?? 0) > MENTION_MAX) throw new InvalidToolInputError(`mention_uids tối đa ${MENTION_MAX}.`);
    const r = await postGroupText(g, {
      text,
      replyToMsgId: input.reply_to_msg_id ? parseMsgId(input.reply_to_msg_id) : null,
      mentionUids: input.mention_uids ?? [],
      by: 'tool',
    });
    return { sent: true, outbox_id: r.outboxId };
  },
};
