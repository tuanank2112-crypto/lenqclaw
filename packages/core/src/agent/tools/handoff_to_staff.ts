// packages/core/src/agent/tools/handoff_to_staff.ts — SPEC-P03 §10.3
// "moi luc": chuyen nguoi that xu ly, ghi audit + tam ngung agent cho
// conversation nay (human_takeover_until).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface HandoffToStaffInput {
  reason: string;
}

const HUMAN_TAKEOVER_MIN_DEFAULT = 60;

/** SPEC-P03 §11.6 (N3): so phut nguoi that tiep quan (env `HUMAN_TAKEOVER_MIN`,
 * mac dinh 60). Xuat rieng de test don vi (khong can DB). */
export function humanTakeoverMinutes(): number {
  const raw = process.env.HUMAN_TAKEOVER_MIN?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : HUMAN_TAKEOVER_MIN_DEFAULT;
}

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
      [String(humanTakeoverMinutes()), ctx.conversationId]
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
