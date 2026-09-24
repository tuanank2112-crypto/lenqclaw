// packages/core/src/agent/tool-context.ts — ToolContext (01-CONTRACTS.md
// §7: "resident_id, apartment_id, building_id, job_id hien hanh do server
// gan vao context, KHONG phai tham so" — BB-08). Mutable: tool
// `save_job_draft` gan `jobId` sau khi tao job moi de cac tool_use tiep theo
// trong CUNG luot dung duoc.

export interface ToolContext {
  readonly residentId: string;
  readonly apartmentId: string;
  readonly buildingId: string;
  readonly conversationId: string;
  /** Tin nhan cua cu dan vua kich hoat luot nay — dung boi `open_service_case`
   * de kiem tat dinh su dong y (SPEC-P03 §10.3). */
  readonly latestText: string;
  jobId: string | null;
}
