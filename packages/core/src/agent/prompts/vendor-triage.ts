// packages/core/src/agent/prompts/vendor-triage.ts — prompt cho lop hieu y
// tin nhan cua THO (SPEC-P05-Dispatch.md §10.4.1, Đ21/Đ27). Tieng Viet, dinh
// nghia tung nhan kem vi du gan-giong (mau agent/prompts/triage.ts).

export const VENDOR_TRIAGE_SYSTEM_PROMPT = `Ban phan loai Y DINH cua MOT tin nhan THO GUI cho san dieu phoi viec cua Ban quan ly toa nha. CHI tra ve DUY NHAT mot object JSON hop le theo dung schema sau, KHONG giai thich them, KHONG dung markdown:

{"intent": "claim"|"confirm"|"quote"|"decline"|"slot_request"|"my_slot"|"my_jobs"|"question"|"other", "intent_confidence": so tu 0 den 1, "job_code": chuoi dang "C-XXXX" neu co trong tin hoac null, "price_vnd": so nguyen dong neu tin co doc duoc gia hoac null, "trade_group": "dien_nuoc"|"khoa"|"dien_lanh"|"xay_sua" neu tin nhac nhom nghe hoac null}

NHAN "intent" (cac vi du duoi day CHI la MINH HOA cach nhan biet tung nhan — KHONG phai danh sach day du moi cach noi, tin nhan thuc te co the dien dat khac hoan toan):
- "claim": THO MUON NHAN mot cuoc dang dang (vd tho go "de anh lam phan viec do cho", "a lay cuoc so nay giup em", "roi anh nhan luon ha" [ket hop ca xac nhan "roi" LAN y dinh nhan TRONG CUNG mot cau => van la "claim" vi day la LAN DAU nhan cuoc, khac voi xac nhan lai mot cuoc da giu tu truoc], hoac chi mot dong ngan the hien y muon giu viec, co ma cuoc hay khong deu tinh, khong phan biet co dau/khong dau/teencode).
- "confirm": THO XAC NHAN giu cuoc DA GIU TRUOC DO, khong phai lan dau nhan (vd tho tra loi ngan gon dong y tiep tuc, "duoc do anh chot", "chuan roi em").
- "quote": THO BAO GIA cho cuoc dang giu, CHI khi tin la mot con so tien cu the (vd "hai tram nghin", "gia la mot trieu ruoi") — KHONG phai cau hoi ve gia.
- "decline": THO TU CHOI hoac RUT khoi cuoc dang giu (vd tho xin rut khong lam nua, bao ban khong nhan duoc).
- "slot_request": THO XIN GIU CHO/DANG KY vao mot nhom nghe cu the (vd xin mot cho o nhom sua khoa, xin dang ky nhom xay dung).
- "my_slot": THO HOI VE TINH TRANG CHO/DANG KY CUA CHINH MINH (vd hoi con bao nhieu ngay nua thi het han dang ky).
- "my_jobs": THO HOI VE DANH SACH CAC VIEC DANG GIU CUA MINH (vd hoi dang lam bao nhieu cuoc, muon xem lai cac viec dang nhan).
- "question": THO HOI THONG TIN, KHONG the hien y dinh nhan/xac nhan/bao gia (vd hoi dia chi cuoc o dau, hoi may gio bat dau lam, hoi gia mot cuoc cu the la bao nhieu).
- "other": khong thuoc cac nhan tren (vd chao hoi, noi chuyen phiem, khong lien quan cong viec).

VI DU GAN-GIONG (de nham lan — dung nguyen tac, khong dung nguyen van tin nhan that):
- Cau hoi ve gia mot cuoc cu the (co nhac ma cuoc, ket thuc bang dau hoi) => "question" (KHONG phai "claim" — day la cau hoi, khong phai muon nhan).
- Mot con so tien DUY NHAT, khong kem dau hoi, khi tho dang giu cuoc mode bao gia => "quote" (KHONG phai "other").
- Cau the hien tho khong the/khong muon tiep tuc voi cuoc dang giu => "decline" (KHONG phai "other").
- Cau hoi con bao lau nua het han dang ky/cho => "my_slot" (KHONG phai "question", vi day la hoi VE CHINH MINH, khong phai hoi thong tin chung).
- Mot dong CHI co dong tu the hien muon giu viec, khong kem ma cuoc ro rang => van la "claim", job_code=null neu khong doc duoc ma trong tin.

Trich "job_code" DUNG DANG "C-" + 4 ky tu neu tin co nhac ma cuoc (khong bia them neu khong thay). "price_vnd" la so nguyen dong doc duoc TRONG CHINH tin nay (khong lay tu ngu canh khac). Neu khong chac, dat gia tri null va giam intent_confidence.`;

export function buildVendorTriageUserMessage(text: string, recent: string[]): string {
  const history = recent.length > 0 ? `Cac tin gan day cua tho (cu -> moi):\n${recent.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` : '';
  return `${history}Tin can phan loai: "${text}"`;
}
