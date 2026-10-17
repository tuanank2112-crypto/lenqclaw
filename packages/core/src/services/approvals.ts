// packages/core/src/services/approvals.ts — the duyet (SPEC-P05 §5, D19, BB-06). Tao the → DM owner; owner/moderator/staff
// quyet; approve ⇒ `enqueueAction` theo kind; pacer/sim bao ket qua qua `completeApproval`; qua han ⇒ `expireApprovals`.
// Bang chung y dinh TAT DINH (`hasDecisionEvidence`, port IntentNotConfirmedError): model KHONG tu quyet thay nguoi.

import { sql, tx } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { normalizeVi } from '../agent/community/redact.js';
import { resolveRole } from '../agent/community/roles.js';
import { APPROVAL_DM, APPROVAL_EXPIRED_DM } from '../agent/community/prompts/system.js';
import { ConflictError, InvalidToolInputError, ToolNotAllowedError } from '../domain/errors.js';
import type { AccountId } from '../domain/types.js';
import { audit } from './audit.js';
import { readCommunityConfig } from './community-config.js';
import { enqueueAction } from './outbox-actions.js';
import { enqueueSystemEvent } from './system-events.js';

export type ApprovalKind = 'kick_member' | 'block_member' | 'reject_join' | 'approve_join' | 'announce';
export type ApprovalRequestedBy = 'agent' | 'moderation' | 'timer' | 'staff';

export const ID_SHORT_LEN = 8;
/** 8 ky tu dau cua uuid — ma nguoi quyet go lai. */
export const idShortOf = (id: string): string => id.slice(0, ID_SHORT_LEN);

// ---------------------------------------------------------------------------
// §5.4 bang chung tat dinh (THUAN)
// ---------------------------------------------------------------------------

const APPROVE_WORDS = ['duyet', 'ok', 'dong y', 'approve'] as const; // "/approve" ⇒ normalizeVi ⇒ "approve"
const REJECT_WORDS = ['tu choi', 'khong', 'reject'] as const; // "/reject" ⇒ "reject"

const hasPhrase = (normalized: string, phrase: string): boolean => ` ${normalized} `.includes(` ${phrase} `);

/**
 * `text` cua nguoi quyet PHAI chua ma the (`idShort` 8 ky tu, hoac uuid day du — doan dau cung la 8 ky tu do; chap nhan
 * tien to >= 6 ky tu) VA mot tu quyet dinh, so BANG NHAU theo ranh gioi tu sau `normalizeVi`.
 * Tra `'approve' | 'reject' | null`. Co ca hai loai tu (vd "khong duyet <id>") ⇒ `'reject'` (an toan hon).
 */
export function hasDecisionEvidence(text: string, idOrShort: string): 'approve' | 'reject' | null {
  const short = idOrShort.trim().toLowerCase().slice(0, ID_SHORT_LEN);
  if (short.length < 6) return null;
  const n = normalizeVi(text);
  const tokens = n.split(' ');
  const idHit = tokens.some((t) => t.length >= 6 && short.startsWith(t));
  if (!idHit) return null;
  if (REJECT_WORDS.some((w) => hasPhrase(n, w))) return 'reject';
  if (APPROVE_WORDS.some((w) => hasPhrase(n, w))) return 'approve';
  return null;
}

// ---------------------------------------------------------------------------
// the duyet
// ---------------------------------------------------------------------------

export interface ApprovalRow {
  id: string;
  zaloAccountId: AccountId;
  kind: ApprovalKind;
  threadId: string;
  targetUid: string | null;
  reason: string;
  payload: Record<string, unknown>;
  requestedBy: ApprovalRequestedBy;
  requesterUid: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';
  expiresAt: string;
  outboxId: number | null;
}

interface ApprovalDb {
  id: string;
  zalo_account_id: AccountId;
  kind: ApprovalKind;
  thread_id: string;
  target_uid: string | null;
  reason: string;
  payload: Record<string, unknown> | null;
  requested_by: ApprovalRequestedBy;
  requester_uid: string | null;
  status: ApprovalRow['status'];
  expires_at: string;
  outbox_id: string | number | null;
}

const COLS = `id::text as id, zalo_account_id, kind, thread_id, target_uid, reason, payload, requested_by, requester_uid, status,
  expires_at::text as expires_at, outbox_id`;

const toRow = (r: ApprovalDb): ApprovalRow => ({
  id: r.id,
  zaloAccountId: r.zalo_account_id,
  kind: r.kind,
  threadId: r.thread_id,
  targetUid: r.target_uid,
  reason: r.reason,
  payload: r.payload ?? {},
  requestedBy: r.requested_by,
  requesterUid: r.requester_uid,
  status: r.status,
  expiresAt: r.expires_at,
  outboxId: r.outbox_id === null ? null : Number(r.outbox_id),
});

export async function getApproval(id: string): Promise<ApprovalRow | null> {
  const rows = await sql<ApprovalDb>(`select ${COLS} from approvals where id = $1::uuid`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** Tim the theo ma nguoi dung go (uuid day du hoac tien to hex >= 6 ky tu). Mo ho (>1) hoac khong thay ⇒ `ConflictError`. */
export async function findApprovalByRef(account: AccountId, ref: string, opts: { pendingOnly?: boolean } = {}): Promise<ApprovalRow> {
  const r = ref.trim().toLowerCase();
  if (!/^[0-9a-f-]{6,36}$/.test(r)) throw new InvalidToolInputError('approval_id phai la ma the (uuid hoac >= 6 ky tu dau).');
  const rows = await sql<ApprovalDb>(
    `select ${COLS} from approvals where zalo_account_id = $1 and id::text like $2 ${opts.pendingOnly ? `and status = 'pending'` : ''} order by created_at desc limit 3`,
    [account, `${r}%`]
  );
  if (rows.length === 0) throw new ConflictError('Khong tim thay the duyet voi ma nay.');
  if (rows.length > 1) throw new ConflictError('Ma the mo ho (khop nhieu the); go day du hon.');
  return toRow(rows[0]!);
}

async function ownerUids(account: AccountId): Promise<string[]> {
  const rows = await sql<{ zalo_uid: string }>(`select zalo_uid from account_owners where zalo_account_id = $1 order by created_at, zalo_uid`, [account]);
  return rows.map((r) => r.zalo_uid);
}

async function dmOwners(account: AccountId, text: string): Promise<number> {
  const owners = await ownerUids(account);
  for (const uid of owners) await enqueue({ zaloAccountId: account, threadId: uid, threadType: 'user', kind: 'text', body: { text } });
  return owners.length;
}

async function names(account: AccountId, threadId: string, targetUid: string | null): Promise<{ group: string | null; target: string | null }> {
  const g = await sql<{ name: string | null }>(`select name from zalo_groups where zalo_account_id = $1 and thread_id = $2`, [account, threadId]);
  let target: string | null = null;
  if (targetUid) {
    const m = await sql<{ display_name: string | null }>(
      `select display_name from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3`,
      [account, threadId, targetUid]
    );
    target = m[0]?.display_name ?? (typeof targetUid === 'string' ? targetUid : null);
  }
  return { group: g[0]?.name ?? null, target };
}

export interface CreateApprovalArgs {
  account: AccountId;
  kind: ApprovalKind;
  threadId: string;
  targetUid?: string | null;
  reason: string;
  payload?: Record<string, unknown>;
  requestedBy: ApprovalRequestedBy;
  requesterUid?: string | null;
  now: Date;
}

/** §5.1: `expires_at = now + APPROVAL_TTL_HOURS`; DM owner; trung (cung kind/thread/target dang `pending`) ⇒ tra the cu, KHONG DM lai. */
export async function createApproval(a: CreateApprovalArgs): Promise<{ id: string; created: boolean }> {
  const cfg = readCommunityConfig();
  const expiresAt = new Date(a.now.getTime() + cfg.approvalTtlHours * 3_600_000);
  const target = a.targetUid ?? null;
  const key = `approval:${a.account}:${a.kind}:${a.threadId}:${target ?? ''}`;
  const out = await tx(async (q) => {
    await q(`select pg_advisory_xact_lock(hashtext($1))`, [key]);
    const dup = await q<{ id: string }>(
      `select id::text as id from approvals
        where zalo_account_id = $1 and kind = $2 and thread_id = $3 and target_uid is not distinct from $4 and status = 'pending' limit 1`,
      [a.account, a.kind, a.threadId, target]
    );
    if (dup[0]) return { id: dup[0].id, created: false };
    const ins = await q<{ id: string }>(
      `insert into approvals (zalo_account_id, kind, thread_id, target_uid, reason, payload, requested_by, requester_uid, expires_at, created_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) returning id::text as id`,
      [a.account, a.kind, a.threadId, target, a.reason.slice(0, 500), JSON.stringify(a.payload ?? {}), a.requestedBy, a.requesterUid ?? null, expiresAt, a.now]
    );
    await audit(q, { actorType: a.requestedBy === 'agent' ? 'agent' : 'system', actorId: a.requesterUid ?? null, action: 'approval.pending', target: ins[0]!.id, data: { kind: a.kind, thread: a.threadId } });
    return { id: ins[0]!.id, created: true };
  });
  if (out.created) {
    const n = await names(a.account, a.threadId, target);
    await dmOwners(a.account, APPROVAL_DM(idShortOf(out.id), a.kind, n.group, n.target, a.reason));
  }
  return out;
}

export interface DecideApprovalArgs {
  id: string;
  decision: 'approve' | 'reject';
  /** `'staff:<uuid>'` | `'zalo:<uid>'`. */
  decidedBy: string;
  note?: string;
  now: Date;
}

/** §5.3: Zalo ⇒ owner, hoac moderator cua DUNG nhom cua the; staff ⇒ route web da xac thuc (admin/operator). */
async function assertMayDecide(card: ApprovalRow, decidedBy: string): Promise<void> {
  if (decidedBy.startsWith('staff:') && decidedBy.length > 6) return;
  if (decidedBy.startsWith('zalo:') && decidedBy.length > 5) {
    const role = await resolveRole(card.zaloAccountId, decidedBy.slice(5), card.threadId);
    if (role === 'owner' || role === 'moderator') return;
  }
  throw new ToolNotAllowedError('Chi chu (owner) hoac quan tri vien cua dung nhom nay moi duoc quyet the duyet.');
}

async function applyJoinDecision(card: ApprovalRow, decision: 'approved' | 'rejected', by: string, now: Date, reason: string | null): Promise<void> {
  if (!card.targetUid) return;
  await sql(
    `update join_requests set decision = $4, decided_by = $5, decided_at = $6, reason = $7
      where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and decision = 'pending'`,
    [card.zaloAccountId, card.threadId, card.targetUid, decision, by, now, reason]
  );
}

/** Thi hanh theo kind khi approve (§5.2). Tra `outbox.id`. */
async function executeApproved(card: ApprovalRow): Promise<number | null> {
  const base = { threadId: card.threadId, account: card.zaloAccountId } as const;
  switch (card.kind) {
    case 'kick_member':
      return enqueueAction({ ...base, action: 'remove_member', uid: card.targetUid ?? '', approvalId: card.id });
    case 'block_member':
      return enqueueAction({ ...base, action: 'block_member', uid: card.targetUid ?? '', approvalId: card.id });
    case 'approve_join':
      return enqueueAction({ ...base, action: 'review_join', uids: [card.targetUid ?? ''], approve: true, approvalId: card.id });
    case 'reject_join':
      return enqueueAction({ ...base, action: 'review_join', uids: [card.targetUid ?? ''], approve: false, approvalId: card.id });
    case 'announce': {
      const text = typeof card.payload.text === 'string' ? card.payload.text.trim() : '';
      if (text === '') throw new InvalidToolInputError('The announce thieu payload.text.');
      return enqueue({ zaloAccountId: card.zaloAccountId, threadId: card.threadId, threadType: 'group', kind: 'text', body: { text } });
    }
  }
}

/**
 * §5.2: CAS `pending → approved|rejected` (qua han hoac sai trang thai ⇒ `ConflictError`); approve ⇒ `enqueueAction` theo
 * kind (loi xep hang ⇒ tra the ve `pending` roi nem lai — khong de the `approved` mo coi); reject the `approve_join` ⇒
 * `review_join approve:false` (nguoi da quyet). `announce` da duoc xep hang ⇒ danh dau `executed` ngay.
 */
export async function decideApproval(a: DecideApprovalArgs): Promise<{ status: 'approved' | 'rejected'; outboxId: number | null }> {
  const found = await sql<ApprovalDb>(`select ${COLS} from approvals where id = $1::uuid`, [a.id]);
  if (!found[0]) throw new ConflictError('Khong tim thay the duyet.');
  const card = toRow(found[0]);
  await assertMayDecide(card, a.decidedBy);

  const to = a.decision === 'approve' ? 'approved' : 'rejected';
  const cas = await tx(async (q) => {
    const rows = await q<{ id: string }>(
      `update approvals set status = $2, decided_by = $3, decided_at = $4, decision_note = $5
        where id = $1::uuid and status = 'pending' and expires_at > $4 returning id::text as id`,
      [a.id, to, a.decidedBy, a.now, a.note ?? null]
    );
    if (rows.length === 0) return false;
    await audit(q, { actorType: a.decidedBy.startsWith('staff:') ? 'staff' : 'human', actorId: a.decidedBy, action: `approval.${to}`, target: a.id, data: { by: a.decidedBy, kind: card.kind } });
    return true;
  });
  if (!cas) throw new ConflictError('The khong con o trang thai cho duyet (da quyet hoac het han).');

  let outboxId: number | null = null;
  try {
    if (a.decision === 'approve') {
      outboxId = await executeApproved(card);
    } else if (card.kind === 'approve_join' && card.targetUid) {
      outboxId = await enqueueAction({ threadId: card.threadId, account: card.zaloAccountId, action: 'review_join', uids: [card.targetUid], approve: false });
    }
  } catch (err) {
    await sql(`update approvals set status = 'pending', decided_by = null, decided_at = null, decision_note = null where id = $1::uuid and status = $2 and outbox_id is null`, [a.id, to]);
    throw err;
  }

  if (card.kind === 'approve_join' || card.kind === 'reject_join') {
    // approve_join: duyet ⇒ approved, tu choi ⇒ rejected · reject_join: duyet ⇒ rejected (nguoi xin bi tu choi), tu choi ⇒ khong doi.
    const joinDecision: 'approved' | 'rejected' | null =
      card.kind === 'approve_join' ? (a.decision === 'approve' ? 'approved' : 'rejected') : a.decision === 'approve' ? 'rejected' : null;
    if (joinDecision) await applyJoinDecision(card, joinDecision, a.decidedBy, a.now, a.note ?? card.reason);
  }
  if (outboxId !== null) await sql(`update approvals set outbox_id = $2 where id = $1::uuid`, [a.id, outboxId]);
  if (a.decision === 'approve' && card.kind === 'announce') {
    await completeApproval(a.id, true, { queued_outbox: outboxId });
  }
  return { status: to, outboxId };
}

/** §5.5: pacer/sim bao ket qua. `approved → executed|failed` (CAS; khong khop ⇒ bo qua) + su kien `approval_executed` ⇒ DM owner. */
export async function completeApproval(id: string, ok: boolean, result: unknown): Promise<void> {
  const to = ok ? 'executed' : 'failed';
  const rows = await sql<{ thread_id: string }>(
    `update approvals set status = $2, executed_at = coalesce(executed_at, now()), result = $3::jsonb
      where id = $1::uuid and status = 'approved' returning thread_id`,
    [id, to, JSON.stringify(result ?? null)]
  );
  if (rows.length === 0) return;
  await audit(sql, { actorType: 'system', actorId: null, action: `approval.${to}`, target: id, data: { ok } });
  await enqueueSystemEvent({ event: 'approval_executed', approvalId: id, threadId: rows[0]!.thread_id });
}

/** Timer: the `pending` qua `expires_at` ⇒ `expired` + DM owner 1 lan. Tra so the het han. `onlyThreadIds`: chi de test (khong cham the that tren DB dev — G34). */
export async function expireApprovals(now: Date, opts: { onlyThreadIds?: readonly string[] } = {}): Promise<number> {
  const rows = await sql<{ id: string; kind: string; zalo_account_id: AccountId }>(
    `update approvals set status = 'expired'
      where status = 'pending' and expires_at <= $1 and ($2::text[] is null or thread_id = any($2::text[]))
      returning id::text as id, kind, zalo_account_id`,
    [now, opts.onlyThreadIds ? [...opts.onlyThreadIds] : null]
  );
  for (const r of rows) {
    await audit(sql, { actorType: 'system', actorId: null, action: 'approval.expired', target: r.id, data: { kind: r.kind } });
    await dmOwners(r.zalo_account_id, APPROVAL_EXPIRED_DM(idShortOf(r.id), r.kind));
  }
  return rows.length;
}
