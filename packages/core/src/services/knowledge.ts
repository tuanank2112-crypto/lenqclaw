// packages/core/src/services/knowledge.ts — kho tri thuc cong dong (SPEC-P04 §1, §5).
// `upsertDocument` · `embedPending` (timer P07 §2 buoc 9) · `findUnansweredQuestions` + `pickUnanswered` (buoc 4).
// Truy hoi lai nam o `retrieval/search-knowledge.ts`. KHONG log noi dung tai lieu/tin.

import { sql, tx } from '../adapters/db.js';
import { embedTexts } from '../adapters/model.js';
import { EmbeddingUnavailableError, InvalidToolInputError } from '../domain/errors.js';
import { auditEmbedUnavailable } from '../retrieval/search-knowledge.js';
import { audit } from './audit.js';
import { readCommunityConfig, type CommunityConfig } from './community-config.js';
import { enqueueSystemEvent } from './system-events.js';

/** SPEC-P04 §1: moi `body` <= 4000 ky tu (dashboard tach muc). */
export const MAX_SECTION_BODY = 4000;
/** Moi lan thu embed tai lieu hang loat (khong co han chot luot): rong hon EMBED_TIMEOUT_MS cua truy van. */
const EMBED_DOC_TIMEOUT_MS = 20_000;

export interface KnowledgeSectionInput {
  sectionId: string;
  heading: string | null;
  body: string;
}

export interface UpsertDocumentInput {
  id: string;
  title: string;
  version: string;
  status: 'approved' | 'draft' | 'deprecated';
  /** 'YYYY-MM-DD' */
  effectiveFrom: string;
  effectiveTo?: string | null;
  source?: string | null;
  tags?: string[];
  sections: KnowledgeSectionInput[];
}

export interface UpsertDocumentResult {
  inserted: number;
  changed: number;
  unchanged: number;
  removed: number;
}

/**
 * Upsert tai lieu + muc trong MOT transaction. Muc khong con trong danh sach ⇒ xoa; muc doi `heading`/`body` ⇒
 * `embedding=null, embedded_at=null, embedding_model=null` (de `embedPending` nhung lai); muc giu nguyen ⇒ khong cham.
 * `body` > 4000 ky tu hoac `sectionId` trung ⇒ `InvalidToolInputError` (khong ghi gi).
 */
export async function upsertDocument(doc: UpsertDocumentInput): Promise<UpsertDocumentResult> {
  const seen = new Set<string>();
  for (const s of doc.sections) {
    if (s.body.length > MAX_SECTION_BODY) {
      throw new InvalidToolInputError(`Muc '${s.sectionId}' dai ${s.body.length} ky tu (toi da ${MAX_SECTION_BODY}).`);
    }
    if (seen.has(s.sectionId)) throw new InvalidToolInputError(`sectionId trung: '${s.sectionId}'.`);
    seen.add(s.sectionId);
  }
  return tx(async (q) => {
    await q(
      `insert into kb_documents (id, title, version, status, effective_from, effective_to, source, tags, updated_at)
       values ($1,$2,$3,$4,$5::date,$6::date,$7,$8::text[], now())
       on conflict (id) do update
         set title = excluded.title, version = excluded.version, status = excluded.status,
             effective_from = excluded.effective_from, effective_to = excluded.effective_to,
             source = excluded.source, tags = excluded.tags, updated_at = now()`,
      [doc.id, doc.title, doc.version, doc.status, doc.effectiveFrom, doc.effectiveTo ?? null, doc.source ?? null, doc.tags ?? []]
    );
    const existing = await q<{ section_id: string; heading: string | null; body: string }>(
      `select section_id, heading, body from kb_sections where document_id = $1`,
      [doc.id]
    );
    const byId = new Map(existing.map((r) => [r.section_id, r]));
    const res: UpsertDocumentResult = { inserted: 0, changed: 0, unchanged: 0, removed: 0 };
    for (const s of doc.sections) {
      const old = byId.get(s.sectionId);
      if (!old) {
        await q(`insert into kb_sections (document_id, section_id, heading, body) values ($1,$2,$3,$4)`, [doc.id, s.sectionId, s.heading, s.body]);
        res.inserted++;
      } else if (old.body !== s.body || old.heading !== s.heading) {
        await q(
          `update kb_sections set heading = $3, body = $4, embedding = null, embedded_at = null, embedding_model = null
            where document_id = $1 and section_id = $2`,
          [doc.id, s.sectionId, s.heading, s.body]
        );
        res.changed++;
      } else {
        res.unchanged++;
      }
    }
    const keep = doc.sections.map((s) => s.sectionId);
    const del = await q<{ section_id: string }>(
      `delete from kb_sections where document_id = $1 and not (section_id = any($2::text[])) returning section_id`,
      [doc.id, keep]
    );
    res.removed = del.length;
    return res;
  });
}

function vectorLiteral(v: readonly number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Nhung toi da `limit` muc `embedding is null` cua tai lieu `approved` (SPEC-P04 §1). `EMBED_PROVIDER=none` ⇒ 0, khong cham gi.
 * `EmbeddingUnavailableError` ⇒ audit `kb.embed_unavailable` (<= 1/gio) + dung buoc, tra 0, KHONG nem.
 * `onlyDocumentIds` (tuy chon, cho test/dashboard "Nhung lai" tung tai lieu): chi xet cac tai lieu do. Chi ghi vector neu `body` khong doi giua luc doc va luc ghi (tranh vector cu de len noi dung moi). Tra so muc da nhung.
 */
export async function embedPending(limit: number = 50, now: Date = new Date(), onlyDocumentIds?: readonly string[]): Promise<number> {
  const cfg = readCommunityConfig();
  if (cfg.embedProvider === 'none') return 0;
  const rows = await sql<{ document_id: string; section_id: string; body: string }>(
    `select s.document_id, s.section_id, s.body
       from kb_sections s join kb_documents d on d.id = s.document_id
      where s.embedding is null and d.status = 'approved'
        and ($2::text[] is null or s.document_id = any($2::text[]))
      order by s.document_id, s.section_id
      limit $1`,
    [limit, onlyDocumentIds ? [...onlyDocumentIds] : null]
  );
  if (rows.length === 0) return 0;
  let vectors: number[][];
  let model: string;
  try {
    const r = await embedTexts(
      rows.map((x) => x.body),
      { taskType: 'RETRIEVAL_DOCUMENT', timeoutMs: EMBED_DOC_TIMEOUT_MS }
    );
    vectors = r.vectors;
    model = r.model;
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      await auditEmbedUnavailable(now, 'embed_pending');
      return 0;
    }
    throw err;
  }
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const done = await sql<{ x: number }>(
      `update kb_sections set embedding = $4::vector, embedded_at = $5::timestamptz, embedding_model = $6
        where document_id = $1 and section_id = $2 and body = $3 and embedding is null
        returning 1 as x`,
      [r.document_id, r.section_id, r.body, vectorLiteral(vectors[i]!), now, model]
    );
    n += done.length;
  }
  return n;
}

export interface UnansweredQuestion {
  groupMessageId: number;
  threadId: string;
}

/**
 * SPEC-P04 §5: cau hoi `is_question`, `received_at <= now - UNANSWERED_AFTER_MIN` va `> now - UNANSWERED_MAX_AGE_HOURS`,
 * chua `answered_at`/`deleted_at`, khong `is_self`, nhom `enabled` + `mode='ambient'`, va KHONG co tin sau do (cung nhom,
 * nguoi gui khac, chua xoa) quote no hoac mention nguoi hoi. `limit UNANSWERED_MAX_PER_TICK`. `now` la THAM SO.
 * `scope.excludeThreads` = thread dang chay (D31) — bo qua, khong danh dau; `scope.onlyThreads` (tuy chon, cho test) = chi xet cac thread do.
 */
export async function findUnansweredQuestions(
  now: Date,
  cfg: CommunityConfig = readCommunityConfig(),
  scope: { excludeThreads?: readonly string[]; onlyThreads?: readonly string[] } = {}
): Promise<UnansweredQuestion[]> {
  const rows = await sql<{ id: number; thread_id: string }>(
    `select m.id::int as id, m.thread_id
       from group_messages m
       join zalo_groups g on g.zalo_account_id = m.zalo_account_id and g.thread_id = m.thread_id
      where m.zalo_account_id = 'community'
        and m.is_question and m.answered_at is null and m.deleted_at is null and not m.is_self
        and m.received_at <= $1::timestamptz - make_interval(mins => $2)
        and m.received_at >  $1::timestamptz - make_interval(hours => $3)
        and g.enabled and g.mode = 'ambient'
        and not (m.thread_id = any($5::text[]))
        and ($6::text[] is null or m.thread_id = any($6::text[]))
        and not exists (
          select 1 from group_messages r
           where r.zalo_account_id = m.zalo_account_id and r.thread_id = m.thread_id
             and r.id > m.id and r.sender_uid <> m.sender_uid and r.deleted_at is null
             and (r.quote_msg_id = m.zalo_msg_id
                  or r.mentions @> jsonb_build_array(jsonb_build_object('uid', m.sender_uid))))
      order by m.received_at, m.id
      limit $4`,
    [now, cfg.unansweredAfterMin, cfg.unansweredMaxAgeHours, cfg.unansweredMaxPerTick, [...(scope.excludeThreads ?? [])], scope.onlyThreads ? [...scope.onlyThreads] : null]
  );
  return rows.map((r) => ({ groupMessageId: r.id, threadId: r.thread_id }));
}

/**
 * Buoc timer `pickUnanswered` (P07 §2 buoc 4): moi cau tim duoc ⇒ danh dau `answered_at = now` (da xu ly — khong nhat lai
 * du agent im) + audit `unanswered.picked` + `enqueueSystemEvent({event:'unanswered_question', …})`. Tra so cau da nhat.
 * Danh dau bang `update … where answered_at is null returning` — hai tien trinh khong nhat trung mot cau.
 */
export async function pickUnanswered(
  now: Date,
  cfg: CommunityConfig = readCommunityConfig(),
  busyThreads: ReadonlySet<string> = new Set(),
  onlyThreads?: readonly string[]
): Promise<number> {
  const found = await findUnansweredQuestions(now, cfg, { excludeThreads: [...busyThreads], ...(onlyThreads ? { onlyThreads } : {}) });
  let n = 0;
  for (const f of found) {
    const claimed = await sql<{ id: number }>(
      `update group_messages set answered_at = $2::timestamptz where id = $1 and answered_at is null returning id::int as id`,
      [f.groupMessageId, now]
    );
    if (claimed.length === 0) continue;
    await audit(sql, {
      actorType: 'system',
      actorId: null,
      action: 'unanswered.picked',
      target: f.threadId,
      data: { thread: f.threadId, groupMessageId: f.groupMessageId },
    });
    await enqueueSystemEvent({ event: 'unanswered_question', threadId: f.threadId, groupMessageId: f.groupMessageId });
    n++;
  }
  return n;
}
