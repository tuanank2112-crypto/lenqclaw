// packages/core/src/agent/community/triage.ts — lop hieu y (SPEC-P03 §5.2, BB-12).
// `parseCommunityTriage` THUAN (kiem enum/khoang [0,1], hong => null). `triageCommunityMessage`
// goi route `triage` (`callTriageModel`, KHONG retry, huy fetch bang AbortSignal sau
// `TRIAGE_TIMEOUT_MS`); loi/qua han/JSON hong => null. CHI node `triage` duoc goi ham nay (BB-15).

import { callTriageModel } from '../../adapters/model.js';
import type { CommunityTriage } from '../../domain/types.js';
import { redactPhones } from './redact.js';
import { buildTriageUserMessage, TRIAGE_SYSTEM } from './prompts/triage.js';

const VERDICTS = ['ok', 'spam', 'scam', 'ad', 'harass', 'unsure'] as const;

function isUnit(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** Bo hang rao ```json ... ``` neu model boc JSON trong khoi ma. */
function stripFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1]! : t;
}

/** JSON hong / thieu khoa / ngoai [0,1] / sai kieu => `null` (01-CONTRACTS §6). */
export function parseCommunityTriage(raw: string): CommunityTriage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(stripFence(raw));
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const verdict = o.verdict;
  if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) return null;
  if (!isUnit(o.confidence) || !isUnit(o.question_confidence) || !isUnit(o.lead_confidence)) return null;
  if (typeof o.is_question !== 'boolean' || typeof o.lead_intent !== 'boolean' || typeof o.wants_private !== 'boolean') return null;
  return {
    verdict: verdict as CommunityTriage['verdict'],
    confidence: o.confidence,
    is_question: o.is_question,
    question_confidence: o.question_confidence,
    lead_intent: o.lead_intent,
    lead_confidence: o.lead_confidence,
    wants_private: o.wants_private,
  };
}

/** `recent` = 3 tin truoc cung thread, da che SDT boi caller hoac o day (an toan lap lai). */
export async function triageCommunityMessage(
  text: string,
  recent: readonly string[],
  conversationId?: string | null
): Promise<CommunityTriage | null> {
  try {
    const res = await callTriageModel({
      system: TRIAGE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: buildTriageUserMessage({ text: redactPhones(text), recent: recent.map(redactPhones) }),
        },
      ],
      conversationId: conversationId ?? null,
    });
    const raw = res.message.content
      .filter((b): b is { type: 'text'; text: string; citations: null } => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return parseCommunityTriage(raw);
  } catch {
    return null; // loi / qua han: lop hieu y KHONG chan duong tra loi (giu hop dong cu)
  }
}
