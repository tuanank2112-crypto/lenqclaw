// node `triage` (pipeline) — lop hieu y (SPEC-P03 §5.2, D31 T3, BB-12). CHI node nay goi `triageCommunityMessage`
// (BB-15). Tin GOI BOT (DM, mention, quote tin bot, ten bot, lenh owner/moderator) KHONG triage ⇒ `triage=null`,
// `triageMs=null`. Tin khong goi bot o nhom kiem duyet bat HOAC mode ambient: mot loi goi model/tin, cap nhat
// `group_messages.is_question`. Loi/qua han/JSON hong ⇒ null (khong chan duong tra loi).

import { sql } from '../../../../adapters/db.js';
import { loadRecentTexts } from '../../buffer.js';
import { hasControlCommand } from '../../gate.js';
import { loadPersonaBundle } from '../../persona.js';
import { triageCommunityMessage } from '../../triage.js';
import { resolveBotUid } from '../../bot.js';
import { isAddressedToBot, needsTriage } from '../edges.js';
import type { NodeFn, PipelineStateT } from '../state.js';

const QUESTION_MIN_CONF = 0.5;

export const triageNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const payload = e.payload as { text?: unknown; msg_type?: unknown; mentions?: unknown; quote?: unknown };
  const text = typeof payload.text === 'string' ? payload.text : '';
  const msgType = typeof payload.msg_type === 'string' ? payload.msg_type : 'webchat';

  let botNamePatterns: RegExp[] = [];
  if (e.threadType === 'group') {
    try {
      botNamePatterns = (await loadPersonaBundle(e.zaloAccountId)).namePatterns;
    } catch {
      botNamePatterns = []; // loi persona ⇒ chi mention/quote/lenh kich hoat
    }
  }
  const mentions = Array.isArray(payload.mentions)
    ? (payload.mentions as Array<{ uid?: unknown }>).filter((m): m is { uid: string } => typeof m?.uid === 'string')
    : [];
  const quoteOwner =
    payload.quote && typeof payload.quote === 'object' && typeof (payload.quote as { owner_id?: unknown }).owner_id === 'string'
      ? ((payload.quote as { owner_id: string }).owner_id)
      : null;

  const addressed = isAddressedToBot({
    threadType: e.threadType,
    mentions,
    quoteOwnerUid: quoteOwner,
    botUid: resolveBotUid(process.env, e.zaloAccountId, e.threadId),
    text,
    botNamePatterns,
    hasControlCommand: hasControlCommand(text),
    role: s.sender?.role ?? 'stranger',
  });

  if (!needsTriage({ threadType: e.threadType, msgType, text, group: s.group, addressed })) {
    return { triageResult: null, triageMs: null };
  }

  const started = Date.now();
  const recent = s.row ? await loadRecentTexts(e.zaloAccountId, e.threadId, s.row.id, 3) : [];
  const triage = await triageCommunityMessage(text, recent);
  const triageMs = Date.now() - started;
  if (triage && s.row) {
    await sql(`update group_messages set is_question = $2 where id = $1`, [
      s.row.id,
      triage.is_question && triage.question_confidence >= QUESTION_MIN_CONF,
    ]);
  }
  return { triageResult: triage, triageMs };
};
