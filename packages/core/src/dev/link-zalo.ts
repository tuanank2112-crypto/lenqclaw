// packages/core/src/dev/link-zalo.ts — `npm run dev:link-zalo -- --owner [--uid <uid>]`
// (SPEC-P01 §3). CHI khi DATA_MODE=sim (khac => exit 1). Ghi
// account_owners('community', uid, 'dev') de gan Zalo that vao vai chu (owner);
// bo `--uid` => lay sender_uid cua tin DM inbound_events moi nhat CHUA la owner
// va CHUA la thanh vien nhom nao tren tai khoan do.

import { pathToFileURL } from 'node:url';
import { sql, closeDb } from '../adapters/db.js';
import { audit } from '../services/audit.js';
import type { AccountId } from '../domain/types.js';

export class LinkZaloError extends Error {
  readonly code = 'LinkZaloError';
}

const ACCOUNT: AccountId = 'community';

export interface LinkZaloArgs {
  /** Chi `true` — hien chi ho tro gan vai owner. */
  owner: boolean;
  uid?: string;
}

export interface LinkZaloResult {
  account: AccountId;
  uid: string;
  created: boolean;
}

export async function linkZalo(args: LinkZaloArgs): Promise<LinkZaloResult> {
  if (process.env.DATA_MODE !== 'sim') {
    throw new LinkZaloError('dev:link-zalo CHI chay khi DATA_MODE=sim.');
  }
  if (!args.owner) {
    throw new LinkZaloError('thieu --owner (hien chi ho tro gan vai chu).');
  }

  let uid = args.uid?.trim();
  if (!uid) {
    const latest = await sql<{ sender_uid: string }>(
      `select ie.sender_uid from inbound_events ie
       where ie.zalo_account_id = $1 and not ie.is_self and ie.thread_type = 'user' and ie.sender_uid <> 'system'
         and not exists (select 1 from account_owners ao where ao.zalo_account_id = ie.zalo_account_id and ao.zalo_uid = ie.sender_uid)
         and not exists (select 1 from group_members gm where gm.zalo_account_id = ie.zalo_account_id and gm.zalo_uid = ie.sender_uid)
       order by ie.id desc limit 1`,
      [ACCOUNT]
    );
    if (latest.length === 0) {
      throw new LinkZaloError(
        `khong co tin DM nao tu nguoi chua duoc nhan dien tren tai khoan ${ACCOUNT} — nhan mot tin roi chay lai, hoac dung --uid.`
      );
    }
    uid = latest[0]!.sender_uid;
  }

  const inserted = await sql<{ zalo_uid: string }>(
    `insert into account_owners (zalo_account_id, zalo_uid, label) values ($1,$2,'dev')
     on conflict (zalo_account_id, zalo_uid) do nothing returning zalo_uid`,
    [ACCOUNT, uid]
  );
  if (inserted.length === 0) return { account: ACCOUNT, uid, created: false };

  await audit(sql, {
    actorType: 'dev',
    actorId: 'dev:link-zalo',
    action: 'dev.link_zalo',
    target: `${ACCOUNT}:${uid}`,
    data: { role: 'owner' },
  });
  return { account: ACCOUNT, uid, created: true };
}

export function parseArgs(argv: readonly string[]): LinkZaloArgs {
  const owner = argv.includes('--owner');
  const i = argv.indexOf('--uid');
  const uid = i >= 0 ? argv[i + 1] : undefined;
  if (!owner) {
    throw new LinkZaloError('cach dung: npm run dev:link-zalo -- --owner [--uid <uid>]');
  }
  return { owner, uid };
}

async function main(): Promise<void> {
  try {
    if (process.env.DATA_MODE !== 'sim') {
      throw new LinkZaloError('dev:link-zalo CHI chay khi DATA_MODE=sim.');
    }
    const r = await linkZalo(parseArgs(process.argv.slice(2)));
    console.log(`link-zalo: account=${r.account} uid=${r.uid} role=owner created=${r.created}`);
    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error(`LINK_ZALO_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  }
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isMain) {
  void main();
}
