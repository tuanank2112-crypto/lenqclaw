// packages/core/src/retrieval/search-knowledge.ts — truy hoi tri thuc cong dong
// Truy hoi LAI (SPEC-P04 §2): lexical top 20 + vector top 20 + RRF k=60; vector la tuy chon
// (loi/het gio/provider khong ho tro ⇒ lexical thuan, vectorRank=null).
// Doi ten tu `search-regulations.ts` cua ke hoach 01 (bo tham so toa nha va
// dieu kien `building_id`).
//
// N14 (R05): truoc day tu khoa duoc tach o TS nhung con nguyen dau/ky tu la
// (vd "ŉ", ky hieu Unicode), roi day thang cho `public.immutable_unaccent()`
// trong Postgres unaccent -- mot so ky tu la sau khi unaccent lai sinh ra ky
// tu dac biet cua cu phap tsquery (vd nhay don) => `to_tsquery` nem
// "syntax error". Sua: chuan hoa/bo dau NGAY TRONG TS (NFD, bo dau, đ->d,
// chu thuong), CHI GIU [a-z0-9], toi da 12 token — tham so gui xuong SQL vi
// vay CHI CON CHUA [a-z0-9] va dau `|`, an toan tuyet doi voi `to_tsquery`.

import { embedTexts } from '../adapters/model.js';
import { sql } from '../adapters/db.js';
import { EmbeddingUnavailableError, KnowledgeUnavailableError } from '../domain/errors.js';
import { audit } from '../services/audit.js';
import { readCommunityConfig } from '../services/community-config.js';
import { vnDateString } from '../services/vn-time.js';

export const DEFAULT_TOP_K = 8;
const MAX_TOKENS = 12;
/** Moi danh sach thanh phan (lexical, vector) lay top 20 truoc khi hop nhat. */
const LIST_SIZE = 20;
export const RRF_K = 60;

export interface KnowledgeHit {
  documentId: string;
  title: string;
  sectionId: string;
  heading: string | null;
  body: string;
  score: number;
  lexicalRank: number | null;
  vectorRank: number | null;
}

export interface SearchKnowledgeOpts {
  /** Mac dinh `KB_TOP_K` (8). */
  topK?: number;
  /** Mac dinh true. */
  useVector?: boolean;
  /** D31: han chot luot (epoch ms) — timeout embed = min(EMBED_TIMEOUT_MS, deadlineAt - now). */
  deadlineAt?: number;
  /** Thoi diem tinh "hieu luc theo ngay VN" (mac dinh bay gio). */
  now?: Date;
}

export interface SearchKnowledgeResult {
  hits: KnowledgeHit[];
  /** true khi buoc vector DA chay (co embedding truy van + truy van `<=>` thanh cong), du khong muc nao lot top K. */
  vectorUsed: boolean;
}

interface CandidateRow {
  document_id: string;
  title: string;
  section_id: string;
  heading: string | null;
  body: string;
}

/** Bo dau + ha chu thuong, CHI GIU [a-z0-9], tach token, toi da 12 token
 * (N14). Xuat rieng de test don vi. */
export function buildQueryTokens(queryVi: string): string[] {
  const stripped = queryVi
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

export interface RrfEntry {
  key: string;
  score: number;
  lexicalRank: number | null;
  vectorRank: number | null;
}

/**
 * Hop nhat RRF (THUAN): `score = Σ 1/(k + rank)` tren hai danh sach (rank 1-based, thu tu mang = thu tu xep hang).
 * Sap giam theo score; hoa: lexicalRank nho truoc (co truoc khong co), roi vectorRank, roi key. Khong cat topK o day.
 */
export function rrfMerge(lexical: readonly string[], vector: readonly string[], k: number = RRF_K): RrfEntry[] {
  const map = new Map<string, RrfEntry>();
  const touch = (key: string): RrfEntry => {
    let e = map.get(key);
    if (!e) {
      e = { key, score: 0, lexicalRank: null, vectorRank: null };
      map.set(key, e);
    }
    return e;
  };
  lexical.forEach((key, i) => {
    const e = touch(key);
    if (e.lexicalRank === null) {
      e.lexicalRank = i + 1;
      e.score += 1 / (k + i + 1);
    }
  });
  vector.forEach((key, i) => {
    const e = touch(key);
    if (e.vectorRank === null) {
      e.vectorRank = i + 1;
      e.score += 1 / (k + i + 1);
    }
  });
  const rankOrInf = (r: number | null): number => (r === null ? Number.POSITIVE_INFINITY : r);
  return [...map.values()].sort(
    (a, b) =>
      b.score - a.score ||
      rankOrInf(a.lexicalRank) - rankOrInf(b.lexicalRank) ||
      rankOrInf(a.vectorRank) - rankOrInf(b.vectorRank) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

const keyOf = (documentId: string, sectionId: string): string => `${documentId}\u0000${sectionId}`;

/** Dieu kien hop le: duyet + con hieu luc theo ngay VN (`dateParam` = tham so ngay 'YYYY-MM-DD'). */
const VALID_DOC = (dateParam: string): string =>
  `d.status = 'approved' and d.effective_from <= ${dateParam}::date and (d.effective_to is null or d.effective_to >= ${dateParam}::date)`;

function vectorLiteral(v: readonly number[]): string {
  return `[${v.join(',')}]`;
}

/** Audit `kb.embed_unavailable` toi da 1 lan/gio (khong bao gio nem). */
export async function auditEmbedUnavailable(now: Date, via: 'search' | 'embed_pending'): Promise<void> {
  try {
    const recent = await sql(
      `select 1 from audit_log where action = 'kb.embed_unavailable' and created_at > $1::timestamptz - interval '1 hour' limit 1`,
      [now]
    );
    if (recent.length > 0) return;
    await audit(sql, { actorType: 'system', actorId: null, action: 'kb.embed_unavailable', target: null, data: { via } });
  } catch {
    /* audit khong duoc lam hong truy hoi */
  }
}

/**
 * Truy hoi tri thuc LAI. Chuoi rong ⇒ rong, khong cham DB. Loi DB ⇒ `KnowledgeUnavailableError`.
 * Vector loi/het gio/provider khong ho tro ⇒ bo buoc, `vectorRank=null` (khong nem).
 */
export async function searchKnowledgeDetailed(queryVi: string, opts: SearchKnowledgeOpts = {}): Promise<SearchKnowledgeResult> {
  const expr = buildTsQueryExpr(queryVi);
  if (expr.length === 0) return { hits: [], vectorUsed: false };
  const cfg = readCommunityConfig();
  const topK = opts.topK ?? cfg.kbTopK;
  const now = opts.now ?? new Date();
  const today = vnDateString(now);
  const wantVector = opts.useVector !== false && cfg.embedProvider !== 'none';

  const embedding: Promise<number[] | null> = wantVector
    ? embedTexts([queryVi], {
        taskType: 'RETRIEVAL_QUERY',
        ...(opts.deadlineAt !== undefined ? { deadlineAt: opts.deadlineAt } : {}),
      }).then(
        (r) => r.vectors[0] ?? null,
        async (err: unknown) => {
          if (err instanceof EmbeddingUnavailableError && cfg.embedProvider === 'gemini') await auditEmbedUnavailable(now, 'search');
          return null;
        }
      )
    : Promise.resolve(null);

  try {
    const lexicalP = sql<CandidateRow>(
      `select s.document_id, d.title, s.section_id, s.heading, s.body
         from kb_sections s
         join kb_documents d on d.id = s.document_id
        where s.tsv @@ to_tsquery('simple', $1) and ${VALID_DOC('$2')}
        order by ts_rank_cd(s.tsv, to_tsquery('simple', $1), 32) desc, s.document_id, s.section_id
        limit ${LIST_SIZE}`,
      [expr, today]
    );
    const [lexicalRows, qvec] = await Promise.all([lexicalP, embedding]);

    let vectorRows: CandidateRow[] = [];
    let vectorUsed = false;
    if (qvec) {
      vectorRows = await sql<CandidateRow>(
        `select s.document_id, d.title, s.section_id, s.heading, s.body
           from kb_sections s
           join kb_documents d on d.id = s.document_id
          where s.embedding is not null and ${VALID_DOC('$2')}
          order by s.embedding <=> $1::vector, s.document_id, s.section_id
          limit ${LIST_SIZE}`,
        [vectorLiteral(qvec), today]
      );
      vectorUsed = true;
    }

    const rowsByKey = new Map<string, CandidateRow>();
    for (const r of [...lexicalRows, ...vectorRows]) rowsByKey.set(keyOf(r.document_id, r.section_id), r);
    const merged = rrfMerge(
      lexicalRows.map((r) => keyOf(r.document_id, r.section_id)),
      vectorRows.map((r) => keyOf(r.document_id, r.section_id))
    ).slice(0, topK);
    const hits = merged.map((m): KnowledgeHit => {
      const r = rowsByKey.get(m.key)!;
      return {
        documentId: r.document_id,
        title: r.title,
        sectionId: r.section_id,
        heading: r.heading,
        body: r.body,
        score: m.score,
        lexicalRank: m.lexicalRank,
        vectorRank: m.vectorRank,
      };
    });
    return { hits, vectorUsed };
  } catch (err) {
    throw new KnowledgeUnavailableError(
      `Khong truy hoi duoc tri thuc: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Chu ky SPEC-P04 §2: chi tra hit. */
export async function searchKnowledge(queryVi: string, opts: SearchKnowledgeOpts = {}): Promise<KnowledgeHit[]> {
  return (await searchKnowledgeDetailed(queryVi, opts)).hits;
}
