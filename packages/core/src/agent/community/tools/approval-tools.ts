// tool `decide_approval` (SPEC-P05 §5.3–§5.4). BB-06: model KHONG tu quyet thay nguoi —
// `decide_approval` can bang chung tat dinh trong tin CUA NGUOI QUYET (ma the + tu quyet dinh, `hasDecisionEvidence`).

import { IntentNotConfirmedError, ToolNotAllowedError } from '../../../domain/errors.js';
import type { ToolContext } from '../../../domain/types.js';
import { decideApproval, findApprovalByRef, hasDecisionEvidence, idShortOf } from '../../../services/approvals.js';
import { isGroupCtx } from './ctx-guards.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

/** Tin gan nhat CUA CHINH nguoi yeu cau: DM ⇒ `latestText`; nhom ⇒ tin cuoi trong focus do requester gui. */
export function requesterLatestText(ctx: ToolContext): string {
  if (!ctx.requester) return '';
  if (!isGroupCtx(ctx)) return ctx.latestText;
  const mine = ctx.focusMessages.filter((m) => m.senderUid === ctx.requester!.uid);
  return mine.length > 0 ? (mine[mine.length - 1]!.text ?? '') : '';
}

const decideDef: ToolDefinition = {
  name: 'decide_approval',
  description:
    'Ghi quyết định của chủ/quản trị viên cho MỘT thẻ duyệt. CHỈ gọi khi tin của người đó có mã thẻ và từ quyết định rõ ràng ("duyệt <mã>" / "từ chối <mã>" / "/approve <mã>" / "/reject <mã>"); hệ thống kiểm lại bằng chứng này, không gọi thay họ.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      approval_id: { type: 'string', description: 'Mã thẻ (8 ký tự đầu hoặc uuid đầy đủ) đúng như người quyết đã gõ.' },
      decision: { type: 'string', enum: ['approve', 'reject'], description: 'approve = duyệt, reject = từ chối.' },
      note: { type: 'string', description: 'Ghi chú tuỳ chọn.' },
    },
    required: ['approval_id', 'decision'],
    additionalProperties: false,
  },
};

export const decideApprovalTool: AgentTool<{ approval_id: string; decision: 'approve' | 'reject'; note?: string }> = {
  definition: decideDef,
  async run(ctx, input) {
    const requester = ctx.requester;
    if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
      throw new ToolNotAllowedError('Chỉ chủ hoặc quản trị viên mới được quyết thẻ duyệt.');
    }
    const card = await findApprovalByRef(ctx.account, input.approval_id, { pendingOnly: true });
    const evidence = hasDecisionEvidence(requesterLatestText(ctx), card.id);
    if (evidence === null || evidence !== input.decision) {
      throw new IntentNotConfirmedError(`Chưa thấy xác nhận rõ ràng. Hãy trả lời đúng mẫu "duyệt ${idShortOf(card.id)}" hoặc "từ chối ${idShortOf(card.id)}".`);
    }
    const r = await decideApproval({
      id: card.id,
      decision: input.decision,
      decidedBy: `zalo:${requester.uid}`,
      ...(input.note ? { note: input.note.slice(0, 500) } : {}),
      now: new Date(),
    });
    return { status: r.status, outbox_id: r.outboxId };
  },
};
