// packages/core/src/dbtests/p02-link-zalo.db.test.ts — SPEC-P02 §9.4:
// dev:link-zalo gan dung uid MOI NHAT chua co danh tinh; DATA_MODE≠sim ⇒ exit 1.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { simInbound } from '../sim/sim-transport.js';
import { linkZalo, LinkZaloError } from '../dev/link-zalo.js';
import { runSeedSim } from '../db/seed-sim.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'dev', 'link-zalo.ts');
const prevMode = process.env.DATA_MODE;
const created: string[] = [];

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runSeedSim(); // idempotent — dam bao co sim-res-1
});

afterAll(async () => {
  if (created.length > 0) {
    await sql(`delete from zalo_identities where zalo_account_id = 'bql' and zalo_uid = any($1)`, [created]);
  }
  process.env.DATA_MODE = prevMode;
  await closeDb();
});

async function residentOf(simUid: string): Promise<string> {
  const r = await sql<{ party_id: string }>(
    `select party_id from zalo_identities where zalo_account_id = 'bql' and zalo_uid = $1`,
    [simUid]
  );
  return r[0]!.party_id;
}

describe('dev:link-zalo', () => {
  it('bo --uid ⇒ gan uid cua tin MOI NHAT chua co danh tinh (bo qua uid da co danh tinh)', async () => {
    const older = `real-old-${randomUUID().slice(0, 8)}`;
    const newest = `real-new-${randomUUID().slice(0, 8)}`;
    await simInbound({ account: 'bql', threadId: older, threadType: 'user', senderUid: older, text: 'a' });
    await simInbound({ account: 'bql', threadId: newest, threadType: 'user', senderUid: newest, text: 'b' });
    // Tin moi hon nua nhung tu nguoi DA co danh tinh ⇒ khong duoc chon.
    await simInbound({ account: 'bql', threadId: 'sim-res-2', threadType: 'user', senderUid: 'sim-res-2', text: 'c' });
    await sql(`update inbound_events set processed_at = now() where thread_id = any($1)`, [[older, newest, 'sim-res-2']]);

    const r = await linkZalo({ account: 'bql', resident: 'sim-res-1' });
    created.push(r.uid);
    expect(r.uid).toBe(newest);
    expect(r.created).toBe(true);
    expect(r.residentId).toBe(await residentOf('sim-res-1'));
    const zi = await sql<{ party_type: string; party_id: string }>(
      `select party_type, party_id from zalo_identities where zalo_account_id='bql' and zalo_uid=$1`,
      [newest]
    );
    expect(zi[0]).toEqual({ party_type: 'resident', party_id: r.residentId });
    // Chay lai: idempotent
    expect((await linkZalo({ account: 'bql', resident: 'sim-res-1', uid: newest })).created).toBe(false);
  });

  it('--uid tuong minh; uid da gan nguoi khac ⇒ loi, khong ghi de', async () => {
    const explicit = `real-x-${randomUUID().slice(0, 8)}`;
    const r = await linkZalo({ account: 'bql', resident: 'sim-res-3', uid: explicit });
    created.push(explicit);
    expect(r.uid).toBe(explicit);
    await expect(linkZalo({ account: 'bql', resident: 'sim-res-1', uid: explicit })).rejects.toBeInstanceOf(LinkZaloError);
  });

  it('cu dan mo phong khong ton tai ⇒ loi', async () => {
    await expect(linkZalo({ account: 'bql', resident: 'sim-res-404', uid: 'x' })).rejects.toBeInstanceOf(LinkZaloError);
  });

  it('DATA_MODE≠sim ⇒ ham tu choi; lenh CLI exit 1', async () => {
    process.env.DATA_MODE = 'real';
    await expect(linkZalo({ account: 'bql', resident: 'sim-res-1', uid: 'y' })).rejects.toBeInstanceOf(LinkZaloError);
    process.env.DATA_MODE = 'sim';
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATA_MODE;
    const res = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--account', 'bql', '--resident', 'sim-res-1'], {
      env,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('DATA_MODE=sim');
    const res2 = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--account', 'bql', '--resident', 'sim-res-1'], {
      env: { ...env, DATA_MODE: 'real' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(res2.status).toBe(1);
  }, 120_000);
});
