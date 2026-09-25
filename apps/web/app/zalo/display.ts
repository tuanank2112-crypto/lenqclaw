// apps/web/app/zalo/display.ts — SPEC-P02 §9.8: chon hien thi THUAN cho
// trang /zalo tu trang thai tai khoan (khong render — test khong can DOM).
// 4 trang thai hien thi + trang thai "connected" (nut dang xuat co xac nhan).

export type ZaloDisplayKind = 'connected' | 'waiting_scan' | 'scanned' | 'expired' | 'declined' | 'idle';

export interface ZaloAccountLike {
  session_state: string;
  qr_state: string | null;
}

/** §9.8: connected thang moi qr_state (da co phien, khong con QR flow). */
export function selectZaloDisplay(a: ZaloAccountLike): ZaloDisplayKind {
  if (a.session_state === 'connected') return 'connected';
  switch (a.qr_state) {
    case 'waiting_scan':
      return 'waiting_scan';
    case 'scanned':
      return 'scanned';
    case 'expired':
      return 'expired';
    case 'declined':
      return 'declined';
    default:
      return 'idle';
  }
}

/** true ⇒ trang hien nut "Lay ma QR moi" thay vi "Dang nhap bang QR" (cung goi POST /login). */
export function needsNewQrButton(kind: ZaloDisplayKind): boolean {
  return kind === 'expired' || kind === 'declined';
}

export const SCANNED_TEXT = 'Đã quét — bấm XÁC NHẬN trên điện thoại Zalo phụ';
export const LOGOUT_CONFIRM_TEXT =
  'Hệ thống xoá phiên; để gỡ hẳn, vào Zalo trên điện thoại → quản lý thiết bị đăng nhập.';
export const NEW_QR_LABEL = 'Lấy mã QR mới';
export const LOGIN_LABEL = 'Đăng nhập bằng QR';
export const LOGOUT_LABEL = 'Đăng xuất Zalo';
