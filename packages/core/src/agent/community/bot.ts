// packages/core/src/agent/community/bot.ts — uid cua bot trong kenh dang chay (D37, 01-CONTRACTS §4.11).
// Thu tu nguon cua `botUid(account)`:
//   1. cot `zalo_accounts.own_uid` (worker ghi `session.ownUid` moi lan phien `connected`) — doc qua cache 60 s
//   2. env `BOT_ZALO_UID`
//   3. CHI khi `DATA_MODE=sim` (mac dinh cua config): `BOT_UID_SIM`
//   (D39) thread `sim-%` + DATA_MODE=sim ⇒ BOT_UID_SIM truoc moi nguon tren.
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
  /** D39: luot gan nhat la thread `sim-%` trong `DATA_MODE=sim` ⇒ `resolveBotUid` tra `BOT_UID_SIM` bat ke cot. */
  sim: boolean;
}
const cache = new Map<string, CacheEntry>();

/** Xoa cache (test). */
export function resetBotUidCache(): void {
  cache.clear();
}

/** D39: sim khong bao gio dung uid that — `DATA_MODE=sim` + thread `sim-%` ⇒ `BOT_UID_SIM` bat ke cot `own_uid`. */
function isSimThread(env: NodeJS.ProcessEnv, threadId: string | undefined): boolean {
  return threadId !== undefined && threadId.startsWith('sim-') && (env.DATA_MODE?.trim() || 'sim') === 'sim';
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
  now: () => number = Date.now,
  threadId?: string
): Promise<string | null> {
  const sim = isSimThread(env, threadId);
  const hit = cache.get(account);
  if (!hit || now() - hit.at >= BOT_UID_CACHE_MS) {
    let uid: string | null = hit?.uid ?? null;
    try {
      const rows = await sql<{ own_uid: string | null }>(`select own_uid from zalo_accounts where id = $1`, [account]);
      uid = rows[0]?.own_uid?.trim() || null;
    } catch {
      /* DB chap chon: giu gia tri cu, thu lai sau 60 s */
    }
    cache.set(account, { uid, at: now(), sim });
  }
  const entry = cache.get(account)!;
  entry.sim = sim;
  if (sim) return BOT_UID_SIM;
  return entry.uid ?? fromEnv(env);
}

/** Dong bo cho node do thi: anh chup cache (`own_uid`) → env → sim → `BOT_UID_UNKNOWN`. */
export function resolveBotUid(env: NodeJS.ProcessEnv = process.env, account: string = 'community'): string {
  const e = cache.get(account);
  if (e?.sim) return BOT_UID_SIM;
  return e?.uid ?? fromEnv(env) ?? BOT_UID_UNKNOWN;
}
