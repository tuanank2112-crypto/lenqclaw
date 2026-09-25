// packages/core/src/agent/tools/vendor_handoff_to_staff.ts —
// SPEC-P05-Dispatch.md §10.6: chuyen nguoi that xu ly cho THO (mau
// agent/tools/handoff_to_staff.ts phia cu dan, dung lai `humanTakeoverMinutes`
// tu file do — KHONG dinh nghia lai hang so HUMAN_TAKEOVER_MIN).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { humanTakeoverMinutes } from './handoff_to_staff.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';

export interface VendorHandoffToStaffInput {
  reason: string;
}

const definition: ToolDefinition = {
  name: 'handoff_to_staff',
  description: 'Chuyen cuoc tro chuyen voi tho nay cho nhan vien BQL xu ly truc tiep.',
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

export const vendorHandoffToStaffTool: AgentTool<VendorHandoffToStaffInput, { ok: true }, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const convRows = await sql<{ id: string }>(
      `select id from conversations where zalo_account_id = 'market' and thread_id = $1`,
      [ctx.vendorUid]
    );
    const conversationId = convRows[0]?.id ?? null;
    if (conversationId) {
      await sql(`update conversations set human_takeover_until = now() + ($1 || ' minutes')::interval where id = $2`, [
        String(humanTakeoverMinutes()),
        conversationId,
      ]);
    }

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.handoff_to_staff',
      target: conversationId,
      data: { reason: input.reason },
    });

    return { ok: true };
  },
};
