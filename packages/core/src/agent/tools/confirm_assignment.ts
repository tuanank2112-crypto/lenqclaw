// packages/core/src/agent/tools/confirm_assignment.ts — SPEC-P05-Dispatch.md
// §10.6 buoc 5: tho XAC NHAN/BAO GIA cuoc dang giu (`held`). Bang chung y
// dinh + luoi khop gia §10.4.2/§10.4.4 truoc khi goi services/dispatch.ts.

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { confirmAssignment } from '../../services/dispatch.js';
import { readDispatchConfig } from '../../services/dispatch-config.js';
import { matchesConfirmPhrase, parsePriceVnd } from '../vendor-intent.js';
import { InvalidToolInputError, IntentNotConfirmedError, QuoteRequiredError } from '../../domain/errors.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';

export interface ConfirmAssignmentInput {
  job_code: string;
  price_vnd: number | null;
}

export type ConfirmAssignmentOutput =
  | { status: 'confirmed'; job_code: string }
  | { status: 'held'; awaiting_resident_price_consent: true; price_band: [number, number] };

const JOB_CODE_FORMAT_RE = /^C-[A-HJ-NP-Z2-9]{4}$/;

const definition: ToolDefinition = {
  name: 'confirm_assignment',
  description:
    'Tho XAC NHAN giu cuoc, hoac BAO GIA (mode bao gia). Tool tu kiem bang chung y dinh (OK/xac nhan/dong y hoac ' +
    'gia trung voi tin nhan tho vua gui), gia phai KHOP voi so doc duoc trong tin nhan cua chinh tho.',
  input_schema: {
    type: 'object',
    properties: {
      job_code: { type: 'string', description: 'Ma cuoc dang "C-XXXX"' },
      price_vnd: { type: ['number', 'null'], description: 'Gia bao (dong) neu cuoc mode bao gia, null neu khong bao gia' },
    },
    required: ['job_code', 'price_vnd'],
    additionalProperties: false,
  },
  strict: true,
};

export const confirmAssignmentTool: AgentTool<ConfirmAssignmentInput, ConfirmAssignmentOutput, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const normalizedCode = input.job_code.trim().toUpperCase();
    if (!JOB_CODE_FORMAT_RE.test(normalizedCode)) {
      throw new InvalidToolInputError(`confirm_assignment: "${input.job_code}" khong dung dang "C-XXXX".`);
    }

    const cfg = readDispatchConfig();
    const priceInText = parsePriceVnd(ctx.latestText);
    const intentOk =
      (ctx.triage &&
        (ctx.triage.intent === 'confirm' || ctx.triage.intent === 'quote') &&
        ctx.triage.intent_confidence >= cfg.vendorIntentMin) ||
      matchesConfirmPhrase(ctx.latestText, normalizedCode) ||
      (input.price_vnd != null && priceInText !== null);
    if (!intentOk) throw new IntentNotConfirmedError();

    if (input.price_vnd != null) {
      const matchesLattice = input.price_vnd === priceInText || input.price_vnd === (ctx.triage?.price_vnd ?? null);
      if (!matchesLattice) throw new QuoteRequiredError('gia khong khop tin nhan cua tho');
    }

    const result = await confirmAssignment({
      jobCode: normalizedCode,
      vendorId: ctx.vendorId,
      priceVnd: input.price_vnd,
      now: ctx.now,
    });

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.confirm_assignment',
      target: normalizedCode,
      data: { status: result.status, price_vnd: input.price_vnd },
    });

    if (result.status === 'confirmed') return { status: 'confirmed', job_code: normalizedCode };
    return { status: 'held', awaiting_resident_price_consent: true, price_band: result.priceBand };
  },
};
