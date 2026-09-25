// packages/core/src/agent/tools/dispatch_to_vendor.ts — SPEC-P05-Dispatch.md
// §10.6 buoc 7: giao viec cho tho sau khi BQL da duyet ticket cap quyen.
// KHONG bao gio tra `JobReveal` cho model — `dispatchToVendor` tu gui
// thang DM tho (BB-11).

import { sql } from '../../adapters/db.js';
import { audit } from '../../services/audit.js';
import { dispatchToVendor } from '../../services/access.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { VendorToolContext } from '../vendor-tool-context.js';

export interface DispatchToVendorInput {
  job_code: string;
}

export interface DispatchToVendorOutput {
  status: 'dispatched';
  job_code: string;
}

const definition: ToolDefinition = {
  name: 'dispatch_to_vendor',
  description:
    'Giao viec cho tho SAU KHI ticket cap quyen vao toa da duoc BQL duyet — tool tu gui so can/ma vao toa THANG ' +
    'DM cho tho, KHONG tra thong tin do cho model.',
  input_schema: {
    type: 'object',
    properties: {
      job_code: { type: 'string' },
    },
    required: ['job_code'],
    additionalProperties: false,
  },
  strict: true,
};

export const dispatchToVendorTool: AgentTool<DispatchToVendorInput, DispatchToVendorOutput, VendorToolContext> = {
  definition,
  async run(ctx, input) {
    const normalizedCode = input.job_code.trim().toUpperCase();
    const result = await dispatchToVendor({ jobCode: normalizedCode, vendorId: ctx.vendorId, now: ctx.now });

    await audit(sql, {
      actorType: 'vendor',
      actorId: ctx.vendorId,
      action: 'tool.dispatch_to_vendor',
      target: result.jobId,
      data: {},
    });

    return { status: 'dispatched', job_code: normalizedCode };
  },
};
