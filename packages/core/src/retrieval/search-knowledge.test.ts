// search-knowledge.ts — dung tu khoa thuan (N14): chi [a-z0-9], toi da 12 token.
import { describe, expect, it } from 'vitest';
import { buildQueryTokens, buildTsQueryExpr, rrfMerge } from './search-knowledge.js';

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

describe('rrfMerge (SPEC-P04 §2.3, k=60)', () => {
  const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-12);

  it('chi lexical ⇒ giu thu tu, score = 1/(60+rank), vectorRank null', () => {
    const r = rrfMerge(['a', 'b', 'c'], []);
    expect(r.map((x) => x.key)).toEqual(['a', 'b', 'c']);
    near(r[0]!.score, 1 / 61);
    near(r[2]!.score, 1 / 63);
    expect(r.every((x) => x.vectorRank === null)).toBe(true);
    expect(r.map((x) => x.lexicalRank)).toEqual([1, 2, 3]);
  });
  it('chi vector ⇒ muc chi-vector van co mat, lexicalRank null', () => {
    const r = rrfMerge([], ['x', 'y']);
    expect(r.map((x) => [x.key, x.lexicalRank, x.vectorRank])).toEqual([
      ['x', null, 1],
      ['y', null, 2],
    ]);
  });
  it('muc co mat o CA HAI danh sach vuot muc chi o mot danh sach', () => {
    // a: lexical 1 (1/61); b: lexical 2 + vector 1 (1/62 + 1/61) ⇒ b dung truoc a
    const r = rrfMerge(['a', 'b'], ['b']);
    expect(r.map((x) => x.key)).toEqual(['b', 'a']);
    near(r[0]!.score, 1 / 62 + 1 / 61);
  });
  it('lexical hang 1 va chi-vector hang 1 hoa diem ⇒ lexical truoc; lexical hang 2 xuong cuoi', () => {
    const r = rrfMerge(['L1', 'L2'], ['V1']);
    expect(r.map((x) => x.key)).toEqual(['L1', 'V1', 'L2']);
  });
  it('hoa diem tuyet doi: lexicalRank nho truoc, roi vectorRank, roi key', () => {
    // p: lex 1 / vec 2 ; q: lex 2 / vec 1 — cung score 1/61+1/62 ⇒ p (lexicalRank 1) truoc q
    const r = rrfMerge(['p', 'q'], ['q', 'p']);
    expect(r.map((x) => x.key)).toEqual(['p', 'q']);
    near(r[0]!.score, r[1]!.score);
    const r2 = rrfMerge(['m'], ['n']);
    expect(r2.map((x) => x.key)).toEqual(['m', 'n']);
  });
  it('khoa trung trong cung mot danh sach chi tinh hang dau', () => {
    const r = rrfMerge(['a', 'a', 'b'], []);
    expect(r.map((x) => x.key)).toEqual(['a', 'b']);
    expect(r[1]!.lexicalRank).toBe(3);
  });
  it('hai danh sach rong ⇒ rong; k tuy chinh duoc', () => {
    expect(rrfMerge([], [])).toEqual([]);
    near(rrfMerge(['a'], [], 10)[0]!.score, 1 / 11);
  });
});
