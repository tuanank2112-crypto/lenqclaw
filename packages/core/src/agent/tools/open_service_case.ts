// packages/core/src/agent/tools/open_service_case.ts — SPEC-P03 §11.5 (thay
// §10.3). Chi khi job 'awaiting_consent', verdict da luu la 'resident', VA
// tin cu dan moi nhat (NHAN SAU luc chuyen drafting->awaiting_consent) khop
// dong y tat dinh (danh sach tu) hoac lop hieu y (triage.intent='consent',
// do >= 0.8). Sai => ConsentMissingError.

import { sql, tx } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { transitionJob } from '../../services/job-state.js';
import { ConflictError, ConsentMissingError } from '../../domain/errors.js';
import { normalizeVi } from '../pii.js';
import type { ResponsibilityVerdict } from '../../domain/types.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { ToolContext } from '../tool-context.js';

export interface OpenServiceCaseInput {
  window_options: string[];
  note: string;
}

export interface OpenServiceCaseOutput {
  ticket_id: string;
  mode: 'fixed' | 'quote';
}

// SPEC-P03 §11.5 — danh sach cum dong y (da bo dau, chu thuong).
const POSITIVE_PHRASES = new Set([
  'dong y',
  'toi dong y',
  'em dong y',
  'ok',
  'oke',
  'okay',
  'duoc',
  'chot',
  'tim tho',
  'tim tho giup',
  'dat lich',
  'co',
]);
const TRAILING_PARTICLES = new Set(['a', 'nhe', 'nha', 'luon', 'di', 'em', 'anh', 'chi', 'minh']);
const NEGATIVE_TOKENS = ['khong', 'ko', 'k', 'hong', 'hok', 'chua', 'dung', 'thoi', 'huy', 'suy nghi', 'hoi'];

function stripTrailingParticles(norm: string): string {
  const tokens = norm.split(' ').filter(Boolean);
  while (tokens.length > 1 && TRAILING_PARTICLES.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(' ');
}

function matchesExactConsent(rawText: string): boolean {
  const withoutTrailingPunct = rawText.replace(/[.,!;:]+$/u, '');
  const norm = stripTrailingParticles(normalizeVi(withoutTrailingPunct));
  return POSITIVE_PHRASES.has(norm);
}

function matchesPrefixConsent(rawText: string): boolean {
  const commaIdx = rawText.search(/[,.]/u);
  if (commaIdx === -1) return false;
  const head = stripTrailingParticles(normalizeVi(rawText.slice(0, commaIdx)));
  if (!POSITIVE_PHRASES.has(head)) return false;
  const tail = normalizeVi(rawText.slice(commaIdx + 1));
  const hasNegation = NEGATIVE_TOKENS.some((neg) => tail.includes(neg));
  return !hasNegation;
}

/** SPEC-P03 §11.5: khop tat dinh danh sach tu (khong dung `?`). Xuat rieng
 * de test don vi. */
export function hasExplicitConsent(text: string): boolean {
  if (text.includes('?')) return false;
  return matchesExactConsent(text) || matchesPrefixConsent(text);
}

const definition: ToolDefinition = {
  name: 'open_service_case',
  description:
    'Mo ticket theo doi viec (service_case) sau khi cu dan DONG Y tim tho. Tool tu kiem su dong y tat dinh tu ' +
    'tin nhan moi nhat cua cu dan (o LUOT SAU luc hoi) — KHONG tin ket luan cua model.',
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

async function isAfterAwaitingConsentTransition(ctx: ToolContext): Promise<boolean> {
  const rows = await sql<{ t: string }>(
    `select created_at::text as t from job_events
     where job_id = $1 and to_status = 'awaiting_consent'
     order by created_at desc limit 1`,
    [ctx.jobId]
  );
  if (rows.length === 0) return false;
  return ctx.latestMessageCreatedAt > rows[0]!.t;
}

export const openServiceCaseTool: AgentTool<OpenServiceCaseInput, OpenServiceCaseOutput> = {
  definition,
  async run(ctx, input) {
    if (!ctx.jobId) {
      throw new ConflictError('open_service_case: chua co job.');
    }
    const jobs = await sql<{ status: string; category_code: string | null; responsibility: ResponsibilityVerdict | null }>(
      `select status, category_code, responsibility from jobs where id = $1`,
      [ctx.jobId]
    );
    const job = jobs[0];
    if (!job || job.status !== 'awaiting_consent') {
      throw new ConflictError('open_service_case: job khong o trang thai awaiting_consent.');
    }
    // SPEC-P03 §11.5: verdict da luu PHAI la 'resident' (chan ca 3d — model
    // doi verdict sang bql roi mo case voi verdict cu).
    if (job.responsibility?.party !== 'resident') {
      throw new ConflictError('open_service_case: verdict hien tai khong phai "resident".');
    }
    // Tin dong y phai o LUOT SAU luc job vao awaiting_consent (chan ca 3c —
    // mo case ngay trong luot dau tien, cu dan chua thay ket luan/khung gia).
    if (!(await isAfterAwaitingConsentTransition(ctx))) {
      throw new ConsentMissingError();
    }

    const explicit = hasExplicitConsent(ctx.latestText);
    const triageConsent =
      !explicit && ctx.triage !== null && ctx.triage.intent === 'consent' && ctx.triage.intent_confidence >= 0.8;
    if (!explicit && !triageConsent) {
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
