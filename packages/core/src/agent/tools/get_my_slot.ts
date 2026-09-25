// packages/core/src/agent/tools/get_my_slot.ts — SPEC-P05-Dispatch.md
// §10.6/§10.9.2: tho tra cuu slot/danh sach cho cua chinh minh.

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { getSlotSummary } from '../../services/slots.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';
import type { TradeGroup } from '../../domain/types.js';

export interface GetMySlotOutput {
  slots: Array<{ building_code: string; trade_group: TradeGroup; is_trial: boolean; period_end: string; days_left: number; status: string }>;
  waitlist: Array<{ building_code: string; trade_group: TradeGroup; position: number; invited_at: string | null }>;
}

const definition: ToolDefinition = {
  name: 'get_my_slot',
  description: 'Xem cac slot dang giu va vi tri trong danh sach cho cua chinh tho.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  strict: true,
};

export const getMySlotTool: AgentTool<Record<string, never>, GetMySlotOutput, VendorToolContext> = {
  definition,
  async run(ctx) {
    const summary = await getSlotSummary(ctx.vendorId, ctx.now);

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.get_my_slot',
      target: ctx.vendorId,
      data: { slots: summary.slots.length, waitlist: summary.waitlist.length },
    });

    return {
      slots: summary.slots.map((s) => ({
        building_code: s.buildingCode,
        trade_group: s.tradeGroup,
        is_trial: s.isTrial,
        period_end: s.periodEnd,
        days_left: s.daysLeft,
        status: s.status,
      })),
      waitlist: summary.waitlist.map((w) => ({
        building_code: w.buildingCode,
        trade_group: w.tradeGroup,
        position: w.position,
        invited_at: w.invitedAt,
      })),
    };
  },
};
