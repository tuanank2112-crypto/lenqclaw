// node `group_event` (pipeline) — KHUNG cua P05 (join / join_request / leave / admin / setting, SPEC-P05 §6–§7).
// P03: chi audit `group.event_stub` (khong noi dung) roi `stop='group_event_done'`; nhom chua khai ⇒
// audit `group.event_unknown_group`. P05 dien than node.

import { sql } from '../../../../adapters/db.js';
import { audit } from '../../../../services/audit.js';
import { getGroup } from '../../buffer.js';
import type { NodeFn, PipelineStateT } from '../state.js';

export const groupEventNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const group = await getGroup(e.zaloAccountId, e.threadId);
  const event = (e.payload as { event?: unknown }).event;
  await audit(sql, {
    actorType: 'system',
    actorId: String(e.id),
    action: group ? 'group.event_stub' : 'group.event_unknown_group',
    target: e.threadId,
    data: { event: typeof event === 'string' ? event : null },
  });
  return { group, stop: 'group_event_done' };
};
