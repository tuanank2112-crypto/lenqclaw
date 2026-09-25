// packages/core/src/agent/vendor-intent.ts — luoi an toan tat dinh cho tin
// nhan cua tho (SPEC-P05-Dispatch.md §10.4.2, Đ21/Đ27): thuan, khong goi DB
// hay model. Model hieu y (`agent/vendor-triage.ts`, P05-C) la duong CHINH;
// cac ham o day chi la LUOI khi model chet hoac de doi chieu danh sach cum
// khop BANG NHAU (khong "chua" — vung cam SPEC-P05 §10.14).

import { normalizeVi } from './pii.js';

/** Chuan hoa 'C-' + 4 ky tu HOA, bo trung, giu thu tu xuat hien. Alphabet
 * khop `agent/job-code.ts` (khong nham lan: khong co I, L, O, 0, 1). */
export const JOB_CODE_RE =
  /(?<![\p{L}\p{N}])[Cc]\s?[-–]?\s?([ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz]{4})(?![\p{L}\p{N}])/gu;

export function extractJobCodes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(JOB_CODE_RE)) {
    const code = `C-${m[1]!.toUpperCase()}`;
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** Ha dau + thuong hoa nhung GIU NGUYEN so/dau cham/phay/khoang trang —
 * khac `normalizeVi` (ham do thay moi ky tu khong phai chu/so bang khoang
 * trang, pha vo dinh dang so nhu "350.000"). Chi dung rieng cho gia. */
function deaccentKeepPunct(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// Alternation duoc thu THEO THU TU (trai qua phai o moi vi tri) — regex
// engine chi roi sang nhanh tiep theo neu nhanh truoc that bai TAI CHINH VI
// TRI do, nen "1.2 trieu"/"1tr2" duoc MOT nhanh nuot tron, khong bi nhanh
// "so tran" o cuoi khop chong len mot phan con lai (tranh bao gia tri thu
// hai gia — R12 tu kiem tay 2026-09-26).
// 1) '<n>.<d> tr|trieu'  2) '<n>tr<d>' (khong co khoang trang)
// 3) '<n> tr|trieu' (nguyen trieu)  4) '<n>k'  5) '<n>.<nnn>[.<nnn>...]'
// 6) so tran (fallback).
const PRICE_TOKEN_RE =
  /(\d+)[.,](\d)\s*(?:tr|trieu)\b|(\d+)tr(\d)(?!\d)|(\d+)\s*(?:tr|trieu)\b|(\d+)\s*k\b|(\d{1,3}(?:[.,]\d{3})+)\b|(\d+)\b/gu;

function tokenValueVnd(m: RegExpExecArray): number {
  if (m[1] !== undefined) return Number(m[1]) * 1_000_000 + Number(m[2]) * 100_000; // 1) '1.2 trieu'
  if (m[3] !== undefined) return Number(m[3]) * 1_000_000 + Number(m[4]) * 100_000; // 2) '1tr2'
  if (m[5] !== undefined) return Number(m[5]) * 1_000_000; // 3) '2 trieu'
  if (m[6] !== undefined) return Number(m[6]) * 1000; // 4) '350k'
  if (m[7] !== undefined) return Number(m[7].replace(/[.,]/g, '')); // 5) '350.000'
  const n = Number(m[8]); // 6) so tran
  return n >= 50 && n <= 999 ? n * 1000 : n;
}

/** '350k' => 350000 · '350.000'/'350,000' => 350000 · '1tr2'/'1,2 trieu' =>
 * 1200000 · '2 trieu' => 2000000 · so tran 50-999 => x1000 · >=10000 =>
 * nguyen; ngoai [20000, 50000000] hoac tim thay >1 so KHAC NHAU => null
 * (SPEC-P05-Dispatch.md §10.4.2). */
export function parsePriceVnd(text: string): number | null {
  const norm = deaccentKeepPunct(text);
  const values = new Set<number>();
  for (const m of norm.matchAll(PRICE_TOKEN_RE)) {
    values.add(tokenValueVnd(m));
  }
  if (values.size === 0 || values.size > 1) return null;
  const value = [...values][0]!;
  if (value < 20_000 || value > 50_000_000) return null;
  return value;
}

const TRAILING_PARTICLES = new Set(['a', 'nhe', 'nha', 'luon', 'di', 'em', 'anh', 'chi', 'minh']);

function normalizeForPhrase(text: string): string {
  const withoutPunct = text.replace(/[.,!;:?]+$/u, '');
  const norm = normalizeVi(withoutPunct);
  const tokens = norm.split(' ').filter(Boolean);
  while (tokens.length > 1 && TRAILING_PARTICLES.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(' ');
}

/** Ma cuoc dua qua CUNG `normalizeVi` nhu van ban (Vd "C-24A7" =>
 * "c 24a7" — dau '-' thanh khoang trang, giong het cach van ban nguoi
 * dung go duoc chuan hoa) de cum mau "nhan <code>" khop dung tung tu. */
function normalizedCode(code: string | null): string | null {
  if (!code) return null;
  return normalizeVi(code);
}

function buildPhraseSet(templates: string[], codeToken: string | null): Set<string> {
  const set = new Set<string>();
  for (const t of templates) {
    set.add(t);
    if (codeToken) set.add(t.replace('<code>', codeToken));
  }
  return set;
}

export function matchesClaimPhrase(text: string, code: string | null): boolean {
  const norm = normalizeForPhrase(text);
  const codeToken = normalizedCode(code);
  const templates = [
    'nhan',
    'nhan <code>',
    '<code> nhan',
    'em nhan <code>',
    'e nhan <code>',
    'toi nhan <code>',
    'minh nhan <code>',
    'lay <code>',
    'em lay <code>',
    'nhan cuoc <code>',
  ];
  return buildPhraseSet(templates, codeToken).has(norm);
}

export function matchesConfirmPhrase(text: string, code: string | null): boolean {
  const norm = normalizeForPhrase(text);
  const codeToken = normalizedCode(code);
  const templates = ['ok', 'oke', 'okay', 'xac nhan', 'dong y', 'chot', 'duoc', 'ok <code>', 'xac nhan <code>'];
  return buildPhraseSet(templates, codeToken).has(norm);
}

export function matchesDeclinePhrase(text: string, code: string | null): boolean {
  const norm = normalizeForPhrase(text);
  const codeToken = normalizedCode(code);
  const equalTemplates = ['thoi', 'huy', 'bo', 'khong', 'ko', 'k', 'khong nhan', 'khong lam', 'em khong nhan'];
  const prefixTemplates = buildPhraseSet(['huy <code>', 'bo <code>'], codeToken);
  if (buildPhraseSet(equalTemplates, codeToken).has(norm)) return true;
  for (const p of prefixTemplates) {
    if (norm === p || norm.startsWith(`${p} `)) return true;
  }
  return false;
}
