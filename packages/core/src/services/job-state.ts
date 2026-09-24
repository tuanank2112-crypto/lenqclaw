// packages/core/src/services/job-state.ts — may trang thai cuoc (jobs.status),
// 01-CONTRACTS.md §5 + SPEC-P01-Foundation.md §5.

import type { TxSqlFn } from '../adapters/db.js';
import { ConflictError, IllegalTransitionError } from '../domain/errors.js';
import type { JobStatus } from '../domain/types.js';

export interface Transition {
  from: JobStatus;
  to: JobStatus;
}

/** Cac trang thai truoc `in_progress` (theo thu tu §5) — dung de bung dong
 * "moi trang thai truoc in_progress -> cancelled" ra tung cap. */
const STATES_BEFORE_IN_PROGRESS: JobStatus[] = [
  'drafting',
  'routed_bql',
  'awaiting_consent',
  'case_open',
  'published',
  'held',
  'confirmed',
  'access_pending',
  'access_granted',
  'dispatched',
];

/** Chep dung bang §5 01-CONTRACTS.md. */
export const TRANSITIONS: ReadonlyArray<Transition> = [
  { from: 'drafting', to: 'routed_bql' },
  { from: 'drafting', to: 'awaiting_consent' },
  { from: 'awaiting_consent', to: 'case_open' },
  { from: 'awaiting_consent', to: 'cancelled' },
  { from: 'case_open', to: 'published' },
  { from: 'published', to: 'held' },
  { from: 'held', to: 'confirmed' },
  { from: 'held', to: 'published' },
  { from: 'confirmed', to: 'access_pending' },
  { from: 'access_pending', to: 'access_granted' },
  { from: 'access_pending', to: 'published' },
  { from: 'access_granted', to: 'dispatched' },
  { from: 'published', to: 'unassigned' },
  { from: 'dispatched', to: 'in_progress' },
  { from: 'in_progress', to: 'awaiting_acceptance' },
  { from: 'awaiting_acceptance', to: 'accepted' },
  { from: 'awaiting_acceptance', to: 'disputed' },
  { from: 'accepted', to: 'closed' },
  ...STATES_BEFORE_IN_PROGRESS.map((from) => ({ from, to: 'cancelled' as JobStatus })),
];

function isTransitionAllowed(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export interface TransitionJobArgs {
  jobId: string;
  from: JobStatus;
  to: JobStatus;
  actorType: string;
  actorId: string | null;
  data?: Record<string, unknown> | null;
}

/**
 * Chuyen trang thai mot cuoc. Cap (from -> to) khong co trong `TRANSITIONS`
 * => `IllegalTransitionError`, KHONG cham DB (loi lap trinh, caller khong
 * bat de xu ly tiep). Cap hop le: `UPDATE ... WHERE status = from`; 0 dong
 * => `ConflictError`; co dong => `INSERT job_events` trong CUNG `q` (caller
 * truyen `q` cua `tx`).
 *
 * R02-tham-dinh G1: `q` PHAI la `TxSqlFn` (marker `__tx` gan boi `tx()` luc
 * runtime) — truyen `sql` thuong (ngoai transaction) se nem loi ngay, tranh
 * ca doi trang thai thanh cong ma thieu `job_events` do mot lenh la client
 * khac cua pool.
 */
export async function transitionJob(q: TxSqlFn, args: TransitionJobArgs): Promise<void> {
  const { jobId, from, to, actorType, actorId, data } = args;
  if (!isTransitionAllowed(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  if (!q.__tx) {
    throw new Error('transitionJob() phai duoc goi voi q cua tx() — khong duoc truyen sql cua pool.');
  }
  const rows = await q<{ id: string }>(
    `update jobs set status = $1, updated_at = now() where id = $2 and status = $3 returning id`,
    [to, jobId, from]
  );
  if (rows.length === 0) {
    throw new ConflictError(
      `Cuoc ${jobId} khong con o trang thai "${from}" — khong the chuyen sang "${to}".`
    );
  }
  await q(
    `insert into job_events (job_id, from_status, to_status, actor_type, actor_id, data)
     values ($1,$2,$3,$4,$5,$6)`,
    [jobId, from, to, actorType, actorId, data ? JSON.stringify(data) : null]
  );
}
