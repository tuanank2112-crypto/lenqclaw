// packages/core/src/adapters/transport.ts — noi DUY NHAT noi voi zca-js qua
// worker (BB-07, 01-CONTRACTS.md §8). Hop dong `Transport` giu nguyen giua
// SimTransport (P01, Đ13) va Zalo that (P02) — doi TRANSPORT khong sua core.
// Ham DUY NHAT ghi bang `outbox` la `enqueue` trong file nay (BB-04) —
// scripts/check_adapter_boundary.mjs quet chuoi "insert into outbox" ngoai
// day va ngoai db/migrations.

import { sql } from './db.js';
import type { AccountId, OutboxBody } from '../domain/types.js';

export type { AccountId };

export type SessionState = 'logged_out' | 'qr_pending' | 'connected' | 'kicked' | 'reconnecting' | 'dead';

export interface InboundEvent {
  id: number;
  zaloAccountId: AccountId;
  zaloMsgId: string;
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  isSelf: boolean;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export type OutboxKind = 'text' | 'image' | 'typing' | 'seen' | 'action' | 'react';

export interface OutboxInsert {
  zaloAccountId: AccountId;
  threadId: string;
  threadType: 'user' | 'group';
  kind: OutboxKind;
  /** 01-CONTRACTS §8.3. `Record<string, unknown>` van duoc nhan de cac
   * dich vu cu khong phai doi kieu; kieu chat nam o `OutboxBody`. */
  body: OutboxBody | Record<string, unknown>;
  notBefore?: Date;
}

export interface Transport {
  onInbound(handler: (e: InboundEvent) => Promise<void>): void;
  enqueue(msg: OutboxInsert): Promise<number>;
  status(account: AccountId): Promise<SessionState>;
}

/** Ham DUY NHAT ghi bang `outbox` (BB-04). */
export async function enqueue(msg: OutboxInsert): Promise<number> {
  const rows = await sql<{ id: number }>(
    `insert into outbox (zalo_account_id, thread_id, thread_type, kind, body, not_before)
     values ($1,$2,$3,$4,$5,$6)
     returning id`,
    [
      msg.zaloAccountId,
      msg.threadId,
      msg.threadType,
      msg.kind,
      JSON.stringify(msg.body),
      msg.notBefore ?? new Date(),
    ]
  );
  return rows[0]!.id;
}

async function simStatus(account: AccountId): Promise<SessionState> {
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
 * cung object: core chi dung `enqueue`/`status`, worker la tien trinh rieng
 * — 01-CONTRACTS §2.3). */
export function createTransport(): Transport {
  const mode = (process.env.TRANSPORT ?? 'sim').trim();
  if (mode === 'sim' || mode === 'zalo') return createSimTransport();
  throw new Error(`TRANSPORT="${mode}" khong hop le. Chi nhan "sim" hoac "zalo".`);
}
