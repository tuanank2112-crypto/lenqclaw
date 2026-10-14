// apps/web/app/api/zalo/_shared.ts — dung chung cho trang /zalo va app/api/zalo/**
// (SPEC-P02 §9.2). Chi co tai khoan `community` (env ZALO_ACCOUNTS, mac dinh
// community — D12).

import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '../../../lib/auth/guard';
import type { SessionPayload } from '../../../lib/auth/session';

export type ZaloAccountId = 'community';

export function enabledZaloAccounts(): ZaloAccountId[] {
  const raw = (process.env.ZALO_ACCOUNTS ?? 'community').trim() || 'community';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ZaloAccountId => s === 'community');
}

export type AdminCheck = { ok: true; session: SessionPayload } | { ok: false; status: 401 | 403 };

/** 401 khi chua dang nhap, 403 khi vai khac admin. */
export async function requireZaloAdmin(req: NextRequest): Promise<AdminCheck> {
  const session = await getSessionFromRequest(req);
  if (!session) return { ok: false, status: 401 };
  if (session.role !== 'admin') return { ok: false, status: 403 };
  return { ok: true, session };
}
