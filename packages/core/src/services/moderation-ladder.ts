// packages/core/src/services/moderation-ladder.ts — thang canh cao (SPEC-P05 §4, D17). THUAN: khong I/O, khong dong ho.
// Suy giam nua doi 168 gio; nguong warn 1 / delete 2 / kick 3 / block 4; tang spam/ad 1 · harass 1,5 · scam 2.
// LAM TRON 1 chu so thap phan TRUOC khi so nguong (1 + 1 sau 1 gio suy giam = 1,996 → 2,0 ⇒ delete — D17).
// Ban tham chieu: planning/02_*/evidence/ARCH/ladder-ref.txt (14 ca L01–L14).

import type { Role } from '../domain/types.js';

export const LADDER = { halfLifeHours: 168, warn: 1, delete: 2, kick: 3, block: 4 } as const;
export const INCREMENT = { ok: 0, unsure: 0, spam: 1, ad: 1, harass: 1.5, scam: 2 } as const;

export type LadderVerdict = keyof typeof INCREMENT;
export type LadderAction = 'none' | 'warn' | 'delete' | 'kick_requested' | 'block_requested';

/** Lam tron 1 chu so thap phan (nua len; EPSILON chong sai so nhi phan kieu 1,95). */
export function round1(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

/** score × 0.5^(gio / halfLife); gio < 0 (dong ho lui) ⇒ coi 0 — diem khong bao gio tang do suy giam. */
export function decayScore(score: number, lastUpdatedAt: Date, now: Date, halfLifeHours: number = LADDER.halfLifeHours): number {
  const hours = Math.max(0, (now.getTime() - lastUpdatedAt.getTime()) / 3_600_000);
  return score * Math.pow(0.5, hours / halfLifeHours);
}

export interface LadderInput {
  prevScore: number;
  lastUpdatedAt: Date;
  now: Date;
  verdict: LadderVerdict;
  senderRole: Role;
  halfLifeHours?: number;
}

export interface LadderStep {
  score: number;
  action: LadderAction;
  exempt: boolean;
}

export function nextLadderStep(a: LadderInput): LadderStep {
  // owner/moderator mien tru (vung cam P05 §8): KHONG doi diem, KHONG hanh dong.
  if (a.senderRole === 'owner' || a.senderRole === 'moderator') return { score: a.prevScore, action: 'none', exempt: true };
  const inc = INCREMENT[a.verdict];
  if (inc === 0) return { score: a.prevScore, action: 'none', exempt: false };
  const score = round1(decayScore(a.prevScore, a.lastUpdatedAt, a.now, a.halfLifeHours ?? LADDER.halfLifeHours) + inc);
  const action: LadderAction =
    score >= LADDER.block ? 'block_requested' : score >= LADDER.kick ? 'kick_requested' : score >= LADDER.delete ? 'delete' : score >= LADDER.warn ? 'warn' : 'none';
  return { score, action, exempt: false };
}
