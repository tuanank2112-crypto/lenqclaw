// packages/core/src/agent/community/bot.ts — uid cua bot trong kenh dang chay (D37, 01-CONTRACTS §4.11).
// Thu tu nguon cua `botUid(account)`:
//   1. cot `zalo_accounts.own_uid` (worker ghi `session.ownUid` moi lan phien `connected`) — doc qua cache 60 s
//   2. env `BOT_ZALO_UID`
//   3. CHI khi `DATA_MODE=sim` (mac dinh cua config): `BOT_UID_SIM`
//   4. khong co ⇒ `null`: cong coi nhu KHONG co mention bot (khong doan uid).
// Cac node do thi (graph/**, hinh chot, khong sua) goi ham DONG BO `resolveBotUid()`: no doc anh chup cache moi nhat
// (runner lam moi bang `await botUid()` truoc moi luot) roi env/sim; khong co nguon nao ⇒ `BOT_UID_UNKNOWN` (khong
// khop uid nguoi that nao ⇒ khong ai bi coi la "goi bot").

import { sql } from '../../adapters/db.js';
import { BOT_UID_SIM } from '../../sim/sim-transport.js';

export const BOT_UID_CACHE_MS = 60_000;
/** Gia tri thay `null` cho cac node co kieu `string`: khong bao gio la uid Zalo that (uid Zalo la day so). */
export const BOT_UID_UNKNOWN = 'bot-uid-unknown';

interface CacheEntry {
  uid: string | null;
  at: number;
}
const cache = new Map<string, CacheEntry>();

/** Xoa cache (test). */
export function resetBotUidCache(): void {
  cache.clear();
}

function fromEnv(env: NodeJS.ProcessEnv): string | null {
  const v = env.BOT_ZALO_UID?.trim();
  if (v) return v;
  if ((env.DATA_MODE?.trim() || 'sim') === 'sim') return BOT_UID_SIM;
  return null;
}

/** uid cua bot cho `account` (async: doc cot `own_uid`, cache 60 s). Loi DB ⇒ dung gia tri cache cu / env (khong nem). */
export async function botUid(
  account: string = 'community',
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now
): Promise<string | null> {
  const hit = cache.get(account);
  if (!hit || now() - hit.at >= BOT_UID_CACHE_MS) {
    let uid: string | null = hit?.uid ?? null;
    try {
      const rows = await sql<{ own_uid: string | null }>(`select own_uid from zalo_accounts where id = $1`, [account]);
      uid = rows[0]?.own_uid?.trim() || null;
    } catch {
      /* DB chap chon: giu gia tri cu, thu lai sau 60 s */
    }
    cache.set(account, { uid, at: now() });
  }
  return cache.get(account)!.uid ?? fromEnv(env);
}

/** Dong bo cho node do thi: anh chup cache (`own_uid`) → env → sim → `BOT_UID_UNKNOWN`. */
export function resolveBotUid(env: NodeJS.ProcessEnv = process.env, account: string = 'community'): string {
  return cache.get(account)?.uid ?? fromEnv(env) ?? BOT_UID_UNKNOWN;
}
