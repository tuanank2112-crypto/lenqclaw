// tool `recall_group_history` — doc them dem CUA CHINH nhom hien tai (SPEC-P03 §8). `extendsDeadline` (D31).
// Text da che SDT; tin da xoa bi loai; khong bao gio doc nhom khac.

import { sql } from '../../../adapters/db.js';
import { redactPhones } from '../redact.js';
import { requireGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const definition: ToolDefinition = {
  name: 'recall_group_history',
  description: 'Xem thêm các tin cũ hơn trong bộ đệm của nhóm hiện tại (tối đa 50 tin). before_id: chỉ lấy tin có id nhỏ hơn.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Số tin tối đa (mặc định 20, tối đa 50).' },
      before_id: { type: 'integer', description: 'Chỉ lấy tin có id nhỏ hơn giá trị này.' },
    },
    additionalProperties: false,
  },
};

export const recallGroupHistoryTool: AgentTool<{ limit?: number; before_id?: number }> = {
  definition,
  extendsDeadline: true,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'recall_group_history');
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const rows = await sql<{ id: number; sender_uid: string; sender_name: string | null; is_self: boolean; text: string | null; at: string }>(
      `select id::int as id, sender_uid, sender_name, is_self, text,
              to_char(received_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') as at
         from group_messages
        where zalo_account_id = $1 and thread_id = $2 and deleted_at is null and ($3::bigint is null or id < $3)
        order by id desc limit $4`,
      [g.account, g.threadId, input.before_id ?? null, limit]
    );
    return {
      messages: rows.reverse().map((r) => ({
        id: r.id,
        uid: r.is_self ? 'BOT' : r.sender_uid,
        name: r.sender_name === null ? null : redactPhones(r.sender_name),
        at: r.at,
        text: redactPhones(r.text ?? ''),
      })),
    };
  },
};
