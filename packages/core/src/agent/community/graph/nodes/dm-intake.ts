// node `dm_intake` (pipeline) — nhan tin rieng (SPEC-P03 §5.1 buoc 1–3, BB-04): vai + hoi thoai + luu tin;
// takeover ⇒ im; tin khong phai chu ⇒ TEXT_ONLY_REPLY. DM la tin GOI BOT ⇒ khong triage (D31 T3).
// Outbox: CHI `TEXT_ONLY_REPLY` (bang 01-CONTRACTS §12.3). Model ✗.

import { enqueue } from '../../../../adapters/transport.js';
import { getOrCreateConversation, saveMessage } from '../../../conversation.js';
import { TEXT_ONLY_REPLY } from '../../prompts/system.js';
import { resolveRole } from '../../roles.js';
import type { NodeFn, PipelineStateT, TurnRequest } from '../state.js';

export const dmIntakeNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const p = e.payload as { kind?: unknown; text?: unknown };
  const text = typeof p.text === 'string' ? p.text : '';
  const role = await resolveRole(e.zaloAccountId, e.senderUid, null);
  const conv = await getOrCreateConversation(e.zaloAccountId, e.threadId, 'user', role === 'owner' ? 'owner' : role === 'member' ? 'member' : 'stranger');
  const saved = await saveMessage(conv.id, 'in', 'user', text);
  const sender = { uid: e.senderUid, role };

  if (conv.human_takeover_until && new Date(conv.human_takeover_until).getTime() > Date.now()) {
    return { sender, stop: 'takeover' };
  }
  if (p.kind === 'unsupported') {
    await enqueue({ zaloAccountId: e.zaloAccountId, threadId: e.threadId, threadType: 'user', kind: 'text', body: { text: TEXT_ONLY_REPLY } });
    return { sender, stop: 'unsupported' };
  }
  const turnRequest: TurnRequest = {
    kind: role === 'owner' ? 'owner_dm' : 'dm',
    account: e.zaloAccountId,
    threadId: e.threadId,
    threadType: 'user',
    requester: sender,
    trigger: null,
    mustReply: false,
    focusMessageIds: [],
    dm: { conversationId: conv.id, latestText: text, latestMessageId: saved.id },
    triage: null,
    inboundEventId: e.id,
    receivedAt: 0,
    claimedAt: 0,
    triageMs: null,
  };
  return { sender, turnRequest };
};
