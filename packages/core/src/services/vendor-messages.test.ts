// packages/core/src/services/vendor-messages.test.ts — SPEC-P05-Dispatch.md
// §10.10: cac ham mau tin la thuan (khong PII trong tham so tru
// `renderReveal`), noi dung dung dinh dang tieng Viet co dau.

import { describe, expect, it } from 'vitest';
import {
  CLAIM_WON_GROUP,
  HOLD_DM,
  CONFIRMED_DM,
  HOLD_RELEASED_DM,
  ACCESS_PENDING_DM,
  ACCESS_REJECTED_DM,
  renderReveal,
  QUOTE_ASK_RESIDENT,
  DISPATCHED_RESIDENT,
  NO_VENDOR_RESIDENT,
} from './vendor-messages.js';

describe('mau tin phia tho/cu dan — thuan, khong PII (tru renderReveal)', () => {
  it('CLAIM_WON_GROUP/HOLD_DM/CONFIRMED_DM chi nhan ma cuoc + gio — khong ten/SDT/can', () => {
    expect(CLAIM_WON_GROUP('C-24A7', '10:05')).toContain('C-24A7');
    expect(HOLD_DM('C-24A7', '10:15', false)).not.toContain('báo giá');
    expect(HOLD_DM('C-24A7', '10:15', true)).toContain('báo giá');
    expect(CONFIRMED_DM('C-24A7')).toContain('C-24A7');
  });

  it('HOLD_RELEASED_DM/ACCESS_PENDING_DM/ACCESS_REJECTED_DM khong lo ly do BQL', () => {
    expect(HOLD_RELEASED_DM('C-24A7', 'hold_expired')).toContain('hết hạn giữ');
    expect(ACCESS_PENDING_DM('C-24A7')).toContain('C-24A7');
    const rejected = ACCESS_REJECTED_DM('C-24A7');
    expect(rejected).toContain('chuyển cho thợ khác');
    expect(rejected).not.toMatch(/lý do/i);
  });

  it('renderReveal la noi DUY NHAT co ca SDT/can/ma vao trong MOT chuoi', () => {
    const text = renderReveal({
      code: 'C-24A7',
      window: ['14:00 26/09', '17:00 26/09'],
      apartment_code: 'A-0101',
      floor: 1,
      resident_phone: '0901000001',
      access_pass_code: 'AB12CD',
      building_code: 'TOA-A',
    });
    expect(text).toContain('A-0101');
    expect(text).toContain('0901000001');
    expect(text).toContain('AB12CD');
  });

  it('QUOTE_ASK_RESIDENT/DISPATCHED_RESIDENT/NO_VENDOR_RESIDENT dinh dang dung', () => {
    expect(QUOTE_ASK_RESIDENT('C-24A7', 500000, [150000, 400000])).toContain('ĐỒNG Ý');
    expect(DISPATCHED_RESIDENT('C-24A7', 'Nguyễn Văn A', 4.5, ['14:00 26/09', '17:00 26/09'], 'AB12CD')).toContain('AB12CD');
    expect(NO_VENDOR_RESIDENT('C-24A7')).toContain('C-24A7');
  });
});
