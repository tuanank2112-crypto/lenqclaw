// packages/core/src/retrieval/search-regulations.ts — truy hoi quy che CHI
// TU KHOA (SPEC-P03-Resident-Agent.md §10.4). Port cach dung tu khoa cua
// `D:\build phase\lib\retrieval\query.ts` (OR cac tu qua `to_tsquery`, cung
// ham bo dau ca hai chieu — G18 cua ban goc). `embedding` de NULL (Đ17-b):
// truy hoi LAI (lexical+embedding) BI CAM o P03 (§10.7) — day la lexical
// THUAN, khong phai "truy hoi lai".

import { sql } from '../adapters/db.js';
import { RegulationUnavailable } from '../domain/errors.js';

export const DEFAULT_TOP_K = 8;

export interface RegulationHit {
  documentId: string;
  sectionId: string;
  heading: string | null;
  body: string;
  status: 'approved' | 'draft' | 'deprecated';
  effectiveFrom: string;
  effectiveTo: string | null;
  score: number;
}

interface RegulationRow {
  document_id: string;
  section_id: string;
  heading: string | null;
  body: string;
  status: 'approved' | 'draft' | 'deprecated';
  effective_from: string;
  effective_to: string | null;
  score: number;
}

/**
 * Chuan hoa cau hoi thanh bieu thuc `tsquery` dang OR: `"be | boi | tre"`.
 * Moi ky tu khong phai chu/so bi loai TRUOC khi noi — khong co toan tu
 * `tsquery` nao lot tu dau vao nguoi dung. Chuoi rong => tap rong, KHONG
 * chay SQL (`to_tsquery('')` nem loi cu phap) — SPEC-P03 §10.4.
 */
export function buildTsQueryExpr(queryVi: string): string {
  return queryVi
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' | ');
}

/**
 * Truy hoi quy che theo tu khoa, top K theo `ts_rank_cd(..., 32)`. Chuoi
 * rong => tra mang rong, khong cham DB. Loi DB => `RegulationUnavailable`
 * (01-CONTRACTS §9).
 */
export async function searchRegulations(
  queryVi: string,
  topK: number = DEFAULT_TOP_K
): Promise<RegulationHit[]> {
  const expr = buildTsQueryExpr(queryVi);
  if (expr.length === 0) return [];

  try {
    const rows = await sql<RegulationRow>(
      // R03: ep `::text` cho hai cot `date` — `pg` tra `Date`, khong phai
      // chuoi (xem ghi chu cung loi o classify_responsibility.ts).
      `select s.document_id, s.section_id, s.heading, s.body,
              d.status, d.effective_from::text as effective_from, d.effective_to::text as effective_to,
              ts_rank_cd(s.tsv, to_tsquery('simple', public.immutable_unaccent($1)), 32) as score
       from kb_sections s
       join kb_documents d on d.id = s.document_id
       where s.tsv @@ to_tsquery('simple', public.immutable_unaccent($1))
       order by score desc
       limit $2`,
      [expr, topK]
    );
    return rows.map((r) => ({
      documentId: r.document_id,
      sectionId: r.section_id,
      heading: r.heading,
      body: r.body,
      status: r.status,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      score: Number(r.score),
    }));
  } catch (err) {
    throw new RegulationUnavailable(
      `Khong truy hoi duoc quy che: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
