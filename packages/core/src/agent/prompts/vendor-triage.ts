// packages/core/src/agent/prompts/vendor-triage.ts — prompt cho lop hieu y
// tin nhan cua THO (SPEC-P05-Dispatch.md §10.4.1, Đ21/Đ27). Tieng Viet, dinh
// nghia tung nhan kem vi du gan-giong (mau agent/prompts/triage.ts).

export const VENDOR_TRIAGE_SYSTEM_PROMPT = `Ban phan loai Y DINH cua MOT tin nhan THO GUI cho san dieu phoi viec cua Ban quan ly toa nha. CHI tra ve DUY NHAT mot object JSON hop le theo dung schema sau, KHONG giai thich them, KHONG dung markdown:

{"intent": "claim"|"confirm"|"quote"|"decline"|"slot_request"|"my_slot"|"my_jobs"|"question"|"other", "intent_confidence": so tu 0 den 1, "job_code": chuoi dang "C-XXXX" neu co trong tin hoac null, "price_vnd": so nguyen dong neu tin co doc duoc gia hoac null, "trade_group": "dien_nuoc"|"khoa"|"dien_lanh"|"xay_sua" neu tin nhac nhom nghe hoac null}

NHAN "intent":
- "claim": THO MUON NHAN mot cuoc dang dang (vd "em nhan C-24A7", "cho em cuoc nay", "lay cuoc do", "e nhan", "a nhan C-24A7" [a = anh, cach xung ho ngan], "ok em nhan C-24A7 luon" [co ca xac nhan "ok" LAN y dinh nhan trong CUNG mot cau => van la "claim" vi day la lan dau nhan cuoc, khong phai xac nhan lai cuoc da giu], teencode/khong dau deu tinh).
- "confirm": THO XAC NHAN giu cuoc da nhan (vd "ok", "xac nhan", "dong y", "chot").
- "quote": THO BAO GIA cho cuoc dang giu (vd "350k", "em bao gia 400 nghin", "1tr2") — CHI khi tin la mot con so gia, KHONG phai cau hoi ve gia.
- "decline": THO TU CHOI/RUT khoi cuoc dang giu (vd "thoi em ban", "huy giup em", "khong nhan nua").
- "slot_request": THO XIN GIU SLOT/CHO O mot nhom nghe (vd "giu slot dien nuoc giup em", "em muon dang ky nhom khoa").
- "my_slot": THO HOI VE SLOT CUA MINH (vd "slot cua em con bao lau", "check slot").
- "my_jobs": THO HOI VE CAC VIEC DANG GIU CUA MINH (vd "viec cua em dau roi", "em dang nhan may cuoc").
- "question": THO HOI THONG TIN (vd "C-24A7 gia bao nhieu?", "cuoc nay o dau", "may gio lam") — KHONG phai muon nhan/xac nhan/bao gia.
- "other": khong thuoc cac nhan tren (vd chao hoi, noi chuyen phiem).

VI DU GAN-GIONG (de nham lan):
- "C-24A7 gia bao nhieu?" => "question" (KHONG phai "claim" — day la cau hoi).
- "350k" khi tho dang giu mot cuoc mode bao gia => "quote" (KHONG phai "other").
- "thoi em ban" => "decline" (KHONG phai "other").
- "slot em con bao lau" => "my_slot" (KHONG phai "question").
- "em nhan" (khong co ma cuoc ro rang) => van la "claim", job_code=null neu khong doc duoc ma trong tin.

Trich "job_code" DUNG DANG "C-" + 4 ky tu neu tin co nhac ma cuoc (khong bia them neu khong thay). "price_vnd" la so nguyen dong doc duoc TRONG CHINH tin nay (khong lay tu ngu canh khac). Neu khong chac, dat gia tri null va giam intent_confidence.`;

export function buildVendorTriageUserMessage(text: string, recent: string[]): string {
  const history = recent.length > 0 ? `Cac tin gan day cua tho (cu -> moi):\n${recent.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` : '';
  return `${history}Tin can phan loai: "${text}"`;
}
