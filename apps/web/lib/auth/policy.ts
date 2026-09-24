// apps/web/lib/auth/policy.ts — phan quyen 3 vai (SPEC-P01-Foundation.md §7).
// Ham thuan, `middleware.ts` goi ham nay. CAM dat logic phan quyen o noi khac.

import type { StaffRole } from '@lenqclaw/core';

/**
 * Bang phan quyen (SPEC-P01-Foundation.md §7):
 *
 * | Duong dan            | bql_admin | bql_staff | guard | chua dang nhap |
 * | /login, /api/auth/*  | ok        | ok        | ok    | ok             |
 * | /                    | ok        | ok        | ok    | -> /login      |
 * | /tickets/*           | ok        | ok        | no    | -> /login      |
 * | /gate/*              | ok        | no        | ok    | -> /login      |
 * | /admin/*, /dev/*     | ok        | no        | no    | -> /login      |
 * | duong khac           | no        | no        | no    | -> /login      |
 *
 * `role=null` (chua dang nhap) chi duoc `true` cho /login va /api/auth/*;
 * middleware.ts tu quyet dinh chuyen huong /login cho phan con lai.
 */

/**
 * `pathname` khop `base` theo RANH GIOI DOAN DUONG DAN: dung bang `base`
 * hoac bat dau bang `base + '/'`. R02-tham-dinh D6: `startsWith('/tickets')`
 * (khong co ranh gioi) khop nham `/ticketsX`, `/gate` khop nham `/gatekeeper`
 * — mot route sau nay dat ten trung tien to se lo cheo vai.
 */
function matchesSegment(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function canAccess(role: StaffRole | null, pathname: string): boolean {
  if (matchesSegment(pathname, '/login') || matchesSegment(pathname, '/api/auth')) return true;
  if (role === null) return false;
  if (pathname === '/') return true;
  if (matchesSegment(pathname, '/tickets')) return role === 'bql_admin' || role === 'bql_staff';
  if (matchesSegment(pathname, '/gate')) return role === 'bql_admin' || role === 'guard';
  if (matchesSegment(pathname, '/admin') || matchesSegment(pathname, '/dev') || matchesSegment(pathname, '/api/dev')) {
    return role === 'bql_admin';
  }
  return false;
}
