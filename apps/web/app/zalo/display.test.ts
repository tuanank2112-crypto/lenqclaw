// apps/web/app/zalo/display.test.ts — SPEC-P02 §9.8: chon hien thi thuan
// (khong DOM) cho 4 trang thai QR + connected.

import { describe, expect, it } from 'vitest';
import { needsNewQrButton, selectZaloDisplay } from './display';

describe('selectZaloDisplay (§9.8)', () => {
  it('connected thang moi qr_state', () => {
    expect(selectZaloDisplay({ session_state: 'connected', qr_state: 'expired' })).toBe('connected');
    expect(selectZaloDisplay({ session_state: 'connected', qr_state: null })).toBe('connected');
  });

  it('waiting_scan ⇒ hien anh QR', () => {
    expect(selectZaloDisplay({ session_state: 'qr_pending', qr_state: 'waiting_scan' })).toBe('waiting_scan');
  });

  it('scanned ⇒ an anh QR, cho xac nhan tren dien thoai', () => {
    expect(selectZaloDisplay({ session_state: 'qr_pending', qr_state: 'scanned' })).toBe('scanned');
  });

  it('expired / declined ⇒ nut lay ma QR moi', () => {
    expect(selectZaloDisplay({ session_state: 'qr_pending', qr_state: 'expired' })).toBe('expired');
    expect(selectZaloDisplay({ session_state: 'logged_out', qr_state: 'declined' })).toBe('declined');
    expect(needsNewQrButton('expired')).toBe(true);
    expect(needsNewQrButton('declined')).toBe(true);
    expect(needsNewQrButton('waiting_scan')).toBe(false);
    expect(needsNewQrButton('connected')).toBe(false);
  });

  it('logged_out chua tung bat dau QR (qr_state null) ⇒ idle (nut dang nhap thuong)', () => {
    expect(selectZaloDisplay({ session_state: 'logged_out', qr_state: null })).toBe('idle');
    expect(selectZaloDisplay({ session_state: 'kicked', qr_state: null })).toBe('idle');
    expect(selectZaloDisplay({ session_state: 'dead', qr_state: null })).toBe('idle');
    expect(selectZaloDisplay({ session_state: 'reconnecting', qr_state: null })).toBe('idle');
  });
});
