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
