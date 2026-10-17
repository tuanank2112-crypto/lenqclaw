// packages/core/src/services/outbox-actions.ts — `enqueueAction`: dung body `action` hop le (01-CONTRACTS §8.3) roi `enqueue()`.
// Moi hanh dong quan tri ra Zalo cua core di qua day (BB-02/BB-06). Lop chan THU HAI cua BB-06 (lop cuoi la worker/sim):
// `remove_member` / `block_member` CHI duoc xep hang khi `approvals.status='approved'` khop thread/uid/kind — thieu ⇒
// `ApprovalRequiredError` (loi lap trinh, KHONG bat de xu ly tiep).

import { sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { ApprovalRequiredError, InvalidToolInputError } from '../domain/errors.js';
import type { AccountId, OutboxAction } from '../domain/types.js';

export type EnqueueActionArgs = OutboxAction & {
  threadId: string;
  account?: AccountId;
  /** `inbound_events.id` dang xu ly (do tin tra loi; tuy chon). */
  inboundEventId?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GATED_KIND = { remove_member: 'kick_member', block_member: 'block_member' } as const;

async function assertApproved(account: AccountId, threadId: string, action: 'remove_member' | 'block_member', uid: string, approvalId: unknown): Promise<void> {
  if (typeof approvalId !== 'string' || !UUID_RE.test(approvalId)) {
    throw new ApprovalRequiredError(`${action} can approvalId hop le.`);
  }
  const ok = await sql(
    `select 1 from approvals
      where id = $1::uuid and zalo_account_id = $2 and thread_id = $3 and kind = $4 and target_uid = $5 and status = 'approved'`,
    [approvalId, account, threadId, GATED_KIND[action], uid]
  );
  if (ok.length === 0) throw new ApprovalRequiredError(`${action}: the duyet khong o trang thai approved cho uid/nhom nay.`);
}

/** Xep MOT hang `outbox(kind='action')`. Tra `outbox.id`. */
export async function enqueueAction(a: EnqueueActionArgs): Promise<number> {
  const { threadId, account = 'community', inboundEventId, ...action } = a;
  if (threadId.trim() === '') throw new InvalidToolInputError('enqueueAction: thieu threadId.');

  switch (action.action) {
    case 'delete_message':
      if (!action.msgId || !action.cliMsgId || !action.uidFrom) throw new InvalidToolInputError('delete_message can msgId, cliMsgId, uidFrom (khong doan cliMsgId).');
      break;
    case 'remove_member':
    case 'block_member':
      await assertApproved(account, threadId, action.action, action.uid, action.approvalId);
      break;
    case 'review_join':
      if (action.uids.length === 0) throw new InvalidToolInputError('review_join can it nhat 1 uid.');
      break;
    default:
      break;
  }

  const id = await enqueue({
    zaloAccountId: account,
    threadId,
    threadType: 'group',
    kind: 'action',
    body: action,
    ...(inboundEventId !== undefined ? { inboundEventId } : {}),
  });
  return Number(id); // bigserial ⇒ pg tra chuoi
}
