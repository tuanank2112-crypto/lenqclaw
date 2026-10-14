// search-knowledge.ts — dung tu khoa thuan (N14): chi [a-z0-9], toi da 12 token.
import { describe, expect, it } from 'vitest';
import { buildQueryTokens, buildTsQueryExpr } from './search-knowledge.js';

describe('buildQueryTokens (N14)', () => {
  it('bo dau, đ -> d, ha chu thuong', () => {
    expect(buildQueryTokens('Đăng ký AI Agent')).toEqual(['dang', 'ky', 'ai', 'agent']);
  });
  it('chi giu [a-z0-9]: ky tu la/nhay/dau cau bi loai', () => {
    const tokens = buildQueryTokens("a'b | c; ŉ ☃ zalo-oa");
    for (const t of tokens) expect(t).toMatch(/^[a-z0-9]+$/);
    expect(tokens).toContain('zalo');
    expect(tokens).toContain('oa');
  });
  it('toi da 12 token', () => {
    const q = Array.from({ length: 20 }, (_, i) => `tu${i}`).join(' ');
    expect(buildQueryTokens(q).length).toBe(12);
  });
  it('chuoi rong / toan ky tu la => mang rong', () => {
    expect(buildQueryTokens('')).toEqual([]);
    expect(buildQueryTokens('!!! ??? ☃')).toEqual([]);
  });
});

describe('buildTsQueryExpr', () => {
  it('noi bang " | " (OR), chi chua [a-z0-9|] va khoang trang', () => {
    const expr = buildTsQueryExpr('Bình chọn trong nhóm');
    expect(expr).toBe('binh | chon | trong | nhom');
    expect(expr).toMatch(/^[a-z0-9| ]+$/);
  });
  it('cau hoi rong => chuoi rong (khong chay SQL)', () => {
    expect(buildTsQueryExpr('   ')).toBe('');
  });
});
