// redact.ts — chuan hoa + che SDT (thuan, 0 DB).
import { describe, expect, it } from 'vitest';
import { normalizeVi, redactPhones } from './redact.js';

describe('normalizeVi', () => {
  it('bo dau, đ -> d, ha chu thuong, gop khoang trang', () => {
    expect(normalizeVi('  Xin   CHÀO, Đà Nẵng!  ')).toBe('xin chao da nang');
  });
});

describe('redactPhones', () => {
  it('che SDT dang 0xxx, +84, co dau cach/gach', () => {
    expect(redactPhones('goi 0912345678 nhe')).toBe('goi [SĐT] nhe');
    expect(redactPhones('so +84 912 345 678.')).toBe('so [SĐT].');
    expect(redactPhones('0912-345-678')).toBe('[SĐT]');
  });
  it('che SDT full-width (NFKC)', () => {
    expect(redactPhones('０９１２３４５６７８')).toBe('[SĐT]');
  });
  it('khong dong vao chuoi so ngan / chu tieng Viet', () => {
    expect(redactPhones('co 12345 tin, Việt Nam')).toBe('co 12345 tin, Việt Nam');
  });
});
