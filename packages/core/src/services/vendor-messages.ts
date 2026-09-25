// packages/core/src/services/vendor-messages.ts — mau tin (tieng Viet, moi
// mau MOT ham nhan tham so da dinh kieu — SPEC-P05-Dispatch.md §10.10) +
// `sendVendorMessage`/`sendResidentOfJob`. `sendVendorMessage` la CUA DUY
// NHAT cac dich vu P05 dung de gui tin cho tho (PiiGate chay TRUOC
// `enqueue` — BB-02). `allowReveal: true` CHI duoc truyen tu
// `services/access.ts::dispatchToVendor` (scripts/check_agent_tools.mjs
// kiem: `allow_reveal_outside_access`).

import { sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { audit } from './audit.js';
import { assertNoResidentPii, type ResidentGuard } from './pii-gate.js';

// SPEC-P05-Dispatch.md §10.1.3: kieu `JobReveal` CHI duoc xuat hien o
// `domain/types.ts` va `services/access.ts` (may do check_agent_tools.mjs
// `jobreveal_outside_allowed: 0`). `renderReveal` o day nhan MOT kieu noi
// bo cung hinh dang (structurally compatible) thay vi import ten `JobReveal`
// — `services/access.ts` truyen thang bien da co kieu `JobReveal`, TypeScript
// chap nhan vi day la kieu con (khong kiem tra excess-property tren bien,
// chi tren object literal).
interface RevealLike {
  code: string;
  window: [string, string];
  apartment_code: string;
  floor: number;
  resident_phone: string;
  access_pass_code: string;
  building_code: string;
}

/** Thread DM ('market') cua mot tho — tu `zalo_identities`. `null` neu tho
 * chua co danh tinh tren tai khoan `market` (chua tung nhan tin). Dung
 * chung boi dispatch.ts/access.ts/slots.ts/timers.ts truoc khi goi
 * `sendVendorMessage` voi `threadType:'user'`. */
export async function vendorDmThreadId(vendorId: string): Promise<string | null> {
  const rows = await sql<{ zalo_uid: string }>(
    `select zalo_uid from zalo_identities where zalo_account_id = 'market' and party_type = 'vendor' and party_id = $1`,
    [vendorId]
  );
  return rows[0]?.zalo_uid ?? null;
}

export interface SendVendorMessageArgs {
  threadId: string;
  threadType: 'user' | 'group';
  text: string;
  jobId: string | null;
  guard?: ResidentGuard | null;
  allowReveal?: boolean;
}

/** PiiGate chay TRUOC `enqueue` khi co `guard` va `allowReveal !== true`
 * (BB-02). Nem => audit `pii.gate_blocked` (KHONG ghi noi dung text) roi
 * nem tiep — SPEC-P05-Dispatch.md §10.10. */
export async function sendVendorMessage(args: SendVendorMessageArgs): Promise<number> {
  if (args.allowReveal !== true && args.guard) {
    try {
      assertNoResidentPii(args.text, args.guard);
    } catch (err) {
      await audit(sql, {
        actorType: 'system',
        actorId: null,
        action: 'pii.gate_blocked',
        target: args.jobId,
        data: { job_id: args.jobId, thread_type: args.threadType, kind: 'vendor_message' },
      });
      throw err;
    }
  }
  return enqueue({
    zaloAccountId: 'market',
    threadId: args.threadId,
    threadType: args.threadType,
    kind: 'text',
    body: { text: args.text },
    jobId: args.jobId ?? undefined,
  });
}

/** Gui tin cho cu dan cua mot cuoc (thread = conversation `bql`/`resident`
 * cua chinh cu dan do cuoc). Thieu conversation => audit
 * `resident.no_conversation`, khong gui. */
export async function sendResidentOfJob(jobId: string, text: string): Promise<void> {
  const rows = await sql<{ thread_id: string }>(
    `select c.thread_id from jobs j
     join conversations c on c.zalo_account_id = 'bql' and c.party_type = 'resident' and c.party_id = j.resident_id
     where j.id = $1 limit 1`,
    [jobId]
  );
  if (rows.length === 0) {
    await audit(sql, {
      actorType: 'system',
      actorId: null,
      action: 'resident.no_conversation',
      target: jobId,
      data: {},
    });
    return;
  }
  await enqueue({
    zaloAccountId: 'bql',
    threadId: rows[0]!.thread_id,
    threadType: 'user',
    kind: 'text',
    body: { text },
    jobId,
  });
}

// --- Mau tin phia tho (nhom + DM 'market') ----------------------------

export function CLAIM_WON_GROUP(code: string, hhmm: string): string {
  return `${code}: đã có thợ nhận lúc ${hhmm}.`;
}

export function HOLD_DM(code: string, hhmm: string, needPrice: boolean): string {
  const base = `Bạn đang giữ ${code} tới ${hhmm}. Trả lời OK để xác nhận.`;
  return needPrice ? `${base} Cuốc này thợ báo giá — trả lời giá của bạn (vd 350k) để xác nhận.` : base;
}

export function CONFIRMED_DM(code: string): string {
  return `Đã xác nhận cuốc ${code}. BQL sẽ duyệt cho bạn vào toà.`;
}

const HOLD_RELEASED_REASON_VI: Record<string, string> = {
  hold_expired: 'hết hạn giữ',
  quote_consent_timeout: 'cư dân chưa phản hồi giá kịp thời',
  vendor_declined: 'bạn đã từ chối',
  quote_declined: 'cư dân không đồng ý giá',
  vendor_suspended: 'tài khoản bị đình chỉ',
};

export function HOLD_RELEASED_DM(code: string, reason: string): string {
  const reasonVi = HOLD_RELEASED_REASON_VI[reason] ?? reason;
  return `Cuốc ${code} đã được nhả (${reasonVi}).`;
}

export function ACCESS_PENDING_DM(code: string): string {
  return `Cuốc ${code}: đang chờ BQL duyệt cho bạn vào toà.`;
}

export function ACCESS_REJECTED_DM(code: string): string {
  return `${code} được chuyển cho thợ khác.`;
}

/** DUY NHAT noi tao chuoi co PII day du (mo hinh KHONG bao gio thay ham
 * nay — chi `services/access.ts::dispatchToVendor` goi). */
export function renderReveal(reveal: RevealLike): string {
  const [from, to] = reveal.window;
  return (
    `${reveal.code} — Căn ${reveal.apartment_code} (tầng ${reveal.floor}), toà ${reveal.building_code}. ` +
    `SĐT cư dân: ${reveal.resident_phone}. Mã vào toà: ${reveal.access_pass_code} (hiệu lực ${from}–${to}). ` +
    `Đến nơi nhắn "đến ${reveal.code}".`
  );
}

export function SLOT_EXPIRED_DM(tradeGroupNameVi: string, isTrial: boolean, slotFeeMonthly: number): string {
  return isTrial
    ? `Slot dùng thử nhóm nghề ${tradeGroupNameVi} đã hết hạn. Liên hệ BQL đóng phí ${slotFeeMonthly.toLocaleString('vi-VN')}đ/tháng để tiếp tục nhận việc.`
    : `Slot nhóm nghề ${tradeGroupNameVi} đã hết hạn. Liên hệ BQL để gia hạn.`;
}

export function SLOT_REMIND_DM(tradeGroupNameVi: string, daysLeft: number): string {
  return `Slot nhóm nghề ${tradeGroupNameVi} của bạn còn ${daysLeft} ngày. Liên hệ BQL để gia hạn kịp thời.`;
}

export function WAITLIST_INVITE_DM(tradeGroupNameVi: string, hours: number): string {
  return `Đã có chỗ trống nhóm nghề ${tradeGroupNameVi}. Trả lời «giữ slot ${tradeGroupNameVi}» trong ${hours} giờ để giữ chỗ.`;
}

// --- Mau tin phia cu dan ('bql') ---------------------------------------

export function ACCESS_PENDING_RESIDENT(code: string): string {
  return `Đã có thợ nhận việc ${code}, đang chờ BQL xác nhận thợ.`;
}

export const WAITING_BQL_RESIDENT = 'BQL đang xác nhận thợ cho anh/chị, xin chờ thêm ít phút.';

export const SEARCHING_AGAIN_RESIDENT = 'Đang tìm thợ khác cho anh/chị, sẽ báo lại ngay khi có người nhận.';

export function QUOTE_ASK_RESIDENT(code: string, price: number, band: [number, number]): string {
  const [low, high] = band;
  return (
    `Thợ báo giá ${price.toLocaleString('vi-VN')}đ cho ${code}, cao hơn khung tham khảo ` +
    `${low.toLocaleString('vi-VN')}–${high.toLocaleString('vi-VN')}đ. Anh/chị ĐỒNG Ý giá này không?`
  );
}

export const QUOTE_TIMEOUT_RESIDENT = 'Anh/chị chưa phản hồi giá kịp thời, đang tìm thợ khác.';

export function DISPATCHED_RESIDENT(
  code: string,
  vendorName: string,
  rating: number | null,
  window: [string, string],
  pass: string
): string {
  const ratingText = rating === null ? 'chưa có đánh giá' : `${rating.toFixed(1)}★`;
  return (
    `Thợ ${vendorName} (${ratingText}) sẽ đến ${window[0]}–${window[1]} cho việc ${code}. ` +
    `Mã đối chiếu với bảo vệ: ${pass}.`
  );
}

export function NO_VENDOR_RESIDENT(code: string): string {
  return `Chưa tìm được thợ nhận việc ${code}. BQL sẽ liên hệ hỗ trợ thêm.`;
}
