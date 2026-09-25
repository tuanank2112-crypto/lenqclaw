// packages/core/src/agent/vendor-intent.test.ts — SPEC-P05-Dispatch.md
// §10.4.2 (luoi an toan tat dinh, thuan). `npm test` (khong can DB).

import { describe, expect, it } from 'vitest';
import {
  extractJobCodes,
  parsePriceVnd,
  matchesClaimPhrase,
  matchesConfirmPhrase,
  matchesDeclinePhrase,
} from './vendor-intent.js';

describe('extractJobCodes', () => {
  it('bat ma dang "C-XXXX" co/khong dau gach, hoa/thuong, chuan hoa HOA', () => {
    expect(extractJobCodes('nhận C-24A7')).toEqual(['C-24A7']);
    expect(extractJobCodes('nhan c24a7 nhe')).toEqual(['C-24A7']);
    expect(extractJobCodes('C 24A7')).toEqual(['C-24A7']);
  });

  it('bo trung, giu thu tu xuat hien', () => {
    expect(extractJobCodes('C-24A7 va C-24A7 roi C-99ZZ')).toEqual(['C-24A7', 'C-99ZZ']);
  });

  it('khong bat khi dinh lien voi chu/so khac (ranh gioi)', () => {
    expect(extractJobCodes('ABC-24A7X')).toEqual([]);
  });

  it('rong khi khong co ma', () => {
    expect(extractJobCodes('em chao anh')).toEqual([]);
  });
});

describe('parsePriceVnd', () => {
  it('"350k" => 350000', () => {
    expect(parsePriceVnd('350k')).toBe(350000);
  });
  it('"350.000" va "350,000" => 350000', () => {
    expect(parsePriceVnd('350.000')).toBe(350000);
    expect(parsePriceVnd('350,000')).toBe(350000);
  });
  it('"1tr2" va "1,2 triệu" => 1200000', () => {
    expect(parsePriceVnd('1tr2')).toBe(1200000);
    expect(parsePriceVnd('1,2 triệu')).toBe(1200000);
  });
  it('"2 triệu" => 2000000', () => {
    expect(parsePriceVnd('2 triệu')).toBe(2000000);
  });
  it('so tran 50-999 => x1000', () => {
    expect(parsePriceVnd('350')).toBe(350000);
    expect(parsePriceVnd('99')).toBe(99000);
  });
  it('>=10000 => giu nguyen', () => {
    expect(parsePriceVnd('25000')).toBe(25000);
  });
  it('ngoai [20000, 50000000] => null', () => {
    expect(parsePriceVnd('10000')).toBeNull();
    expect(parsePriceVnd('60000000')).toBeNull();
    expect(parsePriceVnd('1')).toBeNull();
  });
  it('>1 so KHAC NHAU trong cung tin => null', () => {
    expect(parsePriceVnd('300k hay 400k cung duoc')).toBeNull();
  });
  it('nhieu lan nhac CUNG mot so => khong ambiguous, tra ve gia tri do', () => {
    expect(parsePriceVnd('350k, chot 350k nhe')).toBe(350000);
  });
  it('khong co so => null', () => {
    expect(parsePriceVnd('em chua ro gia')).toBeNull();
  });
});

describe('matchesClaimPhrase', () => {
  it('khop "nhan" don le (khong can ma)', () => {
    expect(matchesClaimPhrase('Nhận!', null)).toBe(true);
  });
  it('khop "nhan <code>" co/khong dau, hoa/thuong, tieu tu cuoi', () => {
    expect(matchesClaimPhrase('nhận C-24A7 nhé', 'C-24A7')).toBe(true);
    expect(matchesClaimPhrase('em nhận C-24A7', 'C-24A7')).toBe(true);
    expect(matchesClaimPhrase('C-24A7 nhận', 'C-24A7')).toBe(true);
  });
  it('KHONG khop khi la cum "chua" (khong dung equality)', () => {
    expect(matchesClaimPhrase('em chưa muốn nhận C-24A7 đâu', 'C-24A7')).toBe(false);
  });
  it('khong khop cau hoi', () => {
    expect(matchesClaimPhrase('C-24A7 giá bao nhiêu?', 'C-24A7')).toBe(false);
  });
});

describe('matchesConfirmPhrase', () => {
  it('khop "ok"/"oke"/"dong y"/"chot"/"duoc"', () => {
    for (const t of ['ok', 'oke', 'okay', 'xác nhận', 'đồng ý', 'chốt', 'được']) {
      expect(matchesConfirmPhrase(t, null)).toBe(true);
    }
  });
  it('khop "ok <code>"', () => {
    expect(matchesConfirmPhrase('ok C-24A7', 'C-24A7')).toBe(true);
  });
  it('khong khop chuoi khac', () => {
    expect(matchesConfirmPhrase('em nghĩ ok đó', null)).toBe(false);
  });
});

describe('matchesDeclinePhrase', () => {
  it('khop bang nhau: thoi/huy/bo/khong/ko/k', () => {
    for (const t of ['thôi', 'huỷ', 'bỏ', 'không', 'ko', 'k']) {
      expect(matchesDeclinePhrase(t, null)).toBe(true);
    }
  });
  it('khop bat dau bang "huy <code>"/"bo <code>"', () => {
    expect(matchesDeclinePhrase('huỷ C-24A7 giúp em', 'C-24A7')).toBe(true);
  });
  it('khong khop cau khac', () => {
    expect(matchesDeclinePhrase('không biết nữa để em xem lại', null)).toBe(false);
  });
});
