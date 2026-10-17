// packages/core/src/services/moderation-grid.ts — luoi tat dinh kiem duyet (SPEC-P05 §2). THUAN: khong I/O.
// Uu tien CHINH XAC (khong bao nham): CHI `scam_phrase` (khop BANG NHAU theo ranh gioi tu) va `repeat_burst` la `hard`;
// cac hit con lai la tin hieu mem de model quyet. CAM tu don / cum nhap nhang ("dau tu", "kiem tien" don le).

import type { Role } from '../domain/types.js';
import { normalizeVi, PHONE_RE } from '../agent/community/redact.js';

export type GridHit = 'mass_mention' | 'repeat_burst' | 'link_flood' | 'scam_phrase' | 'contact_spam' | 'invite_link';

export interface GridContext {
  /** Cac mention trong tin (`group_messages.mentions`). */
  mentions: ReadonlyArray<unknown>;
  senderRole: Role;
  /** So tin cua nguoi gui TRONG dem (ke ca tin nay) — nguoi moi (`< 3`) moi bi xet `contact_spam`. */
  senderBufferCount: number;
  /** So tin GIONG HET (sau chuan hoa) nguoi gui da gui trong 10 phut gan nhat, KE CA tin nay (dem tu dem). */
  identicalRecentCount: number;
}

export interface GridResult {
  hits: GridHit[];
  hard: boolean;
}

export const MASS_MENTION_MIN = 8;
export const REPEAT_BURST_MIN = 5;
export const LINK_FLOOD_MIN = 3;
export const CONTACT_SPAM_PHONES = 2;
export const CONTACT_SPAM_MAX_BUFFER = 3;

/** Cum lua dao KHONG nhap nhang (da bo dau, chu thuong). Test sinh tu chinh mang nay (G14). >= 20 cum, moi cum >= 3 tu. */
export const SCAM_PHRASES: readonly string[] = [
  'nhan tien thuong khi dang ky',
  'chuyen khoan truoc de nhan',
  'viec nhe luong cao',
  'link rut tien',
  'ung dung kiem tien moi ngay',
  'kiem tien tai nha khong can von',
  'cong tac vien chot don luong cao',
  'nhiem vu danh gia san pham nhan hoa hong',
  'dau tu sinh loi gap doi trong ngay',
  'cam ket loi nhuan hang ngay',
  'nap tien nhan thuong gap doi',
  'tuyen nhan vien lam viec online tai nha luong cao',
  'click vao link de nhan qua',
  'ban da trung thuong iphone',
  'quet ma qr de nhan tien',
  'khoa tai khoan neu khong xac minh',
  'xac minh tai khoan ngan hang tai link',
  'cho vay lai suat thap khong the chap',
  'giai ngan nhanh trong 5 phut',
  'dang ky nhan ngay tien thuong',
  'lam nhiem vu nhan hoa hong moi ngay',
  'mua bot like follow gia re',
  'nhan qua mien phi bam vao day',
  'tuyen cong tac vien luong 500k moi ngay',
];

const URL_RE = /(?:https?:\/\/|www\.)[^\s]+/gi;
const INVITE_RE = /(?<![a-z0-9.-])(?:zalo\.me\/g\/|t\.me\/)/i;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Cum `phrase` (da chuan hoa) khop BANG NHAU theo ranh gioi tu trong van ban da chuan hoa. */
export function containsPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

export function classifyGrid(text: string, ctx: GridContext): GridResult {
  const hits: GridHit[] = [];
  const privileged = ctx.senderRole === 'owner' || ctx.senderRole === 'moderator';
  const normalized = normalizeVi(text);
  const folded = text.normalize('NFKC');

  if (ctx.mentions.length >= MASS_MENTION_MIN) hits.push('mass_mention');
  if (ctx.identicalRecentCount >= REPEAT_BURST_MIN) hits.push('repeat_burst');
  if (countMatches(folded, URL_RE) >= LINK_FLOOD_MIN) hits.push('link_flood');
  if (SCAM_PHRASES.some((p) => containsPhrase(normalized, p))) hits.push('scam_phrase');
  if (
    ctx.senderBufferCount < CONTACT_SPAM_MAX_BUFFER &&
    countMatches(folded, new RegExp(PHONE_RE.source, 'g')) >= CONTACT_SPAM_PHONES &&
    (containsPhrase(normalized, 'lh') || containsPhrase(normalized, 'lien he') || containsPhrase(normalized, 'zalo'))
  ) {
    hits.push('contact_spam');
  }
  if (!privileged && INVITE_RE.test(folded)) hits.push('invite_link');

  return { hits, hard: hits.includes('scam_phrase') || hits.includes('repeat_burst') };
}
