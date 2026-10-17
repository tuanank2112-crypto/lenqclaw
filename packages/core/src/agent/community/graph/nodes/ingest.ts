// node `ingest` (pipeline) — SPEC-P03 §2/§4.1, BB-11, BB-04. Nhom chua khai/tat ⇒ dung (khong ghi gi).
// Con lai: upsert thanh vien TRUOC `resolveRole`, chen dem, cat dem, danh dau "da tra loi".
// Tin cua chinh bot ⇒ dem roi `stop='self'` (D28: KHONG triage/kiem duyet tin cua bot).
// Outbox ✗, model ✗ (BB-15).

import { auditGroupDenied, getGroup, ingestGroupMessage } from '../../buffer.js';
import { resolveRole } from '../../roles.js';
import type { NodeFn, PipelineStateT } from '../state.js';

export const ingestNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const group = await getGroup(e.zaloAccountId, e.threadId);
  if (!group) {
    await auditGroupDenied(e.zaloAccountId, e.threadId, 'group_unknown');
    return { group: null, stop: 'group_unknown' };
  }
  if (!group.enabled) {
    await auditGroupDenied(e.zaloAccountId, e.threadId, 'group_disabled');
    return { group, stop: 'group_disabled' };
  }
  const row = await ingestGroupMessage(e);
  if (e.isSelf) return { group, row, stop: 'self' };
  const role = await resolveRole(e.zaloAccountId, e.senderUid, e.threadId);
  return { group, row, sender: { uid: e.senderUid, role } };
};
