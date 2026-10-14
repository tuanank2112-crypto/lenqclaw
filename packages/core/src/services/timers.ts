// packages/core/src/services/timers.ts — dong ho khong pg-boss (01-CONTRACTS §1).
// `runTimers(now, cfg)` nhan `now` THAM SO — CAM `now()` cua Postgres /
// `Date.now()` trong so sanh. P01: KHUNG RONG (tra `steps: {}`); tung buoc
// (flush ambient, chao thanh vien, cau hoi bo trong, lich, het han the duyet,
// cat dem, bao cao ngay) do P03–P07 dien, moi buoc idempotent va doc lap.

import { readCommunityConfig, type CommunityConfig } from './community-config.js';

export interface TimerReport {
  /** Ten buoc → so muc da xu ly. Rong o P01. */
  steps: Record<string, number>;
}

export async function runTimers(_now: Date, _cfg: CommunityConfig = readCommunityConfig()): Promise<TimerReport> {
  void _now;
  void _cfg;
  return { steps: {} };
}
