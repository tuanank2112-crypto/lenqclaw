// node `system_event` (pipeline) — su kien he thong tren `inbound_events` (SPEC-P03 §2, §4.3, BB-04):
// chong gia mao (`zalo_msg_id` phai `sys-%` va `payload.kind='system'`), roi chon loai luot.
//   ambient_flush        ⇒ luot group_ambient_flush           unanswered_question ⇒ luot group_unanswered
//   approval_executed    ⇒ DM owner APPROVAL_RESULT_DM, KHONG luot model
//   welcome_flush · join_request · automation ⇒ KHUNG (P05/P07): audit `system.unhandled`, `stop='system_no_turn'`
// Outbox: CHI `APPROVAL_RESULT_DM` (bang 01-CONTRACTS §12.3). Model ✗.

import { sql } from '../../../../adapters/db.js';
import { enqueue } from '../../../../adapters/transport.js';
import { audit } from '../../../../services/audit.js';
import { getGroup } from '../../buffer.js';
import { APPROVAL_RESULT_DM } from '../../prompts/system.js';
import { firstOwnerUid } from '../../roles.js';
import type { NodeFn, PipelineStateT, TurnRequest } from '../state.js';

function baseRequest(s: PipelineStateT): Omit<TurnRequest, 'kind' | 'trigger' | 'mustReply' | 'focusMessageIds'> {
  const e = s.event;
  return {
    account: e.zaloAccountId,
    threadId: e.threadId,
    threadType: e.threadType,
    requester: null,
    triage: null,
    inboundEventId: e.id,
    receivedAt: 0,
    claimedAt: 0,
    triageMs: null,
  };
}

export const systemEventNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const p = e.payload as { kind?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (!e.zaloMsgId.startsWith('sys-') || p.kind !== 'system') {
    await audit(sql, { actorType: 'system', actorId: String(e.id), action: 'router.forged_system_event', target: e.threadId, data: null });
    return { stop: 'forged_system_event' };
  }
  const data = p.data ?? {};

  switch (p.event) {
    case 'ambient_flush': {
      const group = await getGroup(e.zaloAccountId, e.threadId);
      if (!group || !group.enabled) {
        await audit(sql, { actorType: 'system', actorId: String(e.id), action: 'ambient.group_disabled', target: e.threadId, data: null });
        return { group, stop: 'system_no_turn' };
      }
      return {
        group,
        turnRequest: { ...baseRequest(s), kind: 'group_ambient_flush', trigger: 'ambient', mustReply: false, focusMessageIds: [] },
      };
    }
    case 'unanswered_question': {
      const group = await getGroup(e.zaloAccountId, e.threadId);
      const id = Number(data.groupMessageId);
      if (!group || !group.enabled || !Number.isInteger(id)) {
        await audit(sql, { actorType: 'system', actorId: String(e.id), action: 'unanswered.skip', target: e.threadId, data: null });
        return { group, stop: 'system_no_turn' };
      }
      return {
        group,
        turnRequest: { ...baseRequest(s), kind: 'group_unanswered', trigger: null, mustReply: false, focusMessageIds: [id] },
      };
    }
    case 'approval_executed': {
      const approvalId = String(data.approvalId ?? '');
      const rows = approvalId
        ? await sql<{ kind: string; status: string }>(`select kind, status from approvals where id = $1::uuid`, [approvalId])
        : [];
      const owner = await firstOwnerUid(e.zaloAccountId);
      if (rows[0] && owner) {
        await enqueue({
          zaloAccountId: e.zaloAccountId,
          threadId: owner,
          threadType: 'user',
          kind: 'text',
          body: { text: APPROVAL_RESULT_DM(approvalId, rows[0].kind, rows[0].status) },
        });
      }
      return { stop: 'system_no_turn' };
    }
    default: {
      // welcome_flush · join_request · automation (P05/P07) hoac loai la.
      await audit(sql, {
        actorType: 'system',
        actorId: String(e.id),
        action: 'system.unhandled',
        target: e.threadId,
        data: { event: typeof p.event === 'string' ? p.event : null },
      });
      return { stop: 'system_no_turn' };
    }
  }
};
