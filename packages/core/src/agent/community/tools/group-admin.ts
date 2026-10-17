// Tool quan tri nhom cua owner/moderator: list_groups · set_group_enabled · set_group_mode · mute_group
// (01-CONTRACTS §7.1). Moi hanh dong ghi audit voi actor (BB-09). O luot nhom tool tac dong DUNG nhom
// hien tai (khong nhan thread_id khac); o DM owner bat buoc `thread_id`.

import { sql } from '../../../adapters/db.js';
import { ActionNotPermittedError, InvalidToolInputError } from '../../../domain/errors.js';
import type { ToolContext } from '../../../domain/types.js';
import { audit } from '../../../services/audit.js';
import { isGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

/** Nhom muc tieu: nhom hien tai (G) hoac `thread_id` bat buoc (O). */
function targetThread(ctx: ToolContext, threadId: string | undefined): string {
  if (isGroupCtx(ctx)) {
    if (threadId !== undefined && threadId !== ctx.threadId) {
      throw new ActionNotPermittedError('Trong nhóm chỉ được thao tác chính nhóm này.');
    }
    return ctx.threadId;
  }
  if (!threadId) throw new InvalidToolInputError('Thiếu thread_id của nhóm.');
  return threadId;
}

async function requireGroupExists(account: string, threadId: string): Promise<void> {
  const g = await sql(`select 1 from zalo_groups where zalo_account_id = $1 and thread_id = $2`, [account, threadId]);
  if (g.length === 0) throw new ActionNotPermittedError(`Nhóm ${threadId} chưa được khai báo.`);
}

const listGroupsDef: ToolDefinition = {
  name: 'list_groups',
  description: 'Liệt kê các nhóm đã khai: tên, bật/tắt, chế độ, ngân sách tin mỗi giờ và số tin còn lại trong giờ này.',
  strict: true,
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
};

export const listGroupsTool: AgentTool<Record<string, never>> = {
  definition: listGroupsDef,
  async run(ctx) {
    const rows = await sql<{ thread_id: string; name: string | null; enabled: boolean; mode: string; budget_per_hour: number; used: number }>(
      `select g.thread_id, g.name, g.enabled, g.mode, g.budget_per_hour,
              (select count(*)::int from outbox o
                where o.zalo_account_id = g.zalo_account_id and o.thread_id = g.thread_id and o.kind = 'text'
                  and o.status in ('queued','sending','sent') and o.created_at > now() - interval '1 hour'
                  and coalesce((o.body->>'part')::int, 0) = 0) as used
         from zalo_groups g where g.zalo_account_id = $1 order by g.thread_id`,
      [ctx.account]
    );
    return {
      groups: rows.map((r) => ({
        thread_id: r.thread_id,
        name: r.name,
        enabled: r.enabled,
        mode: r.mode,
        budget_per_hour: r.budget_per_hour,
        budget_left: Math.max(0, r.budget_per_hour - r.used),
      })),
    };
  },
};

const setEnabledDef: ToolDefinition = {
  name: 'set_group_enabled',
  description: 'Bật hoặc tắt trợ lý cho một nhóm (chỉ chủ, nhắn riêng). Tắt = trợ lý không đọc, không lưu, không trả lời tin của nhóm đó.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { thread_id: { type: 'string' }, enabled: { type: 'boolean' } },
    required: ['thread_id', 'enabled'],
    additionalProperties: false,
  },
};

export const setGroupEnabledTool: AgentTool<{ thread_id: string; enabled: boolean }> = {
  definition: setEnabledDef,
  async run(ctx, input) {
    await requireGroupExists(ctx.account, input.thread_id);
    await sql(`update zalo_groups set enabled = $3, updated_at = now() where zalo_account_id = $1 and thread_id = $2`, [
      ctx.account,
      input.thread_id,
      input.enabled,
    ]);
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.requester?.uid ?? null,
      action: 'group.enabled',
      target: input.thread_id,
      data: { enabled: input.enabled },
    });
    return { thread_id: input.thread_id, enabled: input.enabled };
  },
};

const setModeDef: ToolDefinition = {
  name: 'set_group_mode',
  description:
    'Đổi chế độ của nhóm: "mention" (chỉ trả lời khi được gọi) hoặc "ambient" (lắng nghe, chỉ lên tiếng khi có giá trị rõ). Trong nhóm: áp cho chính nhóm đó. Nhắn riêng với chủ: cần thread_id.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { mode: { type: 'string', enum: ['mention', 'ambient'] }, thread_id: { type: 'string' } },
    required: ['mode'],
    additionalProperties: false,
  },
};

export const setGroupModeTool: AgentTool<{ mode: 'mention' | 'ambient'; thread_id?: string }> = {
  definition: setModeDef,
  async run(ctx, input) {
    const thread = targetThread(ctx, input.thread_id);
    await requireGroupExists(ctx.account, thread);
    await sql(`update zalo_groups set mode = $3, updated_at = now() where zalo_account_id = $1 and thread_id = $2`, [ctx.account, thread, input.mode]);
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.requester?.uid ?? null,
      action: 'group.mode',
      target: thread,
      data: { mode: input.mode },
    });
    return { thread_id: thread, mode: input.mode };
  },
};

const muteDef: ToolDefinition = {
  name: 'mute_group',
  description:
    'Cho trợ lý im lặng hoặc nói lại trong nhóm. "mute" = chuyển về chế độ chỉ trả lời khi được gọi; "unmute" = chế độ lắng nghe. (Chưa hỗ trợ thời lượng — /mute 1h và /mute 24h đều là mute.)',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { action: { type: 'string', enum: ['mute', 'unmute'] }, thread_id: { type: 'string' } },
    required: ['action'],
    additionalProperties: false,
  },
};

export const muteGroupTool: AgentTool<{ action: 'mute' | 'unmute'; thread_id?: string }> = {
  definition: muteDef,
  async run(ctx, input) {
    const thread = targetThread(ctx, input.thread_id);
    await requireGroupExists(ctx.account, thread);
    const mode = input.action === 'mute' ? 'mention' : 'ambient';
    await sql(`update zalo_groups set mode = $3, updated_at = now() where zalo_account_id = $1 and thread_id = $2`, [ctx.account, thread, mode]);
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.requester?.uid ?? null,
      action: 'group.mute',
      target: thread,
      data: { action: input.action },
    });
    return { thread_id: thread, mode };
  },
};
