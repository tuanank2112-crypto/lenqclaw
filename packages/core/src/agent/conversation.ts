// packages/core/src/agent/conversation.ts — hoi thoai + tin nhan (conversations,
// messages) dung chung cho moi luot agent (SPEC-P01 §3). Danh tinh/vai KHONG o
// day: vai lay tu `account_owners` + `group_members` (BB-04, `community/roles.ts`
// o P03), khong bao gio tu noi dung tin hay output model.

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql } from '../adapters/db.js';
import { redactPhones } from './community/redact.js';
import type { AccountId } from '../domain/types.js';

const HISTORY_LIMIT = 20;

export type ConversationPartyType = 'owner' | 'member' | 'stranger' | 'group';

export interface ConversationRow {
  id: string;
  party_type: ConversationPartyType | null;
  human_takeover_until: string | null;
}

/** Tao (neu chua co) hoac lay hoi thoai theo (tai khoan, thread). `party_type`
 * va `thread_type` luon duoc cap nhat theo gia tri moi nhat (vai co the doi:
 * stranger -> member). */
export async function getOrCreateConversation(
  account: AccountId,
  threadId: string,
  threadType: 'user' | 'group',
  partyType: ConversationPartyType
): Promise<ConversationRow> {
  const rows = await sql<ConversationRow>(
    `insert into conversations (zalo_account_id, thread_id, thread_type, party_type)
     values ($1,$2,$3,$4)
     on conflict (zalo_account_id, thread_id)
     do update set thread_type = excluded.thread_type, party_type = excluded.party_type
     returning id, party_type, human_takeover_until::text as human_takeover_until`,
    [account, threadId, threadType, partyType]
  );
  return rows[0]!;
}

export async function saveMessage(
  conversationId: string,
  direction: 'in' | 'out',
  role: 'user' | 'assistant' | 'staff',
  text: string,
  extra: Record<string, unknown> = {}
): Promise<{ id: number; createdAt: string }> {
  const rows = await sql<{ id: number; created_at: string }>(
    `insert into messages (conversation_id, direction, role, content)
     values ($1,$2,$3,$4) returning id, created_at::text as created_at`,
    [conversationId, direction, role, JSON.stringify({ text, ...extra })]
  );
  return { id: rows[0]!.id, createdAt: rows[0]!.created_at };
}

interface HistoryRow {
  role: 'user' | 'assistant' | 'staff';
  content: { text?: string };
}

/** Che SDT truoc khi dua vao ngu canh model (SPEC-P03 §5.3). */
export function maskForModel(text: string): string {
  return redactPhones(text);
}

export async function loadHistory(conversationId: string, excludeMessageId: number): Promise<MessageParam[]> {
  const rows = await sql<HistoryRow>(
    `select role, content from messages where conversation_id = $1 and id <> $2 order by id desc limit ${HISTORY_LIMIT}`,
    [conversationId, excludeMessageId]
  );
  return rows
    .reverse()
    .map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: maskForModel(r.content?.text ?? ''),
    }));
}
