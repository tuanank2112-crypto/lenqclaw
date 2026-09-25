// packages/core/src/dbtests/p01.db.test.ts — toan bo test can Postgres cua
// P01 (SPEC-P01-Foundation.md §9), gop MOT file de dam bao thu tu chay
// (migrate -> seed -> job-state -> sim-transport): vitest KHONG dam bao thu
// tu giua CAC FILE khac nhau, nhung dam bao thu tu tuan tu cac `describe`/
// `it` TRONG CUNG mot file.

import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql, tx } from '../adapters/db.js';
import { ConflictError } from '../domain/errors.js';
import { MigrationChecksumError, runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { transitionJob } from '../services/job-state.js';
import { echoHandler, processInbound, runScenario, simInbound } from '../sim/sim-transport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'db', 'migrations');
const SCENARIO_PATH = path.join(REPO_ROOT, 'evals', 'scenarios', 'echo.jsonl');

const EXPECTED_TABLES = [
  'organizations',
  'buildings',
  'apartments',
  'residents',
  'job_categories',
  'vendors',
  'vendor_slots',
  'staff_users',
  'zalo_accounts',
  'zalo_identities',
  'inbound_events',
  'outbox',
  'conversations',
  'messages',
  'agent_runs',
  'jobs',
  'job_offers',
  'job_events',
  'tickets',
  'kb_documents',
  'kb_sections',
  'audit_log',
  'schema_migrations',
];

describe('1) runMigrations — DB rong -> schema day du (SPEC-P01 §9)', () => {
  beforeAll(async () => {
    await sql('drop schema public cascade');
    await sql('create schema public');
  });

  it('lan dau: applied=3 (001_init.sql + 002_search.sql + 003_kb_building.sql), moi bang ton tai', async () => {
    const result = await runMigrations();
    expect(result.applied).toBe(3);

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

describe('2) runSeed — idempotent (SPEC-P01 §9)', () => {
  it('seed lan 1: job_categories=12, apartments=20', async () => {
    const result = await runSeed();
    expect(result.jobCategories).toBe(12);
    expect(result.apartments).toBe(20);
  });

  it('seed lan 2: so dong khong doi', async () => {
    const result = await runSeed();
    expect(result.jobCategories).toBe(12);
    expect(result.apartments).toBe(20);
  });
});

describe('3) transitionJob tren DB that (SPEC-P01 §9, mam BB-05)', () => {
  let buildingId: string;
  let apartmentId: string;
  let residentId: string;

  async function createJob(status: string): Promise<string> {
    const code = `T-${randomUUID().slice(0, 8)}`;
    const draft = {
      category_code: null,
      symptoms: [],
      location_in_unit: '',
      urgency: 'normal',
      photo_ids: [],
      questions_asked: 0,
      confidence_note: '',
    };
    const rows = await sql<{ id: string }>(
      `insert into jobs (code, building_id, apartment_id, resident_id, draft, status)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [code, buildingId, apartmentId, residentId, JSON.stringify(draft), status]
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    const buildings = await sql<{ id: string }>(`select id from buildings where code = 'TOA-A' limit 1`);
    buildingId = buildings[0]!.id;
    const apartments = await sql<{ id: string }>(
      `select id from apartments where building_id = $1 limit 1`,
      [buildingId]
    );
    apartmentId = apartments[0]!.id;
    const residents = await sql<{ id: string }>(
      `insert into residents (full_name, status) values ('Test Resident', 'active') returning id`
    );
    residentId = residents[0]!.id;
  });

  it('sai from => ConflictError, khong them job_events', async () => {
    const jobId = await createJob('drafting');
    await expect(
      tx((q) => transitionJob(q, { jobId, from: 'published', to: 'held', actorType: 'system', actorId: null }))
    ).rejects.toBeInstanceOf(ConflictError);

    const events = await sql<{ c: number }>(`select count(*)::int as c from job_events where job_id = $1`, [jobId]);
    expect(events[0]!.c).toBe(0);
  });

  it('dung from => chuyen status, dung 1 job_events', async () => {
    const jobId = await createJob('drafting');
    await tx((q) => transitionJob(q, { jobId, from: 'drafting', to: 'awaiting_consent', actorType: 'agent', actorId: null }));

    const events = await sql<{ c: number }>(`select count(*)::int as c from job_events where job_id = $1`, [jobId]);
    expect(events[0]!.c).toBe(1);

    const jobs = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(jobs[0]!.status).toBe('awaiting_consent');
  });

  it('20 transitionJob dong thoi cung from => dung 1 thanh cong (mam BB-05)', async () => {
    const jobId = await createJob('published');

    const attempts = Array.from({ length: 20 }, (_, i) =>
      tx((q) =>
        transitionJob(q, { jobId, from: 'published', to: 'held', actorType: 'vendor', actorId: `vendor-${i}` })
      )
        .then(() => ({ ok: true as const }))
        .catch((err: unknown) => ({ ok: false as const, err }))
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r): r is { ok: false; err: unknown } => !r.ok);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(19);
    for (const f of failures) {
      expect(f.err).toBeInstanceOf(ConflictError);
    }
  });
});

describe('4) runScenario(echo.jsonl) — SimTransport (SPEC-P01 §9)', () => {
  it('duplicates=1, outbound=inbound, moi outbox sent', async () => {
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

describe('5) processInbound — nhan truoc xu ly sau, khong ket chet (R02-tham-dinh D5, SPEC-P03 §10.1)', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('12 processInbound dong thoi xong < 5s, moi tin dung 1 outbox', async () => {
    const threadId = `sim-concurrency-${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 12; i++) {
      await simInbound({
        account: 'bql',
        threadId,
        threadType: 'user',
        senderUid: `resident-concurrency-${i}`,
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
