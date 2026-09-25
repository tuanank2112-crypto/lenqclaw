// packages/core/src/agent/tools/classify_responsibility.ts — SPEC-P03 §11.4
// + §11.5 (thay §10.3), thuc thi BB-03 (00-ARCHITECTURE §6) TRONG tool,
// khong tin ket luan cua model: citations rong/nguon khong 'approved'/ngoai
// hieu luc/toa khac => ep 'unclear'; nhan mau thuan voi party => 'unclear';
// quote do model gui BI BO QUA, thay bang doan cat tu kb_sections.body.
//
// "Nhan" duoc doc tu MOT nhan tat dinh o dau `kb_sections.body` (seed cai
// vao, KHONG phai DDL moi — 01-CONTRACTS khong doi): `[TRÁCH NHIỆM: BQL]`
// hoac `[TRÁCH NHIỆM: CƯ DÂN]`. Quy uoc noi bo cua P03 (khong lo ra ngoai
// tool), tranh phai them cot vao 01-CONTRACTS §4 cho MVP.

import { sql, tx } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { transitionJob } from '../../services/job-state.js';
import { VerdictLockedError } from '../../domain/errors.js';
import type { Citation, ResponsibilityVerdict } from '../../domain/types.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

export interface ClassifyResponsibilityInput {
  party: 'resident' | 'bql' | 'unclear';
  citations: Citation[];
  reason_vi: string;
}

const MARKER_RE = /^\s*\[TR[ÁA]CH NHI[ỆE]M:\s*(BQL|C[ƯU] D[ÂA]N)\]/iu;
const QUOTE_MAX_LEN = 300;

function parseMarker(body: string): 'bql' | 'resident' | null {
  const m = MARKER_RE.exec(body);
  if (!m) return null;
  const raw = m[1]!.toUpperCase();
  return raw === 'BQL' ? 'bql' : 'resident';
}

interface CitationMeta {
  documentId: string;
  sectionId: string;
  body: string;
  status: 'approved' | 'draft' | 'deprecated';
  effectiveFrom: string;
  effectiveTo: string | null;
  marker: 'bql' | 'resident' | null;
}

async function loadCitationMeta(citations: Citation[], buildingId: string): Promise<CitationMeta[]> {
  const out: CitationMeta[] = [];
  for (const c of citations) {
    const rows = await sql<{
      body: string;
      status: 'approved' | 'draft' | 'deprecated';
      effective_from: string;
      effective_to: string | null;
    }>(
      // R03: `d.effective_from`/`effective_to` la cot `date` — driver `pg`
      // tra ve JS `Date`, KHONG phai chuoi. Ep `::text`. §11.4: chi tinh
      // trich dan cua DUNG toa hien tai (d.building_id = ctx.buildingId) —
      // trich dan cua toa khac coi nhu KHONG hop le (khong trong ket qua).
      `select s.body, d.status, d.effective_from::text as effective_from, d.effective_to::text as effective_to
       from kb_sections s join kb_documents d on d.id = s.document_id
       where s.document_id = $1 and s.section_id = $2 and d.building_id = $3`,
      [c.document_id, c.section_id, buildingId]
    );
    if (rows.length === 0) continue; // trich dan khong ton tai/khac toa -> bo qua, coi nhu khong hop le
    const r = rows[0]!;
    out.push({
      documentId: c.document_id,
      sectionId: c.section_id,
      body: r.body,
      status: r.status,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      marker: parseMarker(r.body),
    });
  }
  return out;
}

/** So sanh theo NGAY o mui gio Asia/Ho_Chi_Minh (G7 — truoc do so UTC). */
/** G7 (R06 vong 2): xuat rieng de test THUAN (`npm test`, vi.useFakeTimers)
 * canh dung bien UTC vs Asia/Ho_Chi_Minh (UTC+7) — khong phu thuoc gio chay
 * that cua may CI. */
export function todayInVietnam(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // 'sv-SE' => "YYYY-MM-DD"
}

function isEffectiveToday(meta: CitationMeta, today: string): boolean {
  if (meta.status !== 'approved') return false;
  if (meta.effectiveFrom > today) return false;
  if (meta.effectiveTo !== null && meta.effectiveTo < today) return false;
  return true;
}

const definition: ToolDefinition = {
  name: 'classify_responsibility',
  description:
    'Chot ket luan phan dinh trach nhiem (resident/bql/unclear) kem trich dan. Tool tu kiem: thieu trich dan con ' +
    'hieu luc/dung toa, trich dan trai nhan voi ket luan, se bi EP thanh unclear bat ke agent de xuat gi. Quote ' +
    'thuc te se lay tu kho quy che, khong dung nguyen van agent gui.',
  input_schema: {
    type: 'object',
    properties: {
      party: { type: 'string', enum: ['resident', 'bql', 'unclear'] },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            document_id: { type: 'string' },
            section_id: { type: 'string' },
            quote: { type: 'string' },
          },
          required: ['document_id', 'section_id', 'quote'],
          additionalProperties: false,
        },
      },
      reason_vi: { type: 'string' },
    },
    required: ['party', 'citations', 'reason_vi'],
    additionalProperties: false,
  },
  strict: true,
};

export const classifyResponsibilityTool: AgentTool<ClassifyResponsibilityInput, ResponsibilityVerdict & { forced: boolean }> = {
  definition,
  async run(ctx, input) {
    if (!ctx.jobId) {
      throw new Error('classify_responsibility: chua co job (goi save_job_draft truoc).');
    }
    // SPEC-P03 §11.5: chi chay khi job dang 'drafting' — goi lai sau khi
    // verdict da chot (job da sang trang thai khac) => VerdictLockedError,
    // KHONG duoc ghi de (chan ca 3d: model doi verdict sau khi da
    // awaiting_consent/case_open).
    const jobs = await sql<{ status: string }>(`select status from jobs where id = $1`, [ctx.jobId]);
    if (!jobs[0] || jobs[0].status !== 'drafting') {
      throw new VerdictLockedError();
    }

    const today = todayInVietnam();
    const metas = await loadCitationMeta(input.citations, ctx.buildingId);
    const validMetas = metas.filter((m) => isEffectiveToday(m, today));

    let forcedParty: 'resident' | 'bql' | 'unclear' = input.party;
    let forced = false;

    if (input.party === 'unclear') {
      forcedParty = 'unclear';
    } else if (validMetas.length === 0) {
      forcedParty = 'unclear';
      forced = true;
    } else {
      // §11.4: MOI citation hop le phai co nhan VA nhan = party de duoc giu
      // nguyen; thieu nhan hoac trai nhan (vd nhan [BQL] nhung party=resident)
      // => ep unclear (chan ca 2h).
      const allMatch = validMetas.every((m) => m.marker === input.party);
      if (!allMatch) {
        forcedParty = 'unclear';
        forced = true;
      }
    }

    // §11.4: quote LUU = doan cat tu kb_sections.body (<=300 ky tu dau muc);
    // quote do model gui BI BO QUA (chan ca 2i — quote bia). Khi bi EP (citation
    // xau/mau thuan) thi bo het trich dan xau do; khi agent TU nhan 'unclear'
    // (khong bi ep) van giu cac trich dan hop le (neu co) de tham khao.
    const citationSourceMetas = forced ? [] : validMetas;
    const finalCitations: Citation[] = citationSourceMetas.map((m) => ({
      document_id: m.documentId,
      section_id: m.sectionId,
      quote: m.body.slice(0, QUOTE_MAX_LEN),
    }));
    const verdict: ResponsibilityVerdict = { party: forcedParty, citations: finalCitations, reason_vi: input.reason_vi };

    await tx(async (q) => {
      await q(`update jobs set responsibility = $1, updated_at = now() where id = $2`, [
        JSON.stringify(verdict),
        ctx.jobId,
      ]);
      if (forcedParty === 'resident') {
        await transitionJob(q, {
          jobId: ctx.jobId!,
          from: 'drafting',
          to: 'awaiting_consent',
          actorType: 'agent',
          actorId: ctx.residentId,
          data: { verdict },
        });
      }
    });

    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.classify_responsibility',
      target: ctx.jobId,
      data: { party: forcedParty, forced, citations: finalCitations.length },
    });

    return { ...verdict, forced };
  },
};
