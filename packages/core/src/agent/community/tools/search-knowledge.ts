// tool `search_knowledge` — truy hoi kho tri thuc (SPEC-P04 §3; P03 dung ban lexical co san, P04 nang
// len truy hoi lai). `extendsDeadline`: goi tool nay nang luot tuong tac tu lan fast len rag (D31).

import { sql } from '../../../adapters/db.js';
import { searchKnowledge } from '../../../retrieval/search-knowledge.js';
import { audit } from '../../../services/audit.js';
import { readCommunityConfig } from '../../../services/community-config.js';
import { buildQueryTokens } from '../../../retrieval/search-knowledge.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const MAX_TOP_K = 12;
const QUOTE_CHARS = 600;

const definition: ToolDefinition = {
  name: 'search_knowledge',
  description:
    'Tra kho tri thức công khai của cộng đồng (tài liệu về AI agent, Zalo, chăm sóc khách hàng bằng AI). Gọi TRƯỚC khi trả lời câu hỏi kiến thức; trả các mục liên quan để trích dẫn.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Câu hỏi hoặc từ khoá cần tra.' },
      top_k: { type: 'integer', description: 'Số mục tối đa (mặc định theo cấu hình, tối đa 12).' },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

/** Cat `body` con <= 600 ky tu quanh token khop dau tien. */
export function excerptAround(body: string, query: string): string {
  if (body.length <= QUOTE_CHARS) return body;
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of buildQueryTokens(query)) {
    at = lower.indexOf(t);
    if (at >= 0) break;
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - 100);
  return `${start > 0 ? '…' : ''}${body.slice(start, start + QUOTE_CHARS)}…`;
}

export const searchKnowledgeTool: AgentTool<{ query: string; top_k?: number }> = {
  definition,
  extendsDeadline: true,
  async run(ctx, input) {
    const cfg = readCommunityConfig();
    const topK = Math.max(1, Math.min(input.top_k ?? cfg.kbTopK, MAX_TOP_K));
    const hits = await searchKnowledge(input.query, topK);
    const titles = new Map<string, string>();
    if (hits.length > 0) {
      const ids = [...new Set(hits.map((h) => h.documentId))];
      const rows = await sql<{ id: string; title: string }>(`select id, title from kb_documents where id = any($1::text[])`, [ids]);
      for (const r of rows) titles.set(r.id, r.title);
    }
    await audit(sql, { actorType: 'agent', actorId: ctx.requester?.uid ?? null, action: 'kb.search', target: ctx.threadId, data: { hits: hits.length, vector: false } });
    return {
      hits: hits.map((h) => ({
        document_id: h.documentId,
        title: titles.get(h.documentId) ?? null,
        section_id: h.sectionId,
        heading: h.heading,
        quote: excerptAround(h.body, input.query),
      })),
      note: 'Trích dẫn dạng: (theo <tên tài liệu> · <mục>). Không có hit liên quan thì nói rõ chưa có tài liệu.',
    };
  },
};
