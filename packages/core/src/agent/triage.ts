// packages/core/src/agent/triage.ts — lop hieu y (SPEC-P03-Resident-Agent.md
// §11.10, Đ21). `text`/`recent` PHAI da che PII (§11.3) truoc khi goi ham
// nay — CAM gui PII tho vao triage (§11.9).

import { callTriageModel, DEFAULT_TRIAGE_TIMEOUT_MS } from '../adapters/model.js';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserMessage } from './prompts/triage.js';

export type TriageEmergency = 'fire' | 'smoke' | 'gas' | 'electric' | 'flood' | 'elevator' | 'other' | null;
export type TriageIntent = 'describe_problem' | 'consent' | 'decline' | 'defer' | 'question' | 'other';

export interface TriageResult {
  emergency: TriageEmergency;
  emergency_confidence: number;
  intent: TriageIntent;
  intent_confidence: number;
}

const EMERGENCY_VALUES: ReadonlyArray<TriageEmergency> = ['fire', 'smoke', 'gas', 'electric', 'flood', 'elevator', 'other', null];
const INTENT_VALUES: ReadonlyArray<TriageIntent> = ['describe_problem', 'consent', 'decline', 'defer', 'question', 'other'];

function isNumberInRange01(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** Parse + kiem schema JSON tra ve boi model. `null` neu hong (SPEC §11.10
 * "parse + kiem schema loi => null"). Xuat rieng de test JSON hong doc lap. */
export function parseTriageResult(raw: string): TriageResult | null {
  let parsed: unknown;
  try {
    // Model doi khi boc JSON trong ```json ... ``` du prompt da dan khong
    // dung markdown — cat phan trong ngoac nhon dau/cuoi cho chac.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonText = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : raw;
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const emergency = obj.emergency as TriageEmergency;
  const intent = obj.intent as TriageIntent;
  if (!EMERGENCY_VALUES.includes(emergency)) return null;
  if (!INTENT_VALUES.includes(intent)) return null;
  if (!isNumberInRange01(obj.emergency_confidence)) return null;
  if (!isNumberInRange01(obj.intent_confidence)) return null;
  return {
    emergency,
    emergency_confidence: obj.emergency_confidence as number,
    intent,
    intent_confidence: obj.intent_confidence as number,
  };
}

function extractText(call: Awaited<ReturnType<typeof callTriageModel>>): string {
  return call.message.content
    .filter((b): b is { type: 'text'; text: string; citations: null } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** SPEC-P03 §11.10: `text`/`recent` DA che PII. Qua han
 * `TRIAGE_TIMEOUT_MS` (mac dinh 4000ms), loi model, JSON hong, hoac sai
 * schema => `null` (KHONG retry, KHONG MODEL_FALLBACKS — chi mot lan goi
 * duy nhat qua `callTriageModel`). */
export async function triageMessage(text: string, recent: string[] = [], conversationId?: string | null): Promise<TriageResult | null> {
  const timeoutMs = Number(process.env.TRIAGE_TIMEOUT_MS?.trim() || DEFAULT_TRIAGE_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      callTriageModel({
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildTriageUserMessage(text, recent) }],
        conversationId: conversationId ?? null,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('triage: qua han TRIAGE_TIMEOUT_MS')), timeoutMs);
      }),
    ]);
    return parseTriageResult(extractText(result));
  } catch {
    return null;
  }
}
