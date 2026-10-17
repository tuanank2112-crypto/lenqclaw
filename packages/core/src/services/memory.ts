// packages/core/src/services/memory.ts — tri nho thanh vien (SPEC-P06 §2, D22; P03 dung phan NEN).
// `rememberMemberNote` CHI GHI (append) ho so; `loadMemberContext` CHI duoc node `prepare` goi cho
// luot DM cua CHINH requester (BB-07: luot nhom khong bao gio doc ho so/ghi chu). Ghi chu cung la du
// lieu khong tin cay (do agent tu ghi tu loi nguoi dung).

import { sql } from '../adapters/db.js';
import type { AccountId } from '../domain/types.js';
import { vnDateString } from './vn-time.js';

const NOTES_MAX = 4000;
const LEAD_FIELDS_BY_PRIORITY = ['contact', 'budget', 'industry', 'channels', 'msg_volume', 'deadline'] as const;

function vnStamp(at: Date): string {
  const t = new Date(at.getTime() + 7 * 3600 * 1000).toISOString();
  return `${vnDateString(at)} ${t.slice(11, 16)}`;
}

/** Them mot dong `[YYYY-MM-DD HH:MM] (nguon) ghi chu`; tong > 4000 ky tu ⇒ bo dong CU nhat. */
export async function rememberMemberNote(args: {
  account: AccountId;
  uid: string;
  note: string;
  source: string;
  displayName?: string | null;
  now?: Date;
}): Promise<{ notesLength: number }> {
  const line = `[${vnStamp(args.now ?? new Date())}] (${args.source}) ${args.note.trim().replace(/\s+/g, ' ')}`;
  const cur = await sql<{ notes: string }>(`select notes from member_profiles where zalo_account_id = $1 and zalo_uid = $2`, [
    args.account,
    args.uid,
  ]);
  const lines = (cur[0]?.notes ?? '').split('\n').filter((l) => l.trim() !== '');
  lines.push(line.slice(0, 600));
  let joined = lines.join('\n');
  while (joined.length > NOTES_MAX && lines.length > 1) {
    lines.shift();
    joined = lines.join('\n');
  }
  if (joined.length > NOTES_MAX) joined = joined.slice(joined.length - NOTES_MAX);
  await sql(
    `insert into member_profiles (zalo_account_id, zalo_uid, display_name, notes, updated_at)
     values ($1,$2,$3,$4, now())
     on conflict (zalo_account_id, zalo_uid)
     do update set notes = $4, display_name = coalesce($3, member_profiles.display_name), updated_at = now()`,
    [args.account, args.uid, args.displayName ?? null, joined]
  );
  return { notesLength: joined.length };
}

export interface MemberContext {
  notes: string | null;
  openLead: { status: string; score: number; missing: string[] } | null;
}

/** Ghi chu + lead mo cua CHINH `uid` (null neu chua co gi). `missing` theo thu tu uu tien SPEC-P06 §3. */
export async function loadMemberContext(account: AccountId, uid: string): Promise<MemberContext> {
  const prof = await sql<{ notes: string }>(`select notes from member_profiles where zalo_account_id = $1 and zalo_uid = $2`, [account, uid]);
  const lead = await sql<Record<string, unknown>>(
    `select status, score, industry, channels, msg_volume, deadline, budget, contact
       from leads where zalo_account_id = $1 and zalo_uid = $2 and status in ('new','qualifying','qualified')`,
    [account, uid]
  );
  const notes = prof[0]?.notes && prof[0].notes.trim() !== '' ? prof[0].notes : null;
  const l = lead[0];
  if (!l) return { notes, openLead: null };
  const empty = (v: unknown): boolean => v === null || v === undefined || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');
  return {
    notes,
    openLead: {
      status: String(l.status),
      score: Number(l.score),
      missing: LEAD_FIELDS_BY_PRIORITY.filter((f) => empty(l[f])),
    },
  };
}
