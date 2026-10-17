// tool `remember_member_note` — CHI GHI (append) ghi chu thanh vien; CAM doc o luot nhom (BB-07).
// O DM chi cho uid = requester; o nhom uid phai la thanh vien con hieu luc; O DM owner: moi uid.

import { sql } from '../../../adapters/db.js';
import { ActionNotPermittedError, InvalidToolInputError, UnknownMemberError } from '../../../domain/errors.js';
import { audit } from '../../../services/audit.js';
import { rememberMemberNote } from '../../../services/memory.js';
import { isGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const NOTE_MAX = 500;

const definition: ToolDefinition = {
  name: 'remember_member_note',
  description:
    'Ghi MỘT dòng ghi chú ngắn về một thành viên để nhớ lâu (họ làm gì, dự án, nhu cầu, hẹn, điều họ không thích). Không ghi chuyện phiếm, không ghi số điện thoại. Chỉ ghi thêm, không đọc lại được trong nhóm.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      uid: { type: 'string', description: 'uid đầy đủ của thành viên.' },
      note: { type: 'string', description: 'Ghi chú ngắn, tối đa 500 ký tự.' },
    },
    required: ['uid', 'note'],
    additionalProperties: false,
  },
};

export const rememberMemberNoteTool: AgentTool<{ uid: string; note: string }> = {
  definition,
  async run(ctx, input) {
    const note = input.note.trim();
    if (note === '') throw new InvalidToolInputError('note không được rỗng.');
    if (note.length > NOTE_MAX) throw new InvalidToolInputError(`note dài quá ${NOTE_MAX} ký tự.`);
    let displayName: string | null = null;
    if (isGroupCtx(ctx)) {
      const m = await sql<{ display_name: string | null }>(
        `select display_name from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and left_at is null`,
        [ctx.account, ctx.threadId, input.uid]
      );
      if (m.length === 0) throw new UnknownMemberError();
      displayName = m[0]!.display_name;
    } else if (ctx.kind === 'dm' && input.uid !== ctx.requester.uid) {
      throw new ActionNotPermittedError('Chỉ được ghi chú về chính người đang nhắn riêng với bạn.');
    }
    await rememberMemberNote({ account: ctx.account, uid: input.uid, note, source: 'agent', displayName });
    await audit(sql, { actorType: 'agent', actorId: ctx.requester?.uid ?? null, action: 'memory.note', target: ctx.threadId, data: { uid: input.uid } });
    return { saved: true };
  },
};
