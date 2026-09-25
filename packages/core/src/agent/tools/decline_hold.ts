// packages/core/src/agent/tools/decline_hold.ts — SPEC-P05-Dispatch.md
// §10.6: tho RUT khoi cuoc dang giu/da xac nhan/dang xin quyen.

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { readDispatchConfig } from '../../services/dispatch-config.js';
import { releaseHold, withdrawConfirmed } from '../../services/dispatch.js';
import { matchesDeclinePhrase } from '../vendor-intent.js';
import {
  ConflictError,
  IneligibleVendorError,
  IntentNotConfirmedError,
  InvalidToolInputError,
  JobNotFoundError,
} from '../../domain/errors.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';
import type { JobStatus } from '../../domain/types.js';

export interface DeclineHoldInput {
  job_code: string;
}

export interface DeclineHoldOutput {
  status: 'published';
  job_code: string;
}

const JOB_CODE_FORMAT_RE = /^C-[A-HJ-NP-Z2-9]{4}$/;

const definition: ToolDefinition = {
  name: 'decline_hold',
  description: 'Tho RUT khoi cuoc dang giu/da xac nhan/dang xin quyen vao toa — cuoc dang lai cho tho khac.',
  input_schema: {
    type: 'object',
    properties: {
      job_code: { type: 'string', description: 'Ma cuoc dang "C-XXXX"' },
    },
    required: ['job_code'],
    additionalProperties: false,
  },
  strict: true,
};

export const declineHoldTool: AgentTool<DeclineHoldInput, DeclineHoldOutput, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const normalizedCode = input.job_code.trim().toUpperCase();
    if (!JOB_CODE_FORMAT_RE.test(normalizedCode)) {
      throw new InvalidToolInputError(`decline_hold: "${input.job_code}" khong dung dang "C-XXXX".`);
    }

    const cfg = readDispatchConfig();
    const intentOk =
      (ctx.triage?.intent === 'decline' && ctx.triage.intent_confidence >= cfg.vendorIntentMin) ||
      matchesDeclinePhrase(ctx.latestText, normalizedCode);
    if (!intentOk) throw new IntentNotConfirmedError();

    const jobRows = await sql<{ id: string; status: JobStatus; assigned_vendor_id: string | null }>(
      `select id, status, assigned_vendor_id from jobs where code = $1`,
      [normalizedCode]
    );
    const job = jobRows[0];
    if (!job) throw new JobNotFoundError();
    if (job.assigned_vendor_id !== ctx.vendorId) throw new IneligibleVendorError('not_assigned');

    if (job.status === 'held') {
      await releaseHold({ jobId: job.id, now: ctx.now, reason: 'vendor_declined', actor: { type: 'vendor', id: ctx.vendorId } });
    } else if (job.status === 'confirmed' || job.status === 'access_pending') {
      await withdrawConfirmed({ jobId: job.id, now: ctx.now, reason: 'vendor_declined', actor: { type: 'vendor', id: ctx.vendorId } });
    } else {
      throw new ConflictError(`decline_hold: cuộc đang ở "${job.status}", cần "held"/"confirmed"/"access_pending".`);
    }

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.decline_hold',
      target: job.id,
      data: { from_status: job.status },
    });

    return { status: 'published', job_code: normalizedCode };
  },
};
