// packages/core/src/dbtests/p01.db.test.ts — toan bo test can Postgres cua P01
// (SPEC-P01 §3, §10 hang 4), gop MOT file de dam bao thu tu chay
// (migrate -> seed -> audit/enqueue -> sim-transport): vitest KHONG dam bao thu
// tu giua CAC FILE khac nhau, nhung dam bao thu tu tuan tu cac `describe`/
// `it` TRONG CUNG mot file.
//
// TEST_DB_RESET=1: drop schema public + migrate tu DB rong, `applied` PHAI bang
// so file db/migrations/*.sql (khong ghi cung — hien 9). Mac dinh (khong dat):
// dung DB hien co da migrate, kiem `schema_migrations` du so file.

import { randomUUID, createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { MigrationChecksumError, runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { audit } from '../services/audit.js';
import { echoHandler, processInbound, runScenario, simInbound } from '../sim/sim-transport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'db', 'migrations');
const SCENARIO_PATH = path.join(REPO_ROOT, 'evals', 'scenarios', 'echo.jsonl');
const RESET = process.env.TEST_DB_RESET === '1';

const EXPECTED_TABLES = [
  'staff_users',
  'zalo_accounts',
  'inbound_events',
  'outbox',
  'conversations',
  'messages',
  'agent_runs',
  'kb_documents',
  'kb_sections',
  'audit_log',
  'schema_migrations',
  // 008
  'account_owners',
  'zalo_groups',
  'group_members',
  'group_messages',
  'group_sessions',
  'persona_docs',
  'skill_docs',
  'member_profiles',
  'daily_notes',
  'leads',
  'moderation_events',
  'moderation_scores',
  'approvals',
  'join_requests',
  'automations',
  'automation_runs',
  // 009
  'tenants',
  'turn_traces',
];

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

describe('1) runMigrations — schema day du tren 001..009 (SPEC-P01 §3)', () => {
  beforeAll(async () => {
    if (RESET) {
      await sql('drop schema public cascade');
      await sql('create schema public');
    }
  });

  it('lan dau: applied = so file db/migrations/*.sql (reset) hoac schema da du; moi bang ton tai', async () => {
    const result = await runMigrations();
    const files = await migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    console.log(`applied: ${result.applied} (files: ${files.length}, reset: ${RESET})`);
    if (RESET) expect(result.applied).toBe(files.length);

    const done = await sql<{ version: string }>(`select version from schema_migrations order by version`);
    expect(done.map((r) => r.version)).toEqual(files);

    const rows = await sql<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const t of EXPECTED_TABLES) {
      expect(names.has(t), `thieu bang ${t}`).toBe(true);
    }
  });

  it('chay lan 2: applied=0', async () => {
    const result = await runMigrations();
    expect(result.applied).toBe(0);
  });

  it('checksum file da ap dung bi doi => MigrationChecksumError', async () => {
    await sql(`update schema_migrations set checksum = 'checksum-gia-mao' where version = '001_init.sql'`);
    await expect(runMigrations()).rejects.toBeInstanceOf(MigrationChecksumError);

    // Phuc hoi checksum dung de cac describe sau khong bi chan boi loi nay.
    const content = await readFile(path.join(MIGRATIONS_DIR, '001_init.sql'), 'utf8');
    const checksum = createHash('sha256').update(content, 'utf8').digest('hex');
    await sql(`update schema_migrations set checksum = $1 where version = '001_init.sql'`, [checksum]);
  });
});

describe('2) runSeed — idempotent, nen cong dong (SPEC-P01 §4.1)', () => {
  it('seed lan 1: 4 persona, 2 skill, dung 1 tai khoan community (tenant default)', async () => {
    const result = await runSeed();
    expect(result.personaDocs).toBe(4);
    expect(result.skills).toBe(2);

    const accounts = await sql<{ id: string; tenant_id: string }>(`select id, tenant_id from zalo_accounts`);
    expect(accounts).toEqual([{ id: 'community', tenant_id: 'default' }]);

    const active = await sql<{ kind: string; version: number }>(
      `select kind, version from persona_docs where zalo_account_id = 'community' and is_active order by kind`
    );
    expect(active.map((r) => r.kind)).toEqual(['capabilities', 'identity', 'rules', 'soul']);
    expect(active.every((r) => r.version === 1)).toBe(true);

    const identity = await sql<{ body: string }>(
      `select body from persona_docs where zalo_account_id = 'community' and kind = 'identity' and is_active`
    );
    expect(identity[0]!.body).toContain('Tên: Claw');
    expect(identity[0]!.body).toContain('Gọi tên: claw ơi; bé claw; @claw');
  });

  it('seed lan 2: so dong khong doi', async () => {
    const result = await runSeed();
    expect(result.personaDocs).toBe(4);
    expect(result.skills).toBe(2);
    const accounts = await sql<{ c: number }>(`select count(*)::int as c from zalo_accounts`);
    expect(accounts[0]!.c).toBe(1);
  });
});

describe('3) audit() va enqueue() tren DB that (SPEC-P01 §3)', () => {
  it('audit() ghi duoc mot dong audit_log', async () => {
    const marker = `p01-${randomUUID().slice(0, 8)}`;
    await audit(sql, { actorType: 'test', actorId: null, action: 'p01.audit_probe', target: marker, data: { ok: true } });
    const rows = await sql<{ c: number }>(`select count(*)::int as c from audit_log where target = $1`, [marker]);
    expect(rows[0]!.c).toBe(1);
  });

  it('enqueue() ghi outbox kind action', async () => {
    const threadId = `sim-action-${randomUUID().slice(0, 8)}`;
    const id = await enqueue({
      zaloAccountId: 'community',
      threadId,
      threadType: 'group',
      kind: 'action',
      body: { action: 'sync_group_info' },
    });
    const rows = await sql<{ kind: string; status: string; body: { action: string } }>(
      `select kind, status, body from outbox where id = $1`,
      [id]
    );
    expect(rows[0]!.kind).toBe('action');
    expect(rows[0]!.status).toBe('queued');
    expect(rows[0]!.body.action).toBe('sync_group_info');
    // Don dep: de dong `queued` lai se bi `simDeliver` (ca 4) tinh nham la tin da giao.
    await sql(`update outbox set status = 'cancelled' where id = $1`, [id]);
  });
});

describe('4) runScenario(echo.jsonl) — SimTransport (SPEC-P01 §3)', () => {
  it('duplicates=1, outbound=inbound, moi outbox sent', async () => {
    // Tu co lap du lieu (G29): hang doi inbound_events la toan cuc, msg_id kich ban
    // (echo-*) con sot tu lan chay truoc se bi tinh la trung => don truoc khi chay.
    await sql(`update inbound_events set processed_at = now() where processed_at is null`);
    await sql(`update outbox set status = 'cancelled' where status = 'queued'`);
    await sql(`delete from inbound_events where zalo_account_id = 'community' and zalo_msg_id like 'echo-%'`);
    const result = await runScenario(SCENARIO_PATH);

    expect(result.duplicates).toBe(1);
    expect(result.outbound).toBe(result.inbound);
    expect(result.inbound).toBeGreaterThanOrEqual(5);

    const notSent = await sql<{ c: number }>(
      `select count(*)::int as c from outbox where zalo_msg_id like 'sim-out-%' and status != 'sent'`
    );
    expect(notSent[0]!.c).toBe(0);
  });
});

describe('5) processInbound — nhan truoc xu ly sau, khong ket chet', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('12 processInbound dong thoi xong < 5s, moi tin dung 1 outbox', async () => {
    const threadId = `sim-concurrency-${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 12; i++) {
      await simInbound({
        account: 'community',
        threadId,
        threadType: 'user',
        senderUid: `sim-concurrency-${i}`,
        text: `tin thu ${i}`,
        msgId: `concurrency-${threadId}-${i}`,
      });
    }

    const before = await sql<{ c: number }>(`select count(*)::int as c from outbox where thread_id = $1`, [threadId]);

    const startedAt = Date.now();
    const results = await Promise.all(Array.from({ length: 12 }, () => processInbound(echoHandler)));
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(5000);
    expect(results.filter((r) => r.processed === 1).length).toBe(12);

    const after = await sql<{ c: number }>(`select count(*)::int as c from outbox where thread_id = $1`, [threadId]);
    expect(after[0]!.c - before[0]!.c).toBe(12);
  });
});
