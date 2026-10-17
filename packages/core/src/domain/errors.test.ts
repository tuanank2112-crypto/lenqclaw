// errors.ts — moi lop co `code` = ten lop (01-CONTRACTS §9) de caller switch theo `code`.
import { describe, expect, it } from 'vitest';
import * as errors from './errors.js';

const CLASSES: Array<[string, new (message?: string) => Error & { code: string }]> = [
  ['ConflictError', errors.ConflictError],
  ['ModelUnavailableError', errors.ModelUnavailableError],
  ['TransportDeadError', errors.TransportDeadError],
  ['RateLimitedError', errors.RateLimitedError],
  ['ConfigError', errors.ConfigError],
  ['GroupBudgetExceededError', errors.GroupBudgetExceededError],
  ['ToolNotAllowedError', errors.ToolNotAllowedError],
  ['ActionNotPermittedError', errors.ActionNotPermittedError],
  ['MessageNotInBufferError', errors.MessageNotInBufferError],
  ['UnknownMemberError', errors.UnknownMemberError],
  ['AmbiguousMentionError', errors.AmbiguousMentionError],
  ['ApprovalRequiredError', errors.ApprovalRequiredError],
  ['IntentNotConfirmedError', errors.IntentNotConfirmedError],
  ['LeadIncompleteError', errors.LeadIncompleteError],
  ['SkillNotFoundError', errors.SkillNotFoundError],
  ['AutomationInvalidError', errors.AutomationInvalidError],
  ['EmbeddingUnavailableError', errors.EmbeddingUnavailableError],
  ['KnowledgeUnavailableError', errors.KnowledgeUnavailableError],
  ['ZaloActionError', errors.ZaloActionError],
  ['ModelDeadlineError', errors.ModelDeadlineError],
  ['PersonaMissingError', errors.PersonaMissingError],
  ['PersonaTooLargeError', errors.PersonaTooLargeError],
];

describe('domain/errors', () => {
  it.each(CLASSES)('%s: code = name = ten lop, la Error, co thong diep mac dinh', (name, Ctor) => {
    const e = new Ctor();
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(name);
    expect(e.name).toBe(name);
    expect(e.message.length).toBeGreaterThan(0);
  });

  it('ModelDeadlineError la con cua ModelUnavailableError (D31: di chung duong model_down)', () => {
    const e = new errors.ModelDeadlineError();
    expect(e).toBeInstanceOf(errors.ModelUnavailableError);
    expect(e.code).toBe('ModelDeadlineError');
  });

  it('thong diep tuy chinh duoc giu nguyen', () => {
    expect(new errors.ConflictError('da doi').message).toBe('da doi');
  });

  it('InvalidToolInputError giu code/name "InvalidToolInput" (khong doi tu ban truoc)', () => {
    const e = new errors.InvalidToolInputError();
    expect(e.code).toBe('InvalidToolInput');
    expect(e.name).toBe('InvalidToolInput');
  });

  it('loi cua he thong cu khong con duoc xuat', () => {
    const exported = Object.keys(errors);
    for (const gone of ['JobNotFoundError', 'HoldExpiredError', 'PiiGateError', 'IllegalTransitionError', 'RegulationUnavailable']) {
      expect(exported).not.toContain(gone);
    }
  });
});
