// packages/core/src/agent/community/buffer.ts — dem tin nhom `group_messages` (SPEC-P03 §4.1, BB-11).
// Chen tin, cat dem <= GROUP_BUFFER_MAX, danh dau "da tra loi", doc dem. Nhom chua khai/tat KHONG
// luu gi (quyen rieng tu — BB-11). Noi dung tin KHONG vao audit (BB-09/D24).

import { sql } from '../../adapters/db.js';
import type { InboundEvent } from '../../adapters/transport.js';
import type { AccountId, GroupMessageRow, GroupMode, JoinPolicy } from '../../domain/types.js';
import { audit } from '../../services/audit.js';
import { readCommunityConfig } from '../../services/community-config.js';
import type { GroupRow } from './graph/state.js';

export const GROUP_MESSAGE_COLUMNS = `id::int as id, zalo_msg_id, cli_msg_id, sender_uid, sender_name, is_self, msg_type, text,
  mentions, quote_msg_id, quote_owner_uid, is_question, answered_at::text as answered_at, deleted_at::text as deleted_at,
  to_char(received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as received_at`;

interface MessageDbRow {
  id: number;
  zalo_msg_id: string;
  cli_msg_id: string | null;
  sender_uid: string;
  sender_name: string | null;
  is_self: boolean;
  msg_type: string;
  text: string | null;
  mentions: Array<{ uid: string; pos: number; len: number }> | null;
  quote_msg_id: string | null;
  quote_owner_uid: string | null;
  is_question: boolean;
  answered_at: string | null;
  deleted_at: string | null;
  received_at: string;
}

export function toGroupMessageRow(r: MessageDbRow): GroupMessageRow {
  return {
    id: r.id,
    zaloMsgId: r.zalo_msg_id,
    cliMsgId: r.cli_msg_id,
    senderUid: r.sender_uid,
    senderName: r.sender_name,
    isSelf: r.is_self,
    msgType: r.msg_type,
    text: r.text,
    mentions: r.mentions ?? [],
    quoteMsgId: r.quote_msg_id,
    quoteOwnerUid: r.quote_owner_uid,
    isQuestion: r.is_question,
    answeredAt: r.answered_at,
    deletedAt: r.deleted_at,
    receivedAt: r.received_at,
  };
}

interface GroupDbRow {
  thread_id: string;
  name: string | null;
  enabled: boolean;
  mode: GroupMode;
  join_policy: JoinPolicy;
  welcome_enabled: boolean;
  moderation_enabled: boolean;
  budget_per_hour: number;
  ambient_turns_per_hour: number;
  system_prompt: string | null;
  allow_users: string[];
  deny_users: string[];
  bot_is_admin: boolean;
}

/** Mot dong `zalo_groups` hoac null (nhom chua khai). */
export async function getGroup(account: AccountId, threadId: string): Promise<GroupRow | null> {
  const rows = await sql<GroupDbRow>(
    `select thread_id, name, enabled, mode, join_policy, welcome_enabled, moderation_enabled, budget_per_hour,
            ambient_turns_per_hour, system_prompt, allow_users, deny_users, bot_is_admin
       from zalo_groups where zalo_account_id = $1 and thread_id = $2`,
    [account, threadId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    threadId: r.thread_id,
    name: r.name,
    enabled: r.enabled,
    mode: r.mode,
    joinPolicy: r.join_policy,
    welcomeEnabled: r.welcome_enabled,
    moderationEnabled: r.moderation_enabled,
    budgetPerHour: r.budget_per_hour,
    ambientTurnsPerHour: r.ambient_turns_per_hour,
    systemPrompt: r.system_prompt,
    allowUsers: r.allow_users,
    denyUsers: r.deny_users,
    botIsAdmin: r.bot_is_admin,
  };
}

/** Nhom chua khai / tat: audit `group.denied` toi da 1 lan/nhom/gio, KHONG ghi gi khac (BB-11). */
export async function auditGroupDenied(account: AccountId, threadId: string, reason: 'group_unknown' | 'group_disabled'): Promise<void> {
  const recent = await sql(
    `select 1 from audit_log where action = 'group.denied' and target = $1 and created_at > now() - interval '1 hour' limit 1`,
    [threadId]
  );
  if (recent.length > 0) return;
  await audit(sql, { actorType: 'system', actorId: account, action: 'group.denied', target: threadId, data: { reason } });
}

interface TextPayload {
  text?: unknown;
  msg_type?: unknown;
  cli_msg_id?: unknown;
  d_name?: unknown;
  mentions?: unknown;
  quote?: unknown;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * §4.1 buoc 2–5 cho nhom da khai & bat. Tra dong dem cua tin (ke ca khi trung `zalo_msg_id`).
 * Tin cua chinh bot (`is_self`) KHONG upsert thanh vien.
 */
export async function ingestGroupMessage(e: InboundEvent): Promise<GroupMessageRow> {
  const account = e.zaloAccountId;
  const threadId = e.threadId;
  const p = e.payload as TextPayload;
  const cfg = readCommunityConfig();
  const senderName = str(p.d_name);

  if (!e.isSelf) {
    await sql(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name, last_seen_at)
       values ($1,$2,$3,'member',$4, now())
       on conflict (zalo_account_id, thread_id, zalo_uid)
       do update set left_at = null, last_seen_at = now(), display_name = coalesce($4, group_members.display_name)`,
      [account, threadId, e.senderUid, senderName]
    );
  }

  const quote = p.quote && typeof p.quote === 'object' ? (p.quote as { owner_id?: unknown; global_msg_id?: unknown }) : null;
  const mentions = Array.isArray(p.mentions) ? p.mentions : [];
  const inserted = await sql<MessageDbRow>(
    `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, sender_name, is_self, msg_type,
                                 text, mentions, quote_msg_id, quote_owner_uid, is_question, received_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,false, now())
     on conflict (zalo_account_id, zalo_msg_id) do nothing
     returning ${GROUP_MESSAGE_COLUMNS}`,
    [
      account,
      threadId,
      e.zaloMsgId,
      str(p.cli_msg_id),
      e.senderUid,
      senderName,
      e.isSelf,
      str(p.msg_type) ?? 'webchat',
      str((e.payload as { text?: unknown }).text),
      JSON.stringify(mentions),
      quote ? str(quote.global_msg_id) : null,
      quote ? str(quote.owner_id) : null,
    ]
  );

  let row: MessageDbRow;
  if (inserted.length > 0) {
    row = inserted[0]!;
    // 4. cat dem: giu dung GROUP_BUFFER_MAX tin moi nhat (idempotent)
    await sql(
      `delete from group_messages
        where zalo_account_id = $1 and thread_id = $2
          and id <= (select id from group_messages where zalo_account_id = $1 and thread_id = $2 order by id desc offset $3 limit 1)`,
      [account, threadId, cfg.groupBufferMax]
    );
    // 5. danh dau "da tra loi": tin quote cau hoi mo, hoac mention nguoi gui cau hoi mo
    if (!e.isSelf) {
      const mentionUids = mentions
        .map((m) => (m && typeof m === 'object' ? (m as { uid?: unknown }).uid : null))
        .filter((u): u is string => typeof u === 'string');
      if (row.quote_msg_id || mentionUids.length > 0) {
        await sql(
          `update group_messages q set answered_at = now()
            where q.zalo_account_id = $1 and q.thread_id = $2 and q.is_question and q.answered_at is null
              and q.deleted_at is null and q.sender_uid <> $3
              and (($4::text is not null and q.zalo_msg_id = $4) or q.sender_uid = any($5::text[]))`,
          [account, threadId, e.senderUid, row.quote_msg_id, mentionUids]
        );
      }
    }
  } else {
    const existing = await sql<MessageDbRow>(
      `select ${GROUP_MESSAGE_COLUMNS} from group_messages where zalo_account_id = $1 and zalo_msg_id = $2`,
      [account, e.zaloMsgId]
    );
    row = existing[0]!;
  }
  return toGroupMessageRow(row);
}

/** n tin KHONG bi xoa ngay truoc `beforeId` (cu → moi), da loc tin `is_self` neu `excludeSelf`. */
export async function loadRecentBefore(
  account: AccountId,
  threadId: string,
  beforeId: number,
  limit: number
): Promise<GroupMessageRow[]> {
  const rows = await sql<MessageDbRow>(
    `select ${GROUP_MESSAGE_COLUMNS} from group_messages
      where zalo_account_id = $1 and thread_id = $2 and id < $3 and deleted_at is null
      order by id desc limit $4`,
    [account, threadId, beforeId, limit]
  );
  return rows.reverse().map(toGroupMessageRow);
}

export async function loadMessagesByIds(account: AccountId, threadId: string, ids: readonly number[]): Promise<GroupMessageRow[]> {
  if (ids.length === 0) return [];
  const rows = await sql<MessageDbRow>(
    `select ${GROUP_MESSAGE_COLUMNS} from group_messages
      where zalo_account_id = $1 and thread_id = $2 and id = any($3::bigint[]) and deleted_at is null order by id`,
    [account, threadId, ids]
  );
  return rows.map(toGroupMessageRow);
}

/** Tin ambient moi: id > moc da thay, khong phai tin bot, khong bi xoa. */
export async function loadUnseen(account: AccountId, threadId: string, afterId: number, limit: number): Promise<GroupMessageRow[]> {
  const rows = await sql<MessageDbRow>(
    `select ${GROUP_MESSAGE_COLUMNS} from group_messages
      where zalo_account_id = $1 and thread_id = $2 and id > $3 and not is_self and deleted_at is null
      order by id desc limit $4`,
    [account, threadId, afterId, limit]
  );
  return rows.reverse().map(toGroupMessageRow);
}

/** Tin trong dem theo id ung dung (cho tool): `#id` neu day la so. */
export async function findBufferedMessage(account: AccountId, threadId: string, id: number): Promise<GroupMessageRow | null> {
  const rows = await sql<MessageDbRow>(
    `select ${GROUP_MESSAGE_COLUMNS} from group_messages where zalo_account_id = $1 and thread_id = $2 and id = $3 and deleted_at is null`,
    [account, threadId, id]
  );
  return rows[0] ? toGroupMessageRow(rows[0]) : null;
}

export async function loadRecentTexts(account: AccountId, threadId: string, beforeId: number, n: number): Promise<string[]> {
  const rows = await loadRecentBefore(account, threadId, beforeId, n);
  return rows.map((r) => r.text ?? '');
}
