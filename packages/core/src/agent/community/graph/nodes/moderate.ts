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
    return out.deleted ? { moderation, stop: 'deleted' } : { moderation };
  } catch (err) {
    await audit(sql, {
      actorType: 'system',
      actorId: String(s.event.id),
      action: 'moderation.error',
      target: s.event.threadId,
      data: { error: err instanceof Error ? err.name : 'unknown' },
    }).catch(() => undefined);
    return {};
  }
};
