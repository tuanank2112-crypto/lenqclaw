// packages/core/src/services/moderation.ts — kiem duyet nhom (SPEC-P05 §3–§4, D17). Node `moderate` goi
// `moderateGroupMessage`; tool `flag_message` goi `applyModeration` (cung thang canh cao). Vung cam (§8): owner/moderator mien
// tru; khong xoa tin > 24 gio / thieu cli_msg_id / bot khong la admin (ha ve canh cao + bao owner); khong qua
// MOD_WARN_PER_HOUR; KHONG DM nguoi vi pham; kick/block CHI qua the duyet (`createApproval`). KHONG ghi noi dung tin vao audit.

import { sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { BOT_UID_UNKNOWN, botUid } from '../agent/community/bot.js';
import type { GroupRow } from '../agent/community/graph/state.js';
import { MOD_DELETE_DM, NEED_DEPUTY_DM, WARN_GROUP_TEXT } from '../agent/community/prompts/system.js';
import { normalizeVi } from '../agent/community/redact.js';
import { firstOwnerUid } from '../agent/community/roles.js';
import type { AccountId, CommunityTriage, GroupMessageRow, QuoteRef, Role } from '../domain/types.js';
import { createApproval } from './approvals.js';
import { audit } from './audit.js';
import { readCommunityConfig } from './community-config.js';
import { classifyGrid, type GridHit, type GridResult } from './moderation-grid.js';
import { nextLadderStep, type LadderAction, type LadderVerdict } from './moderation-ladder.js';
import { enqueueAction } from './outbox-actions.js';

export type ModerationSource = 'grid' | 'model' | 'agent' | 'human';
export type ModerationVerdict = LadderVerdict;

export interface VerdictDecision {
  verdict: ModerationVerdict;
  confidence: number;
  source: ModerationSource;
}

export const DELETE_MAX_AGE_MS = 24 * 3_600_000;
const BURST_WINDOW_MS = 10 * 60_000;

// ---------------------------------------------------------------------------
// §3 hop nhat luoi + model (THUAN)
// ---------------------------------------------------------------------------

/** Bang §3, xet theo thu tu. `ok` ⇒ null-equivalent (verdict 'ok', khong ghi event). */
export function decideVerdict(grid: GridResult, triage: CommunityTriage | null, cfg: { scamMin: number; spamMin: number }): VerdictDecision {
  if (grid.hard) {
    return { verdict: grid.hits.includes('scam_phrase') ? 'scam' : 'spam', confidence: 0.95, source: 'grid' };
  }
  if (triage) {
    if (triage.verdict === 'scam' && triage.confidence >= cfg.scamMin) return { verdict: 'scam', confidence: triage.confidence, source: 'model' };
    if ((triage.verdict === 'spam' || triage.verdict === 'ad' || triage.verdict === 'harass') && triage.confidence >= cfg.spamMin) {
      return { verdict: triage.verdict, confidence: triage.confidence, source: 'model' };
    }
    if (grid.hits.length > 0 && triage.verdict !== 'ok' && triage.confidence >= 0.5) {
      return { verdict: triage.verdict, confidence: triage.confidence, source: 'model' };
    }
    return { verdict: 'ok', confidence: triage.confidence, source: 'model' };
  }
  if (grid.hits.length > 0) return { verdict: 'unsure', confidence: 0.5, source: 'grid' };
  return { verdict: 'ok', confidence: 1, source: 'grid' };
}

// ---------------------------------------------------------------------------
// ngu canh DB cua luoi
// ---------------------------------------------------------------------------

async function gridContext(account: AccountId, threadId: string, row: GroupMessageRow, role: Role, now: Date) {
  const count = await sql<{ c: number }>(
    `select count(*)::int as c from group_messages where zalo_account_id = $1 and thread_id = $2 and sender_uid = $3`,
    [account, threadId, row.senderUid]
  );
  const recent = await sql<{ text: string | null }>(
    `select text from group_messages
      where zalo_account_id = $1 and thread_id = $2 and sender_uid = $3 and deleted_at is null and text is not null
        and received_at > $4::timestamptz - make_interval(secs => $5)
      order by id desc limit 40`,
    [account, threadId, row.senderUid, now, BURST_WINDOW_MS / 1000]
  );
  const mine = normalizeVi(row.text ?? '');
  const identical = mine === '' ? 0 : recent.filter((r) => normalizeVi(r.text ?? '') === mine).length;
  return { mentions: row.mentions, senderRole: role, senderBufferCount: count[0]?.c ?? 0, identicalRecentCount: identical };
}

// ---------------------------------------------------------------------------
// ap dung thang
// ---------------------------------------------------------------------------

export interface ApplyModerationArgs {
  account: AccountId;
  group: GroupRow;
  row: GroupMessageRow;
  senderRole: Role;
  verdict: ModerationVerdict;
  confidence: number;
  source: ModerationSource;
  gridHits?: readonly GridHit[];
  now: Date;
  inboundEventId?: number;
}

export interface ModerationOutcome {
  verdict: ModerationVerdict;
  confidence: number;
  source: ModerationSource;
  exempt: boolean;
  /** Hanh dong THUC SU ap dung (sau khi ha bac: thieu quyen / tin cu / thieu cli_msg_id). */
  action: LadderAction;
  /** Da xep hang lenh xoa tin (⇒ pipeline dung, tin khong duoc tra loi). */
  deleted: boolean;
  score: number | null;
  eventId: number | null;
}

const NONE: Omit<ModerationOutcome, 'verdict' | 'confidence' | 'source'> = { exempt: false, action: 'none', deleted: false, score: null, eventId: null };

async function insertEvent(a: ApplyModerationArgs, action: LadderAction, scoreAfter: number | null): Promise<number> {
  const rows = await sql<{ id: number }>(
    `insert into moderation_events (zalo_account_id, thread_id, zalo_uid, zalo_msg_id, verdict, confidence, source, grid_hits, action, score_after, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11) returning id::int as id`,
    [
      a.account,
      a.group.threadId,
      a.row.senderUid,
      a.row.zaloMsgId,
      a.verdict,
      Math.max(0, Math.min(1, Math.round(a.confidence * 1000) / 1000)),
      a.source,
      [...(a.gridHits ?? [])],
      action,
      scoreAfter,
      a.now,
    ]
  );
  return rows[0]!.id;
}

async function recentCount(action: string, target: string, now: Date, windowSecs: number): Promise<number> {
  const rows = await sql<{ c: number }>(
    `select count(*)::int as c from audit_log where action = $1 and target = $2 and created_at > $3::timestamptz - make_interval(secs => $4)`,
    [action, target, now, windowSecs]
  );
  return rows[0]?.c ?? 0;
}

export async function warnsInLastHour(account: AccountId, threadId: string, now: Date): Promise<number> {
  const rows = await sql<{ c: number }>(
    `select count(*)::int as c from moderation_events
      where zalo_account_id = $1 and thread_id = $2 and action = 'warn' and created_at > $3::timestamptz - interval '1 hour'`,
    [account, threadId, now]
  );
  return rows[0]?.c ?? 0;
}

async function dmOwner(account: AccountId, text: string): Promise<void> {
  const owner = await firstOwnerUid(account);
  if (owner) await enqueue({ zaloAccountId: account, threadId: owner, threadType: 'user', kind: 'text', body: { text } });
}

/** Canh cao cong khai: quote tin vi pham, KHONG mention, hang TS (khong model). Tin bot chen vao dem `out-<id>`. */
async function postWarning(a: ApplyModerationArgs): Promise<number> {
  const text = WARN_GROUP_TEXT(a.verdict);
  const quote: QuoteRef = {
    msgId: a.row.zaloMsgId,
    cliMsgId: a.row.cliMsgId ?? a.row.zaloMsgId,
    uidFrom: a.row.senderUid,
    content: (a.row.text ?? '').slice(0, 200),
    msgType: a.row.msgType,
    ts: String(new Date(a.row.receivedAt).getTime()),
    ttl: 0,
  };
  const outboxId = await enqueue({ zaloAccountId: a.account, threadId: a.group.threadId, threadType: 'group', kind: 'text', body: { text, quote } });
  const bot = (await botUid(a.account, process.env, Date.now, a.group.threadId).catch(() => null)) ?? BOT_UID_UNKNOWN;
  await sql(
    `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, is_self, msg_type, text, mentions, received_at)
     values ($1,$2,$3,$4,true,'webchat',$5,'[]'::jsonb,$6) on conflict (zalo_account_id, zalo_msg_id) do nothing`,
    [a.account, a.group.threadId, `out-${outboxId}`, bot, text, a.now]
  );
  return outboxId;
}

async function deleteMessage(a: ApplyModerationArgs): Promise<void> {
  await sql(
    `update group_messages set deleted_at = $4, delete_reason = $5 where id = $1 and zalo_account_id = $2 and thread_id = $3 and deleted_at is null`,
    [a.row.id, a.account, a.group.threadId, a.now, a.verdict]
  );
  await enqueueAction({
    account: a.account,
    threadId: a.group.threadId,
    action: 'delete_message',
    msgId: a.row.zaloMsgId,
    cliMsgId: a.row.cliMsgId ?? '',
    uidFrom: a.row.senderUid,
    onlyMe: false,
    ...(a.inboundEventId !== undefined ? { inboundEventId: a.inboundEventId } : {}),
  });
  // DM owner gop <= 1 / 10 phut / nhom
  if ((await recentCount('moderation.delete_dm', a.group.threadId, a.now, 600)) === 0) {
    await dmOwner(a.account, MOD_DELETE_DM(a.group.name, a.verdict));
    await audit(sql, { actorType: 'system', actorId: null, action: 'moderation.delete_dm', target: a.group.threadId, data: null });
  }
}

/** Ghi event + diem, ap dung hanh dong (§4.1). Owner/moderator ⇒ chi ghi event `none`. */
export async function applyModeration(a: ApplyModerationArgs): Promise<ModerationOutcome> {
  const base = { verdict: a.verdict, confidence: a.confidence, source: a.source };
  if (a.verdict === 'ok') return { ...base, ...NONE };
  const cfg = readCommunityConfig();

  const prev = await sql<{ score: string; updated_at: string }>(
    `select score::text as score, updated_at::text as updated_at from moderation_scores where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3`,
    [a.account, a.group.threadId, a.row.senderUid]
  );
  const step = nextLadderStep({
    prevScore: prev[0] ? Number(prev[0].score) : 0,
    lastUpdatedAt: prev[0] ? new Date(prev[0].updated_at) : a.now,
    now: a.now,
    verdict: a.verdict,
    senderRole: a.senderRole,
    halfLifeHours: cfg.modLadderHalfLifeHours,
  });

  if (step.exempt) {
    const eventId = await insertEvent(a, 'none', null);
    return { ...base, exempt: true, action: 'none', deleted: false, score: null, eventId };
  }
  if (step.action === 'none') {
    const eventId = await insertEvent(a, 'none', step.score);
    return { ...base, exempt: false, action: 'none', deleted: false, score: step.score, eventId };
  }

  await sql(
    `insert into moderation_scores (zalo_account_id, thread_id, zalo_uid, score, strikes, updated_at) values ($1,$2,$3,$4,1,$5)
     on conflict (zalo_account_id, thread_id, zalo_uid) do update set score = $4, strikes = moderation_scores.strikes + 1, updated_at = $5`,
    [a.account, a.group.threadId, a.row.senderUid, step.score, a.now]
  );

  // ---- ha bac theo quyen / tuoi tin (vung cam §8) ----
  const wantDelete = step.action === 'delete' || step.action === 'kick_requested' || step.action === 'block_requested';
  const ageMs = a.now.getTime() - new Date(a.row.receivedAt).getTime();
  const hasCli = a.row.cliMsgId !== null && a.row.cliMsgId !== '';
  let effective: LadderAction = step.action;
  let canDelete = wantDelete;
  if (wantDelete && !a.group.botIsAdmin) {
    effective = 'warn';
    canDelete = false;
    await audit(sql, { actorType: 'system', actorId: null, action: 'moderation.need_deputy', target: a.group.threadId, data: { verdict: a.verdict, wanted: step.action } });
    if ((await recentCount('moderation.need_deputy_dm', a.group.threadId, a.now, 3600)) === 0) {
      await dmOwner(a.account, NEED_DEPUTY_DM(a.group.name));
      await audit(sql, { actorType: 'system', actorId: null, action: 'moderation.need_deputy_dm', target: a.group.threadId, data: null });
    }
  } else if (wantDelete && (!hasCli || ageMs > DELETE_MAX_AGE_MS || a.row.isSelf)) {
    canDelete = false;
    if (step.action === 'delete') effective = 'warn';
    await audit(sql, { actorType: 'system', actorId: null, action: 'moderation.cannot_delete', target: a.group.threadId, data: { reason: !hasCli ? 'cli_msg_id_missing' : a.row.isSelf ? 'self' : 'too_old' } });
  }

  const warnBudgetLeft = effective === 'warn' ? (await warnsInLastHour(a.account, a.group.threadId, a.now)) < cfg.modWarnPerHour : false;
  const eventId = await insertEvent(a, effective, step.score);

  if (effective === 'warn') {
    if (warnBudgetLeft) await postWarning(a);
  } else if (canDelete) {
    await deleteMessage(a);
  }
  if (effective === 'kick_requested' || effective === 'block_requested') {
    const last = await sql<{ id: number }>(
      `select id::int as id from moderation_events where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and verdict <> 'ok' order by id desc limit 3`,
      [a.account, a.group.threadId, a.row.senderUid]
    );
    await createApproval({
      account: a.account,
      kind: effective === 'kick_requested' ? 'kick_member' : 'block_member',
      threadId: a.group.threadId,
      targetUid: a.row.senderUid,
      reason: `Điểm cảnh cáo ${step.score} (${a.verdict}) sau nhiều lần vi phạm.`,
      payload: { events: last.map((e) => e.id) },
      requestedBy: 'moderation',
      now: a.now,
    });
  }
  return { ...base, exempt: false, action: effective, deleted: canDelete, score: step.score, eventId };
}

// ---------------------------------------------------------------------------
// node `moderate`
// ---------------------------------------------------------------------------

export interface ModerateContext {
  account: AccountId;
  group: GroupRow;
  sender: { uid: string; role: Role };
  now: Date;
  inboundEventId?: number;
}

/** §3: luoi + triage → verdict → (neu khac ok) thang canh cao. Tin khong phai chu / cua bot / nhom tat kiem duyet ⇒ khong lam gi. */
export async function moderateGroupMessage(row: GroupMessageRow, triage: CommunityTriage | null, ctx: ModerateContext): Promise<ModerationOutcome> {
  const skip = (): ModerationOutcome => ({ verdict: 'ok', confidence: 1, source: 'grid', ...NONE });
  if (!ctx.group.moderationEnabled || row.isSelf || row.msgType !== 'webchat' || (row.text ?? '').trim() === '') return skip();

  const cfg = readCommunityConfig();
  const grid = classifyGrid(row.text ?? '', await gridContext(ctx.account, ctx.group.threadId, row, ctx.sender.role, ctx.now));
  const d = decideVerdict(grid, triage, { scamMin: cfg.modScamMin, spamMin: cfg.modSpamMin });
  if (d.verdict === 'ok') return { ...skip(), confidence: d.confidence, source: d.source };
  return applyModeration({
    account: ctx.account,
    group: ctx.group,
    row,
    senderRole: ctx.sender.role,
    verdict: d.verdict,
    confidence: d.confidence,
    source: d.source,
    gridHits: grid.hits,
    now: ctx.now,
    ...(ctx.inboundEventId !== undefined ? { inboundEventId: ctx.inboundEventId } : {}),
  });
}

/** §9 timer `reconcileDeletes`: lenh xoa `failed` ⇒ bo dau `deleted_at` (tin van ton tai) + audit. Idempotent. Tra so tin. */
export async function reconcileDeletes(_now: Date): Promise<number> {
  const rows = await sql<{ id: number; thread_id: string }>(
    `update group_messages g set deleted_at = null, delete_reason = 'delete_failed'
       from outbox o
      where g.deleted_at is not null and g.delete_reason is distinct from 'delete_failed'
        and o.kind = 'action' and o.status = 'failed' and o.body->>'action' = 'delete_message'
        and o.zalo_account_id = g.zalo_account_id and o.thread_id = g.thread_id and o.body->>'msgId' = g.zalo_msg_id
      returning g.id::int as id, g.thread_id`
  );
  for (const r of rows) {
    await audit(sql, { actorType: 'system', actorId: null, action: 'moderation.delete_failed', target: r.thread_id, data: { message_id: r.id } });
  }
  return rows.length;
}

/** Tool `warn_member`: ghi event canh cao do agent de nghi (khong qua thang diem). */
export async function recordAgentWarn(args: { account: AccountId; threadId: string; uid: string; now: Date }): Promise<void> {
  await sql(
    `insert into moderation_events (zalo_account_id, thread_id, zalo_uid, verdict, confidence, source, grid_hits, action, created_at)
     values ($1,$2,$3,'unsure',0.8,'agent','{}','warn',$4)`,
    [args.account, args.threadId, args.uid, args.now]
  );
}
