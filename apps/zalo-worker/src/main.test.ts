// SPEC-P02 §9.3: thieu/sai ZALO_SESSION_KEY ⇒ worker tu choi khoi dong (exit 1),
// khong in gia tri khoa.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.join(here, 'main.ts');

function runMain(env: Record<string, string | undefined>) {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  delete clean.ZALO_SESSION_KEY;
  delete clean.DATABASE_URL;
  return spawnSync(process.execPath, ['--import', 'tsx', MAIN], {
    env: { ...clean, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
}

describe('zalo-worker main — khoa phien', { timeout: 60_000 }, () => {
  it('thieu ZALO_SESSION_KEY ⇒ exit 1', () => {
    const r = runMain({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ZALO_SESSION_KEY');
  });
  it('khoa sai do dai ⇒ exit 1, khong in lai gia tri', () => {
    const bad = 'c2hvcnQta2V5LW9ubHktMjAtYnl0ZXM=';
    const r = runMain({ ZALO_SESSION_KEY: bad });
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).not.toContain(bad);
  });
  it('khoa dung nhung ZALO_ACCOUNTS khac community ⇒ exit 1', () => {
    const r = runMain({ ZALO_SESSION_KEY: 'ab'.repeat(32), ZALO_ACCOUNTS: 'other' });
    expect(r.status).toBe(1);
  });
});
