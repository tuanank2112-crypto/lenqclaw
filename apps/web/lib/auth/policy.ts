// apps/web/lib/auth/policy.ts — phan quyen 2 vai `admin` / `operator`
// (SPEC-P01 §3.1, D13). Ham thuan, `middleware.ts` goi ham nay. CAM dat logic
// phan quyen o noi khac.

import type { StaffRole } from '@lenqclaw/core';

/**
 * Bang phan quyen (SPEC-P01 §3.1):
 *
 * | Duong dan                                                                  | admin | operator            | chua dang nhap |
 * | /login, /api/auth/*                                                        | ok    | ok                  | ok             |
 * | /                                                                          | ok    | ok                  | -> /login      |
 * | /groups, /persona, /knowledge, /automations (+ /api/<cung ten>)            | ok    | doc (GET); khac 403 | -> /login      |
 * | /approvals, /leads, /moderation (+ /api/<cung ten>), /agent                | ok    | ok                  | -> /login      |
 * | /zalo, /api/zalo, /dev, /api/dev, /admin                                   | ok    | 403                 | -> /login      |
 * | duong khac                                                                 | 403   | 403                 | -> /login      |
 *
 * `role=null` (chua dang nhap) chi duoc `true` cho /login va /api/auth/*;
 * middleware.ts tu quyet dinh chuyen huong /login cho phan con lai.
 */

/**
 * `pathname` khop `base` theo RANH GIOI DOAN DUONG DAN: dung bang `base`
 * hoac bat dau bang `base + '/'` (`startsWith('/groups')` khong ranh gioi se
 * khop nham `/groupsX`).
 */
function matchesSegment(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function matchesAny(pathname: string, bases: readonly string[]): boolean {
  return bases.some((b) => matchesSegment(pathname, b));
}

// Doc cho operator, ghi chi admin.
const READ_ONLY_FOR_OPERATOR = [
  '/groups', '/api/groups',
  '/persona', '/api/persona',
  '/knowledge', '/api/knowledge',
  '/automations', '/api/automations',
] as const;

// Ca hai vai deu duoc (ke ca ghi).
const BOTH_ROLES = [
  '/approvals', '/api/approvals',
  '/leads', '/api/leads',
  '/moderation', '/api/moderation',
  '/agent',
] as const;

// Chi admin.
const ADMIN_ONLY = ['/zalo', '/api/zalo', '/dev', '/api/dev', '/admin'] as const;

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | (string & {});

export function canAccess(role: StaffRole | null, pathname: string, method: HttpMethod = 'GET'): boolean {
  if (matchesSegment(pathname, '/login') || matchesSegment(pathname, '/api/auth')) return true;
  if (role === null) return false;
  if (pathname === '/') return true;
  if (matchesAny(pathname, ADMIN_ONLY)) return role === 'admin';
  if (matchesAny(pathname, READ_ONLY_FOR_OPERATOR)) {
    if (role === 'admin') return true;
    const m = method.toUpperCase();
    return role === 'operator' && (m === 'GET' || m === 'HEAD');
  }
  if (matchesAny(pathname, BOTH_ROLES)) return role === 'admin' || role === 'operator';
  return false;
}
