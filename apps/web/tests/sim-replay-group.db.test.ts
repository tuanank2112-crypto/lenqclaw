// apps/web/tests/sim-replay-group.db.test.ts — SPEC-P03 §11 hang 6: /dev/sim e2e qua `routeInboundEvent` (= runPipeline)
// voi model gia. Kich ban `evals/scenarios/group-mention.jsonl` (6 dong: 2 nhom, 1 mention, 1 quote tin bot, 1 ten bot,
// 1 sticker, 1 tin thuong o nhom ambient) ⇒ outbound=3 (typing KHONG tinh — simDeliver chi dem tin that).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, model, sql } from '@lenqclaw/core';
import { POST as simReplay } from '../app/api/dev/sim/replay/route';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';

let adminId = '';
const savedEnv: Record<string, string | undefined> = {};
const ENV = ['SESSION_SECRET', 'DATA_MODE', 'MODEL_PROVIDER', 'GEMINI_API_KEY', 'MODEL_COMMUNITY', 'MODEL_FALLBACKS'] as const;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Model gia: lan dau cua luot ⇒ goi send_group_message (quote tin kich hoat); sau tool_result ⇒ chot. */
const fakeModel: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as { contents: Array<{ parts: Array<Record<string, unknown>> }> };
  const hasToolResult = body.contents.some((c) => c.parts.some((p) => 'functionResponse' in p));
  const usage = { promptTokenCount: 10, candidatesTokenCount: 5 };
  if (hasToolResult) return json({ candidates: [{ content: { parts: [{ text: 'xong' }] }, finishReason: 'STOP' }], usageMetadata: usage });
  const text = body.contents.flatMap((c) => c.parts.map((p) => (typeof p.text === 'string' ? p.text : ''))).join('\n');
  const focus = text.split('<<<untrusted focus>>>')[1] ?? '';
  const id = /\[#(\d+) uid=/.exec(focus)?.[1];
  const args = { text: 'Mình trả lời trong nhóm nhé.', ...(id ? { reply_to_msg_id: id } : {}) };
  return json({ candidates: [{ content: { parts: [{ functionCall: { name: 'send_group_message', args } }] }, finishReason: 'STOP' }], usageMetadata: usage });
};

describe('/api/dev/sim/replay — group-mention.jsonl (db, model gia)', () => {
  beforeAll(async () => {
    for (const k of ENV) savedEnv[k] = process.env[k];
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
    process.env.DATA_MODE = 'sim';
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.MODEL_COMMUNITY = 'gemini-fake-main';
    process.env.MODEL_FALLBACKS = '';
    model.setGeminiFetchForTest(fakeModel);
    const rows = await sql<{ id: string }>(
      `insert into staff_users (email, password_hash, role) values ($1,'x','admin') returning id`,
      [`sim-replay-${randomUUID().slice(0, 8)}@test.local`]
    );
    adminId = rows[0]!.id;
  });

  afterAll(async () => {
    model.setGeminiFetchForTest(null);
    for (const k of ENV) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await closeDb();
  });

  it('6 dong ⇒ inbound=6, 0 trung, outbound=3 (mention, quote tin bot, ten bot); sticker + tin thuong + nhom ambient im', async () => {
    // tu co lap: kich ban dung msg_id co dinh `gm-*`
    await sql(`update inbound_events set processed_at = now() where processed_at is null`);
    await sql(`delete from inbound_events where zalo_msg_id like 'gm-%'`);
    await sql(`delete from group_messages where zalo_msg_id like 'gm-%'`);
    const community = await sql<{ c: number }>(`select count(*)::int as c from agent_runs where route = 'community'`);

    const cookie = `${SESSION_COOKIE_NAME}=${await createSessionCookie(adminId, 'admin')}`;
    const res = await simReplay(
      new NextRequest('http://localhost/api/dev/sim/replay', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ file: 'group-mention.jsonl' }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inbound: 6, duplicates: 0, outbound: 3 });

    // 3 luot mention ⇒ 3 × (tool + chot) = 6 lan goi model community; 0 cho tin thuong / sticker / ambient
    const after = await sql<{ c: number }>(`select count(*)::int as c from agent_runs where route = 'community'`);
    expect(after[0]!.c - community[0]!.c).toBe(6);

    const outs = await sql<{ kind: string; trigger: string | null }>(
      `select t.kind, t.trigger from turn_traces t where t.thread_id = 'sim-group-1' order by t.created_at desc limit 3`
    );
    expect(outs.map((o) => o.trigger).sort()).toEqual(['mention', 'name_pattern', 'reply_to_bot']);

    // phat lai lan hai: msg_id trung ⇒ 6 duplicates, khong sinh them gi
    const res2 = await simReplay(
      new NextRequest('http://localhost/api/dev/sim/replay', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ file: 'group-mention.jsonl' }),
      })
    );
    expect(await res2.json()).toEqual({ inbound: 0, duplicates: 6, outbound: 0 });
  }, 60_000);
});
