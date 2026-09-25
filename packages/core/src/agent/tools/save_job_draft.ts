// packages/core/src/agent/tools/save_job_draft.ts — SPEC-P03-Resident-Agent
// §10.3 buoc 1. Lan dau tao `jobs` status='drafting' voi `code` sinh ngau
// nhien (trung => sinh lai, toi da 5 lan); cac lan sau ghi de `draft`.

import { createHash } from 'node:crypto';
import { sql, tx } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { InvalidCategoryError } from '../../domain/errors.js';
import type { JobDraft } from '../../domain/types.js';
import type { ToolContext } from '../tool-context.js';
import { generateJobCode } from '../job-code.js';
import { triggerEmergencyFlow } from '../emergency.js';
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
  /** SPEC-P03 §11.2: co khi job dang/da bi khoa 'emergency' (co doi 't hay
   * khong dat cung urgency='emergency' o lan goi nay). */
  urgency_locked?: true;
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

/** Khoa 64-bit tat dinh tu `residentId` (uuid) cho `pg_advisory_xact_lock`
 * — SPEC-P03 §11.6 (G9): "mot cu dan chi co toi da mot job 'drafting'". */
function residentLockKey(residentId: string): string {
  const hash = createHash('sha256').update(residentId).digest();
  return hash.readBigInt64BE(0).toString();
}

async function insertJob(ctx: ToolContext, draft: JobDraft): Promise<{ id: string; code: string }> {
  return tx(async (q) => {
    // G9: khoa theo resident_id TRONG transaction — hai luot dong thoi cho
    // CUNG cu dan se cho nhau o day; luot sau, sau khi co khoa, se thay job
    // 'drafting' da co va DUNG LAI job do thay vi tao them.
    await q(`select pg_advisory_xact_lock($1)`, [residentLockKey(ctx.residentId)]);
    const existing = await q<{ id: string; code: string }>(
      `select id, code from jobs where resident_id = $1 and status = 'drafting' order by created_at desc limit 1`,
      [ctx.residentId]
    );
    if (existing.length > 0) {
      // §11.11: cot `category_code` la nguon chan ly — ghi CUNG cau lenh voi
      // `draft` o CA nhanh dung lai job 'drafting' da co (G9).
      await q(`update jobs set draft = $1, category_code = $2, updated_at = now() where id = $3`, [
        JSON.stringify(draft),
        draft.category_code,
        existing[0]!.id,
      ]);
      return { id: existing[0]!.id, code: existing[0]!.code };
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateJobCode();
      try {
        const rows = await q<{ id: string }>(
          `insert into jobs (code, building_id, apartment_id, resident_id, draft, category_code, status)
           values ($1,$2,$3,$4,$5,$6,'drafting') returning id`,
          [code, ctx.buildingId, ctx.apartmentId, ctx.residentId, JSON.stringify(draft), draft.category_code]
        );
        return { id: rows[0]!.id, code };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Khong sinh duoc ma cuoc sau 5 lan thu.');
  });
}

export const saveJobDraftTool: AgentTool<SaveJobDraftInput, SaveJobDraftOutput> = {
  definition,
  async run(ctx, input) {
    if (input.category_code !== null && !(await categoryExists(input.category_code))) {
      throw new InvalidCategoryError(`Danh muc "${input.category_code}" khong ton tai.`);
    }

    // SPEC-P03 §11.2: co dơn dieu — job da 'emergency' thi input 'normal'/
    // 'soon' bi bo qua (giu nguyen 'emergency'); dat 'emergency' lan dau =>
    // chay dung duong §11.1 (ticket + EMERGENCY_REPLY, cung luat chong lap).
    let previousUrgency: JobDraft['urgency'] | null = null;
    if (ctx.jobId !== null) {
      const prevRows = await sql<{ draft: JobDraft }>(`select draft from jobs where id = $1`, [ctx.jobId]);
      previousUrgency = prevRows[0]?.draft?.urgency ?? null;
    }
    const wasEmergency = previousUrgency === 'emergency';
    const effectiveUrgency: JobDraft['urgency'] = wasEmergency ? 'emergency' : input.urgency;

    const draft: JobDraft = {
      category_code: input.category_code,
      symptoms: input.symptoms,
      location_in_unit: input.location_in_unit,
      urgency: effectiveUrgency,
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
      // §11.11: nhanh cap nhat theo `ctx.jobId` cung ghi cot `category_code`
      // trong CUNG cau lenh voi `draft` — `null` ghi de thanh `null`.
      const rows = await sql<{ code: string }>(
        `update jobs set draft = $1, category_code = $2, updated_at = now() where id = $3 returning code`,
        [JSON.stringify(draft), draft.category_code, ctx.jobId]
      );
      code = rows[0]!.code;
    }

    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.save_job_draft',
      target: ctx.jobId,
      data: { category_code: draft.category_code, urgency: effectiveUrgency },
    });

    // §11.2: dat 'emergency' LAN DAU (khong phai da khoa tu truoc) => chay
    // duong khan cap ngay trong tool (day la luoi thu hai cho bien the §11.1
    // khong bat duoc).
    if (effectiveUrgency === 'emergency' && !wasEmergency) {
      await triggerEmergencyFlow({
        conversationId: ctx.conversationId,
        buildingId: ctx.buildingId,
        apartmentId: ctx.apartmentId,
        residentId: ctx.residentId,
        summary: ctx.latestText,
        source: 'model_flag',
      });
    }

    const out: SaveJobDraftOutput = { job_code: code, status: 'drafting' };
    if (effectiveUrgency === 'emergency') out.urgency_locked = true;
    return out;
  },
};
