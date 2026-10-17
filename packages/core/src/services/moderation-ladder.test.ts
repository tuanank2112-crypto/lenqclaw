// moderation-ladder.test.ts — SPEC-P05 §10 hang 1: 14 ca L01–L14 NGUYEN VAN `evidence/ARCH/ladder-ref.txt` (ten ca doi chieu tu file).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decayScore, INCREMENT, LADDER, nextLadderStep, round1, type LadderAction, type LadderVerdict } from './moderation-ladder.js';
import type { Role } from '../domain/types.js';

const H = 3_600_000;
const T0 = new Date('2026-10-17T00:00:00Z');
const at = (hours: number): Date => new Date(T0.getTime() + hours * H);

function step(prev: number, lastH: number, nowH: number, verdict: LadderVerdict, role: Role = 'member') {
  return nextLadderStep({ prevScore: prev, lastUpdatedAt: at(lastH), now: at(nowH), verdict, senderRole: role });
}

interface Case {
  id: string;
  name: string;
  run: () => { score?: number; action: LadderAction; exempt?: boolean };
  expect: { score?: number; action: LadderAction; exempt?: boolean };
}

/** Ten ca = dong `ok   <id> <name>` trong ladder-ref.txt (bo "ok   " va id). */
const CASES: Case[] = [
  { id: 'L01', name: 'spam lan dau => warn', run: () => step(0, 0, 0, 'spam'), expect: { score: 1, action: 'warn' } },
  { id: 'L02', name: 'spam lan 2 cung ngay => delete', run: () => step(1, 0, 1, 'spam'), expect: { score: 2, action: 'delete' } },
  { id: 'L03', name: 'spam lan 3 => kick_requested', run: () => step(2, 0, 1, 'spam'), expect: { score: 3, action: 'kick_requested' } },
  { id: 'L04', name: 'lan 4 => block_requested', run: () => step(3, 0, 1, 'spam'), expect: { score: 4, action: 'block_requested' } },
  { id: 'L05', name: 'scam ngay lan dau => delete (tang 2)', run: () => step(0, 0, 0, 'scam'), expect: { score: 2, action: 'delete' } },
  { id: 'L06', name: 'scam lan 2 => block_requested', run: () => step(2, 0, 1, 'scam'), expect: { score: 4, action: 'block_requested' } },
  { id: 'L07', name: 'ok khong doi diem, khong hanh dong', run: () => step(1.5, 0, 5, 'ok'), expect: { score: 1.5, action: 'none' } },
  { id: 'L08', name: 'unsure khong hanh dong', run: () => step(1.5, 0, 5, 'unsure'), expect: { score: 1.5, action: 'none' } },
  { id: 'L09', name: 'suy giam: 2 diem sau 1 tuan con 1 => spam moi = 2 => delete', run: () => step(2, 0, 168, 'spam'), expect: { score: 2, action: 'delete' } },
  { id: 'L10', name: 'suy giam: 2 diem sau 2 tuan con 0.5 => spam moi = 1.5 => warn', run: () => step(2, 0, 336, 'spam'), expect: { score: 1.5, action: 'warn' } },
  { id: 'L11', name: 'moderator mien tru', run: () => step(0, 0, 0, 'scam', 'moderator'), expect: { score: 0, action: 'none', exempt: true } },
  { id: 'L12', name: 'owner mien tru', run: () => step(0, 0, 0, 'scam', 'owner'), expect: { score: 0, action: 'none', exempt: true } },
  {
    id: 'L13',
    name: 'harass 1.5 => warn; lan 2 => kick',
    run: () => {
      const first = step(0, 0, 0, 'harass');
      expect(first).toMatchObject({ score: 1.5, action: 'warn' });
      return step(first.score, 0, 1, 'harass');
    },
    expect: { score: 3, action: 'kick_requested' },
  },
  { id: 'L14', name: 'dong ho lui (now < last) khong am', run: () => step(2, 10, 0, 'spam'), expect: { score: 3, action: 'kick_requested' } },
];

describe('moderation-ladder — 14 ca nguyen van ladder-ref.txt', () => {
  const refPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../planning/02_2026-10-09_zalo-community-agent/evidence/ARCH/ladder-ref.txt'
  );
  const refLines = readFileSync(refPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^ok\s+L\d\d /.test(l))
    .map((l) => l.replace(/^ok\s+/, ''));

  it('tap ca va ten ca khop dung ladder-ref.txt (14 dong, nguyen van)', () => {
    expect(refLines).toHaveLength(14);
    expect(CASES.map((c) => `${c.id} ${c.name}`)).toEqual(refLines);
  });

  for (const c of CASES) {
    it(`${c.id} ${c.name}`, () => {
      const got = c.run();
      expect(got.action).toBe(c.expect.action);
      if (c.expect.score !== undefined) expect(got.score).toBe(c.expect.score);
      if (c.expect.exempt !== undefined) expect(got.exempt).toBe(c.expect.exempt);
    });
  }
});

describe('moderation-ladder — don vi', () => {
  it('hang so khop SPEC §4', () => {
    expect(LADDER).toEqual({ halfLifeHours: 168, warn: 1, delete: 2, kick: 3, block: 4 });
    expect(INCREMENT).toEqual({ ok: 0, unsure: 0, spam: 1, ad: 1, harass: 1.5, scam: 2 });
  });
  it('lam tron 1 chu so truoc khi so nguong: 1 + 1 sau 1 gio = 1,996 ⇒ 2,0 ⇒ delete (D17)', () => {
    expect(decayScore(1, at(0), at(1))).toBeLessThan(1);
    expect(1 * Math.pow(0.5, 1 / 168) + 1).toBeLessThan(2);
    expect(round1(1.996)).toBe(2);
    expect(step(1, 0, 1, 'spam').action).toBe('delete');
  });
  it('decayScore: 1 tuan ⇒ nua; dong ho lui ⇒ khong tang', () => {
    expect(decayScore(2, at(0), at(168))).toBeCloseTo(1, 9);
    expect(decayScore(2, at(10), at(0))).toBe(2);
  });
  it('ad = spam (1); exempt khong doi diem du co diem cu', () => {
    expect(step(0, 0, 0, 'ad')).toMatchObject({ score: 1, action: 'warn' });
    expect(step(2.5, 0, 0, 'spam', 'moderator')).toEqual({ score: 2.5, action: 'none', exempt: true });
  });
});
