// packages/core/src/agent/community/roles.ts — danh tinh & vai (D06, BB-04, 01-CONTRACTS §3).
// Vai lay tu `account_owners` + `group_members`, KHONG BAO GIO tu noi dung tin / ten hien thi /
// output model. Tin nhom luon upsert `group_members` TRUOC khi goi `resolveRole`.

import { sql } from '../../adapters/db.js';
import type { AccountId, Role } from '../../domain/types.js';

export async function resolveRole(account: AccountId, uid: string, threadId: string | null): Promise<Role> {
  const owner = await sql(`select 1 from account_owners where zalo_account_id = $1 and zalo_uid = $2`, [account, uid]);
  if (owner.length > 0) return 'owner';

  if (threadId !== null) {
    const m = await sql<{ role: string }>(
      `select role from group_members where zalo_account_id = $1 and thread_id = $2 and zalo_uid = $3 and left_at is null`,
      [account, threadId, uid]
    );
    if (m.length > 0) return m[0]!.role === 'moderator' ? 'moderator' : 'member';
    return 'stranger';
  }

  // DM: la thanh vien neu con hieu luc o BAT KY nhom dang bat.
  const any = await sql(
    `select 1 from group_members m join zalo_groups g
       on g.zalo_account_id = m.zalo_account_id and g.thread_id = m.thread_id
      where m.zalo_account_id = $1 and m.zalo_uid = $2 and m.left_at is null and g.enabled
      limit 1`,
    [account, uid]
  );
  return any.length > 0 ? 'member' : 'stranger';
}

/** Chu tai khoan dau tien (nhan DM handoff / bao cao). null neu chua khai. */
export async function firstOwnerUid(account: AccountId): Promise<string | null> {
  const rows = await sql<{ zalo_uid: string }>(
    `select zalo_uid from account_owners where zalo_account_id = $1 order by created_at, zalo_uid limit 1`,
    [account]
  );
  return rows[0]?.zalo_uid ?? null;
}
