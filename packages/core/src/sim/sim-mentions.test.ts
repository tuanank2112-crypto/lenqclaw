// SPEC-P02 §7.1: buildMentions thuan — pos/len cua @bot / @uid trong text gia lap.
import { describe, expect, it } from 'vitest';
import { BOT_UID_SIM, buildMentions } from './sim-transport.js';

describe('buildMentions', () => {
  it('khong mention ⇒ text giu nguyen, mentions rong', () => {
    expect(buildMentions('xin chào', false, [])).toEqual({ text: 'xin chào', mentions: [] });
  });
  it('mentionBot co san "@bot" ⇒ pos tro dung vi tri, text khong doi', () => {
    const r = buildMentions('ê @bot giúp', true, []);
    expect(r.text).toBe('ê @bot giúp');
    expect(r.mentions).toEqual([{ uid: BOT_UID_SIM, pos: 2, len: 4 }]);
  });
  it('mentionBot thieu "@bot" ⇒ chen o dau; mentionUids them o cuoi, pos tinh sau khi text on dinh', () => {
    const r = buildMentions('hỏi chút', true, ['sim-mem-2']);
    expect(r.text).toBe('@bot hỏi chút @sim-mem-2');
    expect(r.mentions).toEqual([
      { uid: BOT_UID_SIM, pos: 0, len: 4 },
      { uid: 'sim-mem-2', pos: 14, len: 10 },
    ]);
    for (const m of r.mentions) expect(r.text.slice(m.pos, m.pos + m.len).startsWith('@')).toBe(true);
  });
});
