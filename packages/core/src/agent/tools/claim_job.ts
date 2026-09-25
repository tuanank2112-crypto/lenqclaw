// packages/core/src/agent/tools/claim_job.ts — SPEC-P05-Dispatch.md §10.6
// buoc 5 (BB-05, BB-10). Luat tu kiem THEO THU TU: (1) chuan hoa + dinh
// dang ma cuoc, (2) bang chung y dinh §10.4.4, (3) claimJob (§10.3.1).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { claimJob } from '../../services/dispatch.js';
import { readDispatchConfig } from '../../services/dispatch-config.js';
import { matchesClaimPhrase } from '../vendor-intent.js';
import { InvalidToolInputError, IntentNotConfirmedError } from '../../domain/errors.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';

export interface ClaimJobInput {
  job_code: string;
}

export type ClaimJobOutput =
  | { won: true; job_code: string; hold_expires_at: string; mode: 'fixed' | 'quote'; need_price: boolean }
  | { won: false; status: string };

const JOB_CODE_FORMAT_RE = /^C-[A-HJ-NP-Z2-9]{4}$/;

const definition: ToolDefinition = {
  name: 'claim_job',
  description:
    'Tho nhan giu mot cuoc dang dang trong nhom. Tool tu kiem dinh dang ma cuoc, bang chung y dinh cua tho ' +
    '(triage dat "claim" hoac cum "nhan <ma>" khop dung), roi thu giu bang UPDATE co dieu kien (ai nhanh nguoi ' +
    'do thang) — thua se tra { won:false }, KHONG nem loi.',
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

/** SPEC-P05-Dispatch.md §10.4.4: mã trong input hợp lệ khi NẰM TRONG
 * `ctx.jobCodesInText`, HOẶC (`jobCodesInText` rỗng ∧ đúng MỘT cuốc
 * `published` trong nhóm/tòa của thợ) — khi đó mã đó MỚI là mã hợp lệ. */
async function isCodeEvidenced(ctx: VendorToolContext, normalizedCode: string): Promise<boolean> {
  if (ctx.jobCodesInText.includes(normalizedCode)) return true;
  if (ctx.jobCodesInText.length > 0) return false;

  const params: unknown[] = [ctx.buildingIds];
  let filter = '';
  if (ctx.threadType === 'group' && ctx.groupTradeGroup) {
    filter = ' and c.trade_group = $2';
    params.push(ctx.groupTradeGroup);
  }
  const rows = await sql<{ code: string }>(
    `select j.code from jobs j join job_categories c on c.code = j.category_code
     where j.building_id = any($1::uuid[]) and j.status = 'published'${filter}`,
    params
  );
  return rows.length === 1 && rows[0]!.code === normalizedCode;
}

export const claimJobTool: AgentTool<ClaimJobInput, ClaimJobOutput, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const normalizedCode = input.job_code.trim().toUpperCase();
    if (!JOB_CODE_FORMAT_RE.test(normalizedCode)) {
      throw new InvalidToolInputError(`claim_job: "${input.job_code}" khong dung dang "C-XXXX".`);
    }

    const cfg = readDispatchConfig();
    const intentOk =
      (ctx.triage?.intent === 'claim' && ctx.triage.intent_confidence >= cfg.vendorIntentMin) ||
      matchesClaimPhrase(ctx.latestText, normalizedCode);
    if (!intentOk) throw new IntentNotConfirmedError();

    if (!(await isCodeEvidenced(ctx, normalizedCode))) {
      throw new IntentNotConfirmedError();
    }

    const result = await claimJob({ jobCode: normalizedCode, vendorId: ctx.vendorId, now: ctx.now, source: 'agent' });

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.claim_job',
      target: normalizedCode,
      data: { won: result.won },
    });

    if (!result.won) return { won: false, status: result.status };
    return {
      won: true,
      job_code: normalizedCode,
      hold_expires_at: result.holdExpiresAt.toISOString(),
      mode: result.mode,
      need_price: result.mode === 'quote',
    };
  },
};
