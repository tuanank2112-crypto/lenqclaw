// node `moderate` (pipeline) — kiem duyet tin nhom TRUOC cong (SPEC-P05 §3–§4, 01-CONTRACTS §12.3). Goi `moderateGroupMessage`
// (luoi tat dinh + triage + thang canh cao). Tin bi xoa ⇒ `stop='deleted'` ⇒ canh `afterModerate` ⇒ END (spam khong duoc tra loi).
// Loi kiem duyet KHONG chan duong tra loi: ghi audit `moderation.error` (chi ten loi) roi di tiep. Khong them/bot node hay canh (BB-16).

import { sql } from '../../../../adapters/db.js';
import { audit } from '../../../../services/audit.js';
import { moderateGroupMessage } from '../../../../services/moderation.js';
import type { NodeFn, PipelineStateT } from '../state.js';

export const moderateNode: NodeFn<PipelineStateT> = async (s) => {
  if (!s.group || !s.row || !s.sender) return {};
  try {
    const out = await moderateGroupMessage(s.row, s.triageResult, {
      account: s.event.zaloAccountId,
      group: s.group,
      sender: s.sender,
      now: new Date(),
      inboundEventId: s.event.id,
    });
    const moderation = { verdict: out.verdict, action: out.action, exempt: out.exempt };
    // D41/F3+F6: tin bi xoa HOAC bi xu ly kiem duyet (ke ca chi canh cao khi bot khong la pho nhom) ⇒ khong chay cong/luot.
    return out.deleted || (!out.exempt && out.action !== 'none') ? { moderation, stop: 'deleted' } : { moderation };
  } catch (err) {
    await audit(sql, {
      actorType: 'system',
      actorId: String(s.event.id),
      action: 'moderation.error',
      target: s.event.threadId,
      data: { error: err instanceof Error ? err.name : 'unknown' },
    }).catch(() => undefined);
    // D41/F11: loi SAU khi da xep lenh xoa tin ⇒ tin van "da bi kiem duyet lay khoi luong" (khong tra loi spam).
    const queued = await sql(
      `select 1 from outbox where zalo_account_id = $1 and thread_id = $2 and kind = 'action' and body->>'action' = 'delete_message' and body->>'msgId' = $3 limit 1`,
      [s.event.zaloAccountId, s.event.threadId, s.row.zaloMsgId]
    ).catch(() => []);
    return queued.length > 0 ? { stop: 'deleted' } : {};
  }
};
