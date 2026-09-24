// packages/core/src/agent/tools/classify_responsibility.ts — SPEC-P03 §10.3,
// thuc thi BB-03 (00-ARCHITECTURE §6) TRONG tool, khong tin ket luan cua
// model: citations rong/nguon khong 'approved'/ngoai hieu luc => ep
// 'unclear'; hai citation con hieu luc nhung KET LUAN NGUOC NHAU => 'unclear'.
//
// "Ket luan nguoc nhau" duoc doc tu MOT nhan tat dinh o dau `kb_sections.body`
// (seed cai vao, KHONG phai DDL moi — 01-CONTRACTS khong doi): `[TRACH
// NHIEM: BQL]` hoac `[TRACH NHIEM: CU DAN]`. Day la quy uoc noi bo cua P03
// (khong lo ra ngoai tool), tranh phai them cot vao 01-CONTRACTS §4 cho MVP.

import { sql, tx } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { transitionJob } from '../../services/job-state.js';
import type { Citation, ResponsibilityVerdict } from '../../domain/types.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { ToolContext } from '../tool-context.js';

export interface ClassifyResponsibilityInput {
  party: 'resident' | 'bql' | 'unclear';
  citations: Citation[];
  reason_vi: string;
}

const MARKER_RE = /^\s*\[TR[ÁA]CH NHI[ỆE]M:\s*(BQL|C[ƯU] D[ÂA]N)\]/iu;

function parseMarker(body: string): 'bql' | 'resident' | null {
  const m = MARKER_RE.exec(body);
  if (!m) return null;
  const raw = m[1]!.toUpperCase();
  return raw === 'BQL' ? 'bql' : 'resident';
}

interface CitationMeta {
  documentId: string;
  sectionId: string;
  quote: string;
  status: 'approved' | 'draft' | 'deprecated';
  effectiveFrom: string;
  effectiveTo: string | null;
  marker: 'bql' | 'resident' | null;
}

async function loadCitationMeta(citations: Citation[]): Promise<CitationMeta[]> {
  const out: CitationMeta[] = [];
  for (const c of citations) {
    const rows = await sql<{
      body: string;
      status: 'approved' | 'draft' | 'deprecated';
      effective_from: string;
      effective_to: string | null;
    }>(
      // R03: `d.effective_from`/`effective_to` la cot `date` — driver `pg`
      // tra ve JS `Date`, KHONG phai chuoi. Ep `::text` de so sanh chuoi
      // "YYYY-MM-DD" tat dinh trong `isEffectiveToday` (so sanh Date voi
      // chuoi qua `<`/`>` luon false vi ep kieu ve NaN — bug da bat duoc
      // qua test BB-03 "nguon het hieu luc").
      `select s.body, d.status, d.effective_from::text as effective_from, d.effective_to::text as effective_to
       from kb_sections s join kb_documents d on d.id = s.document_id
       where s.document_id = $1 and s.section_id = $2`,
      [c.document_id, c.section_id]
    );
    if (rows.length === 0) continue; // trich dan khong ton tai -> bo qua, coi nhu khong hop le
    const r = rows[0]!;
    out.push({
      documentId: c.document_id,
      sectionId: c.section_id,
      quote: c.quote,
      status: r.status,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      marker: parseMarker(r.body),
    });
  }
  return out;
}

function isEffectiveToday(meta: CitationMeta): boolean {
  if (meta.status !== 'approved') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (meta.effectiveFrom > today) return false;
  if (meta.effectiveTo !== null && meta.effectiveTo < today) return false;
  return true;
}

const definition: ToolDefinition = {
  name: 'classify_responsibility',
  description:
    'Chot ket luan phan dinh trach nhiem (resident/bql/unclear) kem trich dan. Tool tu kiem: thieu trich dan ' +
    'con hieu luc, hoac hai trich dan mau thuan nhau, se bi EP thanh unclear bat ke agent de xuat gi.',
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
    const metas = await loadCitationMeta(input.citations);
    const validMetas = metas.filter(isEffectiveToday);

    let forcedParty: 'resident' | 'bql' | 'unclear' = input.party;
    let forced = false;

    if (input.party !== 'unclear' && validMetas.length === 0) {
      forcedParty = 'unclear';
      forced = true;
    } else {
      const markers = new Set(validMetas.map((m) => m.marker).filter((m): m is 'bql' | 'resident' => m !== null));
      if (markers.size > 1) {
        forcedParty = 'unclear';
        forced = true;
      }
    }

    const finalCitations: Citation[] = validMetas.map((m) => ({
      document_id: m.documentId,
      section_id: m.sectionId,
      quote: m.quote,
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
