// p03b-bot-uid.db.test.ts — migration 011 + botUid(account) tren DB that (D37, 01-CONTRACTS §4.11).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { BOT_UID_CACHE_MS, botUid, resetBotUidCache } from '../agent/community/bot.js';
import { runMigrations } from '../db/migrate.js';

let original: string | null = null;

beforeEach(async () => {
  const r = await sql<{ own_uid: string | null }>(`select own_uid from zalo_accounts where id = 'community'`);
  original = r[0]?.own_uid ?? null;
  resetBotUidCache();
});

afterAll(async () => {
  await sql(`update zalo_accounts set own_uid = $1 where id = 'community'`, [original]);
  await closeDb();
});

describe('migration 011_bot_uid', () => {
  it('chay lai ⇒ applied 0; cot zalo_accounts.own_uid kieu text, cho null', async () => {
    const r = await runMigrations();
    expect(r.applied).toBe(0);
    const m = await sql<{ version: string }>(`select version from schema_migrations where version like '011%'`);
    expect(m.length).toBe(1);
    const c = await sql<{ data_type: string; is_nullable: string }>(
      `select data_type, is_nullable from information_schema.columns where table_name = 'zalo_accounts' and column_name = 'own_uid'`
    );
    expect(c).toEqual([{ data_type: 'text', is_nullable: 'YES' }]);
  });
});

describe('botUid(account) tren DB that', () => {
  it('own_uid trong cot thang env; xoa cot ⇒ env; khong env + DATA_MODE=real ⇒ null; cache 60 s', async () => {
    await sql(`update zalo_accounts set own_uid = '8801234' where id = 'community'`);
    let t = 5_000_000;
    expect(await botUid('community', { BOT_ZALO_UID: 'env-uid', DATA_MODE: 'real' }, () => t)).toBe('8801234');
    await sql(`update zalo_accounts set own_uid = null where id = 'community'`);
    // trong cache 60 s van thay gia tri cu
    expect(await botUid('community', { BOT_ZALO_UID: 'env-uid', DATA_MODE: 'real' }, () => t + 1000)).toBe('8801234');
    t += BOT_UID_CACHE_MS;
    expect(await botUid('community', { BOT_ZALO_UID: 'env-uid', DATA_MODE: 'real' }, () => t)).toBe('env-uid');
    resetBotUidCache();
    expect(await botUid('community', { DATA_MODE: 'real' })).toBeNull();
  });
});
