// welcome.test.ts (THUAN) — WELCOME_TEMPLATE (SPEC-P05 §7.3, D41/F13): ten qua redactPhones, mot dong, <= 40 ky tu; > 5 nguoi ⇒ 5 ten + "va N ban khac".
import { describe, expect, it } from 'vitest';
import { APPROVAL_RESULT_DM, WELCOME_TEMPLATE } from '../agent/community/prompts/system.js';
import { idShortOf } from './approvals.js';

const tpl = (names: string[]) => WELCOME_TEMPLATE(names, 'Nhóm AI', 'Claw');

describe('WELCOME_TEMPLATE — F13', () => {
  it('ten rong ⇒ "cac ban"', () => {
    expect(tpl([])).toBe('Chào mừng các bạn đã tham gia Nhóm AI! Bạn cứ hỏi mình về AI agent hoặc gõ @Claw nhé.');
  });
  it('1–5 ten: liet ke het, khong "va N ban khac"', () => {
    const t = tpl(['A', 'B', 'C', 'D', 'E']);
    expect(t).toContain('A, B, C, D, E đã tham gia');
    expect(t).not.toContain('bạn khác');
  });
  it('> 5 nguoi ⇒ 5 ten dau + "và N bạn khác"', () => {
    const t = tpl(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(t).toContain('A, B, C, D, E và 2 bạn khác đã tham gia');
    expect(t).not.toContain('F');
  });
  it('ten la so dien thoai ⇒ che [SĐT]', () => {
    const t = tpl(['Nguyễn An 0912345678', '0987 654 321']);
    expect(t).not.toMatch(/0912345678|0987 654 321/);
    expect(t).toContain('[SĐT]');
  });
  it('ten co xuong dong / tab ⇒ gop thanh MOT dong', () => {
    const t = tpl(['An\nBình\r\nChào\tcả nhà']);
    expect(t.includes('\n')).toBe(false);
    expect(t.includes('\r')).toBe(false);
    expect(t.includes('\t')).toBe(false);
  });
  it('ten dai > 40 ky tu bi cat con <= 40', () => {
    const long = 'N'.repeat(100);
    const t = tpl([long]);
    expect(t).toContain('N'.repeat(40));
    expect(t).not.toContain('N'.repeat(41));
  });
  it('ten chi gom khoang trang ⇒ bo; khong con ten nao ⇒ "cac ban"', () => {
    expect(tpl(['  ', '\n'])).toContain('Chào mừng các bạn đã tham gia');
  });
});

describe('APPROVAL_RESULT_DM — F10 (idShort 8 ky tu)', () => {
  const FULL = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  it('dung 8 ky tu dau cua uuid, cung do dai voi idShortOf', () => {
    const t = APPROVAL_RESULT_DM(FULL, 'kick_member', 'executed');
    expect(t).toContain(idShortOf(FULL));
    expect(t).toContain('1a2b3c4d');
    expect(t).not.toContain('1a2b3c4d-');
  });
});
