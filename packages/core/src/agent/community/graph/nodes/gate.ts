// node `gate` (pipeline) — cong nhan tin nhom (SPEC-P03 §3): doc persona (namePatterns, cache 60 s) roi
// `decideGroupInbound` (THUAN). admitted ∧ trigger ≠ ambient ⇒ dung `TurnRequest{group_mention}`; ambient ⇒ de
// `defer` lo; con lai ⇒ `stop='not_admitted'`. Bang 01-CONTRACTS §12.3: `gate` CHI DOC DB (khong ghi, khong audit),
// outbox ✗, model ✗ (BB-15) — ly do tu choi nam o `PipelineState.gateDecision.reason` (D35.12: kenh khong the trung ten node `gate`; khong audit sender_denied/sender_not_allowed — `group.denied` audit o `ingest`).

import { resolveBotUid } from '../../bot.js';
import { decideGroupInbound, hasControlCommand } from '../../gate.js';
import { loadPersonaBundle } from '../../persona.js';
import type { NodeFn, PipelineStateT, TurnRequest } from '../state.js';

export const gateNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const p = e.payload as { text?: unknown; msg_type?: unknown; mentions?: unknown; quote?: unknown };
  const text = typeof p.text === 'string' ? p.text : '';
  let botNamePatterns: RegExp[] = [];
  try {
    botNamePatterns = (await loadPersonaBundle(e.zaloAccountId)).namePatterns;
  } catch {
    botNamePatterns = [];
  }
  const mentions = Array.isArray(p.mentions)
    ? (p.mentions as Array<{ uid?: unknown }>).filter((m): m is { uid: string } => typeof m?.uid === 'string')
    : [];
  const quoteOwnerUid =
    p.quote && typeof p.quote === 'object' && typeof (p.quote as { owner_id?: unknown }).owner_id === 'string'
      ? (p.quote as { owner_id: string }).owner_id
      : null;
  const sender = s.sender ?? { uid: e.senderUid, role: 'stranger' as const };
  const decision = decideGroupInbound({
    isSelf: e.isSelf,
    group: s.group
      ? { enabled: s.group.enabled, mode: s.group.mode, allowUsers: s.group.allowUsers, denyUsers: s.group.denyUsers }
      : null,
    sender,
    botUid: resolveBotUid(process.env, e.zaloAccountId, e.threadId),
    text,
    msgType: typeof p.msg_type === 'string' ? p.msg_type : 'webchat',
    mentions,
    quoteOwnerUid,
    botNamePatterns,
    hasControlCommand: hasControlCommand(text),
  });

  if (!decision.admitted) return { gateDecision: decision, stop: 'not_admitted' };
  if (decision.trigger === 'ambient') return { gateDecision: decision };

  const turnRequest: TurnRequest = {
    kind: 'group_mention',
    account: e.zaloAccountId,
    threadId: e.threadId,
    threadType: 'group',
    requester: { uid: sender.uid, role: sender.role },
    trigger: decision.trigger,
    mustReply: decision.mustReply,
    focusMessageIds: s.row ? [s.row.id] : [],
    triage: null,
    inboundEventId: e.id,
    receivedAt: 0,
    claimedAt: 0,
    triageMs: null,
  };
  return { gateDecision: decision, turnRequest };
};
