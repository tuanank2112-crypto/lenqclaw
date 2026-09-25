// packages/core/src/agent/vendor-tool-context.ts — VendorToolContext
// (SPEC-P05-Dispatch.md §10.5.2, Đ27). Mau ToolContext (agent/tool-context.ts)
// nhung cho phia tho: khong co `residentId`/`apartmentId` (mot toa co the
// nhieu building qua `vendor_buildings`), them thong tin thread/nhom/su
// kien he thong ma cac tool phia tho can tu kiem (BB-08, §10.4.4).

import type { TradeGroup } from '../domain/types.js';

// SPEC-P05-Dispatch.md §10.4.1: `VendorTriageResult` la kieu cua
// `agent/vendor-triage.ts` — file do thuoc pham vi P05-C (CAM DUNG cua
// handoff nay). De `vendor-tool-context.ts` (P05-B) build doc lap ma khong
// tao truoc file P05-C, kieu duoc khai bao O DAY (dung dung hinh dang
// §10.4.1) — P05-C import lai tu day (`import type { VendorTriageResult }
// from '../vendor-tool-context.js'`) thay vi dinh nghia lai. Ghi trong
// Cau hoi mo cua report R12.
export type VendorIntent =
  | 'claim'
  | 'confirm'
  | 'quote'
  | 'decline'
  | 'slot_request'
  | 'my_slot'
  | 'my_jobs'
  | 'question'
  | 'other';

export interface VendorTriageResult {
  intent: VendorIntent;
  intent_confidence: number;
  job_code: string | null;
  price_vnd: number | null;
  trade_group: TradeGroup | null;
}

export interface VendorToolContext {
  readonly vendorId: string;
  /** zalo_uid tren 'market' — thread DM cua tho (quy uoc: thread_type
   * 'user' => thread_id = uid; kenh gia lap PHAI theo — 01-CONTRACTS §8). */
  readonly vendorUid: string;
  readonly buildingIds: readonly string[];
  readonly conversationId: string;
  readonly threadId: string;
  readonly threadType: 'user' | 'group';
  /** Chi co gia tri khi `threadType==='group'` — tu vendor_groups. */
  readonly groupTradeGroup: TradeGroup | null;
  readonly latestText: string;
  readonly latestMessageCreatedAt: string;
  readonly triage: VendorTriageResult | null;
  readonly jobCodesInText: readonly string[];
  readonly systemEvent: { event: 'access_approved'; jobId: string } | null;
  readonly now: Date;
}
