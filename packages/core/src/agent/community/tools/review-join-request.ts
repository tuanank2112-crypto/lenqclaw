// tool `review_join_request` (SPEC-P05 §6): chi trong luot `group_join_review`, chi cho uid dang xet, chi policy agent_review.
// approve ⇒ `review_join approve:true` ngay; reject can ly do >= 10 ky tu. Co `answers` (D28).

import { ActionNotPermittedError } from '../../../domain/errors.js';
import { reviewJoinByAgent } from '../../../services/join-requests.js';
import { getGroup } from '../buffer.js';
import { requireGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const reviewDef: ToolDefinition = {
  name: 'review_join_request',
  description:
    'Quyết định MỘT yêu cầu vào nhóm đang chờ: approve (cho vào) hoặc reject (từ chối, bắt buộc lý do ≥ 10 ký tự). Dùng đúng uid trong khối join_request.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      uid: { type: 'string', description: 'uid người xin vào, đúng như trong khối join_request.' },
      decision: { type: 'string', enum: ['approve', 'reject'], description: 'approve hoặc reject.' },
      reason: { type: 'string', description: 'Lý do ngắn (reject: ≥ 10 ký tự).' },
    },
    required: ['uid', 'decision', 'reason'],
    additionalProperties: false,
  },
};

export const reviewJoinRequestTool: AgentTool<{ uid: string; decision: 'approve' | 'reject'; reason: string }> = {
  definition: reviewDef,
  answers: true,
  async run(ctx, input) {
    const g = requireGroupCtx(ctx, 'review_join_request');
    if (g.kind !== 'group_join_review' || g.joinRequest?.uid !== input.uid) {
      throw new ActionNotPermittedError('Chỉ quyết được yêu cầu vào nhóm đang xét trong lượt này.');
    }
    const group = await getGroup(g.account, g.threadId);
    if (!group) throw new ActionNotPermittedError('Nhóm chưa được khai báo.');
    const r = await reviewJoinByAgent({
      account: g.account,
      group,
      uid: input.uid,
      decision: input.decision,
      reason: input.reason,
      now: new Date(),
      inboundEventId: g.inboundEventId,
    });
    return { decision: r.decision };
  },
};
