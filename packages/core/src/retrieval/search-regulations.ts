// packages/core/src/retrieval/search-regulations.ts — truy hoi quy che CHI
// TU KHOA (SPEC-P03-Resident-Agent.md §10.4, §11.4, N14). Port cach dung tu
// khoa cua `D:\build phase\lib\retrieval\query.ts`. `embedding` de NULL
// (Đ17-b): truy hoi LAI (lexical+embedding) BI CAM o P03 (§10.7) — day la
// lexical THUAN, khong phai "truy hoi lai".
//
// N14 (R05): truoc day tu khoa duoc tach o TS nhung con nguyen dau/ky tu la
// (vd "ŉ", ky hieu Unicode), roi day thang cho `public.immutable_unaccent()`
// trong Postgres unaccent -- mot so ky tu la sau khi unaccent lai sinh ra ky
// tu dac biet cua cu phap tsquery (vd nhay don) => `to_tsquery` nem
// "syntax error". Sua: chuan hoa/bo dau NGAY TRONG TS (NFD, bo dau, đ->d,
// chu thuong), CHI GIU [a-z0-9], toi da 12 token — tham so gui xuong SQL vi
// vay CHI CON CHUA [a-z0-9] va dau `|`, an toan tuyet doi voi `to_tsquery`.

import { sql } from '../adapters/db.js';
import { RegulationUnavailable } from '../domain/errors.js';

export const DEFAULT_TOP_K = 8;
const MAX_TOKENS = 12;

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

/** Bo dau + ha chu thuong, CHI GIU [a-z0-9], tach token, toi da 12 token
 * (N14). Xuat rieng de test don vi. */
export function buildQueryTokens(queryVi: string): string[] {
  const stripped = queryVi
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
  return stripped
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && /^[a-z0-9]+$/.test(t))
    .slice(0, MAX_TOKENS);
}

/**
 * Chuan hoa cau hoi thanh bieu thuc `tsquery` dang OR: `"be | boi | tre"`.
 * Chi chua [a-z0-9|] va khoang trang (N14) — an toan voi `to_tsquery`. Chuoi
 * rong => tap rong, KHONG chay SQL (`to_tsquery('')` nem loi cu phap).
 */
export function buildTsQueryExpr(queryVi: string): string {
  return buildQueryTokens(queryVi).join(' | ');
}

/**
 * Truy hoi quy che theo tu khoa, GIOI HAN trong `buildingId` (§11.4 — trich
 * dan cua toa khac coi nhu khong ton tai), top K theo `ts_rank_cd(..., 32)`.
 * Chuoi rong => tra mang rong, khong cham DB. Loi DB => `RegulationUnavailable`.
 */
export async function searchRegulations(
  queryVi: string,
  buildingId: string,
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
              ts_rank_cd(s.tsv, to_tsquery('simple', $1), 32) as score
       from kb_sections s
       join kb_documents d on d.id = s.document_id
       where s.tsv @@ to_tsquery('simple', $1) and d.building_id = $3
       order by score desc
       limit $2`,
      [expr, topK, buildingId]
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
