// transport.ts — createTransport theo env TRANSPORT (01-CONTRACTS §2.3).
import { afterEach, describe, expect, it } from 'vitest';
import { createTransport } from './transport.js';

const prev = process.env.TRANSPORT;
afterEach(() => {
  if (prev === undefined) delete process.env.TRANSPORT;
  else process.env.TRANSPORT = prev;
});

describe('createTransport', () => {
  it('mac dinh (khong dat TRANSPORT) => sim, co enqueue/status/onInbound', () => {
    delete process.env.TRANSPORT;
    const t = createTransport();
    expect(typeof t.enqueue).toBe('function');
    expect(typeof t.status).toBe('function');
    expect(typeof t.onInbound).toBe('function');
  });
  it('TRANSPORT=zalo => KHONG nem loi (worker la tien trinh rieng)', () => {
    process.env.TRANSPORT = 'zalo';
    expect(() => createTransport()).not.toThrow();
  });
  it('TRANSPORT la => nem loi', () => {
    process.env.TRANSPORT = 'telegram';
    expect(() => createTransport()).toThrow(/khong hop le/);
  });
});
