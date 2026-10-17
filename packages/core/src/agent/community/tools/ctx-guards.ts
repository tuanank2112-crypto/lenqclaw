// packages/core/src/agent/community/tools/ctx-guards.ts — kiem ngu canh dung chung cho tool (phong thu lop 2).

import { ToolNotAllowedError } from '../../../domain/errors.js';
import type { DmTurnContext, GroupTurnContext, ToolContext } from '../../../domain/types.js';

export function isGroupCtx(ctx: ToolContext): ctx is GroupTurnContext {
  return 'group' in ctx;
}

/** Tool chi cho luot nhom. */
export function requireGroupCtx(ctx: ToolContext, tool: string): GroupTurnContext {
  if (!isGroupCtx(ctx)) throw new ToolNotAllowedError(`Tool "${tool}" chi dung duoc trong luot nhom.`);
  return ctx;
}

/** Tool chi cho luot DM (member/stranger/owner). */
export function requireDmCtx(ctx: ToolContext, tool: string): DmTurnContext {
  if (isGroupCtx(ctx)) throw new ToolNotAllowedError(`Tool "${tool}" chi dung duoc trong luot nhan rieng.`);
  return ctx;
}
