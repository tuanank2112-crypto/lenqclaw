// packages/core/src/domain/types.ts — Kieu TypeScript (01-CONTRACTS.md §6)
// + JobStatus (union dung cac trang thai §5). Doi hop dong o day truoc,
// sau do moi doi DDL/service.

/** Dung dung cac gia tri jobs.status xuat hien trong bang chuyen trang thai
 * 01-CONTRACTS.md §5. check_agent_tools.mjs va services/job-state.ts phai
 * dong bo voi danh sach nay. */
export type JobStatus =
  | 'drafting'
  | 'routed_bql'
  | 'awaiting_consent'
  | 'case_open'
  | 'published'
  | 'held'
  | 'confirmed'
  | 'access_pending'
  | 'access_granted'
  | 'dispatched'
  | 'in_progress'
  | 'awaiting_acceptance'
  | 'accepted'
  | 'disputed'
  | 'closed'
  | 'unassigned'
  | 'cancelled';

export type JobDraft = {
  category_code: string | null;
  symptoms: string[];
  location_in_unit: string;
  urgency: 'normal' | 'soon' | 'emergency';
  photo_ids: number[];
  questions_asked: number;
  confidence_note: string;
};

export type Citation = {
  document_id: string;
  section_id: string;
  quote: string;
};

export type ResponsibilityVerdict = {
  party: 'resident' | 'bql' | 'unclear';
  citations: Citation[];
  reason_vi: string;
};
// service ep party='unclear' neu citations rong hoac nguon khong 'approved'/het hieu luc (BB-03)

/** JobCard KHONG co apartment, phone, resident name (BB-02). Lint:
 * check_agent_tools.mjs cam cac khoa nay xuat hien trong khai bao kieu nay. */
export type JobCard = {
  code: string;
  category_name: string;
  building_code: string;
  window: [string, string];
  mode: 'fixed' | 'quote';
  price_band: [number, number] | null;
  summary_vi: string;
  photo_urls_redacted: string[];
};

/** JobReveal chi duoc tao trong dispatch_to_vendor khi jobs.status='access_granted' (BB-11). */
export type JobReveal = JobCard & {
  apartment_code: string;
  floor: number;
  resident_phone: string;
  access_pass_code: string;
};

export type Party = {
  type: 'resident' | 'vendor' | 'staff' | 'unknown';
  id: string | null;
  account: 'bql' | 'market';
};

/** Vai nhan vien web (SPEC-P01-Foundation.md §7). */
export type StaffRole = 'bql_admin' | 'bql_staff' | 'guard';

/** SPEC-P05-Dispatch.md §10.1.2 (Đ27): nhom nghe — don vi tinh slot (Đ14),
 * khop `job_categories.trade_group` / `vendor_groups.trade_group`. */
export type TradeGroup = 'dien_nuoc' | 'khoa' | 'dien_lanh' | 'xay_sua';
