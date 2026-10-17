// bot.ts (D37, 01-CONTRACTS §4.11): thu tu nguon botUid = cot own_uid → env BOT_ZALO_UID → (DATA_MODE=sim) BOT_UID_SIM → null;
// cache 60 s; resolveBotUid dong bo cho node do thi. DB gia (vi.mock) — ca DB that o dbtests/p03b-bot-uid.db.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ own: null as string | null, calls: 0, fail: false }));
vi.mock('../../adapters/db.js', () => ({
  sql: async () => {
    db.calls++;
    if (db.fail) throw new Error('db down');
    return [{ own_uid: db.own }];
  },
}));

import { BOT_UID_CACHE_MS, BOT_UID_UNKNOWN, botUid, resetBotUidCache, resolveBotUid } from './bot.js';
import { BOT_UID_SIM } from '../../sim/sim-transport.js';

beforeEach(() => {
  db.own = null;
  db.calls = 0;
  db.fail = false;
  resetBotUidCache();
});

describe('botUid(account) — thu tu nguon', () => {
  it('cot own_uid thang env va sim', async () => {
    db.own = '7001';
    expect(await botUid('community', { BOT_ZALO_UID: 'env-uid', DATA_MODE: 'sim' })).toBe('7001');
  });
  it('own_uid null ⇒ env BOT_ZALO_UID (ke ca khi DATA_MODE khac sim)', async () => {
    expect(await botUid('community', { BOT_ZALO_UID: ' env-uid ', DATA_MODE: 'real' })).toBe('env-uid');
  });
  it('khong cot, khong env: DATA_MODE=sim (hoac mac dinh) ⇒ BOT_UID_SIM', async () => {
    expect(await botUid('community', { DATA_MODE: 'sim' })).toBe(BOT_UID_SIM);
    resetBotUidCache();
    expect(await botUid('community', {})).toBe(BOT_UID_SIM);
  });
  it('khong cot, khong env, DATA_MODE khac sim ⇒ null (khong doan)', async () => {
    expect(await botUid('community', { DATA_MODE: 'real' })).toBeNull();
  });
  it('own_uid chuoi rong / khoang trang coi nhu null', async () => {
    db.own = '  ';
    expect(await botUid('community', { DATA_MODE: 'real' })).toBeNull();
  });
});

describe('cache 60 s', () => {
  it('trong 60 s chi doc DB 1 lan; qua 60 s doc lai va thay gia tri moi', async () => {
    let t = 1_000_000;
    db.own = '7001';
    expect(await botUid('community', {}, () => t)).toBe('7001');
    db.own = '7002';
    t += BOT_UID_CACHE_MS - 1;
    expect(await botUid('community', {}, () => t)).toBe('7001');
    expect(db.calls).toBe(1);
    t += 1;
    expect(await botUid('community', {}, () => t)).toBe('7002');
    expect(db.calls).toBe(2);
  });
  it('loi DB ⇒ giu gia tri cu, khong nem', async () => {
    let t = 0;
    db.own = '7001';
    await botUid('community', {}, () => t);
    db.fail = true;
    t += BOT_UID_CACHE_MS;
    expect(await botUid('community', {}, () => t)).toBe('7001');
  });
});

describe('resolveBotUid() dong bo cho node do thi', () => {
  it('truoc khi co anh chup: env → sim → BOT_UID_UNKNOWN', () => {
    expect(resolveBotUid({ BOT_ZALO_UID: 'e1' })).toBe('e1');
    expect(resolveBotUid({ DATA_MODE: 'sim' })).toBe(BOT_UID_SIM);
    expect(resolveBotUid({ DATA_MODE: 'real' })).toBe(BOT_UID_UNKNOWN);
  });
  it('sau khi botUid() doc own_uid: resolveBotUid tra own_uid (thang env)', async () => {
    db.own = '7001';
    await botUid('community', { DATA_MODE: 'real' });
    expect(resolveBotUid({ BOT_ZALO_UID: 'e1' })).toBe('7001');
  });
  it('BOT_UID_UNKNOWN khong khop mention nao: cong coi nhu khong co mention bot', async () => {
    const { decideGroupInbound } = await import('./gate.js');
    const r = decideGroupInbound({
      isSelf: false,
      group: { enabled: true, mode: 'mention', allowUsers: [], denyUsers: [] },
      sender: { uid: 'u1', role: 'member' },
      botUid: resolveBotUid({ DATA_MODE: 'real' }),
      text: 'chào',
      msgType: 'webchat',
      mentions: [{ uid: 'u-khac' }],
      quoteOwnerUid: 'u-khac',
      botNamePatterns: [],
      hasControlCommand: false,
    });
    expect(r.admitted).toBe(false);
  });
});
