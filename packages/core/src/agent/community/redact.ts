// packages/core/src/agent/community/redact.ts — chuan hoa tieng Viet + che SDT
// truoc khi dua noi dung vao model (SPEC-P01 §3, SPEC-P03 §5.3). Thuan (khong
// cham DB/model). Port tu `agent/pii.ts` cua ke hoach 01 (tag
// archive/plan-01-*); CHI giu chuan hoa + SDT — khong khan cap, khong ma can.

/** Bo dau thanh + `đ`->`d`, ha chu thuong, gop khoang trang. */
export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Bieu thuc SDT Viet Nam — GIU NGUYEN bieu thuc cua `pii.ts:137` (co `g`). */
export const PHONE_RE = /(?<!\d)(?:\+?84|0)(?:[\s.\-()]*\d){8,10}(?!\d)/g;

/** Che SDT thanh `[SĐT]`. NFKC truoc de quy chu so full-width ve ASCII;
 * khong doi chu tieng Viet co dau (da o dang canonical). */
export function redactPhones(text: string): string {
  return text.normalize('NFKC').replace(PHONE_RE, '[SĐT]');
}
