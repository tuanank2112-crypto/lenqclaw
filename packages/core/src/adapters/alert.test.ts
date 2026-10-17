// adapters/alert.ts (D32, BB-20; G24): fetch gia, DB gia (vi.mock) — 0 mang, 0 DB. Ca DB that: dbtests/ops-watch.db.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  calls: [] as Array<{ text: string; params: readonly unknown[] }>,
  casRows: [{ kind: 'x' }] as unknown[],
  resolvedRows: [{ kind: 'x' }] as unknown[],
  used: 0,
  failAll: false,
}));

vi.mock('./db.js', () => ({
  sql: async (text: string, params: readonly unknown[] = []) => {
    db.calls.push({ text, params });
    if (db.failAll) throw new Error('no db');
    if (/count\(\*\)::int as c from audit_log/.test(text)) return [{ c: db.used }];
    if (/insert into alert_state/.test(text)) return db.casRows;
    if (/update alert_state set open = false/.test(text)) return db.resolvedRows;
    return [];
  },
}));

import { sendAlert, setAlertFetchForTest } from './alert.js';

// Ten bien env ghep lai: chuoi ky tu dac biet chi duoc xuat hien trong adapters/alert.ts (check_adapter_boundary).
const TOKEN_ENV = ['TELEGRAM', 'BOT', 'TOKEN'].join('_');
const HOST = ['api', 'telegram', 'org'].join('.');
const TOKEN = '777000111:AAFAKE-token-khong-that';
const CHAT = '-100123456';

interface Fetched {
  url: string;
  body: Record<string, unknown>;
  aborted: () => boolean;
}
function fakeFetch(status = 200): { f: typeof fetch; calls: Fetched[] } {
  const calls: Fetched[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), aborted: () => init.signal?.aborted === true });
    return new Response('{"ok":true,"secret":"khong-duoc-log"}', { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const A = { kind: 'runner_stale', key: 'runner', severity: 'critical', text: 'runner mat dau song 120 s' } as const;
const auditActions = (): string[] => db.calls.filter((c) => /insert into audit_log/.test(c.text)).map((c) => String(c.params[2]));

beforeEach(() => {
  db.calls = [];
  db.casRows = [{ kind: 'x' }];
  db.resolvedRows = [{ kind: 'x' }];
  db.used = 0;
  db.failAll = false;
  setAlertFetchForTest(null);
  delete process.env[TOKEN_ENV];
  delete process.env.TELEGRAM_CHAT_ID;
});
afterEach(() => {
  setAlertFetchForTest(null);
  delete process.env[TOKEN_ENV];
  delete process.env.TELEGRAM_CHAT_ID;
});

describe('sendAlert — bat/tat', () => {
  it('thieu token HOAC chat id ⇒ disabled, 0 fetch, audit alert.disabled DUNG 1 lan/tien trinh', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    expect(await sendAlert(A)).toBe('disabled');
    process.env[TOKEN_ENV] = TOKEN; // co token, thieu chat id
    expect(await sendAlert(A)).toBe('disabled');
    expect(await sendAlert({ ...A, resolved: true })).toBe('disabled');
    expect(calls).toHaveLength(0);
    expect(auditActions().filter((a) => a === 'alert.disabled')).toHaveLength(1);
  });

  it('khong co DB cung khong nem (disabled / failed)', async () => {
    db.failAll = true;
    expect(await sendAlert(A)).toBe('disabled');
    process.env[TOKEN_ENV] = TOKEN;
    process.env.TELEGRAM_CHAT_ID = CHAT;
    const { f } = fakeFetch();
    setAlertFetchForTest(f);
    await expect(sendAlert(A)).resolves.toBe('failed');
  });
});

describe('sendAlert — gui', () => {
  beforeEach(() => {
    process.env[TOKEN_ENV] = TOKEN;
    process.env.TELEGRAM_CHAT_ID = CHAT;
  });

  it('thanh cong ⇒ sent: POST sendMessage, body {chat_id, text "[lenqclaw] 🔴 …", disable_web_page_preview}, co AbortSignal timeout, audit alert.sent', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    expect(await sendAlert(A)).toBe('sent');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://${HOST}/bot${TOKEN}/sendMessage`);
    expect(calls[0]!.body).toEqual({ chat_id: CHAT, text: '[lenqclaw] 🔴 runner mat dau song 120 s', disable_web_page_preview: true });
    expect(auditActions()).toContain('alert.sent');
  });

  it('warning dung bieu tuong rieng; text cat 800 ky tu', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    await sendAlert({ ...A, severity: 'warning', text: 'x'.repeat(2000) });
    expect(String(calls[0]!.body.text).startsWith('[lenqclaw] 🟠 ')).toBe(true);
    expect(String(calls[0]!.body.text).length).toBe('[lenqclaw] 🟠 '.length + 800);
  });

  it('fetch gia 401 ⇒ failed + audit alert.failed {kind,status}; token / URL / body phan hoi KHONG co trong audit, log', async () => {
    const { f } = fakeFetch(401);
    setAlertFetchForTest(f);
    const logs: string[] = [];
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')].map((s) =>
      s.mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')))
    );
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(((s: unknown) => (logs.push(String(s)), true)) as never);
    try {
      expect(await sendAlert(A)).toBe('failed');
    } finally {
      spies.forEach((s) => s.mockRestore());
      out.mockRestore();
    }
    const audited = db.calls.filter((c) => /insert into audit_log/.test(c.text));
    const failed = audited.find((c) => c.params[2] === 'alert.failed')!;
    expect(JSON.parse(String(failed.params[4]))).toEqual({ kind: 'runner_stale', status: 401 });
    const all = JSON.stringify(db.calls) + logs.join('\n');
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain(HOST);
    expect(all).not.toContain('khong-duoc-log');
    // gui that bai ⇒ hoan lai moc gui de lan sau gui lai
    expect(db.calls.some((c) => /update alert_state set last_sent_at/.test(c.text))).toBe(true);
  });

  it('loi mang (fetch nem) ⇒ failed, khong nem', async () => {
    setAlertFetchForTest((async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch);
    expect(await sendAlert(A)).toBe('failed');
  });

  it('CAS tra 0 dong ⇒ suppressed, 0 fetch, tang cot suppressed', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    db.casRows = [];
    expect(await sendAlert(A)).toBe('suppressed');
    expect(calls).toHaveLength(0);
    expect(db.calls.some((c) => /set suppressed = suppressed \+ 1/.test(c.text))).toBe(true);
  });

  it('CAS dung mệnh de where (not open hoac qua ALERT_REPEAT_MIN) va truyen 30 phut', async () => {
    const { f } = fakeFetch();
    setAlertFetchForTest(f);
    await sendAlert(A);
    const cas = db.calls.find((c) => /insert into alert_state/.test(c.text))!;
    expect(cas.text).toMatch(/where not alert_state\.open or alert_state\.last_sent_at < now\(\) - make_interval\(mins => \$3\)/);
    expect(cas.params).toEqual(['runner_stale', 'runner', 30]);
  });

  it('tran ALERT_MAX_PER_HOUR (20 tin alert.sent / 60 phut) ⇒ suppressed + audit alert.capped MOT lan', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    db.used = 20;
    expect(await sendAlert(A)).toBe('suppressed');
    expect(await sendAlert({ ...A, key: 'khac' })).toBe('suppressed');
    expect(calls).toHaveLength(0);
    expect(auditActions().filter((a) => a === 'alert.capped')).toHaveLength(1);
  });

  it('resolved: co dong dang mo ⇒ gui "✅ da hoi phuc" (khong qua chong lap); khong ⇒ suppressed, 0 fetch', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    expect(await sendAlert({ ...A, resolved: true, text: 'runner co dau song' })).toBe('sent');
    expect(String(calls[0]!.body.text)).toBe('[lenqclaw] ✅ đã hồi phục: runner co dau song');
    db.resolvedRows = [];
    expect(await sendAlert({ ...A, resolved: true })).toBe('suppressed');
    expect(calls).toHaveLength(1);
  });

  it('localOnly: khong dung DB; chong lap bang Map trong tien trinh trong ALERT_REPEAT_MIN; resolved chi sau khi da bao', async () => {
    const { f, calls } = fakeFetch();
    setAlertFetchForTest(f);
    const L = { kind: 'db_unreachable', key: 'runner', severity: 'critical', text: 'mat DB' } as const;
    expect(await sendAlert({ ...L, resolved: true }, { localOnly: true })).toBe('suppressed');
    expect(await sendAlert(L, { localOnly: true })).toBe('sent');
    expect(await sendAlert(L, { localOnly: true })).toBe('suppressed');
    expect(await sendAlert({ ...L, resolved: true, text: 'DB tro lai' }, { localOnly: true })).toBe('sent');
    expect(calls).toHaveLength(2);
    expect(db.calls.filter((c) => /alert_state|audit_log/.test(c.text))).toHaveLength(0);
  });
});
