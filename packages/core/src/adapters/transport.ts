// packages/core/src/adapters/transport.ts — noi DUY NHAT noi voi zca-js qua
// worker (BB-07, 01-CONTRACTS.md §8). Hop dong `Transport` giu nguyen giua
// SimTransport (P01, Đ13) va Zalo that (P02) — doi TRANSPORT khong sua core.
// Ham DUY NHAT ghi bang `outbox` la `enqueue` trong file nay (BB-04) —
// scripts/check_adapter_boundary.mjs quet chuoi "insert into outbox" ngoai
// day va ngoai db/migrations.

import { sql } from './db.js';

export type SessionState = 'logged_out' | 'qr_pending' | 'connected' | 'kicked' | 'reconnecting' | 'dead';

export interface InboundEvent {
  id: number;
  zaloAccountId: string;
  zaloMsgId: string;
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  isSelf: boolean;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export interface OutboxInsert {
  zaloAccountId: 'bql' | 'market';
  threadId: string;
  threadType: 'user' | 'group';
  kind: 'text' | 'image' | 'typing' | 'seen';
  body: Record<string, unknown>;
  notBefore?: Date;
  jobId?: string | null;
}

export interface Transport {
  onInbound(handler: (e: InboundEvent) => Promise<void>): void;
  enqueue(msg: OutboxInsert): Promise<number>;
  status(account: 'bql' | 'market'): Promise<SessionState>;
}

/** Ham DUY NHAT ghi bang `outbox` (BB-04). */
export async function enqueue(msg: OutboxInsert): Promise<number> {
  const rows = await sql<{ id: number }>(
    `insert into outbox (zalo_account_id, thread_id, thread_type, kind, body, not_before, job_id)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      msg.zaloAccountId,
      msg.threadId,
      msg.threadType,
      msg.kind,
      JSON.stringify(msg.body),
      msg.notBefore ?? new Date(),
      msg.jobId ?? null,
    ]
  );
  return rows[0]!.id;
}

async function simStatus(account: 'bql' | 'market'): Promise<SessionState> {
  const rows = await sql<{ session_state: SessionState }>(
    `select session_state from zalo_accounts where id = $1`,
    [account]
  );
  return rows[0]?.session_state ?? 'logged_out';
}

let simInboundHandler: ((e: InboundEvent) => Promise<void>) | null = null;

/** Handler dang ky qua `Transport.onInbound` cho SimTransport — doc boi
 * `sim/sim-transport.ts` khi `processInbound` khong duoc truyen handler
 * tuong minh. P01 dung `echoHandler`; P03 thay bang agent, KHONG sua
 * SimTransport (SPEC-P01 §6). */
export function getRegisteredSimHandler(): ((e: InboundEvent) => Promise<void>) | null {
  return simInboundHandler;
}

function createSimTransport(): Transport {
  return {
    onInbound(handler) {
      simInboundHandler = handler;
    },
    enqueue,
    status: simStatus,
  };
}

/** `createTransport()` chon theo env `TRANSPORT` (`sim` mac dinh; `zalo` =>
 * nem loi "P02 chua lam" — SPEC-P01-Foundation.md §4). */
export function createTransport(): Transport {
  const mode = (process.env.TRANSPORT ?? 'sim').trim();
  if (mode === 'sim') return createSimTransport();
  if (mode === 'zalo') {
    throw new Error('TRANSPORT=zalo: P02 chua lam (SPEC-P02-Zalo-Transport.md).');
  }
  throw new Error(`TRANSPORT="${mode}" khong hop le. Chi nhan "sim" hoac "zalo".`);
}
