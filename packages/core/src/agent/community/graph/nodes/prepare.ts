// node `prepare` (turn) — dung loi goi model cho MOT luot (SPEC-P03 §6.1): nguon DUY NHAT cua ngu canh
// (BB-13: state `messages` bat dau rong moi luot; DM <= 2 x DM_HISTORY_TURNS tin; nhom 25/40 tin dem; KHONG nen,
// KHONG tom tat). Danh dau `group_sessions` TRUOC model (D28). BB-07: nhanh nhom KHONG doc ho so/ghi chu thanh vien;
// chi nhanh DM goi `loadMemberContext`. D31: luot tuong tac enqueue `typing` NGAY dau node (outbox ✓ CHI typing).

import { randomUUID } from 'node:crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql } from '../../../../adapters/db.js';
import { enqueue } from '../../../../adapters/transport.js';
import { PersonaMissingError, PersonaTooLargeError } from '../../../../domain/errors.js';
import type { DmTurnContext, GroupMessageRow, GroupTurnContext } from '../../../../domain/types.js';
import { readCommunityConfig } from '../../../../services/community-config.js';
import { loadMemberContext } from '../../../../services/memory.js';
import { loadHistory } from '../../../conversation.js';
import { resolveBotUid } from '../../bot.js';
import { getGroup, loadMessagesByIds, loadRecentBefore, loadUnseen } from '../../buffer.js';
import { buildGroupUserMessage, buildSystemPrompt, loadPersonaBundle, renderMemberBlocks, sanitizeUntrusted } from '../../persona.js';
import { toolsFor } from '../../policy.js';
import { ensureGroupConversation, getLastSeenMessageId, markSessionAtPrepare } from '../../sessions.js';
import { initialDeadline, isInteractive } from '../edges.js';
import type { NodeFn, TurnStateT } from '../state.js';

async function displayNames(account: string, threadId: string, uids: readonly string[]): Promise<Map<string, string>> {
  if (uids.length === 0) return new Map();
  const rows = await sql<{ zalo_uid: string; display_name: string | null }>(
    `select zalo_uid, display_name from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = any($3::text[])`,
    [account, threadId, uids]
  );
  return new Map(rows.map((r) => [r.zalo_uid, r.display_name ?? r.zalo_uid]));
}

export const prepareNode: NodeFn<TurnStateT> = async (s) => {
  const req = s.request;
  const cfg = readCommunityConfig();
  const startedAt = Date.now();
  const turnId = randomUUID();
  if (isInteractive(req.kind)) {
    // D31 T7: "dang go" som — truoc moi doc DB khac. Loi enqueue typing khong lam hong luot.
    try {
      await enqueue({ zaloAccountId: req.account, threadId: req.threadId, threadType: req.threadType, kind: 'typing', body: { typing: true } });
    } catch {
      /* typing la tin hieu phu */
    }
  }
  const { lane, deadlineAt } = initialDeadline(req, startedAt, {
    fastMs: cfg.laneFastDeadlineMs,
    ragMs: cfg.laneRagDeadlineMs,
    backgroundMs: cfg.turnBackgroundDeadlineMs,
  });

  let persona;
  try {
    persona = await loadPersonaBundle(req.account);
  } catch (err) {
    if (err instanceof PersonaMissingError || err instanceof PersonaTooLargeError) {
      return { turnId, startedAt, lane, deadlineAt, prepError: 'persona_invalid' as const };
    }
    throw err;
  }

  const now = new Date(startedAt);
  const botUid = resolveBotUid();
  const role = req.requester?.role ?? 'member';
  const roundCap = cfg.maxToolRounds;

  if (req.kind === 'dm' || req.kind === 'owner_dm') {
    if (!req.dm || !req.requester) throw new Error('prepare: luot DM thieu dm/requester.');
    const member = await loadMemberContext(req.account, req.requester.uid); // CHI nhanh DM (BB-07/BB-13)
    const dmCtx: DmTurnContext = {
      kind: req.kind,
      account: req.account,
      threadId: req.threadId,
      botUid,
      requester: { uid: req.requester.uid, role: req.requester.role, displayName: null },
      latestText: req.dm.latestText,
      latestMessageId: req.dm.latestMessageId,
      triage: req.triage,
      now,
      conversationId: req.dm.conversationId,
      memberNotes: member.notes,
      openLead: member.openLead,
      inboundEventId: req.inboundEventId,
      deadlineAt,
    };
    const history = await loadHistory(req.dm.conversationId, req.dm.latestMessageId, 2 * cfg.dmHistoryTurns);
    while (history.length > 0 && history[0]!.role !== 'user') history.shift();
    const blocks = renderMemberBlocks({ notes: member.notes, openLead: member.openLead });
    // §5.3: text cua CHINH tin hien tai giu nguyen (khach tu cho so lien he); lich su da che SDT.
    const current: MessageParam = { role: 'user', content: blocks ? `${blocks}\n${req.dm.latestText}` : req.dm.latestText };
    return {
      turnId,
      startedAt,
      ctx: dmCtx,
      personaVersions: persona.versions,
      system: buildSystemPrompt(persona, dmCtx, now),
      toolNames: toolsFor(req.kind, role).map((d) => d.name) as TurnStateT['toolNames'],
      messages: [...history, current],
      roundCap,
      lane,
      deadlineAt,
    };
  }

  // ---- luot NHOM ----
  const group = await getGroup(req.account, req.threadId);
  if (!group) throw new Error(`prepare: nhom ${req.threadId} khong ton tai.`);
  const conversationId = await ensureGroupConversation(req.account, req.threadId);

  let focus: GroupMessageRow[];
  let recent: GroupMessageRow[];
  if (req.kind === 'group_ambient_flush') {
    const lastSeen = await getLastSeenMessageId(req.account, req.threadId);
    focus = await loadUnseen(req.account, req.threadId, lastSeen, cfg.ambientContextMessages);
    const first = focus[0]?.id ?? lastSeen + 1;
    recent = await loadRecentBefore(req.account, req.threadId, first, cfg.ambientContextMessages);
  } else {
    focus = await loadMessagesByIds(req.account, req.threadId, req.focusMessageIds);
    const first = focus[0]?.id ?? Number.MAX_SAFE_INTEGER;
    recent = await loadRecentBefore(req.account, req.threadId, first, req.kind === 'group_mention' ? cfg.mentionContextMessages : cfg.ambientContextMessages);
  }

  const names = await displayNames(req.account, req.threadId, [req.requester?.uid ?? '', ...(req.joinedUids ?? [])].filter(Boolean));
  const groupCtx: GroupTurnContext = {
    kind: req.kind as GroupTurnContext['kind'],
    account: req.account,
    threadId: req.threadId,
    botUid,
    group: {
      name: group.name,
      mode: group.mode,
      budgetPerHour: group.budgetPerHour,
      systemPrompt: group.systemPrompt,
      botIsAdmin: group.botIsAdmin,
      moderationEnabled: group.moderationEnabled,
    },
    requester: req.requester ? { uid: req.requester.uid, role: req.requester.role, displayName: names.get(req.requester.uid) ?? null } : null,
    trigger: req.trigger,
    mustReply: req.mustReply,
    focusMessages: focus,
    recent,
    ...(req.joinedUids ? { joinedUids: req.joinedUids } : {}),
    ...(req.joinRequest ? { joinRequest: { uid: req.joinRequest.uid, displayName: null } } : {}),
    now,
    conversationId,
    inboundEventId: req.inboundEventId,
    deadlineAt,
  };

  // D28: danh dau phien TRUOC loi goi model dau tien.
  const maxSeen = Math.max(0, ...focus.map((m) => m.id), ...recent.map((m) => m.id));
  await markSessionAtPrepare({ account: req.account, threadId: req.threadId, kind: req.kind, maxSeenId: maxSeen, now });

  let extra: string | undefined;
  if (req.joinedUids && req.joinedUids.length > 0) {
    extra = ['<<<untrusted new_members>>>', ...req.joinedUids.map((u) => `${sanitizeUntrusted(u)} "${sanitizeUntrusted(names.get(u) ?? '')}"`), '<<<end>>>'].join('\n');
  }
  return {
    turnId,
    startedAt,
    ctx: groupCtx,
    personaVersions: persona.versions,
    system: buildSystemPrompt(persona, groupCtx, now),
    toolNames: toolsFor(req.kind, role).map((d) => d.name) as TurnStateT['toolNames'],
    messages: [{ role: 'user', content: buildGroupUserMessage(groupCtx, extra) }],
    roundCap,
    lane,
    deadlineAt,
  };
};
