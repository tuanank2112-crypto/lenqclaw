// node `deliver` (turn) — thi hanh quyet dinh ket thuc luot (SPEC-P03 §6.4–§6.5, §10): `decideDelivery` va `hostText` la
// ham THUAN (graph/edges.ts); node nay chi lam tac dung phu theo ket qua. Tin nhom host gui qua `postGroupText`
// (dung chung voi tool); DM qua `enqueue`. BB-05: luot mustReply LUON co dung mot tin ra; text cuoi cua luot khong
// bat buoc tra loi (ambient...) la RIENG TU — chi luu `messages {private:true}` cho dashboard, KHONG dang.

import { sql } from '../../../../adapters/db.js';
import { enqueue } from '../../../../adapters/transport.js';
import type { DmTurnContext, GroupTurnContext } from '../../../../domain/types.js';
import { audit } from '../../../../services/audit.js';
import { applyJoinDefault } from '../../../../services/join-requests.js';
import { saveMessage } from '../../../conversation.js';
import { postGroupText } from '../../group-post.js';
import { handoffToOwner } from '../../handoff.js';
import { parseBotName, loadPersonaBundle } from '../../persona.js';
import { BUSY_DM_REPLY, MODEL_DOWN_DM_REPLY } from '../../prompts/system.js';
import { firstOwnerUid } from '../../roles.js';
import { isGroupCtx } from '../../tools/ctx-guards.js';
import { decideDelivery, hostText, isCapped } from '../edges.js';
import type { NodeFn, TurnStateT } from '../state.js';

async function hostVars(ctx: GroupTurnContext): Promise<{ names: string[]; groupName: string | null; botName: string }> {
  let botName = 'Claw';
  try {
    botName = parseBotName((await loadPersonaBundle(ctx.account)).identity);
  } catch {
    /* giu mac dinh */
  }
  const uids = ctx.joinedUids ?? [];
  let names: string[] = [];
  if (uids.length > 0) {
    const rows = await sql<{ zalo_uid: string; display_name: string | null }>(
      `select zalo_uid, display_name from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = any($3::text[])`,
      [ctx.account, ctx.threadId, uids]
    );
    const byUid = new Map(rows.map((r) => [r.zalo_uid, r.display_name]));
    names = uids.map((u) => byUid.get(u) ?? u);
  }
  return { names, groupName: ctx.group.name, botName };
}

async function sendDm(s: TurnStateT, conversationId: string, text: string): Promise<void> {
  await enqueue({
    zaloAccountId: s.request.account,
    threadId: s.request.threadId,
    threadType: 'user',
    kind: 'text',
    body: { text },
    inboundEventId: s.request.inboundEventId,
  });
  await saveMessage(conversationId, 'out', 'assistant', text);
}

export const deliverNode: NodeFn<TurnStateT> = async (s) => {
  const { delivery, outcome } = decideDelivery(s);
  const req = s.request;
  const ctx = s.ctx;
  const capped = isCapped(s);
  let hostPosted = 0;

  if (capped) await audit(sql, { actorType: 'system', actorId: null, action: 'turn.round_cap', target: req.threadId, data: { rounds: s.rounds } });
  if (s.stop === 'refusal') await audit(sql, { actorType: 'system', actorId: null, action: 'agent.refusal', target: req.threadId, data: null });
  const handoffReason = outcome === 'refusal' ? 'model_refusal' : capped ? 'agent_loop_limit' : null;

  switch (delivery) {
    case 'none': {
      // BB-05: text cuoi RIENG TU cua luot nhom khong bat buoc tra loi (ambient...) — luu cho dashboard, khong dang.
      // (Luot mustReply da tra loi bang tool: cau chot kieu "xong" khong phai suy nghi dang luu.)
      if (ctx && isGroupCtx(ctx) && !req.mustReply && s.finalText !== '') {
        await saveMessage(ctx.conversationId, 'out', 'assistant', s.finalText, { private: true });
      }
      break;
    }
    case 'auto_post': {
      if (!ctx || !isGroupCtx(ctx)) throw new Error('deliver: auto_post can ngu canh nhom.');
      await postGroupText(ctx, { text: s.finalText, replyToMsgId: ctx.focusMessages[0]?.id ?? null, by: 'host', quoteOptional: true });
      await audit(sql, { actorType: 'system', actorId: null, action: 'turn.auto_posted_final', target: req.threadId, data: null });
      hostPosted = 1;
      break;
    }
    case 'fallback': {
      if (!ctx || !isGroupCtx(ctx)) throw new Error('deliver: fallback can ngu canh nhom.');
      const text = hostText(req, 'fallback', await hostVars(ctx));
      await postGroupText(ctx, { text, replyToMsgId: req.kind === 'group_welcome' ? null : (ctx.focusMessages[0]?.id ?? null), by: 'host', quoteOptional: true });
      await audit(sql, { actorType: 'system', actorId: null, action: 'turn.fallback_reply', target: req.threadId, data: null });
      hostPosted = 1;
      if (req.trigger !== null) await handoffToOwner(ctx, handoffReason ?? 'no_reply', { takeover: false });
      break;
    }
    case 'model_down': {
      await audit(sql, { actorType: 'system', actorId: null, action: 'agent.model_error', target: req.threadId, data: { deadline: s.deadlineHit } });
      if (!ctx) break;
      if (isGroupCtx(ctx)) {
        if (req.mustReply) {
          const text = hostText(req, 'model_down', await hostVars(ctx));
          await postGroupText(ctx, { text, replyToMsgId: req.kind === 'group_welcome' ? null : (ctx.focusMessages[0]?.id ?? null), by: 'host', quoteOptional: true });
          hostPosted = 1;
          if (req.trigger !== null) await handoffToOwner(ctx, 'model_unavailable', { takeover: false });
        }
      } else {
        await sendDm(s, ctx.conversationId, MODEL_DOWN_DM_REPLY);
        hostPosted = 1;
        await handoffToOwner(ctx, 'model_unavailable');
      }
      break;
    }
    case 'dm_reply': {
      const dm = ctx as DmTurnContext;
      await sendDm(s, dm.conversationId, s.finalText);
      hostPosted = 1;
      break;
    }
    case 'dm_empty': {
      const dm = ctx as DmTurnContext;
      await sendDm(s, dm.conversationId, BUSY_DM_REPLY);
      hostPosted = 1;
      await handoffToOwner(dm, handoffReason ?? 'agent_empty');
      break;
    }
    case 'join_default': {
      // Q9: CHO VAO mac dinh (SPEC-P05 §6) — model im / sap / refusal / cham tran ⇒ host duyet yeu cau con `pending`.
      const joinUid = req.joinRequest?.uid;
      const applied = joinUid ? await applyJoinDefault({ account: req.account, threadId: req.threadId, uid: joinUid, now: new Date(), inboundEventId: req.inboundEventId }) : false;
      await audit(sql, { actorType: 'system', actorId: null, action: 'join_review.default', target: req.threadId, data: { outcome, applied } });
      break;
    }
    case 'persona_invalid': {
      await audit(sql, { actorType: 'system', actorId: null, action: 'persona.invalid', target: req.threadId, data: null });
      const owner = await firstOwnerUid(req.account);
      if (owner) {
        const recent = await sql(
          `select 1 from audit_log where action = 'persona.invalid_owner_dm' and created_at > now() - interval '1 hour' limit 1`
        );
        if (recent.length === 0) {
          await enqueue({
            zaloAccountId: req.account,
            threadId: owner,
            threadType: 'user',
            kind: 'text',
            body: { text: 'Persona đang lỗi (thiếu hoặc quá dài) nên trợ lý tạm không trả lời được. Bạn kiểm tra lại persona trên dashboard nhé.' },
          });
          await audit(sql, { actorType: 'system', actorId: null, action: 'persona.invalid_owner_dm', target: owner, data: null });
        }
      }
      if ((req.kind === 'dm' || req.kind === 'owner_dm') && req.dm) {
        await sendDm(s, req.dm.conversationId, MODEL_DOWN_DM_REPLY);
        hostPosted = 1;
      }
      break;
    }
  }
  return { delivery, outcome, hostPosted };
};
