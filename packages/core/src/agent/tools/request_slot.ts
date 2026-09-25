// packages/core/src/agent/tools/request_slot.ts — SPEC-P05-Dispatch.md
// §10.6/§10.9.2 (Đ14): tho xin giu slot (dung thu/cho) tai (toa × nhom nghe).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { requestSlot } from '../../services/slots.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';
import type { TradeGroup } from '../../domain/types.js';

export interface RequestSlotInput {
  trade_group: TradeGroup;
  building_code: string | null;
}

export interface RequestSlotOutput {
  result: 'trial_granted' | 'already_active' | 'waitlisted' | 'pending_payment';
  building_code: string | null;
  trade_group: TradeGroup;
  period_end?: string;
  position?: number;
  fee_vnd?: number;
}

const definition: ToolDefinition = {
  name: 'request_slot',
  description:
    'Tho xin giu slot (cho vao nhom viec) tai mot nhom nghe. Lan dau duoc dung thu mien phi; da dung thu roi thi ' +
    'can BQL thu phi; het cho => vao danh sach cho.',
  input_schema: {
    type: 'object',
    properties: {
      trade_group: { type: 'string', enum: ['dien_nuoc', 'khoa', 'dien_lanh', 'xay_sua'] },
      building_code: { type: ['string', 'null'], description: 'Ma toa neu tho thuoc nhieu toa, null neu chi mot toa' },
    },
    required: ['trade_group', 'building_code'],
    additionalProperties: false,
  },
  strict: true,
};

export const requestSlotTool: AgentTool<RequestSlotInput, RequestSlotOutput, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const result = await requestSlot({
      vendorId: ctx.vendorId,
      buildingCode: input.building_code,
      tradeGroup: input.trade_group,
      now: ctx.now,
    });

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.request_slot',
      target: ctx.vendorId,
      data: { trade_group: input.trade_group, result: result.result },
    });

    return {
      result: result.result,
      building_code: input.building_code,
      trade_group: input.trade_group,
      period_end: result.periodEnd,
      position: result.position,
      fee_vnd: result.feeVnd,
    };
  },
};
