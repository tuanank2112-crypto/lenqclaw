// packages/core/src/agent/pii.ts — chuan hoa tieng Viet, khan cap tat dinh
// (§1) va che PII truoc khi gui model (§10.2) cua SPEC-P03-Resident-Agent.md.
// Thuan (khong cham DB/model) de test khong can DB (`npm test`).

/** Bo dau thanh + `đ`->`d`, ha chu thuong, gop khoang trang. KHONG dung thu
 * vien ngoai — cung cong thuc voi `build phase` (NFD + strip combining). */
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

/** SPEC-P03 §1 — danh sach tu khoa khan cap (da chuan hoa, khong dau). */
export const EMERGENCY_TERMS: readonly string[] = [
  'chay',
  'khoi',
  'ket thang',
  'mac ket',
  'ngap',
  'ro gas',
  'mui gas',
  'dien giat',
  'chap dien',
  'boc khoi',
  'nuoc tran hanh lang',
];

/** Khop danh sach `EMERGENCY_TERMS` tren van ban da chuan hoa; tra ve tu khoa
 * khop DAU TIEN hoac `null`. Tat dinh, khong LLM (BB-06). */
export function detectEmergency(text: string): string | null {
  const normalized = normalizeVi(text);
  for (const term of EMERGENCY_TERMS) {
    if (normalized.includes(term)) return term;
  }
  return null;
}

const PHONE_RE = /(\+?84|0)\d{9,10}/g;
const APARTMENT_RE = /\b[A-Z]-?\d{3,4}\b/g;

/** Che SDT va ma can TRUOC khi dua vao ngu canh goi model (§10.2). Ban goc
 * chi nam trong DB — ham nay KHONG ghi gi, chi bien doi chuoi. */
export function redactPii(text: string): string {
  return text.replace(PHONE_RE, '[SĐT]').replace(APARTMENT_RE, '[CĂN]');
}

export function buildEmergencyReply(hotline: string): string {
  return (
    `Đây là tình huống khẩn cấp. Vui lòng gọi ngay hotline BQL: ${hotline}, ` +
    `hoặc 114 (cứu hoả)/115 (y tế) nếu cần. Ban quản lý đã được báo và sẽ liên hệ ngay.`
  );
}

export const REGISTER_REPLY =
  'Xin chào, hệ thống chưa nhận diện anh/chị là cư dân đã đăng ký của toà nhà. ' +
  'Vui lòng liên hệ Ban quản lý để được hỗ trợ đăng ký căn hộ.';
