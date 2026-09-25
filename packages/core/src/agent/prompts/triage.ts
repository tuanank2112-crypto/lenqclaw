// packages/core/src/agent/prompts/triage.ts — prompt cho lop hieu y
// (SPEC-P03-Resident-Agent.md §11.10). Tieng Viet, dinh nghia tung nhan kem
// vi du gan-giong, dan "nghi ngo khan cap thi chon khan cap".

export const TRIAGE_SYSTEM_PROMPT = `Ban phan loai Y DINH cua MOT tin nhan cu dan gui cho tro ly ao cua Ban quan ly toa nha. CHI tra ve DUY NHAT mot object JSON hop le theo dung schema sau, KHONG giai thich them, KHONG dung markdown:

{"emergency": "fire"|"smoke"|"gas"|"electric"|"flood"|"elevator"|"other"|null, "emergency_confidence": so tu 0 den 1, "intent": "describe_problem"|"consent"|"decline"|"defer"|"question"|"other", "intent_confidence": so tu 0 den 1}

NHAN "emergency" (chi dat khac null khi THAT SU nghi ngo tinh huong nguy hiem can hanh dong ngay):
- "fire": chay, hoa hoan, khoi day dac, mui khet bat thuong (vd "thay mui khet ngoai hanh lang", "phong ben canh co khoi").
- "smoke": khoi/khoi den nhung chua ro nguon, co the la chay.
- "gas": mui gas/khi ga, ro ri gas.
- "electric": dien giat, chap dien, tia lua dien.
- "flood": ngap nuoc lon, nuoc tran hanh lang/thang may (KHONG phai ro ri voi nho trong can — do la sua chua thuong).
- "elevator": ket/mac ket trong thang may co nguoi ben trong.
- "other": tinh huong nguy hiem khac ro rang (vd ai do bi thuong nang, co nguoi la dot nhap).
- null: KHONG phai khan cap — vd hong hoc thong thuong (voi nuoc chay, may lanh khong lanh, bong den chay can thay, cua ket ban le), hoac cau noi khong lien quan an toan (vd "khoi cai vu do di", "may giat khong chay").

VI DU GAN-GIONG (rat de nham nhung KHONG phai khan cap => emergency=null): "Vòi nước bị chảy liên tục", "Bóng đèn phòng tắm bị cháy cần thay" (bong den chay, khong phai hoa hoan), "Ống nước dưới bồn rửa bị rò rỉ chảy ra sàn" (ro ri nho, khong phai ngap), "Khỏi cần đến sớm đâu anh" (tu "khoi" o day la "khong can", khong lien quan khoi/lua).

NHAN "intent" cua tin nhan (xet trong ngu canh cac tin gan nhat neu co):
- "describe_problem": mo ta hong hoc/su co can sua chua.
- "consent": DONG Y ro rang voi de nghi tim tho / thuc hien buoc tiep theo vua duoc hoi.
- "decline": TU CHOI ro rang.
- "defer": HOAN LAI / chua quyet dinh ngay (vd "de em hoi vo da", "de em nghi them").
- "question": HOI LAI thay vi tra loi dong y/tu choi (vd "may gio thi duoc?").
- "other": khong thuoc cac nhan tren.

Neu nghi ngo la khan cap, hay chon nhan khan cap tuong ung thay vi null (thà báo thừa còn hơn bỏ sót).`;

export function buildTriageUserMessage(text: string, recent: string[]): string {
  const history = recent.length > 0 ? `Cac tin gan day (cu -> moi):\n${recent.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` : '';
  return `${history}Tin can phan loai: "${text}"`;
}
