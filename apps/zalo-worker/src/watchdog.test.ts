// SPEC-P02 §6: bang tin hieu → hanh vi.
import { describe, expect, it } from 'vitest';
import {
  decideOnClose,
  hourInTz,
  isAttemptExhausted,
  reconnectDelayMs,
  shouldProbeIdle,
  IDLE_PROBE_MS,
} from './watchdog.js';

describe('watchdog', () => {
  it('3000/3003 ⇒ kicked (ke ca khi dang dung); 1006 ⇒ reconnect; 1000 do minh dong ⇒ ignore', () => {
    expect(decideOnClose(3000, false).kind).toBe('kicked');
    expect(decideOnClose(3003, false).kind).toBe('kicked');
    expect(decideOnClose(3003, true).kind).toBe('kicked');
    expect(decideOnClose(1006, false).kind).toBe('reconnect');
    expect(decideOnClose(4000, false).kind).toBe('reconnect');
    expect(decideOnClose(1000, true).kind).toBe('ignore');
  });
  it('lui 5 s → 5 phut, qua 10 lan ⇒ het', () => {
    const d = Array.from({ length: 10 }, (_, i) => reconnectDelayMs(i + 1));
    expect(d).toEqual([5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000, 300000, 300000]);
    expect(isAttemptExhausted(10)).toBe(false);
    expect(isAttemptExhausted(11)).toBe(true);
  });
  it('probe khi im 20 phut, chi trong 7–22h gio Viet Nam', () => {
    // 2026-09-25T03:00Z = 10h ICT; 2026-09-25T16:00Z = 23h ICT
    const day = new Date('2026-09-25T03:00:00Z');
    const night = new Date('2026-09-25T16:00:00Z');
    expect(hourInTz(day)).toBe(10);
    expect(hourInTz(night)).toBe(23);
    expect(shouldProbeIdle(day, day.getTime() - IDLE_PROBE_MS)).toBe(true);
    expect(shouldProbeIdle(day, day.getTime() - IDLE_PROBE_MS + 1)).toBe(false);
    expect(shouldProbeIdle(night, night.getTime() - 2 * IDLE_PROBE_MS)).toBe(false);
  });
});
