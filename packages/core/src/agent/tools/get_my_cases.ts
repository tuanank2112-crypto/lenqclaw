// packages/core/src/agent/tools/get_my_cases.ts — SPEC-P03 §10.3, tra cuu
// case/cuoc cua chinh cu dan (01-CONTRACTS §7 "moi luc").

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface MyCaseItem {
  code: string;
  status: string;
  category_code: string | null;
}

const definition: ToolDefinition = {
  name: 'get_my_cases',
  description: 'Liet ke cac cuoc/case cua chinh cu dan dang tro chuyen (moi nhat truoc), toi da 10 cuoc.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  strict: true,
};

export const getMyCasesTool: AgentTool<Record<string, never>, { cases: MyCaseItem[] }> = {
  definition,
  async run(ctx) {
    const rows = await sql<MyCaseItem>(
      `select code, status, category_code from jobs where resident_id = $1 order by created_at desc limit 10`,
      [ctx.residentId]
    );
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.get_my_cases',
      target: null,
      data: { count: rows.length },
    });
    return { cases: rows };
  },
};
