// packages/core/src/agent/tools/get_price_band.ts — SPEC-P03 §10.3, doc
// price_book, co the rong (01-CONTRACTS §7).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface GetPriceBandInput {
  category_code: string;
}

export interface GetPriceBandOutput {
  price_low: number | null;
  price_high: number | null;
}

const definition: ToolDefinition = {
  name: 'get_price_band',
  description: 'Doc khung gia tham khao (p25-p75) cua mot danh muc viec tai toa nha hien tai. Co the rong.',
  input_schema: {
    type: 'object',
    properties: {
      category_code: { type: 'string' },
    },
    required: ['category_code'],
    additionalProperties: false,
  },
  strict: true,
};

export const getPriceBandTool: AgentTool<GetPriceBandInput, GetPriceBandOutput> = {
  definition,
  async run(ctx, input) {
    const rows = await sql<{ p25: number | null; p75: number | null }>(
      `select p25, p75 from price_book where category_code = $1 and building_id = $2`,
      [input.category_code, ctx.buildingId]
    );
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.get_price_band',
      target: null,
      data: { category_code: input.category_code },
    });
    if (rows.length === 0) return { price_low: null, price_high: null };
    return { price_low: rows[0]!.p25, price_high: rows[0]!.p75 };
  },
};
