// packages/core/src/dev/link-zalo.ts — `npm run dev:link-zalo -- --account bql
// --resident sim-res-1 [--uid <uid>]` (SPEC-P02 §9.4). CHI khi DATA_MODE=sim
// (khac ⇒ exit 1). Gan Zalo that vao cu dan MO PHONG: ghi zalo_identities
// (party `resident`) cho uid; bo `--uid` ⇒ lay sender_uid cua tin
// inbound_events moi nhat CHUA co danh tinh tren tai khoan do. Dang ky cu
// dan that = SPEC-P04 §2, KHONG lam o day.

import { pathToFileURL } from 'node:url';
import { sql, closeDb } from '../adapters/db.js';
import { audit } from '../services/audit.js';

export class LinkZaloError extends Error {
  readonly code = 'LinkZaloError';
}

export interface LinkZaloArgs {
  account: 'bql' | 'market';
  /** Ma cu dan mo phong = zalo_uid gia trong seed-sim (vd `sim-res-1`). */
  resident: string;
  uid?: string;
}

export interface LinkZaloResult {
  account: string;
  uid: string;
  residentId: string;
  created: boolean;
}

export async function linkZalo(args: LinkZaloArgs): Promise<LinkZaloResult> {
  if (process.env.DATA_MODE !== 'sim') {
    throw new LinkZaloError('dev:link-zalo CHI chay khi DATA_MODE=sim (SPEC-P02 §9.4).');
  }
  if (args.account !== 'bql' && args.account !== 'market') {
    throw new LinkZaloError(`--account "${String(args.account)}" khong hop le.`);
  }
  const residents = await sql<{ party_id: string }>(
    `select party_id from zalo_identities
     where zalo_account_id = $1 and zalo_uid = $2 and party_type = 'resident'`,
    [args.account, args.resident]
  );
  if (residents.length === 0) {
    throw new LinkZaloError(`khong tim thay cu dan mo phong "${args.resident}" tren tai khoan ${args.account} (chay db:seed:sim).`);
  }
  const residentId = residents[0]!.party_id;

  let uid = args.uid?.trim();
  if (!uid) {
    const latest = await sql<{ sender_uid: string }>(
      `select ie.sender_uid from inbound_events ie
       where ie.zalo_account_id = $1 and not ie.is_self and ie.thread_type = 'user'
         and not exists (select 1 from zalo_identities zi where zi.zalo_account_id = ie.zalo_account_id and zi.zalo_uid = ie.sender_uid)
       order by ie.id desc limit 1`,
      [args.account]
    );
    if (latest.length === 0) {
      throw new LinkZaloError(`khong co tin nao tu nguoi chua co danh tinh tren tai khoan ${args.account} — nhan mot tin roi chay lai, hoac dung --uid.`);
    }
    uid = latest[0]!.sender_uid;
  }

  const existing = await sql<{ party_type: string; party_id: string }>(
    `select party_type, party_id from zalo_identities where zalo_account_id = $1 and zalo_uid = $2`,
    [args.account, uid]
  );
  if (existing.length > 0) {
    if (existing[0]!.party_type === 'resident' && existing[0]!.party_id === residentId) {
      return { account: args.account, uid, residentId, created: false };
    }
    throw new LinkZaloError(`uid da gan voi danh tinh khac tren tai khoan ${args.account} — khong ghi de.`);
  }

  await sql(
    `insert into zalo_identities (zalo_account_id, zalo_uid, party_type, party_id) values ($1,$2,'resident',$3)`,
    [args.account, uid, residentId]
  );
  await audit(sql, {
    actorType: 'dev',
    actorId: 'dev:link-zalo',
    action: 'dev.link_zalo',
    target: `${args.account}:${uid}`,
    data: { resident: args.resident },
  });
  return { account: args.account, uid, residentId, created: true };
}

export function parseArgs(argv: readonly string[]): LinkZaloArgs {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const account = get('account');
  const resident = get('resident');
  if (!account || !resident) {
    throw new LinkZaloError('cach dung: npm run dev:link-zalo -- --account bql --resident sim-res-1 [--uid <uid>]');
  }
  return { account: account as LinkZaloArgs['account'], resident, uid: get('uid') };
}

async function main(): Promise<void> {
  try {
    if (process.env.DATA_MODE !== 'sim') {
      throw new LinkZaloError('dev:link-zalo CHI chay khi DATA_MODE=sim (SPEC-P02 §9.4).');
    }
    const r = await linkZalo(parseArgs(process.argv.slice(2)));
    console.log(`link-zalo: account=${r.account} uid=${r.uid} resident=${r.residentId} created=${r.created}`);
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
