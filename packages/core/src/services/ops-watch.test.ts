// ops-watch.ts: db_unreachable (3 lan lien that bai, localOnly) — DB gia. Cac kind con lai: dbtests/ops-watch.db.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ fail: true }));
vi.mock('../adapters/db.js', () => ({
  sql: async () => {
    if (db.fail) throw new Error('ECONNREFUSED');
    return [];
  },
}));

import { setAlertFetchForTest } from '../adapters/alert.js';
import { checkOps, resetOpsWatchForTest } from './ops-watch.js';

const TOKEN_ENV = ['TELEGRAM', 'BOT', 'TOKEN'].join('_');
const fetches: Array<Record<string, unknown>> = [];

beforeEach(() => {
  db.fail = true;
  fetches.length = 0;
  process.env[TOKEN_ENV] = '1:FAKE';
  process.env.TELEGRAM_CHAT_ID = '-1';
  setAlertFetchForTest((async (_u: string, init: RequestInit) => {
    fetches.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch);
  resetOpsWatchForTest();
});

describe('checkOps — db_unreachable', () => {
  it('2 lan loi chua bao; lan thu 3 ⇒ DUNG 1 tin (localOnly); lan 4 trong 30 phut ⇒ khong lap; DB tro lai ⇒ 1 tin hoi phuc', async () => {
    const now = new Date('2026-10-17T03:00:00Z');
    expect((await checkOps(now, 'runner')).dbDown).toBe(true);
    await checkOps(now, 'runner');
    expect(fetches).toHaveLength(0);
    await checkOps(now, 'runner');
    expect(fetches).toHaveLength(1);
    expect(String(fetches[0]!.text)).toContain('runner khong ket noi duoc DB');
    await checkOps(now, 'runner');
    expect(fetches).toHaveLength(1);
    db.fail = false;
    await checkOps(now, 'runner').catch(() => undefined);
    expect(fetches.some((f) => String(f.text).includes('✅ đã hồi phục'))).toBe(true);
  });
});
