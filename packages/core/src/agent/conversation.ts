// packages/core/src/agent/conversation.ts — tach tu agent/resident-agent.ts
// (SPEC-P05-Dispatch.md §10.1.2, Đ27): `resolveParty`, `getOrCreateConversation`,
// `saveMessage`, `loadHistory` dung CHUNG cho ca agent cu dan (`bql`) lan
// agent tho (`market`, P05-C). HANH VI GIU NGUYEN tung dong so voi ban goc
// trong resident-agent.ts — day la mot lan CHUYEN CHO, khong phai viet lai
// (test P03 khong duoc do).

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql } from '../adapters/db.js';
import { redactPii, redactKnownApartmentCodes } from './pii.js';
import type { Party } from '../domain/types.js';

const HISTORY_LIMIT = 20;

/** BB-08: danh tinh CHI tu `zalo_identities`, khong bao gio tu noi dung tin
 * nhan hay output LLM (vd chuoi "[userId: ...]" nguoi dung tu go). */
export async function resolveParty(account: 'bql' | 'market', senderUid: string): Promise<Party> {
  const rows = await sql<{ party_type: Party['type']; party_id: string }>(
    `select party_type, party_id from zalo_identities where zalo_account_id = $1 and zalo_uid = $2`,
    [account, senderUid]
  );
  if (rows.length === 0) return { type: 'unknown', id: null, account };
  return { type: rows[0]!.party_type, id: rows[0]!.party_id, account };
}

export interface ConversationRow {
  id: string;
  party_type: Party['type'] | null;
  party_id: string | null;
  human_takeover_until: string | null;
}

/** SPEC-P03 §11.6 (N11): KHONG con ghi de `party_id` cua conversation da co
 * — neu da co nguoi khac gan voi thread nay, coi la mismatch (tra ve
 * `mismatch:true`), KHONG cap nhat gi. Chi gan `party_type/party_id` khi
 * conversation moi tao hoac dang trong (chua tung gan). */
export async function getOrCreateConversation(
  account: 'bql' | 'market',
  threadId: string,
  party: Party
): Promise<{ conversation: ConversationRow; mismatch: boolean }> {
  const inserted = await sql<ConversationRow>(
    `insert into conversations (zalo_account_id, thread_id, party_type, party_id)
     values ($1,$2,$3,$4)
     on conflict (zalo_account_id, thread_id) do nothing
     returning id, party_type, party_id, human_takeover_until::text as human_takeover_until`,
    [account, threadId, party.type, party.id]
  );
  if (inserted.length > 0) {
    return { conversation: inserted[0]!, mismatch: false };
  }
  const rows = await sql<ConversationRow>(
    `select id, party_type, party_id, human_takeover_until::text as human_takeover_until
     from conversations where zalo_account_id = $1 and thread_id = $2`,
    [account, threadId]
  );
  const conv = rows[0]!;
  if (conv.party_id !== null && party.id !== null && conv.party_id !== party.id) {
    return { conversation: conv, mismatch: true };
  }
  if (conv.party_id === null && party.id !== null) {
    await sql(`update conversations set party_type = $1, party_id = $2 where id = $3`, [
      party.type,
      party.id,
      conv.id,
    ]);
    conv.party_type = party.type;
    conv.party_id = party.id;
  }
  return { conversation: conv, mismatch: false };
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

/** §11.3(1)+(2)+(3) P03: che theo THU TU — ma can THAT cua toa (1, can DB)
 * truoc, roi tu khoa/hinh dang chung (2)+(3, thuan). */
export function maskForModel(
  text: string,
  apartmentCodes: readonly string[],
  keepJobCodes: readonly string[] = []
): string {
  return redactPii(redactKnownApartmentCodes(text, apartmentCodes), { keepJobCodes });
}

export async function loadHistory(
  conversationId: string,
  excludeMessageId: number,
  apartmentCodes: readonly string[]
): Promise<MessageParam[]> {
  const rows = await sql<HistoryRow>(
    `select role, content from messages where conversation_id = $1 and id <> $2 order by id desc limit ${HISTORY_LIMIT}`,
    [conversationId, excludeMessageId]
  );
  return rows
    .reverse()
    .map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: maskForModel(r.content?.text ?? '', apartmentCodes),
    }));
}
