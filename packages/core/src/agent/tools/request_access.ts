// packages/core/src/agent/tools/request_access.ts — SPEC-P05-Dispatch.md
// §10.6 buoc 6: tho xin BQL cap quyen vao toa cho cuoc da xac nhan.

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { requestAccess } from '../../services/access.js';
import { JobNotFoundError } from '../../domain/errors.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';

export interface RequestAccessInput {
  job_code: string;
  note: string;
}

export interface RequestAccessOutput {
  ticket_id: string;
  status: 'access_pending';
}

const definition: ToolDefinition = {
  name: 'request_access',
  description: 'Tho xin BQL cap quyen vao toa cho cuoc da xac nhan — tao ticket access_request cho dashboard BQL.',
  input_schema: {
    type: 'object',
    properties: {
      job_code: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['job_code', 'note'],
    additionalProperties: false,
  },
  strict: true,
};

export const requestAccessTool: AgentTool<RequestAccessInput, RequestAccessOutput, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const normalizedCode = input.job_code.trim().toUpperCase();
    const jobRows = await sql<{ id: string }>(`select id from jobs where code = $1`, [normalizedCode]);
    const job = jobRows[0];
    if (!job) throw new JobNotFoundError();

    const result = await requestAccess({
      jobId: job.id,
      vendorId: ctx.vendorId,
      note: input.note,
      actor: { type: 'vendor', id: ctx.vendorId },
      now: ctx.now,
    });

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.request_access',
      target: result.ticketId,
      data: { job_id: job.id },
    });

    return { ticket_id: result.ticketId, status: 'access_pending' };
  },
};
