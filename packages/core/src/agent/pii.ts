// packages/core/src/agent/pii.ts — chuan hoa tieng Viet, khan cap tat dinh
// (SPEC-P03-Resident-Agent.md §11.1, lop 1) va che PII truoc khi gui model
// (§11.3). Thuan (khong cham DB/model) de test khong can DB (`npm test`).

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

/** Gop day chu cai DON le cach nhau boi `.`/`-`/`_`/khoang trang thanh MOT
 * tu (vd "c.h.á.y" -> "cháy") — SPEC-P03 §11.1 "tien xu ly gop day chu cai
 * don cach boi '.', '-', '_', khoang trang; toi thieu 3 chu cai lien tiep".
 *
 * R06 vong 2 (SO do tren HEAD): `\b` trong JS CHI hieu ASCII (`\w` =
 * [A-Za-z0-9_]) — voi chu co dau, `\b` coi ky tu co dau la "non-word" nen no
 * TU Y tach mot ky tu ASCII don le dung canh ky tu co dau thanh "tu rieng":
 * vd "bốc" (b + ố + c) bi `\b` nhin thanh ranh gioi NGAY SAU "b" (vi "ố" la
 * non-word voi \b), khien "bếp bốc khói" bi hieu la "p"+"b" la hai chu cai
 * don ke nhau (qua khoang trang) va GOP THANH "pb" => "bếpbốc khói" — luoi
 * co dau te liet tren chinh cac cum quan trong nhat (§11.1 A). Sua: dung
 * ranh gioi UNICODE that (`(?<![\p{L}\p{N}])`/`(?![\p{L}\p{N}])`, CAM `\b`)
 * + doi toi thieu 2 REP (tuc >=3 chu cai) de tranh gop nham cap 2 chu ASCII
 * that su dung canh nhau (khong con loi ASCII-boundary de xay ra voi 2).
 */
function collapseSpacedLetters(text: string): string {
  return text.replace(
    /(?<![\p{L}\p{N}])\p{L}(?:[.\-_ ]\p{L}){2,}(?![\p{L}\p{N}])/gu,
    (m) => m.replace(/[.\-_ ]/g, '')
  );
}

/** Chuan hoa GIU DAU (NFC, chu thuong) — dung cho danh sach (A) §11.1. */
function normalizeKeepAccent(text: string): string {
  return collapseSpacedLetters(text).normalize('NFC').toLowerCase();
}

/** Chuan hoa BO DAU — dung cho danh sach (B) §11.1 + doi voi consent/pii. */
function normalizeStripAccent(text: string): string {
  return normalizeVi(collapseSpacedLetters(text));
}

/** SPEC-P03 §11.1 (A) — GIU DAU (NFC, chu thuong). */
export const EMERGENCY_TERMS_ACCENTED: readonly string[] = [
  // R06 (2026-09-25): tu don "cháy" (khong ghep) bi RUT KHOI luoi lop 1 —
  // dung nguyen van SPEC-P03 §11.1(A) gay bao nham tren tu vung sua chua
  // binh thuong rat pho bien ("bóng đèn cháy", "ổ cắm ... bị cháy" — golden
  // co san `responsibility.jsonl` ca R22 dung dung cach noi nay), vi pham
  // thang do bat buoc "0 bao nham tren 70 ca golden" cua chinh §11.1. Cac
  // cum GHEP van giu (an toan hon nhieu — "cháy nổ"/"bốc cháy" hiem khi la
  // sua chua thuong). "cháy" don le nay giao cho lop 2 (model, Đ21) — xem
  // Cau hoi mo trong report R06 (SO can chot lai §11.1(A)).
  'bốc cháy',
  'nhà cháy',
  'nhà bị cháy',
  'hỏa hoạn',
  'hoả hoạn',
  'bốc khói',
  'khói đen',
  'kẹt thang',
  'kẹt trong thang',
  'mắc kẹt',
  'rò gas',
  'rò rỉ gas',
  'xì gas',
  'mùi gas',
  'điện giật',
  'giật điện',
  'chập điện',
  'tia lửa điện',
  'cháy nổ',
  'phát nổ',
  'nước tràn hành lang',
];

/** SPEC-P03 §11.1 (B) — BO DAU, chi cum KHONG nhap nhang (CAM tu don). */
export const EMERGENCY_TERMS_UNACCENTED: readonly string[] = [
  'boc chay',
  'dam chay',
  'chay no',
  'nha chay',
  'nha bi chay',
  'hoa hoan',
  'boc khoi',
  'khoi den',
  'ket thang',
  'ket trong thang',
  'mac ket',
  'ro gas',
  'ro ri gas',
  'xi gas',
  'mui gas',
  'dien giat',
  'giat dien',
  'chap dien',
  'phat no',
  'nuoc tran hanh lang',
];

/** Khop theo RANH GIOI TU (day token nguyen, khong so chuoi con) — muc dich
 * tranh "chay"/"khoi" don le nuot nham "chay may"/"khoi benh" (C5 R05). */
function matchesWordBoundary(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u');
  return re.test(` ${haystack} `);
}

/** Lop 1 — luoi tat dinh, uu tien CHINH XAC (SPEC-P03 §11.1). Khong goi
 * model (BB-06), so theo ranh gioi tu tren HAI ban chuan hoa (giu dau /
 * bo dau). Tra ve tu khoa khop DAU TIEN hoac `null`. */
export function detectEmergency(text: string): string | null {
  const keepAccent = normalizeKeepAccent(text);
  for (const term of EMERGENCY_TERMS_ACCENTED) {
    if (matchesWordBoundary(keepAccent, term)) return term;
  }
  const stripAccent = normalizeStripAccent(text);
  for (const term of EMERGENCY_TERMS_UNACCENTED) {
    if (matchesWordBoundary(stripAccent, term)) return term;
  }
  return null;
}

// SPEC-P05-Dispatch.md §10.10 (Đ27, P05-C — R12 Q2): xuat 2 mau nay de
// `services/pii-gate.ts` import lai thay vi lap regex rieng (ban lap cu da
// bi go bo o file do). Hai regex nay dung o day VOI CO GLOBAL (`g`) cho
// `redactPii` (dung `.replace`); `pii-gate.ts` chi can `.test()` nen tu tao
// bien KHONG-global tu nguon chuoi giong het (tranh bug `lastIndex` cua
// regex global khi dung lai giua nhieu lan goi — da ghi trong pii-gate.ts).
export const PHONE_RE = /(?<!\d)(?:\+?84|0)(?:[\s.\-()]*\d){8,10}(?!\d)/g;
// SPEC-P03 §11.3(2): (1) apartments.code that cua toa (xu ly rieng, can DB —
// xem redactPiiForBuilding); (2) sau tu khoa can|can ho|phong|p. la ma;
// (3) chu(1-2)+so(3-4) khong phan biet hoa thuong.
// R06 vong 2: doi `\b` sang ranh gioi Unicode that (xem ghi chu o
// `collapseSpacedLetters`) — `\b` dung canh chu co dau (vd "...ở căn 0105")
// co the khong bao gio la van de thuc te (tien to ASCII nhieu ky tu it khi
// la manh vo giua tu co dau), nhung do lai cho chac thay vi suy luan.
const APT_AFTER_KEYWORD_RE =
  /(?<![\p{L}\p{N}])(c[ăa]n\s*h[ộo]|c[ăa]n|ph[òo]ng|p\.)(\s*)([A-Za-z]{0,2}[\s.\-]?\d{1,2}[\s.\-]?\d{2})/giu;
export const APT_GENERIC_RE = /(?<![\p{L}\p{N}])[A-Za-z]{1,2}[\s.\-]?\d{3,4}(?![\p{L}\p{N}])/gu;

/** Che SDT va ma can TRUOC khi dua vao ngu canh goi model (§11.3). Phien ban
 * THUAN (khong DB) — dung mau chung (2)+(3); ngoai le ma cuoc cua chinh cu
 * dan (G8, `opts.keepJobCodes`) va danh sach can THAT cua toa (1) do
 * `redactPiiForBuilding` xu ly rieng (can truy van DB). Ban goc chi nam
 * trong DB — ham nay KHONG ghi gi, chi bien doi chuoi. */
export function redactPii(text: string, opts: { keepJobCodes?: readonly string[] } = {}): string {
  const keep = (opts.keepJobCodes ?? []).filter(Boolean);
  // NFKC: quy fullwidth/halfwidth (vd chu so full-width "０-９") ve ASCII
  // thuong truoc khi so khop SDT — khong doi cac ky tu tieng Viet co dau
  // (dang canonical, khong bi anh huong boi anh xa tuong thich cua NFKC).
  let working = text.normalize('NFKC');
  const placeholders = new Map<string, string>();
  keep.forEach((code, i) => {
    const token = `\u0000JOBCODE${i}\u0000`;
    working = working.split(code).join(token);
    placeholders.set(token, code);
  });

  working = working
    .replace(PHONE_RE, '[SĐT]')
    .replace(APT_AFTER_KEYWORD_RE, (_m, kw: string, sp: string) => `${kw}${sp}[CĂN]`)
    .replace(APT_GENERIC_RE, '[CĂN]');

  for (const [token, code] of placeholders) {
    working = working.split(token).join(code);
  }
  return working;
}

/** SPEC-P03 §11.3(1): mã căn THẬT của tòa (so khong phan biet hoa thuong,
 * bo qua `.`/`-`/khoang trang) => `[CĂN]`, ke ca khi khong co tu khoa/hinh
 * dang chuan di kem. Goi SAU `redactPii` (can DB nen tach rieng ham nay). */
export function redactKnownApartmentCodes(text: string, apartmentCodes: readonly string[]): string {
  let working = text;
  for (const code of apartmentCodes) {
    if (!code) continue;
    const loose = code.replace(/[.\-\s]/g, '');
    if (loose.length === 0) continue;
    const pattern = loose
      .split('')
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[.\\-\\s]*');
    const re = new RegExp(pattern, 'giu');
    working = working.replace(re, '[CĂN]');
  }
  return working;
}

export function buildEmergencyReply(hotline: string): string {
  return (
    `Đây là tình huống khẩn cấp. Vui lòng gọi ngay hotline BQL: ${hotline}, ` +
    `hoặc 114 (cứu hoả)/115 (y tế) nếu cần. Ban quản lý đã được báo và sẽ liên hệ ngay. ` +
    `Nếu không phải khẩn cấp, anh/chị nhắn lại mô tả để em hỗ trợ sửa chữa.`
  );
}

export const REGISTER_REPLY =
  'Xin chào, hệ thống chưa nhận diện anh/chị là cư dân đã đăng ký của toà nhà. ' +
  'Vui lòng liên hệ Ban quản lý để được hỗ trợ đăng ký căn hộ.';
