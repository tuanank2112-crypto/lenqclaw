// packages/core/src/agent/tools/search_regulations.ts — SPEC-P03 §10.3
// buoc 2, goi retrieval/search-regulations.ts (chi tu khoa, §10.4).

import { audit } from '../../services/audit.js';
import { sql } from '../../adapters/db.js';
import { searchRegulations } from '../../retrieval/search-regulations.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';
import type { ToolContext } from '../tool-context.js';

export interface SearchRegulationsInput {
  query: string;
}

export interface RegulationResultItem {
  document_id: string;
  section_id: string;
  heading: string | null;
  body: string;
  status: 'approved' | 'draft' | 'deprecated';
  effective_from: string;
  effective_to: string | null;
}

const definition: ToolDefinition = {
  name: 'search_regulations',
  description:
    'Truy hoi quy che phan dinh trach nhiem theo tu khoa (hien tuong + vi tri). Tra ve toi da 8 muc, kem ' +
    'trang thai hieu luc (status/effective_from/effective_to) de dung khi phan loai trach nhiem.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Tu khoa tieng Viet: hien tuong + vi tri, vd "ro ri duong ong phong tam"' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  strict: true,
};

export const searchRegulationsTool: AgentTool<SearchRegulationsInput, { results: RegulationResultItem[] }> = {
  definition,
  async run(ctx: ToolContext, input) {
    const hits = await searchRegulations(input.query, ctx.buildingId);
    await audit(sql, {
      actorType: 'agent',
      actorId: ctx.residentId,
      action: 'tool.search_regulations',
      target: ctx.jobId,
      data: { query: input.query, hits: hits.length },
    });
    return {
      results: hits.map((h) => ({
        document_id: h.documentId,
        section_id: h.sectionId,
        heading: h.heading,
        body: h.body,
        status: h.status,
        effective_from: h.effectiveFrom,
        effective_to: h.effectiveTo,
      })),
    };
  },
};
