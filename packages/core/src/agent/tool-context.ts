// packages/core/src/agent/tool-context.ts — ToolContext (01-CONTRACTS.md
// §7: "resident_id, apartment_id, building_id, job_id hien hanh do server
// gan vao context, KHONG phai tham so" — BB-08). Mutable: tool
// `save_job_draft` gan `jobId` sau khi tao job moi de cac tool_use tiep theo
// trong CUNG luot dung duoc.

import type { TriageResult } from './triage.js';

export interface ToolContext {
  readonly residentId: string;
  readonly apartmentId: string;
  readonly buildingId: string;
  readonly conversationId: string;
  /** Tin nhan cua cu dan vua kich hoat luot nay — dung boi `open_service_case`
   * de kiem tat dinh su dong y (SPEC-P03 §11.5). */
  readonly latestText: string;
  /** `created_at` cua tin `latestText` (SPEC-P03 §11.5: dong y phai la tin
   * NHAN SAU luc chuyen drafting->awaiting_consent). */
  readonly latestMessageCreatedAt: string;
  /** Ket qua lop hieu y (§11.10) cua tin hien tai — `null` neu khong chay
   * duoc/loi/qua han. Agent chinh KHONG doc duoc gia tri nay qua tool
   * (§11.9) — chi server (`open_service_case`) dung. */
  readonly triage: TriageResult | null;
  jobId: string | null;
}
