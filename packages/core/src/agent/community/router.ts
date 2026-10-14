// packages/core/src/agent/community/router.ts — KHUNG router cua agent cong dong
// (SPEC-P01 §3). P01 chi de repo bien dich va runner chay duoc; toan bo logic
// that (ingest nhom, kiem duyet, cong nhan tin, luot agent) la P03+.
//   - su kien he thong (`sender_uid='system'`)  => audit `system.unhandled`
//   - tin nhom                                  => audit `group.ingest_stub`, KHONG tra loi
//   - DM                                        => `STUB_DM_REPLY` qua `enqueue`

import { sql } from '../../adapters/db.js';
import { enqueue, type InboundEvent } from '../../adapters/transport.js';
import { audit } from '../../services/audit.js';

/** Cau tra loi tam cho DM cho toi khi P03 lam runtime that. */
export const STUB_DM_REPLY = 'Trợ lý đang được nâng cấp, bạn quay lại sau nhé.';

async function handleSystemEvent(e: InboundEvent): Promise<void> {
  const event = (e.payload as { event?: unknown }).event;
  await audit(sql, {
    actorType: 'system',
    actorId: String(e.id),
    action: 'system.unhandled',
    target: e.threadId,
    data: { event: typeof event === 'string' ? event : null },
  });
}

/** Khung: chi ghi audit, khong luu tin, khong tra loi (khong noi dung tin trong audit). */
async function ingestGroupMessage(e: InboundEvent): Promise<void> {
  await audit(sql, {
    actorType: 'system',
    actorId: String(e.id),
    action: 'group.ingest_stub',
    target: e.threadId,
    data: null,
  });
}

export async function routeInboundEvent(e: InboundEvent): Promise<void> {
  if (e.senderUid === 'system') return handleSystemEvent(e);
  if (e.threadType === 'group') return ingestGroupMessage(e);
  await enqueue({
    zaloAccountId: e.zaloAccountId,
    threadId: e.threadId,
    threadType: 'user',
    kind: 'text',
    body: { text: STUB_DM_REPLY },
  });
}
