// apps/web/app/api/_auth.ts — helper chung cho moi route handler: 401 chua
// dang nhap, 403 sai vai. Mau tu `app/api/zalo/_shared.ts` (`requireZaloAdmin`).

import type { NextRequest } from 'next/server';
import type { StaffRole } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../lib/auth/guard';
import type { SessionPayload } from '../../lib/auth/session';

export type AdminCheck = { ok: true; session: SessionPayload } | { ok: false; status: 401 | 403 };

/** `roles` = danh sach vai duoc phep. Chua dang nhap => 401; dang nhap
 * nhung khong thuoc `roles` => 403. */
export async function requireRole(req: NextRequest, roles: StaffRole[]): Promise<AdminCheck> {
  const session = await getSessionFromRequest(req);
  if (!session) return { ok: false, status: 401 };
  if (!roles.includes(session.role)) return { ok: false, status: 403 };
  return { ok: true, session };
}
