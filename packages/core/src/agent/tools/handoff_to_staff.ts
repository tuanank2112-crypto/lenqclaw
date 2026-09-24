// packages/core/src/agent/tools/handoff_to_staff.ts — SPEC-P03 §10.3
// "moi luc": chuyen nguoi that xu ly, ghi audit + tam ngung agent cho
// conversation nay (human_takeover_until).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface HandoffToStaffInput {
  reason: string;
}

const HUMAN_TAKEOVER_MINUTES = 30;

const definition: ToolDefinition = {
  name: 'handoff_to_staff',
  description: 'Chuyen cuoc tro chuyen nay cho nhan vien BQL xu ly truc tiep (vd het luot tool, model tu choi).',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  strict: true,
};

export const handoffToStaffTool: AgentTool<HandoffToStaffInput, { ok: true }> = {
  definition,
  async run(ctx, input) {
    await sql(
      `update conversations set human_takeover_until = now() + ($1 || ' minutes')::interval where id = $2`,
      [String(HUMAN_TAKEOVER_MINUTES), ctx.conversationId]
    );
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.handoff_to_staff',
      target: ctx.conversationId,
      data: { reason: input.reason },
    });
    return { ok: true };
  },
};
