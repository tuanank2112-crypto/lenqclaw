// packages/core/src/agent/tools/get_my_assignments.ts — SPEC-P05-Dispatch.md
// §10.6: tho tra cuu cac cuoc dang giu/da xac nhan cua chinh minh. KHONG co
// truong PII (dung field JobCard).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { fmtWindowVn } from '../../services/vn-time.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';
import type { JobStatus } from '../../domain/types.js';

export interface GetMyAssignmentsOutput {
  jobs: Array<{
    code: string;
    status: JobStatus;
    category_name: string;
    window: [string, string];
    hold_expires_at: string | null;
    mode: 'fixed' | 'quote';
  }>;
}

const definition: ToolDefinition = {
  name: 'get_my_assignments',
  description: 'Liet ke cac cuoc dang giu/da xac nhan/dang xu ly cua chinh tho dang noi chuyen. KHONG co thong tin cu dan.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  strict: true,
};

export const getMyAssignmentsTool: AgentTool<Record<string, never>, GetMyAssignmentsOutput, VendorToolContext> = {
  definition,
  async run(ctx) {
    const rows = await sql<{
      code: string;
      status: JobStatus;
      name_vi: string;
      window_start: string | null;
      window_end: string | null;
      hold_expires_at: string | null;
      mode: 'fixed' | 'quote' | null;
    }>(
      `select j.code, j.status, coalesce(c.name_vi, '') as name_vi, j.window_start, j.window_end, j.hold_expires_at, j.mode
       from jobs j left join job_categories c on c.code = j.category_code
       where j.assigned_vendor_id = $1 and j.status not in ('closed', 'cancelled')
       order by j.updated_at desc`,
      [ctx.vendorId]
    );

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.get_my_assignments',
      target: null,
      data: { count: rows.length },
    });

    return {
      jobs: rows.map((r) => ({
        code: r.code,
        status: r.status,
        category_name: r.name_vi,
        window: [fmtWindowVn(r.window_start), fmtWindowVn(r.window_end)],
        hold_expires_at: r.hold_expires_at,
        mode: r.mode ?? 'quote',
      })),
    };
  },
};
