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

describe('D39: DATA_MODE=sim + thread sim-% ⇒ BOT_UID_SIM bat ke cot own_uid', () => {
  it('cot co uid that, thread sim-% trong DATA_MODE=sim ⇒ BOT_UID_SIM; resolveBotUid theo anh chup do', async () => {
    db.own = '7001';
    expect(await botUid('community', { DATA_MODE: 'sim' }, Date.now, 'sim-abc')).toBe(BOT_UID_SIM);
    expect(resolveBotUid({ DATA_MODE: 'sim' }, 'community', 'sim-abc')).toBe(BOT_UID_SIM);
  });
  it('thread that (khong sim-) hoac DATA_MODE khac sim ⇒ van doc cot own_uid', async () => {
    db.own = '7001';
    expect(await botUid('community', { DATA_MODE: 'sim' }, Date.now, 'g-123')).toBe('7001');
    expect(resolveBotUid({ DATA_MODE: 'sim' }, 'community', 'g-123')).toBe('7001');
    resetBotUidCache();
    expect(await botUid('community', { DATA_MODE: 'real' }, Date.now, 'sim-abc')).toBe('7001');
  });
  it('luot sau tren thread that dat lai anh chup (khong ro ri co sim)', async () => {
    db.own = '7001';
    await botUid('community', { DATA_MODE: 'sim' }, Date.now, 'sim-abc');
    await botUid('community', { DATA_MODE: 'sim' }, Date.now, 'g-123');
    expect(resolveBotUid({ DATA_MODE: 'sim' }, 'community', 'g-123')).toBe('7001');
  });
});

describe('F2 (D41): resolveBotUid tu tinh sim theo threadId cua CHINH luot — cache chi giu own_uid', () => {
  it('hai luot xen ke (thread that va sim-%) tren cache da nap ⇒ moi luot dung uid cua minh, bat ke thu tu lam moi', async () => {
    db.own = '7001';
    const env = { DATA_MODE: 'sim' } as NodeJS.ProcessEnv;
    await botUid('community', env, Date.now, 'g-real-1');
    await botUid('community', env, Date.now, 'sim-g-1');
    expect(resolveBotUid(env, 'community', 'g-real-1')).toBe('7001');
    expect(resolveBotUid(env, 'community', 'sim-g-1')).toBe(BOT_UID_SIM);
    await botUid('community', env, Date.now, 'sim-g-2');
    await botUid('community', env, Date.now, 'g-real-2');
    expect(resolveBotUid(env, 'community', 'sim-g-2')).toBe(BOT_UID_SIM);
    expect(resolveBotUid(env, 'community', 'g-real-2')).toBe('7001');
  });
  it('DATA_MODE=real: thread sim-% KHONG duoc coi la sim', async () => {
    db.own = '7001';
    const env = { DATA_MODE: 'real' } as NodeJS.ProcessEnv;
    await botUid('community', env, Date.now, 'sim-x');
    expect(resolveBotUid(env, 'community', 'sim-x')).toBe('7001');
  });
  it('khong truyen threadId ⇒ khong bao gio sim theo cache (own_uid truoc, roi env/sim)', async () => {
    db.own = '7001';
    const env = { DATA_MODE: 'sim' } as NodeJS.ProcessEnv;
    await botUid('community', env, Date.now, 'sim-abc');
    expect(resolveBotUid(env)).toBe('7001');
  });
});
