// packages/core/src/agent/tools/push_bql_ticket.ts — SPEC-P03 §10.3 buoc 2a.
// Chi chay khi verdict da luu (`jobs.responsibility.party`) la 'bql'/'unclear'.

import { sql, tx } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { transitionJob } from '../../services/job-state.js';
import { ConflictError } from '../../domain/errors.js';
import type { ResponsibilityVerdict } from '../../domain/types.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface PushBqlTicketInput {
  summary: string;
}

export interface PushBqlTicketOutput {
  ticket_id: string;
  kind: 'bql_responsibility' | 'unclear';
}

const definition: ToolDefinition = {
  name: 'push_bql_ticket',
  description:
    'Tao ticket len dashboard BQL khi ket luan phan dinh trach nhiem la bql hoac unclear. Chi goi SAU KHI ' +
    'classify_responsibility da chot verdict tuong ung.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Tom tat viec + ket luan de BQL doc nhanh' },
    },
    required: ['summary'],
    additionalProperties: false,
  },
  strict: true,
};

export const pushBqlTicketTool: AgentTool<PushBqlTicketInput, PushBqlTicketOutput> = {
  definition,
  async run(ctx, input) {
    if (!ctx.jobId) {
      throw new Error('push_bql_ticket: chua co job.');
    }
    const jobs = await sql<{ status: string; responsibility: ResponsibilityVerdict | null }>(
      `select status, responsibility from jobs where id = $1`,
      [ctx.jobId]
    );
    const job = jobs[0];
    if (!job || job.status !== 'drafting' || !job.responsibility) {
      throw new ConflictError('push_bql_ticket: job khong o trang thai drafting hoac chua co verdict.');
    }
    const party = job.responsibility.party;
    if (party !== 'bql' && party !== 'unclear') {
      throw new ConflictError(`push_bql_ticket: verdict hien tai la "${party}", khong phai bql/unclear.`);
    }
    const kind: PushBqlTicketOutput['kind'] = party === 'bql' ? 'bql_responsibility' : 'unclear';

    const ticketId = await tx(async (q) => {
      const rows = await q<{ id: string }>(
        `insert into tickets (building_id, apartment_id, resident_id, source_job_id, kind, summary, citations, status)
         values ($1,$2,$3,$4,$5,$6,$7,'open') returning id`,
        [
          ctx.buildingId,
          ctx.apartmentId,
          ctx.residentId,
          ctx.jobId,
          kind,
          input.summary,
          JSON.stringify(job.responsibility!.citations),
        ]
      );
      await transitionJob(q, {
        jobId: ctx.jobId!,
        from: 'drafting',
        to: 'routed_bql',
        actorType: 'agent',
        actorId: ctx.residentId,
        data: { ticket_id: rows[0]!.id, kind },
      });
      return rows[0]!.id;
    });

    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.push_bql_ticket',
      target: ticketId,
      data: { kind, job_id: ctx.jobId },
    });

    return { ticket_id: ticketId, kind };
  },
};
