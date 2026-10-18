// p05-fix-f16.db.test.ts — F16 (SPEC-P05 §7.1, §11): `flushWelcomes` xoa `welcome_pending_since` bang CAS; thanh vien `join` den
// GIUA CHUNG (sau khi flush da danh dau, truoc khi xoa) ⇒ lan flush sau van chao. File rieng vi `vi.mock` system-events.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ run: null as null | (() => Promise<void>) }));
vi.mock('../services/system-events.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/system-events.js')>();
  return {
    ...real,
    enqueueSystemEvent: async (...a: Parameters<typeof real.enqueueSystemEvent>) => {
      const id = await real.enqueueSystemEvent(...a);
      const h = hook.run;
      hook.run = null; // chi chen mot lan
      if (h) await h();
      return id;
    },
  };
});

import { closeDb, sql } from '../adapters/db.js';
import { getGroup } from '../agent/community/buffer.js';
import { readCommunityConfig } from '../services/community-config.js';
import { flushWelcomes, recordMemberJoin } from '../services/welcome.js';
import { ACCOUNT, mkGroup, uniq } from './p03-helpers.js';

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) {
    await sql(`update inbound_events set processed_at = now() where processed_at is null and thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_members where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_sessions where thread_id = any($1::text[])`, [made]);
    await sql(`delete from zalo_groups where thread_id = any($1::text[])`, [made]);
  }
  await closeDb();
});
beforeAll(() => undefined);

const welcomeEvents = (g: string) =>
  sql<{ id: number; payload: { data: { uids: string[] } } }>(
    `select id::int as id, payload from inbound_events where thread_id = $1 and sender_uid = 'system' and payload->>'event' = 'welcome_flush' order by id`,
    [g]
  );

describe('F16 — join den giua chung luc flush', () => {
  it('flush #1 chao u1; u2 join trong luc enqueue ⇒ pending khong bi xoa mat; flush #2 chao u2', async () => {
    const g = await mkGroup({});
    made.push(g);
    await sql(`update zalo_groups set welcome_enabled = true where zalo_account_id = $2 and thread_id = $1`, [g, ACCOUNT]);
    const group = (await getGroup(ACCOUNT, g))!;
    const cfg = { ...readCommunityConfig(), welcomeDebounceSec: 1 };
    const [u1, u2] = [uniq('sim-w1'), uniq('sim-w2')];
    const t0 = new Date(Date.now() - 20_000);
    await recordMemberJoin({ account: ACCOUNT, group, uids: [u1], names: ['Một'], now: t0 });

    hook.run = async () => {
      await recordMemberJoin({ account: ACCOUNT, group, uids: [u2], names: ['Hai'], now: new Date() });
    };
    expect(await flushWelcomes(new Date(), cfg)).toBe(1);
    let ev = await welcomeEvents(g);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload.data.uids).toEqual([u1]);
    const pending = await sql<{ p: string | null }>(`select welcome_pending_since::text as p from group_sessions where zalo_account_id = $1 and thread_id = $2`, [ACCOUNT, g]);
    expect(pending[0]!.p).not.toBeNull(); // u2 chua duoc chao ⇒ phien van cho
    const m2 = await sql<{ welcomed_at: string | null }>(`select welcomed_at::text from group_members where thread_id = $1 and zalo_uid = $2`, [g, u2]);
    expect(m2[0]!.welcomed_at).toBeNull();

    // runner da xu ly su kien #1 ⇒ lan flush sau
    await sql(`update inbound_events set processed_at = now() where thread_id = $1 and processed_at is null`, [g]);
    expect(await flushWelcomes(new Date(Date.now() + 3_000), cfg)).toBe(1);
    ev = await welcomeEvents(g);
    expect(ev.map((e) => e.payload.data.uids)).toEqual([[u1], [u2]]);
    const after = await sql<{ p: string | null }>(`select welcome_pending_since::text as p from group_sessions where zalo_account_id = $1 and thread_id = $2`, [ACCOUNT, g]);
    expect(after[0]!.p).toBeNull();
  });
});
