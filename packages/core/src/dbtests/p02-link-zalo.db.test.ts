// packages/core/src/dbtests/p02-link-zalo.db.test.ts — dev:link-zalo --owner gan
// dung uid MOI NHAT chua duoc nhan dien; DATA_MODE≠sim => exit 1.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { simInbound } from '../sim/sim-transport.js';
import { linkZalo, LinkZaloError } from '../dev/link-zalo.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'dev', 'link-zalo.ts');
const prevMode = process.env.DATA_MODE;
const created: string[] = [];

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runSeed();
  await runSeedSim(); // idempotent — dam bao co thanh vien sim-mem-*
});

afterAll(async () => {
  if (created.length > 0) {
    await sql(`delete from account_owners where zalo_account_id = 'community' and zalo_uid = any($1)`, [created]);
  }
  process.env.DATA_MODE = prevMode;
  await closeDb();
});

describe('dev:link-zalo --owner', () => {
  it('bo --uid => gan uid cua tin DM MOI NHAT chua duoc nhan dien (bo qua thanh vien nhom)', async () => {
    const older = `real-old-${randomUUID().slice(0, 8)}`;
    const newest = `real-new-${randomUUID().slice(0, 8)}`;
    await simInbound({ account: 'community', threadId: older, threadType: 'user', senderUid: older, text: 'a' });
    await simInbound({ account: 'community', threadId: newest, threadType: 'user', senderUid: newest, text: 'b' });
    // Tin moi hon nua nhung tu thanh vien nhom da biet => khong duoc chon.
    await simInbound({ account: 'community', threadId: 'sim-mem-2', threadType: 'user', senderUid: 'sim-mem-2', text: 'c' });
    await sql(`update inbound_events set processed_at = now() where thread_id = any($1)`, [[older, newest, 'sim-mem-2']]);

    const r = await linkZalo({ owner: true });
    created.push(r.uid);
    expect(r.uid).toBe(newest);
    expect(r.created).toBe(true);
    const ao = await sql<{ label: string }>(
      `select label from account_owners where zalo_account_id = 'community' and zalo_uid = $1`,
      [newest]
    );
    expect(ao[0]).toEqual({ label: 'dev' });
    // Chay lai: idempotent
    expect((await linkZalo({ owner: true, uid: newest })).created).toBe(false);
  });

  it('--uid tuong minh', async () => {
    const explicit = `real-x-${randomUUID().slice(0, 8)}`;
    const r = await linkZalo({ owner: true, uid: explicit });
    created.push(explicit);
    expect(r.uid).toBe(explicit);
    expect(r.created).toBe(true);
  });

  it('thieu --owner => loi', async () => {
    await expect(linkZalo({ owner: false, uid: 'x' })).rejects.toBeInstanceOf(LinkZaloError);
  });

  it('DATA_MODE≠sim => ham tu choi; lenh CLI exit 1', async () => {
    process.env.DATA_MODE = 'real';
    await expect(linkZalo({ owner: true, uid: 'y' })).rejects.toBeInstanceOf(LinkZaloError);
    process.env.DATA_MODE = 'sim';
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATA_MODE;
    const res = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--owner'], {
      env,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('DATA_MODE=sim');
    const res2 = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--owner'], {
      env: { ...env, DATA_MODE: 'real' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(res2.status).toBe(1);
  }, 120_000);
});
