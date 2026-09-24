// packages/core/src/agent/tools/open_service_case.ts — SPEC-P03 §10.3 buoc 3.
// Chi khi job 'awaiting_consent' VA tin cu dan MOI NHAT khop tat dinh CONSENT
// (khong khop khong|chua|thoi|huy) => tao ticket service_case + chuyen
// case_open. Sai => ConsentMissingError.

import { sql, tx } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { transitionJob } from '../../services/job-state.js';
import { ConsentMissingError } from '../../domain/errors.js';
import { normalizeVi } from '../pii.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface OpenServiceCaseInput {
  window_options: string[];
  note: string;
}

export interface OpenServiceCaseOutput {
  ticket_id: string;
  mode: 'fixed' | 'quote';
}

const CONSENT_RE = /\b(dong y|ok|oke|duoc|chot|tim tho|dat lich)\b/;
const NEG_RE = /\b(khong|chua|thoi|huy)\b/;

function hasConsent(text: string): boolean {
  const n = normalizeVi(text);
  if (NEG_RE.test(n)) return false;
  return CONSENT_RE.test(n);
}

const definition: ToolDefinition = {
  name: 'open_service_case',
  description:
    'Mo ticket theo doi viec (service_case) sau khi cu dan DONG Y tim tho. Tool tu kiem su dong y tat dinh tu ' +
    'tin nhan moi nhat cua cu dan trong luot nay — KHONG tin ket luan cua model.',
  input_schema: {
    type: 'object',
    properties: {
      window_options: { type: 'array', items: { type: 'string' }, description: '2-3 khung gio goi y' },
      note: { type: 'string', description: 'Ghi chu cho BQL/tho' },
    },
    required: ['window_options', 'note'],
    additionalProperties: false,
  },
  strict: true,
};

export const openServiceCaseTool: AgentTool<OpenServiceCaseInput, OpenServiceCaseOutput> = {
  definition,
  async run(ctx, input) {
    if (!ctx.jobId) {
      throw new Error('open_service_case: chua co job.');
    }
    const jobs = await sql<{ status: string; category_code: string | null }>(
      `select status, category_code from jobs where id = $1`,
      [ctx.jobId]
    );
    const job = jobs[0];
    if (!job || job.status !== 'awaiting_consent') {
      throw new Error('open_service_case: job khong o trang thai awaiting_consent.');
    }
    if (!hasConsent(ctx.latestText)) {
      throw new ConsentMissingError();
    }

    let mode: 'fixed' | 'quote' = 'quote';
    if (job.category_code) {
      const cats = await sql<{ default_mode: 'fixed' | 'quote' | null }>(
        `select default_mode from job_categories where code = $1`,
        [job.category_code]
      );
      const priceRows = await sql<{ p50: number | null }>(
        `select p50 from price_book where category_code = $1 and building_id = $2`,
        [job.category_code, ctx.buildingId]
      );
      const hasPrice = priceRows.length > 0 && priceRows[0]!.p50 !== null;
      mode = hasPrice && cats[0]?.default_mode ? cats[0]!.default_mode! : 'quote';
    }

    const ticketId = await tx(async (q) => {
      const rows = await q<{ id: string }>(
        `insert into tickets (building_id, apartment_id, resident_id, source_job_id, kind, summary, status)
         values ($1,$2,$3,$4,'service_case',$5,'open') returning id`,
        [ctx.buildingId, ctx.apartmentId, ctx.residentId, ctx.jobId, input.note]
      );
      await q(`update jobs set mode = $1, case_ticket_id = $2, updated_at = now() where id = $3`, [
        mode,
        rows[0]!.id,
        ctx.jobId,
      ]);
      await transitionJob(q, {
        jobId: ctx.jobId!,
        from: 'awaiting_consent',
        to: 'case_open',
        actorType: 'agent',
        actorId: ctx.residentId,
        data: { ticket_id: rows[0]!.id, window_options: input.window_options },
      });
      return rows[0]!.id;
    });

    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.open_service_case',
      target: ticketId,
      data: { job_id: ctx.jobId, mode },
    });

    return { ticket_id: ticketId, mode };
  },
};
