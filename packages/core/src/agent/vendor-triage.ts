// packages/core/src/agent/vendor-triage.ts — lop hieu y tin nhan cua THO
// (SPEC-P05-Dispatch.md §10.4.1, Đ21/Đ27). `text`/`recent` PHAI da che PII
// (redactPii) truoc khi goi ham nay — cung luat voi agent/triage.ts (P03
// §11.9): agent chinh (vendor-agent.ts) KHONG doc duoc `ctx.triage` qua
// tool, chi server (cac tool §10.4.4) dung.

import { callTriageModel, DEFAULT_TRIAGE_TIMEOUT_MS } from '../adapters/model.js';
import { VENDOR_TRIAGE_SYSTEM_PROMPT, buildVendorTriageUserMessage } from './prompts/vendor-triage.js';
// R12 Q1 (report P05-B): kieu `VendorTriageResult`/`VendorIntent` da duoc
// khai bao san trong `agent/vendor-tool-context.ts` (P05-B, dung DUNG hinh
// dang §10.4.1) — import lai o day, KHONG dinh nghia lai (tranh hai nguon
// chan ly).
import type { VendorIntent, VendorTriageResult } from './vendor-tool-context.js';
import type { TradeGroup } from '../domain/types.js';

export type { VendorIntent, VendorTriageResult };

const INTENT_VALUES: ReadonlyArray<VendorIntent> = [
  'claim',
  'confirm',
  'quote',
  'decline',
  'slot_request',
  'my_slot',
  'my_jobs',
  'question',
  'other',
];
const TRADE_GROUP_VALUES: ReadonlyArray<TradeGroup> = ['dien_nuoc', 'khoa', 'dien_lanh', 'xay_sua'];

function isNumberInRange01(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** Parse + kiem schema JSON tra ve boi model. `null` neu hong (giong
 * `parseTriageResult` cua agent/triage.ts §11.10). Xuat rieng de test JSON
 * hong doc lap. */
export function parseVendorTriage(raw: string): VendorTriageResult | null {
  let parsed: unknown;
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonText = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : raw;
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const intent = obj.intent as VendorIntent;
  if (!INTENT_VALUES.includes(intent)) return null;
  if (!isNumberInRange01(obj.intent_confidence)) return null;

  const jobCodeRaw = obj.job_code;
  const jobCode = typeof jobCodeRaw === 'string' && jobCodeRaw.trim().length > 0 ? jobCodeRaw.trim() : null;

  const priceRaw = obj.price_vnd;
  const priceVnd = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? priceRaw : null;

  const tradeGroupRaw = obj.trade_group;
  const tradeGroup =
    typeof tradeGroupRaw === 'string' && (TRADE_GROUP_VALUES as readonly string[]).includes(tradeGroupRaw)
      ? (tradeGroupRaw as TradeGroup)
      : null;

  return {
    intent,
    intent_confidence: obj.intent_confidence as number,
    job_code: jobCode,
    price_vnd: priceVnd,
    trade_group: tradeGroup,
  };
}

function extractText(call: Awaited<ReturnType<typeof callTriageModel>>): string {
  return call.message.content
    .filter((b): b is { type: 'text'; text: string; citations: null } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** SPEC-P05-Dispatch.md §10.4.1: `text`/`recent` DA che PII. Qua han
 * `TRIAGE_TIMEOUT_MS` (mac dinh 4000ms), loi model, JSON hong, hoac sai
 * schema => `null` (KHONG retry, KHONG MODEL_FALLBACKS — mot lan goi duy
 * nhat qua `callTriageModel`, route `triage`, model `MODEL_TRIAGE`). */
export async function triageVendorMessage(
  text: string,
  recent: string[] = [],
  conversationId?: string | null
): Promise<VendorTriageResult | null> {
  const timeoutMs = Number(process.env.TRIAGE_TIMEOUT_MS?.trim() || DEFAULT_TRIAGE_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      callTriageModel({
        system: VENDOR_TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildVendorTriageUserMessage(text, recent) }],
        conversationId: conversationId ?? null,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('vendor-triage: qua han TRIAGE_TIMEOUT_MS')), timeoutMs);
      }),
    ]);
    return parseVendorTriage(extractText(result));
  } catch {
    return null;
  }
}
