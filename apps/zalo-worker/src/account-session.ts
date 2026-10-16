// apps/zalo-worker/src/account-session.ts — vong doi phien cua MOT tai khoan
// (SPEC-P02 §1, §2, §6, §9.2): dang nhap bang cookie da ma hoa, dang nhap QR
// theo yeu cau tu web, listener, watchdog, dong bo cookie (CAS).
// CAM log cookie/imei/userAgent/ban ro phien (§7).

import type { SessionState } from '@lenqclaw/core';
import type { AccountId, PacerConfig } from './config.js';
import { decryptSession, encryptSession, SessionDecryptError, type SessionSecret } from './crypto.js';
import {
  ZaloAuthError,
  type ZaloClientLike,
  type ZaloInboundMessage,
  type ZaloSessionLike,
  type ZaloGroupEvent,
  type ZaloUndoEvent,
} from './client.js';
import { handleGroupEvent, handleInbound, handleUndo } from './inbound.js';
import { errSummary, logEvent } from './log.js';
import * as store from './store.js';
import {
  CLOSE_ABNORMAL,
  decideOnClose,
  isAttemptExhausted,
  reconnectDelayMs,
  shouldProbeIdle,
} from './watchdog.js';

export interface SessionDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AccountSession {
  private session: ZaloSessionLike | null = null;
  private state: SessionState = 'logged_out';
  private stopping = false;
  private reconnecting = false;
  private lastEventAt: number;
  private lastSavedCookieJson: string | null = null;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly rng?: () => number;
  /** Moi lan dang nhap moi / dong listener tang epoch — bo qua su kien cua listener cu. */
  private epoch = 0;
  /** Cac su kien dang xu ly (test cho het bang `idle()`). */
  private inflight = new Set<Promise<unknown>>();
  /** Nhat ky quyet dinh reconnect (test doc). */
  readonly reconnectDelays: number[] = [];

  constructor(
    readonly account: AccountId,
    private readonly client: ZaloClientLike,
    private readonly key: Buffer,
    private readonly cfg: PacerConfig,
    deps: SessionDeps = {}
  ) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? defaultSleep;
    this.rng = deps.rng;
    this.lastEventAt = this.now();
  }
  getSession(): ZaloSessionLike | null {
    return this.state === 'connected' ? this.session : null;
  }

  getState(): SessionState {
    return this.state;
  }

  private async setState(s: SessionState): Promise<void> {
    this.state = s;
    await store.setState(this.account, s);
    logEvent('zalo.state', { account: this.account, state: s });
  }

  /** Khoi dong: giai ma session_enc ⇒ login(cookie). That bai ⇒ logged_out, cho QR (§1). */
  async start(): Promise<void> {
    const row = await store.loadAccount(this.account);
    if (!row) throw new Error(`zalo_accounts thieu dong "${this.account}" — chay "npm run db:seed".`);
    if (!row.session_enc) {
      await this.setState('logged_out');
      return;
    }
    let secret: SessionSecret;
    try {
      secret = decryptSession(row.session_enc, this.key, this.account);
    } catch (err) {
      if (err instanceof SessionDecryptError) {
        await this.setState('logged_out');
        await store.alert(this.account, 'session_decrypt_failed');
        return;
      }
      throw err;
    }
    try {
      const s = await this.client.loginWithCookie(secret);
      this.lastSavedCookieJson = JSON.stringify(secret.cookie);
      await this.attach(s);
    } catch (err) {
      if (err instanceof ZaloAuthError) {
        await this.setState('logged_out');
        await store.alert(this.account, 'cookie_expired', { error: errSummary(err) });
        return;
      }
      logEvent('zalo.login_network_error', { account: this.account, error: errSummary(err) });
      this.track(this.reconnect());
    }
  }

  private async attach(s: ZaloSessionLike): Promise<void> {
    this.detach();
    const myEpoch = ++this.epoch;
    this.session = s;
    this.lastEventAt = this.now();
    s.startListener({
      message: (m) => {
        if (myEpoch === this.epoch) this.track(this.onMessage(m));
      },
      groupEvent: (ev) => {
        if (myEpoch === this.epoch) this.track(this.onGroupEvent(ev));
      },
      undo: (u) => {
        if (myEpoch === this.epoch) this.track(this.onUndo(u));
      },
      closed: (code) => {
        if (myEpoch === this.epoch) this.track(this.onClosed(code));
      },
      error: (e) => {
        if (myEpoch === this.epoch) logEvent('zalo.listener_error', { account: this.account, error: errSummary(e) });
      },
    });
    await this.setState('connected');
  }

  private detach(): void {
    if (this.session) {
      this.epoch++;
      this.session.stopListener();
      this.session = null;
    }
  }

  private track<T>(p: Promise<T>): void {
    const wrapped = p.catch((err) => {
      logEvent('zalo.handler_error', { account: this.account, error: errSummary(err) });
    });
    this.inflight.add(wrapped);
    void wrapped.finally(() => this.inflight.delete(wrapped));
  }

  /** Cho moi su kien dang xu ly xong (test/dung em). */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.all([...this.inflight]);
  }

  private async onMessage(m: ZaloInboundMessage): Promise<void> {
    this.lastEventAt = this.now();
    await store.touchEvent(this.account);
    const outcome = await handleInbound(this.account, m, this.cfg, { now: this.now, rng: this.rng });
    logEvent('zalo.inbound', { account: this.account, outcome, msg_type: m.msgType });
  }

  private async onGroupEvent(ev: ZaloGroupEvent): Promise<void> {
    this.lastEventAt = this.now();
    await store.touchEvent(this.account);
    const outcome = await handleGroupEvent(this.account, ev);
    logEvent('zalo.group_event', { account: this.account, outcome, event: ev.event });
  }

  private async onUndo(u: ZaloUndoEvent): Promise<void> {
    this.lastEventAt = this.now();
    await handleUndo(this.account, u);
  }

  /** Watchdog §6 — dong listener. */
  async onClosed(code: number): Promise<void> {
    const decision = decideOnClose(code, this.stopping);
    logEvent('zalo.closed', { account: this.account, code, decision: decision.kind });
    if (decision.kind === 'ignore') return;
    if (decision.kind === 'kicked') {
      // G01: KHONG tu dang nhap lai; bao dong; cho nguoi mo QR.
      this.detach();
      await this.setState('kicked');
      await store.alert(this.account, 'kicked', { code });
      return;
    }
    await this.reconnect();
  }

  /** 1006 / loi mang: dang nhap lai bang cookie, lui 5 s → 5 phut; qua 10 lan ⇒ dead. */
  async reconnect(): Promise<void> {
    if (this.reconnecting || this.stopping) return;
    this.reconnecting = true;
    try {
      const secret = this.currentSecret() ?? (await this.loadSecret());
      this.detach();
      await this.setState('reconnecting');
      if (!secret) {
        await this.setState('logged_out');
        await store.alert(this.account, 'cookie_expired', { reason: 'no_session' });
        return;
      }
      for (let attempt = 1; ; attempt++) {
        if (isAttemptExhausted(attempt)) {
          await this.setState('dead');
          await store.alert(this.account, 'dead', { attempts: attempt - 1 });
          return;
        }
        const delay = reconnectDelayMs(attempt);
        this.reconnectDelays.push(delay);
        await this.sleep(delay);
        if (this.stopping) return;
        try {
          const s = await this.client.loginWithCookie(secret);
          await this.attach(s);
          return;
        } catch (err) {
          if (err instanceof ZaloAuthError) {
            await this.setState('logged_out');
            await store.alert(this.account, 'cookie_expired', { error: errSummary(err) });
            return;
          }
          logEvent('zalo.reconnect_failed', { account: this.account, attempt, error: errSummary(err) });
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private currentSecret(): SessionSecret | null {
    if (!this.session) return null;
    try {
      return this.session.exportCredentials();
    } catch {
      return null;
    }
  }

  private async loadSecret(): Promise<SessionSecret | null> {
    const row = await store.loadAccount(this.account);
    if (!row?.session_enc) return null;
    try {
      return decryptSession(row.session_enc, this.key, this.account);
    } catch {
      return null;
    }
  }

  /** Watchdog §6: 20 phut khong co su kien trong gio 7–22h ⇒ API doc nhe; loi ⇒ nhu 1006. */
  async watchdogTick(): Promise<'skipped' | 'probe_ok' | 'probe_failed'> {
    if (this.state !== 'connected' || !this.session) return 'skipped';
    if (!shouldProbeIdle(new Date(this.now()), this.lastEventAt)) return 'skipped';
    try {
      await this.session.probeRead();
      this.lastEventAt = this.now();
      return 'probe_ok';
    } catch (err) {
      logEvent('zalo.probe_failed', { account: this.account, error: errSummary(err) });
      await this.onClosed(CLOSE_ABNORMAL);
      return 'probe_failed';
    }
  }

  /** Quet yeu cau dang nhap QR tu web (moi 2 s, §9.2). */
  async pollLoginRequest(): Promise<boolean> {
    if (!(await store.claimLoginRequest(this.account))) return false;
    await this.loginQr();
    return true;
  }

  /** Quet yeu cau dang xuat tu web (moi 2 s, cung nhip voi login — §9.8). */
  async pollLogoutRequest(): Promise<boolean> {
    if (!(await store.claimLogoutRequest(this.account))) return false;
    await this.logout();
    return true;
  }

  /** Dang xuat (§9.8): dung listener + pacer (getSession() tra null khi
   * khong 'connected' ⇒ pacer tu ngung), xoa session_enc + qr_*, logged_out.
   * zca-js khong co API dang xuat that su (G18) — day chi la xoa phien phia minh. */
  async logout(): Promise<void> {
    this.detach();
    this.state = 'logged_out';
    await store.clearSessionOnLogout(this.account);
    logEvent('zalo.state', { account: this.account, state: 'logged_out' });
  }

  /** Dang nhap QR: chi luu credentials SAU khi goi thu mot API doc thanh cong (§2.3). */
  async loginQr(): Promise<void> {
    this.detach();
    this.state = 'qr_pending';
    logEvent('zalo.qr_start', { account: this.account });
    let s: ZaloSessionLike;
    try {
      s = await this.client.loginQR(async (e) => {
        if (e.type === 'qr') await store.setQr(this.account, e.imageDataUrl);
        else await store.setQrState(this.account, e.type);
        logEvent('zalo.qr_event', { account: this.account, type: e.type });
      });
    } catch (err) {
      await store.clearQrImage(this.account);
      await this.setState('logged_out');
      await store.alert(this.account, 'qr_failed', { error: errSummary(err) });
      return;
    }
    try {
      await s.probeRead();
    } catch (err) {
      await store.clearQrImage(this.account);
      await this.setState('logged_out');
      await store.alert(this.account, 'qr_probe_failed', { error: errSummary(err) });
      return;
    }
    const secret = s.exportCredentials();
    const saved = await this.saveSecret(secret);
    await store.clearQr(this.account);
    if (!saved) {
      await this.setState('logged_out');
      return;
    }
    await this.attach(s);
  }

  /** Ghi session_enc bang compare-and-set theo updated_at (§2.4). */
  private async saveSecret(secret: SessionSecret): Promise<boolean> {
    const row = await store.loadAccount(this.account);
    if (!row) return false;
    const enc = encryptSession(secret, this.key, this.account);
    const ok = await store.saveSessionCas(this.account, enc, row.updated_at);
    if (!ok) {
      await store.alert(this.account, 'session_cas_conflict');
      return false;
    }
    this.lastSavedCookieJson = JSON.stringify(secret.cookie);
    return true;
  }

  /** zca-js lam moi cookie trong jar ⇒ ghi lai session_enc khi cookie doi (§2.4). */
  async syncCookies(): Promise<'unchanged' | 'saved' | 'conflict' | 'skipped'> {
    if (this.state !== 'connected' || !this.session) return 'skipped';
    const secret = this.session.exportCredentials();
    const json = JSON.stringify(secret.cookie);
    if (json === this.lastSavedCookieJson) return 'unchanged';
    return (await this.saveSecret(secret)) ? 'saved' : 'conflict';
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.detach();
    await this.idle();
  }
}
