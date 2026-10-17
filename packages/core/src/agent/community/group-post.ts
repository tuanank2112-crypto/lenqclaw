// packages/core/src/agent/community/group-post.ts — MOT duong gui tin nhom duy nhat (SPEC-P03 §6.4):
// dung chung boi tool `send_group_message` (qua `tools`) va `deliver` (host: auto_post / fallback /
// model_down). Moi tin ra Zalo di qua `enqueue` (BB-02). Tin bot duoc chen vao dem NGAY voi
// `zalo_msg_id='out-<outbox_id>'` (pacer/sim doi sang msgId that sau khi gui — SPEC-P02 §2.1).

import { sql } from '../../adapters/db.js';
import { enqueue } from '../../adapters/transport.js';
import { GroupBudgetExceededError, MessageNotInBufferError, UnknownMemberError } from '../../domain/errors.js';
import type { GroupTurnContext, QuoteRef } from '../../domain/types.js';
import { saveMessage } from '../conversation.js';
import { findBufferedMessage } from './buffer.js';

export const GROUP_TEXT_MAX = 4000;
export const MENTION_MAX = 5;

export interface PostGroupArgs {
  text: string;
  /** `group_messages.id` (so sau dau `#` trong khung recent/focus) cua tin can quote. */
  replyToMsgId?: number | null;
  mentionUids?: readonly string[];
  /** 'tool' ⇒ kiem ngan sach (BB-08); 'host' ⇒ KHONG kiem — van enqueue, pacer giu hang cho den khi co ngan sach. */
  by: 'tool' | 'host';
}

export interface PostGroupResult {
  outboxId: number;
  groupMessageId: number | null;
}

async function recentBotTextCount(account: string, threadId: string): Promise<number> {
  const rows = await sql<{ c: number }>(
    `select count(*)::int as c from outbox
      where zalo_account_id = $1 and thread_id = $2 and kind = 'text' and status in ('queued','sending','sent')
        and created_at > now() - interval '1 hour' and coalesce((body->>'part')::int, 0) = 0`,
    [account, threadId]
  );
  return rows[0]?.c ?? 0;
}

let testHook: (() => Promise<void> | void) | null = null;
/** Chi dung trong test: moc chay NGAY DAU `postGroupText` (vd nem loi gia lap DB sap — SPEC-P03 §11 5q). */
export function setPostGroupTextHookForTest(h: (() => Promise<void> | void) | null): void {
  testHook = h;
}

export async function postGroupText(ctx: GroupTurnContext, a: PostGroupArgs): Promise<PostGroupResult> {
  if (testHook) await testHook();
  const text = a.text.trim();
  if (text === '') throw new Error('postGroupText: text rong.');
  if (a.by === 'tool' && (await recentBotTextCount(ctx.account, ctx.threadId)) >= ctx.group.budgetPerHour) {
    throw new GroupBudgetExceededError();
  }

  let quote: QuoteRef | undefined;
  if (a.replyToMsgId != null) {
    const row = await findBufferedMessage(ctx.account, ctx.threadId, a.replyToMsgId);
    if (!row) throw new MessageNotInBufferError(`Tin #${a.replyToMsgId} khong co trong dem nhom nay.`);
    quote = {
      msgId: row.zaloMsgId,
      cliMsgId: row.cliMsgId ?? row.zaloMsgId,
      uidFrom: row.senderUid,
      content: (row.text ?? '').slice(0, 200),
      msgType: row.msgType,
      ts: String(new Date(row.receivedAt).getTime()),
      ttl: 0,
    };
  }

  // mention: host dung "@Ten" tu group_members.display_name (khong tin ten model tu go — BB-10).
  const uids = [...new Set(a.mentionUids ?? [])].slice(0, MENTION_MAX);
  let body = text;
  const mentions: Array<{ uid: string; pos: number; len: number }> = [];
  if (uids.length > 0) {
    const members = await sql<{ zalo_uid: string; display_name: string | null }>(
      `select zalo_uid, display_name from group_members
        where zalo_account_id = $1 and thread_id = $2 and zalo_uid = any($3::text[]) and left_at is null`,
      [ctx.account, ctx.threadId, uids]
    );
    const byUid = new Map(members.map((m) => [m.zalo_uid, m.display_name]));
    let prefix = '';
    for (const uid of uids) {
      if (!byUid.has(uid)) throw new UnknownMemberError(`uid ${uid} khong phai thanh vien con hieu luc cua nhom.`);
      const tag = `@${(byUid.get(uid) ?? uid).replace(/\s+/g, ' ').trim()}`;
      mentions.push({ uid, pos: prefix.length, len: tag.length });
      prefix += `${tag} `;
    }
    body = prefix + text;
  }

  const outboxId = await enqueue({
    zaloAccountId: ctx.account,
    threadId: ctx.threadId,
    threadType: 'group',
    kind: 'text',
    body: { text: body, ...(quote ? { quote } : {}), ...(mentions.length > 0 ? { mentions } : {}) },
  });

  const inserted = await sql<{ id: number }>(
    `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, is_self, msg_type, text, mentions, received_at)
     values ($1,$2,$3,$4,true,'webchat',$5,$6::jsonb, now())
     on conflict (zalo_account_id, zalo_msg_id) do nothing
     returning id::int as id`,
    [ctx.account, ctx.threadId, `out-${outboxId}`, ctx.botUid, body, JSON.stringify(mentions)]
  );
  await saveMessage(ctx.conversationId, 'out', 'assistant', body, { by: a.by });
  return { outboxId, groupMessageId: inserted[0]?.id ?? null };
}
