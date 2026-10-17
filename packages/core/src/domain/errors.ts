// packages/core/src/domain/errors.ts — Lop loi co kieu (01-CONTRACTS.md §9, ke hoach 02).
// Moi lop co `code` chuoi co dinh = ten lop, de caller switch theo `code`
// thay vi `instanceof` khi loi di qua ranh gioi tien trinh (vd JSON qua hang doi).

export class ConflictError extends Error {
  readonly code = 'ConflictError';
  constructor(message = 'Trang thai da doi, thao tac khong con hop le.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ModelUnavailableError extends Error {
  // `string` (khong phai literal) de lop con (ModelDeadlineError) ghi de `code`.
  readonly code: string = 'ModelUnavailableError';
  constructor(message = 'Mo hinh ngon ngu tam thoi khong kha dung.') {
    super(message);
    this.name = 'ModelUnavailableError';
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

/** Gemini khong co `strict` nen tool tu kiem `input` theo `input_schema`
 * (required, kieu, enum, khoa la) truoc khi `run`; sai => `tool_result
 * is_error` ma nay, khong chay tool. (`code`/`name` = 'InvalidToolInput',
 * giu nguyen tu ban truoc — KHONG doi.) */
export class InvalidToolInputError extends Error {
  readonly code = 'InvalidToolInput';
  constructor(message = 'Input cua tool khong hop le theo input_schema.') {
    super(message);
    this.name = 'InvalidToolInput';
  }
}

/** Env sai (`readCommunityConfig`, `readPacerConfig`) — tien trinh exit 1 khi khoi dong. */
export class ConfigError extends Error {
  readonly code = 'ConfigError';
  constructor(message = 'Cau hinh moi truong khong hop le.') {
    super(message);
    this.name = 'ConfigError';
  }
}

/** `send_group_message` khi da du `budget_per_hour` (BB-08). */
export class GroupBudgetExceededError extends Error {
  readonly code = 'GroupBudgetExceededError';
  constructor(message = 'Het ngan sach tin nhan cua nhom trong gio nay.') {
    super(message);
    this.name = 'GroupBudgetExceededError';
  }
}

/** Tool co trong bang §7.1 nhung vai/be mat khong cho (phong thu 2 lop). */
export class ToolNotAllowedError extends Error {
  readonly code = 'ToolNotAllowedError';
  constructor(message = 'Vai/be mat hien tai khong duoc dung tool nay.') {
    super(message);
    this.name = 'ToolNotAllowedError';
  }
}

/** Hanh dong khong duoc phep theo luat trong tool (bot khong la admin, tin cua owner...). */
export class ActionNotPermittedError extends Error {
  readonly code = 'ActionNotPermittedError';
  constructor(message = 'Hanh dong nay khong duoc phep trong ngu canh hien tai.') {
    super(message);
    this.name = 'ActionNotPermittedError';
  }
}

export class MessageNotInBufferError extends Error {
  readonly code = 'MessageNotInBufferError';
  constructor(message = 'Tin nhan khong co trong dem nhom hien tai.') {
    super(message);
    this.name = 'MessageNotInBufferError';
  }
}

export class UnknownMemberError extends Error {
  readonly code = 'UnknownMemberError';
  constructor(message = 'Khong phai thanh vien con hieu luc cua nhom.') {
    super(message);
    this.name = 'UnknownMemberError';
  }
}

export class AmbiguousMentionError extends Error {
  readonly code = 'AmbiguousMentionError';
  constructor(message = 'Ten khop nhieu hon mot thanh vien.') {
    super(message);
    this.name = 'AmbiguousMentionError';
  }
}

/** Loi lap trinh: thi hanh kick/block khi `approvals.status != 'approved'`. */
export class ApprovalRequiredError extends Error {
  readonly code = 'ApprovalRequiredError';
  constructor(message = 'Hanh dong can the duyet da duoc phe duyet.') {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

/** `decide_approval` thieu id trong tin cua requester (bang chung y dinh tat dinh). */
export class IntentNotConfirmedError extends Error {
  readonly code = 'IntentNotConfirmedError';
  constructor(message = 'Chua xac nhan duoc y dinh tu tin nhan cua nguoi quyet.') {
    super(message);
    this.name = 'IntentNotConfirmedError';
  }
}

export class LeadIncompleteError extends Error {
  readonly code = 'LeadIncompleteError';
  constructor(message = 'Lead chua du thong tin de chuyen chu.') {
    super(message);
    this.name = 'LeadIncompleteError';
  }
}

export class SkillNotFoundError extends Error {
  readonly code = 'SkillNotFoundError';
  constructor(message = 'Khong tim thay skill (hoac skill dang tat).') {
    super(message);
    this.name = 'SkillNotFoundError';
  }
}

export class AutomationInvalidError extends Error {
  readonly code = 'AutomationInvalidError';
  constructor(message = 'Lich khong hop le hoac khong tinh duoc lan chay ke tiep.') {
    super(message);
    this.name = 'AutomationInvalidError';
  }
}

export class EmbeddingUnavailableError extends Error {
  readonly code = 'EmbeddingUnavailableError';
  constructor(message = 'Khong lay duoc embedding.') {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

/** Truy hoi tri thuc that bai (`retrieval/search-knowledge.ts`). */
export class KnowledgeUnavailableError extends Error {
  readonly code = 'KnowledgeUnavailableError';
  constructor(message = 'Khong truy hoi duoc tri thuc lien quan.') {
    super(message);
    this.name = 'KnowledgeUnavailableError';
  }
}

/** `ZaloApiError` khi worker thi hanh `action` (kem ma zca-js trong `result`). */
export class ZaloActionError extends Error {
  readonly code = 'ZaloActionError';
  constructor(message = 'Zalo tu choi hanh dong quan tri.') {
    super(message);
    this.name = 'ZaloActionError';
  }
}

/** (D31, BB-18) Het han chot cua luot / con < MODEL_MIN_ATTEMPT_MS: con cua
 * `ModelUnavailableError` nen caller di chung duong `model_down`; KHONG thu lai. */
export class ModelDeadlineError extends ModelUnavailableError {
  readonly code: string = 'ModelDeadlineError';
  constructor(message = 'Het han chot cua luot, khong goi them model.') {
    super(message);
    this.name = 'ModelDeadlineError';
  }
}

/** Thieu persona_docs active cho mot trong 4 kind (loi cau hinh — dashboard seed). */
export class PersonaMissingError extends Error {
  readonly code = 'PersonaMissingError';
  constructor(message = 'Thieu persona dang kich hoat (soul/rules/identity/capabilities).') {
    super(message);
    this.name = 'PersonaMissingError';
  }
}

/** Tong khoi persona 1..6 vuot 24 000 ky tu. */
export class PersonaTooLargeError extends Error {
  readonly code = 'PersonaTooLargeError';
  constructor(message = 'Tong do dai persona vuot gioi han 24000 ky tu.') {
    super(message);
    this.name = 'PersonaTooLargeError';
  }
}
