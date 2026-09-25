// packages/core/src/domain/errors.ts — Lop loi co kieu (01-CONTRACTS.md §9)
// + IllegalTransitionError (SPEC-P01-Foundation.md §5). Moi lop co `code`
// chuoi co dinh = ten lop, de caller switch theo `code` thay vi `instanceof`
// khi loi di qua ranh gioi tien trinh (vd JSON qua hang doi).

export class ConflictError extends Error {
  readonly code = 'ConflictError';
  constructor(message = 'Trang thai da doi, thao tac khong con hop le.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class PiiGateError extends Error {
  readonly code = 'PiiGateError';
  constructor(message = 'Tin nhan cho tho chua duoc phep chua thong tin ca nhan.') {
    super(message);
    this.name = 'PiiGateError';
  }
}

export class AccessNotApprovedError extends Error {
  readonly code = 'AccessNotApprovedError';
  constructor(message = 'Ticket cap quyen vao toa chua duoc BQL duyet.') {
    super(message);
    this.name = 'AccessNotApprovedError';
  }
}

export class IneligibleVendorError extends Error {
  readonly code = 'IneligibleVendorError';
  constructor(message = 'Tho khong du dieu kien nhan cuoc nay.') {
    super(message);
    this.name = 'IneligibleVendorError';
  }
}

export class ModelUnavailableError extends Error {
  readonly code = 'ModelUnavailableError';
  constructor(message = 'Mo hinh ngon ngu tam thoi khong kha dung.') {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export class RegulationUnavailable extends Error {
  readonly code = 'RegulationUnavailable';
  constructor(message = 'Khong truy hoi duoc quy che lien quan.') {
    super(message);
    this.name = 'RegulationUnavailable';
  }
}

export class TransportDeadError extends Error {
  readonly code = 'TransportDeadError';
  constructor(message = 'Phien Zalo da chet/bi da, dung gui tin.') {
    super(message);
    this.name = 'TransportDeadError';
  }
}

export class RateLimitedError extends Error {
  readonly code = 'RateLimitedError';
  constructor(message = 'Bi Zalo gioi han toc do gui.') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export class InvalidCategoryError extends Error {
  readonly code = 'InvalidCategoryError';
  constructor(message = 'Danh muc viec khong hop le.') {
    super(message);
    this.name = 'InvalidCategoryError';
  }
}

export class ConsentMissingError extends Error {
  readonly code = 'ConsentMissingError';
  constructor(message = 'Chua nhan duoc su dong y ro rang cua cu dan.') {
    super(message);
    this.name = 'ConsentMissingError';
  }
}

/** 01-CONTRACTS §2b "Kiem input tool": Gemini khong co `strict` nen tool tu
 * kiem `input` theo `input_schema` (required, kieu, enum, khoa la) truoc
 * khi `run`; sai => `tool_result is_error` ma nay, khong chay tool. */
export class InvalidToolInputError extends Error {
  readonly code = 'InvalidToolInput';
  constructor(message = 'Input cua tool khong hop le theo input_schema.') {
    super(message);
    this.name = 'InvalidToolInput';
  }
}

/** SPEC-P03 §11.5: `classify_responsibility` chi chay khi job dang 'drafting';
 * goi lai sau khi verdict da chot (job da sang awaiting_consent/routed_bql/...)
 * => loi nay. Caller: bao cu dan "da ket luan, can BQL xem lai". (Ghi chu:
 * SPEC-P03 §11.5 doi them dong vao bang loi 01-CONTRACTS §9 — file do nam
 * trong CAM DUNG cua handoff nay, xem Cau hoi mo trong report.) */
export class VerdictLockedError extends Error {
  readonly code = 'VerdictLockedError';
  constructor(message = 'Ket luan trach nhiem da duoc chot, can Ban quan ly xem lai.') {
    super(message);
    this.name = 'VerdictLockedError';
  }
}

/** SPEC-P05-Dispatch.md §10.1.2/§10.3.1: ma cuoc khong ton tai hoac khong
 * thuoc nguoi dang noi. Caller: "Khong tim thay ma cuoc <code>", khong lo
 * cuoc khac. */
export class JobNotFoundError extends Error {
  readonly code = 'JobNotFoundError';
  constructor(message = 'Khong tim thay ma cuoc nay.') {
    super(message);
    this.name = 'JobNotFoundError';
  }
}

/** SPEC-P05-Dispatch.md §10.3.1 (confirmAssignment): OK/gia den sau
 * `hold_expires_at` — tool da nha cuoc (releaseHold) truoc khi nem loi nay. */
export class HoldExpiredError extends Error {
  readonly code = 'HoldExpiredError';
  constructor(message = 'Het han giu, cuoc da duoc dang lai.') {
    super(message);
    this.name = 'HoldExpiredError';
  }
}

/** SPEC-P05-Dispatch.md §10.3.1 (confirmAssignment): cuoc mode='quote'
 * thieu gia hoac gia khong khop tin nhan cua tho (§10.4.2). */
export class QuoteRequiredError extends Error {
  readonly code = 'QuoteRequiredError';
  constructor(message = 'Can bao gia truoc khi xac nhan cuoc nay.') {
    super(message);
    this.name = 'QuoteRequiredError';
  }
}

/** SPEC-P05-Dispatch.md §10.9.2: chua dat tran slot / chua cau hinh nhom
 * thi / toa mo ho khi tho co nhieu hon 1 toa. */
export class SlotUnavailableError extends Error {
  readonly code = 'SlotUnavailableError';
  constructor(message = 'Chua the cap slot luc nay.') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

/** SPEC-P05-Dispatch.md §10.4.4: tool phia tho (`claim_job`,
 * `confirm_assignment`, `decline_hold`) khong co bang chung y dinh (triage
 * du nguong HOAC cum lươi tat dinh khop BANG NHAU) — Đ21/Đ27: model hieu y,
 * code la lươi an toan; CAM regex "chua" lam co che chinh. */
export class IntentNotConfirmedError extends Error {
  readonly code = 'IntentNotConfirmedError';
  constructor(message = 'Chua xac nhan duoc y dinh cua tho tu tin nhan.') {
    super(message);
    this.name = 'IntentNotConfirmedError';
  }
}

/** Loi lap trinh: cap (from -> to) khong nam trong bang §5 01-CONTRACTS.
 * CAM caller bat loi nay de "xu ly tiep" (SPEC-P01 §5) — no bao mot bug o
 * noi goi transitionJob, khong phai mot tinh huong nghiep vu binh thuong. */
export class IllegalTransitionError extends Error {
  readonly code = 'IllegalTransitionError';
  constructor(from: string, to: string) {
    super(`Chuyen trang thai khong hop le: ${from} -> ${to} khong co trong TRANSITIONS.`);
    this.name = 'IllegalTransitionError';
  }
}
