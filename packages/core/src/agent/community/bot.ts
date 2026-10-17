// packages/core/src/agent/community/bot.ts — uid cua bot trong kenh dang chay.
// Kenh gia lap: `BOT_UID_SIM`. Zalo that: worker biet uid cua minh (`ownUid`) nhung CHUA ghi vao DB —
// tam doc env `BOT_ZALO_UID` (cau hoi mo trong report R07; gói P02b/P09 chot nguon that).

import { BOT_UID_SIM } from '../../sim/sim-transport.js';

export function resolveBotUid(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.BOT_ZALO_UID?.trim();
  return v ? v : BOT_UID_SIM;
}
