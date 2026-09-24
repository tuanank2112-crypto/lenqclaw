// packages/core/src/agent/tools/save_job_draft.ts — SPEC-P03-Resident-Agent
// §10.3 buoc 1. Lan dau tao `jobs` status='drafting' voi `code` sinh ngau
// nhien (trung => sinh lai, toi da 5 lan); cac lan sau ghi de `draft`.

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { InvalidCategoryError } from '../../domain/errors.js';
import type { JobDraft } from '../../domain/types.js';
import type { ToolContext } from '../tool-context.js';
import { generateJobCode } from '../job-code.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface SaveJobDraftInput {
  category_code: string | null;
  symptoms: string[];
  location_in_unit: string;
  urgency: 'normal' | 'soon' | 'emergency';
  photo_ids: number[];
  questions_asked: number;
  confidence_note: string;
}

export interface SaveJobDraftOutput {
  job_code: string;
  status: string;
}

const definition: ToolDefinition = {
  name: 'save_job_draft',
  description:
    'Luu hoac cap nhat phieu viec (JobDraft) cua cuoc hien tai. category_code phai thuoc danh muc da biet ' +
    '(hoac null neu chua chac); goi lai sau moi luot co thong tin moi, khong don den cuoi.',
  input_schema: {
    type: 'object',
    properties: {
      category_code: { type: ['string', 'null'], description: 'Ma danh muc viec, null neu chua ro' },
      symptoms: { type: 'array', items: { type: 'string' }, description: 'Cac hien tuong da mo ta' },
      location_in_unit: { type: 'string', description: 'Vi tri trong can (vd "phong tam")' },
      urgency: { type: 'string', enum: ['normal', 'soon', 'emergency'] },
      photo_ids: { type: 'array', items: { type: 'integer' } },
      questions_asked: { type: 'integer', description: 'So cau da hoi cu dan (toi da 3)' },
      confidence_note: { type: 'string', description: 'Ghi chu do tin cay khi category_code=null' },
    },
    required: ['category_code', 'symptoms', 'location_in_unit', 'urgency', 'photo_ids', 'questions_asked', 'confidence_note'],
    additionalProperties: false,
  },
  strict: true,
};

async function categoryExists(code: string): Promise<boolean> {
  const rows = await sql<{ code: string }>(`select code from job_categories where code = $1`, [code]);
  return rows.length > 0;
}

async function insertJob(ctx: ToolContext, draft: JobDraft): Promise<{ id: string; code: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJobCode();
    try {
      const rows = await sql<{ id: string }>(
        `insert into jobs (code, building_id, apartment_id, resident_id, draft, status)
         values ($1,$2,$3,$4,$5,'drafting') returning id`,
        [code, ctx.buildingId, ctx.apartmentId, ctx.residentId, JSON.stringify(draft)]
      );
      return { id: rows[0]!.id, code };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Khong sinh duoc ma cuoc sau 5 lan thu.');
}

export const saveJobDraftTool: AgentTool<SaveJobDraftInput, SaveJobDraftOutput> = {
  definition,
  async run(ctx, input) {
    if (input.category_code !== null && !(await categoryExists(input.category_code))) {
      throw new InvalidCategoryError(`Danh muc "${input.category_code}" khong ton tai.`);
    }
    const draft: JobDraft = {
      category_code: input.category_code,
      symptoms: input.symptoms,
      location_in_unit: input.location_in_unit,
      urgency: input.urgency,
      photo_ids: input.photo_ids,
      questions_asked: input.questions_asked,
      confidence_note: input.confidence_note,
    };

    let code: string;
    if (ctx.jobId === null) {
      const created = await insertJob(ctx, draft);
      ctx.jobId = created.id;
      code = created.code;
    } else {
      const rows = await sql<{ code: string }>(
        `update jobs set draft = $1, updated_at = now() where id = $2 returning code`,
        [JSON.stringify(draft), ctx.jobId]
      );
      code = rows[0]!.code;
    }

    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.save_job_draft',
      target: ctx.jobId,
      data: { category_code: draft.category_code },
    });

    return { job_code: code, status: 'drafting' };
  },
};
