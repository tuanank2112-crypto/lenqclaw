# 01 — CONTRACTS · Agent chăm sóc cộng đồng Zalo

> Đọc sau `00-ARCHITECTURE.md`. Mọi type/DDL/tool/API phải khớp file này. Đổi hợp đồng ⇒ sửa file này trước, ghi D mới vào `plan.md` §2.
> Mọi chữ ký zca-js dưới đây chép từ `node_modules/zca-js/dist/**/*.d.ts` bản **2.2.0** đã cài (đối chiếu 2026-10-09), không phải tài liệu ngoài.

## §1. Layout repo sau P01

```text
apps/web/                         Next.js 15 — dashboard (SPEC-P08) + /zalo + /dev/sim (nhóm)
apps/zalo-worker/                 Node 22 — zca-js 2.2.0, MỘT tài khoản `community`; KHÔNG logic nghiệp vụ
packages/core/src/
  adapters/db.ts                  giữ nguyên (sql, tx, closeDb)
  adapters/model.ts               callModel (route 'community' | 'triage'), callTriageModel (giữ), + embedTexts (§2.2)
  adapters/transport.ts           Transport, enqueue (hàm DUY NHẤT ghi outbox), OutboxInsert mở rộng (§8; D31: + inboundEventId)
  adapters/alert.ts               (D32) sendAlert — hàm DUY NHẤT gọi Telegram Bot API (§2.4, BB-20)
  agent/community/
    router.ts                     routeInboundEvent(e) = runPipeline(e) — giữ TÊN cho runner/processInbound (D28)
    graph/                        (D28 — §12) đồ thị LangGraph
      state.ts                    PipelineState, TurnState (Annotation.Root), TurnRequest, TurnResult, Delivery, StopKind
      edges.ts                    MỌI cạnh điều kiện + decideDelivery/hostText — THUẦN (BB-16)
      shape.ts                    PIPELINE_SHAPE, TURN_SHAPE (hằng = §12.4; graph-shape.test so với getGraph())
      pipeline.ts                 buildPipelineGraph(), pipelineGraph (compile 1 lần), runPipeline(e)
      turn.ts                     buildTurnGraph(), turnGraph, runTurn(req), TURN_RECURSION_LIMIT
      nodes/{ingest,triage,moderate,gate,defer,group-event,system-event,dm-intake,prepare,agent,tools,nudge,deliver,trace}.ts
    gate.ts                       decideGroupInbound (THUẦN, §6.2)
    roles.ts                      resolveRole (§3)
    buffer.ts                     group_messages: insert + prune + đọc đệm + đánh dấu answered
    sessions.ts                   group_sessions / conversations / messages (DM)
    persona.ts                    loadPersonaBundle, buildSystemPrompt (§11)
    policy.ts                     TOOL_POLICY (§7.1) + assertToolAllowed
    (turn.ts — `runCommunityTurn` vòng tool tự viết: KHÔNG tạo, thay bởi D28 ⇒ graph/turn.ts)
    triage.ts                     triageCommunityMessage (§5) — route 'triage'
    prompts/{system,triage}.ts    hằng TS (không .md — lý do R03 kế hoạch 01)
    tools/<ten_tool>.ts           mỗi tool một file `{ definition, answers?, run(ctx, input) }` + tools/index.ts
    tools/tool-kit.ts             GIỮ (AgentTool, ToolDefinition, assertValidToolInput) + cờ `answers?: true` (D28, §12.2)
  services/
    community-config.ts           readCommunityConfig(env) (§10)
    moderation.ts · moderation-ladder.ts (THUẦN) · approvals.ts · join-requests.ts · welcome.ts
    leads.ts · memory.ts · knowledge.ts · automations.ts (+ schedule.ts THUẦN) · reports.ts
    outbox-actions.ts             enqueueAction(...) — dựng body action hợp lệ (§8.3) rồi enqueue()
    timers.ts                     runTimers(now, cfg) MỚI (SPEC-P07 §2)
    system-events.ts              enqueueSystemEvent(args) mở rộng (§8.5)
    audit.ts · vn-time.ts         giữ
  retrieval/search-knowledge.ts   truy hồi lai kb_sections (SPEC-P04 §2); search-memory.ts (SPEC-P06 §4)
  sim/sim-transport.ts            giữ; + sim/sim-actions.ts (thi hành action trên DB giả lập — SPEC-P02 §7)
  runner/inbound-runner.ts        giữ (gọi routeInboundEvent mới + runTimers mới); runTimers KHÔNG nằm trong đồ thị (D28); D31: dispatcher song song theo thread + advisory lock + heartbeat (SPEC-D31 §6, §9)
  services/ops-watch.ts           (D32) checkOps(now, self) — SQL thuần, 0 model; gọi sendAlert (SPEC-D31 §10.2)
  db/migrate.ts · seed.ts · seed-sim.ts   seed viết lại (SPEC-P01 §4)
  domain/{types,errors,password}.ts
db/migrations/007_drop_marketplace.sql · 008_community.sql · 009_tenant_trace.sql · 010_ops_latency.sql   (§4, append-only; 009 = D23/D24; 010 = D31/D32)
apps/web/app/api/healthz/route.ts   (D32) GET không đăng nhập — SPEC-D31 §9
scripts/latency_slo.mjs            (D31) đo SLO local bằng sim + model thật — TESTING G23
scripts/check_adapter_boundary.mjs (giữ) · check_agent_tools.mjs (viết lại, SPEC-P01 §6) · gate.mjs (giữ)
scripts/eval_community.mjs + scripts/eval/community/*.mjs    (TESTING §3)
evals/golden/community/{activation,moderation,lead_intent,unanswered}.jsonl · evals/scenarios/*.jsonl
THIRD_PARTY_NOTICES.md             chỉ khi có chép đoạn mã MIT (SPEC-P01 §7)
```

## §2. Adapter

### §2.1 `adapters/model.ts` — giữ chữ ký, đổi route
```ts
export type ModelRoute = 'community' | 'triage';            // bỏ diagnose/responsibility/acceptance/vendor_parse/compose
export interface ModelCall { route: ModelRoute; system: string; messages: MessageParam[]; tools?: Tool[]; images?: ImageRef[]; conversationId?: string | null;
  turnId?: string; }   // D24: adapter ghi agent_runs.turn_id; thiếu ⇒ NULL (triage, embed)
export function callModel(c: ModelCall): Promise<CallModelResult>;            // KHÔNG đổi (dạng Anthropic, dịch Gemini/OpenRouter/Vyce như §2b–§2d kế hoạch 01)
export function callTriageModel(c: TriageModelCall): Promise<CallModelResult>; // KHÔNG đổi (không retry, không fallback, MODEL_TRIAGE)
```
D28: adapter này GIỮ — đồ thị KHÔNG thay nó. Node `agent` (§12.3) gọi `callModel({route:'community', …, turnId})`, node `triage` gọi `triageCommunityMessage` ⇒ `callTriageModel`; không node nào khác gọi model sinh; CẤM ChatModel của LangChain (00-ARCH §7). `messages` của state đồ thị là đúng `MessageParam[]` ở trên. Lưu ý mã hiện tại (đo `packages/core/src/adapters/model.ts:44-52`, HEAD `e53133d`): `ModelCall` CHƯA có `turnId` ⇒ P03 thêm (D24).
`ROUTE_ENV = { community: 'MODEL_COMMUNITY', triage: 'MODEL_TRIAGE' }`; (D31) route `community` + `tier:'fast'` ⇒ `MODEL_COMMUNITY_FAST`. Mọi hành vi §2b/§2c/§2d của kế hoạch 01 (thoughtSignature, fallback phía client, ~~`max_tokens` 16000~~ ⇒ D31: `MODEL_MAX_OUTPUT_TOKENS` 1024 cho route `community`, `data_collection: deny`, Vyce chỉ `DATA_MODE=sim`) GIỮ NGUYÊN — test adapter hiện có (`model.*.test.ts`) phải tiếp tục xanh (đổi tên route trong test).

**D31 — hạn chót & timeout (BB-18, SPEC-D31 §5.3):**
```ts
export interface ModelCall { /* …như trên… */ tier?: 'fast' | 'default'; deadlineAt?: number /* epoch ms */ }
export class ModelDeadlineError extends ModelUnavailableError {}   // code = 'ModelDeadlineError'
export interface TriageModelCall { /* …giữ… */ timeoutMs: number }  // callTriageModel huỷ fetch bằng AbortSignal (thay Promise.race ở triage.ts)
```
Mỗi lần thử: `timeoutMs = min(MODEL_CALL_TIMEOUT_MS, deadlineAt − now)` qua `AbortSignal.timeout`; `deadlineAt − now < MODEL_MIN_ATTEMPT_MS` ⇒ ném `ModelDeadlineError` KHÔNG gọi mạng; lùi retry 1 s/3 s và thử `MODEL_FALLBACKS` CHỈ khi sau lùi vẫn còn ≥ `MODEL_MIN_ATTEMPT_MS`; không có `deadlineAt` ⇒ chỉ `MODEL_CALL_TIMEOUT_MS`. `agent_runs.outcome = 'deadline'` khi hết hạn. Mặc định model `tier:'fast'`: gemini `gemini-3.5-flash-lite` · openrouter `google/gemini-3.5-flash-lite` · anthropic/vyce = model route `community`.

### §2.2 Embedding (MỚI — SPEC-P04)
```ts
export interface EmbedResult { vectors: number[][]; model: string; dim: number }
export function embedTexts(texts: string[], opts?: { taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' }): Promise<EmbedResult>;
```
- Chỉ nhánh `gemini`: `POST https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`, header `x-goog-api-key`, body `{ requests: texts.map(t => ({ model: 'models/' + EMBED_MODEL, content: { parts: [{ text: t }] }, taskType, outputDimensionality: EMBED_DIM })) }` ⇒ `embeddings[i].values`. Tối đa 100 text/lời gọi (chia batch), retry 2 lần như `callGeminiWithRetry`. D31: `opts.deadlineAt?: number`; mỗi lần thử `AbortSignal.timeout(min(EMBED_TIMEOUT_MS, deadlineAt − now))`; quá ⇒ `EmbeddingUnavailableError` (caller rơi về lexical).
- `EMBED_DIM` mặc định 1024 = số chiều cột `kb_sections.embedding vector(1024)` (001_init.sql) và `daily_notes.embedding`. 🖐 Q3: nếu probe thực tế trả vector khác 1024 chiều ⇒ worker DỪNG, ghi report; không tự đổi DDL.
- Nhánh `anthropic`/`openrouter`/`vyce` hoặc `EMBED_PROVIDER=none` ⇒ ném `EmbeddingUnavailableError` (§9); caller (knowledge.ts) rơi về lexical thuần + audit `kb.embed_unavailable`.
- Test: `setEmbedFetchForTest(fake)`; 0 mạng trong `npm test`.

### §2.3 `adapters/transport.ts`
```ts
export type AccountId = 'community';
export type SessionState = 'logged_out' | 'qr_pending' | 'connected' | 'kicked' | 'reconnecting' | 'dead';   // giữ
export interface InboundEvent { id: number; zaloAccountId: AccountId; zaloMsgId: string; threadId: string; threadType: 'user' | 'group';
  senderUid: string; isSelf: boolean; payload: InboundPayload; receivedAt: string; }           // payload: §8.2
export type OutboxKind = 'text' | 'image' | 'typing' | 'seen' | 'action' | 'react';
export interface OutboxInsert { zaloAccountId: AccountId; threadId: string; threadType: 'user' | 'group'; kind: OutboxKind;
  body: OutboxBody; notBefore?: Date; }                                                        // body: §8.3; bỏ jobId
export interface Transport { onInbound(h: (e: InboundEvent) => Promise<void>): void; enqueue(msg: OutboxInsert): Promise<number>; status(account: AccountId): Promise<SessionState>; }
export async function enqueue(msg: OutboxInsert): Promise<number>;   // hàm DUY NHẤT `insert into outbox` (BB-02)
```
`createTransport()`: `TRANSPORT=sim` (mặc định) ⇒ SimTransport; `zalo` ⇒ KHÔNG ném lỗi nữa — trả cùng object (core chỉ dùng `enqueue`/`status`; worker là tiến trình riêng). Bỏ chuỗi "P02 chưa làm".

### §2.4 `adapters/alert.ts` (D32, BB-20) — hợp đồng đầy đủ: [SPEC-D31 §10.1](SPEC-D31-Toc-Do-Giam-Sat.md)
```ts
export type AlertKind = 'zalo_session' | 'runner_stale' | 'worker_stale' | 'inbound_backlog' | 'model_down' | 'slo_breach' | 'bot_not_admin' | 'db_unreachable';
export interface AlertInput { kind: AlertKind; key: string; severity: 'critical' | 'warning'; text: string; resolved?: boolean }
export type AlertResult = 'sent' | 'suppressed' | 'disabled' | 'failed';
export async function sendAlert(a: AlertInput, opts?: { localOnly?: boolean }): Promise<AlertResult>;   // KHÔNG BAO GIỜ ném
export function setAlertFetchForTest(f: typeof fetch | null): void;
```
CHỈ file này chứa chuỗi `api.telegram.org` và đọc `TELEGRAM_BOT_TOKEN` (`check_adapter_boundary` mở rộng).

### §2.5 `adapters/db.ts` — khoá một bản (D31, BB-19)
```ts
export interface AdvisoryLock { release(): Promise<void> }
export async function holdAdvisoryLock(name: 'lenqclaw:runner' | 'lenqclaw:worker:community', onLost: (err: Error) => void): Promise<AdvisoryLock | null>;
// kết nối pg.Client RIÊNG (không lấy từ pool), `select pg_try_advisory_lock(hashtextextended($1, 0))`; false ⇒ đóng client, trả null;
// client 'error'/'end' khi đang giữ ⇒ onLost (caller: dừng nhận việc, exit 1).
```

## §3. Danh tính & vai (D06, BB-04)

```ts
export type Role = 'owner' | 'moderator' | 'member' | 'stranger';
export async function resolveRole(account: AccountId, uid: string, threadId: string | null): Promise<Role>;
```
Thứ tự: `account_owners(account, uid)` ⇒ `owner` · `threadId` ≠ null và `group_members(account, threadId, uid).role='moderator' and left_at is null` ⇒ `moderator` · `group_members` còn hiệu lực ⇒ `member` · DM từ uid có ≥1 dòng `group_members` còn hiệu lực ở bất kỳ nhóm `enabled` ⇒ `member` · còn lại ⇒ `stranger`. **Tin nhóm luôn upsert `group_members` (là bằng chứng thành viên) TRƯỚC khi gọi `resolveRole`.** Owner là người thật quản lý agent; moderator khai trên dashboard hoặc đồng bộ từ `GroupInfo.adminIds` (`sync_group_info`, SPEC-P02 §4.4 — chỉ GHI `role='moderator'` cho uid trong `adminIds`, KHÔNG hạ vai ai đã khai tay).

Vai quyết định: tool được gọi (§7.1), miễn trừ kiểm duyệt (SPEC-P05 §4), lệnh `/` (§6.2), người duyệt thẻ (§5.1).

## §4. DDL — migration 007 + 008 (append-only; đã áp thử từ rỗng, `evidence/ARCH/migration-probe.txt`) + 009 (D23/D24, chưa áp thử)

Worker chép NGUYÊN VĂN hai file dưới đây vào `db/migrations/` (sha256 bản nháp: `evidence/ARCH/migration-draft-sha256.txt`). Thứ tự câu lệnh là BẮT BUỘC (đã đo: UPDATE trước DROP CONSTRAINT ⇒ lỗi 23514).

### `db/migrations/007_drop_marketplace.sql`
```sql
-- 007_drop_marketplace.sql — ke hoach 02 (D03): go san viec tho. Chi THEM file,
-- 001..006 giu nguyen (OPERATIONS §7). Ten constraint do Postgres tu dat theo
-- quy tac <bang>_<cot>_check / <bang>_<cot>_fkey (001_init.sql khong dat ten) —
-- do that 2026-10-09 tren DB dev: zalo_accounts_id_check, outbox_kind_check,
-- staff_users_role_check, staff_users_building_id_fkey, kb_documents_building_id_fkey.

-- 1. Cot/FK cua bang GIU LAI dang tro sang bang sap drop
alter table staff_users drop column if exists building_id;
alter table kb_documents drop column if exists building_id;

-- 2. Drop toan bo bang san viec tho (cascade cho FK cheo giua chinh chung)
drop table if exists
  ledger_entries, ratings, access_passes, job_photos, job_events, job_offers, tickets, jobs,
  price_book, slot_waitlist, vendor_slots, slot_capacity, vendor_groups, vendor_scores,
  vendor_buildings, vendor_skills, vendors, job_categories, resident_apartments, residents,
  apartments, buildings, organizations, zalo_identities
  cascade;

-- 3. Tai khoan Zalo: 'bql' -> 'community' (giu session_enc neu co), bo 'market'.
--    BO CHECK CU TRUOC (chi cho 'bql'/'market') roi moi doi ten — do thu 2026-10-09:
--    UPDATE truoc khi drop constraint => 23514 zalo_accounts_id_check.
alter table zalo_accounts drop constraint zalo_accounts_id_check;
delete from zalo_accounts where id = 'market';
update zalo_accounts set id = 'community', display_name = 'Trợ lý cộng đồng' where id = 'bql';
insert into zalo_accounts (id, display_name, session_state)
  select 'community', 'Trợ lý cộng đồng', 'logged_out'
  where not exists (select 1 from zalo_accounts where id = 'community');
alter table zalo_accounts add constraint zalo_accounts_id_check check (id in ('community'));

-- 4. Lich su: bo 'market'; 'bql' doi ten
delete from messages where conversation_id in (select id from conversations where zalo_account_id = 'market');
delete from conversations where zalo_account_id = 'market';
delete from inbound_events where zalo_account_id = 'market';
delete from outbox where zalo_account_id = 'market';
update conversations set zalo_account_id = 'community' where zalo_account_id = 'bql';
update inbound_events set zalo_account_id = 'community' where zalo_account_id = 'bql';
update outbox set zalo_account_id = 'community' where zalo_account_id = 'bql';

-- 5. outbox: kind 'action'/'react' (hanh dong quan tri nhom di qua outbox — BB-04), sent_at, result; bo job_id
alter table outbox drop constraint outbox_kind_check;
alter table outbox add constraint outbox_kind_check check (kind in ('text','image','typing','seen','action','react'));
alter table outbox add column sent_at timestamptz;
alter table outbox add column result jsonb;
alter table outbox drop column job_id;
create index if not exists outbox_queued_idx on outbox (zalo_account_id, status, not_before) where status = 'queued';

-- 6. staff_users: vai moi admin/operator (drop CHECK cu TRUOC khi UPDATE — cung ly do muc 3)
alter table staff_users drop constraint staff_users_role_check;
update staff_users set role = case when role = 'bql_admin' then 'admin' else 'operator' end;
alter table staff_users add constraint staff_users_role_check check (role in ('admin','operator'));

-- 7. conversations: loai thread (DM/nhom)
alter table conversations add column thread_type text not null default 'user' check (thread_type in ('user','group'));

-- 8. kho tri thuc: nguon/tags/moc nhung
alter table kb_documents add column source text;
alter table kb_documents add column tags text[] not null default '{}';
alter table kb_documents add column updated_at timestamptz not null default now();
alter table kb_sections add column embedded_at timestamptz;
alter table kb_sections add column embedding_model text;
```

### `db/migrations/008_community.sql`
```sql
-- 008_community.sql — ke hoach 02, 01-CONTRACTS §4: bang moi cua agent cong dong. Chi THEM.

create table account_owners (
  zalo_account_id text not null references zalo_accounts,
  zalo_uid text not null,
  label text,
  created_at timestamptz not null default now(),
  primary key (zalo_account_id, zalo_uid)
);

create table zalo_groups (
  zalo_account_id text not null references zalo_accounts,
  thread_id text not null,
  name text,
  enabled boolean not null default false,
  mode text not null default 'mention' check (mode in ('mention','ambient')),
  join_policy text not null default 'manual' check (join_policy in ('manual','auto_approve','agent_review')),
  welcome_enabled boolean not null default true,
  moderation_enabled boolean not null default true,
  budget_per_hour int not null default 20 check (budget_per_hour >= 0),
  ambient_turns_per_hour int not null default 12 check (ambient_turns_per_hour >= 0),
  system_prompt text check (char_length(system_prompt) <= 4000),
  allow_users text[] not null default '{}',
  deny_users text[] not null default '{}',
  bot_is_admin boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (zalo_account_id, thread_id)
);

create table group_members (
  zalo_account_id text not null,
  thread_id text not null,
  zalo_uid text not null,
  role text not null default 'member' check (role in ('moderator','member')),
  display_name text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz,
  welcomed_at timestamptz,
  primary key (zalo_account_id, thread_id, zalo_uid),
  foreign key (zalo_account_id, thread_id) references zalo_groups on delete cascade
);
create index group_members_uid_idx on group_members (zalo_account_id, zalo_uid);

create table group_messages (
  id bigserial primary key,
  zalo_account_id text not null,
  thread_id text not null,
  zalo_msg_id text not null,
  cli_msg_id text,
  sender_uid text not null,
  sender_name text,
  is_self boolean not null default false,
  msg_type text not null default 'webchat',
  text text,
  mentions jsonb not null default '[]',
  quote_msg_id text,
  quote_owner_uid text,
  is_question boolean not null default false,
  answered_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,
  received_at timestamptz not null default now(),
  unique (zalo_account_id, zalo_msg_id)
);
create index group_messages_thread_idx on group_messages (zalo_account_id, thread_id, id desc);
create index group_messages_open_question_idx on group_messages (zalo_account_id, thread_id, received_at)
  where is_question and answered_at is null and deleted_at is null;

create table group_sessions (
  zalo_account_id text not null,
  thread_id text not null,
  pending_since timestamptz,
  welcome_pending_since timestamptz,
  last_turn_at timestamptz,
  last_seen_message_id bigint not null default 0,
  turns_window_start timestamptz,
  turns_in_window int not null default 0,
  primary key (zalo_account_id, thread_id)
);

create table persona_docs (
  id bigserial primary key,
  zalo_account_id text not null references zalo_accounts,
  kind text not null check (kind in ('soul','rules','identity','capabilities')),
  version int not null check (version >= 1),
  body text not null check (char_length(body) <= 8000),
  is_active boolean not null default false,
  created_by uuid references staff_users,
  created_at timestamptz not null default now(),
  unique (zalo_account_id, kind, version)
);
create unique index persona_docs_active_idx on persona_docs (zalo_account_id, kind) where is_active;

create table skill_docs (
  id bigserial primary key,
  zalo_account_id text not null references zalo_accounts,
  name text not null check (name ~ '^[a-z0-9-]{2,40}$'),
  description text not null check (char_length(description) between 1 and 200),
  body text not null check (char_length(body) <= 8000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (zalo_account_id, name)
);

create table member_profiles (
  zalo_account_id text not null,
  zalo_uid text not null,
  display_name text,
  notes text not null default '' check (char_length(notes) <= 4000),
  interests text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (zalo_account_id, zalo_uid)
);

create table daily_notes (
  id bigserial primary key,
  zalo_account_id text not null,
  note_date date not null,
  thread_id text,
  body text not null check (char_length(body) <= 8000),
  tsv tsvector generated always as (to_tsvector('simple', public.immutable_unaccent(body))) stored,
  embedding vector(1024),
  embedded_at timestamptz,
  created_at timestamptz not null default now()
);
create index daily_notes_tsv_idx on daily_notes using gin (tsv);
create index daily_notes_date_idx on daily_notes (zalo_account_id, note_date desc);

create table leads (
  id uuid primary key default gen_random_uuid(),
  zalo_account_id text not null,
  zalo_uid text not null,
  display_name text,
  industry text,
  channels text[] not null default '{}',
  msg_volume text,
  deadline text,
  budget text,
  contact text,
  notes text not null default '' check (char_length(notes) <= 4000),
  score int not null default 0 check (score between 0 and 100),
  status text not null default 'new' check (status in ('new','qualifying','qualified','handed_off','closed','discarded')),
  source_thread_id text,
  handed_off_at timestamptz,
  owner_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_open_per_uid_idx on leads (zalo_account_id, zalo_uid) where status in ('new','qualifying','qualified');

create table moderation_events (
  id bigserial primary key,
  zalo_account_id text not null,
  thread_id text not null,
  zalo_uid text not null,
  zalo_msg_id text,
  verdict text not null check (verdict in ('ok','spam','scam','ad','harass','unsure')),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  source text not null check (source in ('grid','model','agent','human')),
  grid_hits text[] not null default '{}',
  action text not null check (action in ('none','warn','delete','kick_requested','block_requested')),
  score_after numeric(6,3),
  created_at timestamptz not null default now()
);
create index moderation_events_thread_idx on moderation_events (zalo_account_id, thread_id, created_at desc);

create table moderation_scores (
  zalo_account_id text not null,
  thread_id text not null,
  zalo_uid text not null,
  score numeric(6,3) not null default 0,
  strikes int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (zalo_account_id, thread_id, zalo_uid)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  zalo_account_id text not null,
  kind text not null check (kind in ('kick_member','block_member','reject_join','approve_join','announce')),
  thread_id text not null,
  target_uid text,
  reason text not null,
  payload jsonb not null default '{}',
  requested_by text not null check (requested_by in ('agent','moderation','timer','staff')),
  requester_uid text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','executed','failed')),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  outbox_id bigint,
  executed_at timestamptz,
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index approvals_pending_idx on approvals (zalo_account_id, expires_at) where status = 'pending';

create table join_requests (
  id bigserial primary key,
  zalo_account_id text not null,
  thread_id text not null,
  zalo_uid text not null,
  display_name text,
  requested_at timestamptz not null default now(),
  decision text not null default 'pending' check (decision in ('pending','approved','rejected','expired')),
  decided_by text,
  decided_at timestamptz,
  reason text
);
create unique index join_requests_open_idx on join_requests (zalo_account_id, thread_id, zalo_uid) where decision = 'pending';

create table automations (
  id uuid primary key default gen_random_uuid(),
  zalo_account_id text not null,
  name text not null,
  kind text not null check (kind in ('at','every','daily','weekly')),
  at_time timestamptz,
  every_seconds int check (every_seconds >= 60),
  time_of_day time,
  day_of_week int check (day_of_week between 0 and 6),
  tz text not null default 'Asia/Ho_Chi_Minh',
  thread_id text,
  action text not null check (action in ('send_text','agent_turn','weekly_summary','daily_owner_report','poll','watch_unanswered')),
  payload jsonb not null default '{}',
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  lock_until timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'at' and at_time is not null)
    or (kind = 'every' and every_seconds is not null)
    or (kind = 'daily' and time_of_day is not null)
    or (kind = 'weekly' and time_of_day is not null and day_of_week is not null)
  )
);
create index automations_due_idx on automations (next_run_at) where enabled;

create table automation_runs (
  id bigserial primary key,
  automation_id uuid not null references automations on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('ok','error','skipped')),
  detail text
);
```

### `db/migrations/009_tenant_trace.sql` (D23, D24 — thêm 2026-10-14; CHƯA áp thử ⇒ worker P01 áp từ rỗng sau 008, chạy lại `applied 0`, ghi `evidence/P01/migration-009-probe.txt`; lệch cú pháp ⇒ dừng báo, không tự sửa nghĩa)
```sql
-- 009_tenant_trace.sql — ke hoach 02 (D23 tenant, D24 vet tung luot). Chi THEM.

-- 1. Tenant: 0.1 chi co 'default'. Bang 008 suy tenant qua zalo_accounts (D23).
create table tenants (
  id text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  name text not null,
  created_at timestamptz not null default now()
);
insert into tenants (id, name) values ('default', 'Mặc định') on conflict do nothing;
alter table zalo_accounts add column tenant_id text not null default 'default' references tenants;
alter table staff_users   add column tenant_id text not null default 'default' references tenants;
alter table kb_documents  add column tenant_id text not null default 'default' references tenants;
create index kb_documents_tenant_idx on kb_documents (tenant_id);

-- 2. Vet tung luot agent (D24): khong chua noi dung tin/prompt.
create table turn_traces (
  id uuid primary key default gen_random_uuid(),
  zalo_account_id text not null references zalo_accounts on update cascade,
  conversation_id uuid,
  thread_id text not null,
  thread_type text not null check (thread_type in ('user','group')),
  kind text not null,
  trigger text,
  requester_role text,
  rounds int not null default 0 check (rounds >= 0),
  tools text[] not null default '{}',
  sent int not null default 0 check (sent >= 0),
  outcome text not null check (outcome in ('replied','silent','auto_posted','fallback','model_down','refusal','error')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null default 0,
  persona_versions jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index turn_traces_account_time_idx on turn_traces (zalo_account_id, created_at desc);
create index turn_traces_thread_idx on turn_traces (zalo_account_id, thread_id, created_at desc);
alter table agent_runs add column turn_id uuid;
create index agent_runs_turn_idx on agent_runs (turn_id) where turn_id is not null;
```
`outcome`: `replied` (nhóm `sent ≥ 1` do model gọi tool, hoặc DM có text cuối) · `silent` (lượt không bắt buộc trả lời, 0 tin) · `auto_posted` (host đăng text cuối — SPEC-P03 §6.4.1) · `fallback` (§6.4.2) · `model_down` (§6.5) · `refusal` · `error` (ngoại lệ chưa bắt). `persona_versions` = `{"soul":n,"rules":n,"identity":n,"capabilities":n}` của bản active lúc lượt chạy. `tools` = tên tool theo thứ tự gọi (lặp được). Tổng token = cộng các `agent_runs` cùng `turn_id`.

Ghi chú DDL: bảng giữ nguyên từ 001–006: `zalo_accounts` (+ cột 004/005), `inbound_events`, `outbox`, `conversations`, `messages`, `agent_runs`, `audit_log`, `kb_documents`, `kb_sections` (tsv generated từ 002), `staff_users`, `schema_migrations`. `conversations.party_type` (text, không CHECK) ghi `'owner' | 'member' | 'stranger' | 'group'`; `party_id` để NULL. Tên hiển thị trong mọi bảng là dữ liệu KHÔNG TIN CẬY (BB-10).

### `db/migrations/010_ops_latency.sql` (D31, D32 — thiết kế architect H06 2026-10-16; đã áp thử trên DB TẠM sau 001–009: ok, view tính đúng `core = e2e − hold`, CAS `alert_state` lần 2 trả 0 dòng, CHECK `lane` đỏ đúng — `evidence/ARCH-D31/migration-010-probe.txt`; CHƯA áp DB dev ⇒ P03 áp từ rỗng sau 009, chạy lại `applied 0`, ghi `evidence/P03/migration-010-probe.txt`; lệch cú pháp ⇒ dừng báo, không tự sửa nghĩa)
```sql
-- 010_ops_latency.sql — ke hoach 02 (D31 toc do, D32 giam sat). Chi THEM.
alter table turn_traces add column inbound_event_id bigint;
alter table turn_traces add column received_at timestamptz;
alter table turn_traces add column lane text check (lane in ('fast','rag','background'));
alter table turn_traces add column queued_ms int;
alter table turn_traces add column pre_turn_ms int;
alter table turn_traces add column triage_ms int;
alter table turn_traces add column model_ms int not null default 0;
alter table turn_traces add column tool_ms int not null default 0;
alter table turn_traces add column deadline_hit boolean not null default false;
create index turn_traces_lane_time_idx on turn_traces (lane, created_at desc) where lane in ('fast','rag');

alter table outbox add column inbound_event_id bigint;
alter table outbox add column picked_at timestamptz;
alter table outbox add column hold_reason text check (hold_reason in ('group_gap','thread_gap','per_minute','group_budget','backoff','recipients'));
create index outbox_inbound_event_idx on outbox (inbound_event_id) where inbound_event_id is not null;

create index inbound_events_pending_thread_idx on inbound_events (thread_id, id) where processed_at is null;

create table process_heartbeats (
  name text primary key check (name in ('runner','worker')),
  pid int not null,
  host text not null,
  started_at timestamptz not null,
  beat_at timestamptz not null,
  info jsonb not null default '{}'
);

create table alert_state (
  kind text not null,
  key text not null check (char_length(key) <= 64),
  open boolean not null default true,
  last_sent_at timestamptz,
  sent_count int not null default 0,
  suppressed int not null default 0,
  primary key (kind, key)
);

create view reply_latency as
select t.id as turn_id, t.zalo_account_id, t.thread_id, t.kind, t.lane, t.outcome, t.deadline_hit,
       t.received_at, o.created_at as enqueued_at, o.picked_at, o.sent_at, o.hold_reason,
       t.queued_ms, t.pre_turn_ms, t.triage_ms, t.model_ms, t.tool_ms,
       (extract(epoch from (o.created_at - t.received_at)) * 1000)::int as runtime_ms,
       (extract(epoch from (o.sent_at - t.received_at)) * 1000)::int as e2e_ms,
       case when o.hold_reason is null then 0
            else (extract(epoch from (o.picked_at - o.created_at)) * 1000)::int end as hold_ms,
       (extract(epoch from (o.sent_at - t.received_at)) * 1000)::int
         - case when o.hold_reason is null then 0
                else (extract(epoch from (o.picked_at - o.created_at)) * 1000)::int end as core_ms,
       (extract(epoch from (o.sent_at - o.picked_at)) * 1000)::int as send_ms
  from turn_traces t
  join lateral (select * from outbox x
                 where x.inbound_event_id = t.inbound_event_id and x.kind = 'text'
                   and coalesce((x.body->>'part')::int, 0) = 0
                 order by x.id limit 1) o on true
 where t.lane in ('fast','rag') and t.received_at is not null;
```
`worker_lag_ms` không nằm trong view (cần `inbound_events.payload.ts` — đọc trực tiếp khi điều tra). Hàng ghi trước 010 có cột mới NULL ⇒ view bỏ qua. Ngữ nghĩa từng cột/bảng: [SPEC-D31 §6, §8–§11](SPEC-D31-Toc-Do-Giam-Sat.md).

### §4.11 Migration `011_bot_uid.sql` (D37, append-only)
```sql
alter table zalo_accounts add column own_uid text;
```
Ghi: worker (`session.ownUid` khi phiên `connected`, `update zalo_accounts set own_uid = $2 where id = $1 and own_uid is distinct from $2`). Đọc: `agent/community/bot.ts::botUid(account)` (cache 60 s) ⇒ null ⇒ env `BOT_ZALO_UID` ⇒ chỉ `DATA_MODE=sim`: `BOT_UID_SIM`. Không xoá khi đăng xuất (uid tài khoản không đổi).

## §5. Máy trạng thái

### §5.1 `approvals.status`
| Từ | Sang | Tác nhân | Điều kiện & hiệu ứng |
| :-- | :-- | :-- | :-- |
| — | `pending` | tool `request_member_removal` / dịch vụ kiểm duyệt (`kick_requested`, `block_requested`) / `join-requests.ts` (policy `manual`) / tool `announce` của agent | `expires_at = now + APPROVAL_TTL_HOURS`; DM owner `APPROVAL_DM(id, kind, reason)`; dashboard thẻ |
| `pending` | `approved` | staff (web `POST /api/approvals/{id}/decision`) hoặc owner/moderator qua tool `decide_approval` (bằng chứng id trong tin — SPEC-P05 §5.4) | `decided_by` = `staff:<uid>` \| `zalo:<uid>`; ngay sau đó dịch vụ `executeApproval` ⇒ outbox `action` ⇒ `outbox_id` |
| `pending` | `rejected` | như trên | `decision_note` bắt buộc khi reject từ web (400 `note_required`) |
| `pending` | `expired` | timer `expireApprovals(now)` | DM owner "hết hạn" (1 lần) |
| `approved` | `executed` | pacer báo kết quả (`outbox.status='sent'`) qua `completeApproval` | `result` = kết quả zca-js đã rút gọn |
| `approved` | `failed` | pacer báo `outbox.status='failed'` | `result.error`; DM owner |

Chuyển = `UPDATE approvals SET status=$to … WHERE id=$id AND status=$from` trong `tx`, `rowCount=0` ⇒ `ConflictError`; cùng tx ghi `audit_log action='approval.<to>'`.

### §5.2 `leads.status`
`new` → `qualifying` (agent `save_lead` lần ≥2) → `qualified` (score ≥ `LEAD_SCORE_HANDOFF`) → `handed_off` (`submit_lead` hoặc staff) → `closed` (staff). Bất kỳ → `discarded` (staff hoặc chủ DM). Chỉ MỘT lead mở (`new|qualifying|qualified`) mỗi uid (index `leads_open_per_uid_idx`).

### §5.3 `join_requests.decision`
`pending` → `approved | rejected` (policy; agent; staff; owner) → không đổi; `pending` → `expired` (timer sau `JOIN_REQUEST_TTL_HOURS`).

### §5.4 `automations`
`enabled=true` + `next_run_at <= now` + (`lock_until` null hoặc `< now`) ⇒ chạy (`for update skip locked`), đặt `lock_until = now + 5 phút`, ghi `automation_runs`, tính `next_run_at` mới (`kind='at'` ⇒ `enabled=false`). Chi tiết SPEC-P07 §2.

## §6. Kiểu TypeScript (`domain/types.ts` + `agent/community/*`)

```ts
export type AccountId = 'community';
export type Role = 'owner' | 'moderator' | 'member' | 'stranger';
export type GroupMode = 'mention' | 'ambient';
export type JoinPolicy = 'manual' | 'auto_approve' | 'agent_review';
export type StaffRole = 'admin' | 'operator';

export type GroupTrigger = 'mention' | 'reply_to_bot' | 'name_pattern' | 'owner_command' | 'ambient';
export type GateReason = 'self' | 'group_unknown' | 'group_disabled' | 'sender_denied' | 'sender_not_allowed' | 'unsupported_type' | 'no_trigger' | 'admitted';
export interface GateInput {
  isSelf: boolean;
  group: { enabled: boolean; mode: GroupMode; allowUsers: readonly string[]; denyUsers: readonly string[] } | null;
  sender: { uid: string; role: Role };
  botUid: string;
  text: string;                                   // '' khi không phải text
  msgType: string;                                // 'webchat' = text (zca-js TMessage.msgType)
  mentions: ReadonlyArray<{ uid: string }>;       // từ TGroupMessage.mentions[].uid
  quoteOwnerUid: string | null;                   // từ TMessage.quote.ownerId
  botNamePatterns: readonly RegExp[];             // từ IDENTITY, cờ 'iu', ranh giới (?<![\p{L}\p{N}]) … (?![\p{L}\p{N}]) — CẤM \b (G14)
  hasControlCommand: boolean;                     // text bắt đầu bằng '/' + lệnh thuộc COMMANDS (§6.2)
}
export interface GateDecision { admitted: boolean; reason: GateReason; trigger: GroupTrigger | null; mustReply: boolean; buffer: boolean }
export function decideGroupInbound(i: GateInput): GateDecision;   // THUẦN — bảng 28 ca: evidence/ARCH/gate-ref.txt

export type TurnKind = 'group_mention' | 'group_ambient_flush' | 'group_welcome' | 'group_unanswered' | 'group_join_review' | 'dm' | 'owner_dm' | 'automation';

export interface GroupMessageRow { id: number; zaloMsgId: string; cliMsgId: string | null; senderUid: string; senderName: string | null; isSelf: boolean;
  msgType: string; text: string | null; mentions: Array<{ uid: string; pos: number; len: number }>; quoteMsgId: string | null; quoteOwnerUid: string | null;
  isQuestion: boolean; answeredAt: string | null; deletedAt: string | null; receivedAt: string }

export interface GroupTurnContext {
  readonly kind: Exclude<TurnKind, 'dm' | 'owner_dm' | 'automation'>;
  readonly account: AccountId; readonly threadId: string; readonly botUid: string;
  readonly group: { name: string | null; mode: GroupMode; budgetPerHour: number; systemPrompt: string | null; botIsAdmin: boolean; moderationEnabled: boolean };
  readonly requester: { uid: string; role: Role; displayName: string | null } | null;     // người kích hoạt (null ở ambient_flush/unanswered)
  readonly trigger: GroupTrigger | null; readonly mustReply: boolean;
  readonly focusMessages: readonly GroupMessageRow[];        // tin kích hoạt / tin mới trong cửa sổ / câu hỏi bỏ trống / uid mới vào
  readonly recent: readonly GroupMessageRow[];               // đệm gần nhất (≤ AMBIENT_CONTEXT_MESSAGES)
  readonly joinedUids?: readonly string[];                   // group_welcome
  readonly joinRequest?: { uid: string; displayName: string | null }; // group_join_review
  readonly now: Date; readonly conversationId: string;
  // D28: BỎ trường mutable `sent` — đếm "đã trả lời" là `TurnState.answered` (§12.2), do node `tools` cộng; ctx bất biến sau `prepare`.
}
export interface DmTurnContext { readonly kind: 'dm' | 'owner_dm'; readonly account: AccountId; readonly threadId: string; readonly botUid: string;
  readonly requester: { uid: string; role: Role; displayName: string | null }; readonly latestText: string; readonly latestMessageId: number;
  readonly triage: CommunityTriage | null; readonly now: Date; readonly conversationId: string;
  readonly memberNotes: string | null;                                  // D22: member_profiles.notes của CHÍNH requester (≤ 4000), null nếu chưa có
  readonly openLead: { status: string; score: number; missing: string[] } | null;   // D22: lead mở của requester (SPEC-P06 §3)
}
export type ToolContext = GroupTurnContext | DmTurnContext;

export interface CommunityTriage { verdict: 'ok' | 'spam' | 'scam' | 'ad' | 'harass' | 'unsure'; confidence: number;
  is_question: boolean; question_confidence: number; lead_intent: boolean; lead_confidence: number; wants_private: boolean }

export interface PersonaBundle { soul: string; rules: string; identity: string; capabilities: string; namePatterns: RegExp[]; skills: Array<{ name: string; description: string }>;
  versions: { soul: number; rules: number; identity: number; capabilities: number } }   // D24: ghi vào turn_traces.persona_versions

export type OutboxAction =
  | { action: 'delete_message'; msgId: string; cliMsgId: string; uidFrom: string; onlyMe: false; approvalId?: string }
  | { action: 'remove_member'; uid: string; approvalId: string }
  | { action: 'block_member'; uid: string; approvalId: string }
  | { action: 'unblock_member'; uid: string }
  | { action: 'review_join'; uids: string[]; approve: boolean; approvalId?: string }
  | { action: 'create_poll'; question: string; options: string[]; expiredTime?: number; allowMultiChoices?: boolean; isAnonymous?: boolean }
  | { action: 'lock_poll'; pollId: number }
  | { action: 'create_reminder'; title: string; startTime: number; repeat: 0 | 1 | 2 | 3; emoji?: string }
  | { action: 'remove_reminder'; reminderId: string }
  | { action: 'create_note'; title: string; pinAct?: boolean }
  | { action: 'update_group_settings'; settings: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean } }
  | { action: 'sync_group_info' };
export type OutboxBody =
  | { text: string; quote?: QuoteRef; mentions?: Array<{ uid: string; pos: number; len: number }>; split_of?: number; part?: number; private?: false }
  | { seen: SeenParams } | { typing: true } | OutboxAction | { react: { icon: string; msgId: string; cliMsgId: string } };
export interface QuoteRef { msgId: string; cliMsgId: string; uidFrom: string; content: string; msgType: string; ts: string; ttl: number; propertyExt?: Record<string, unknown> }
```

### §6.2 Lệnh `/` (chỉ owner/moderator; member gõ `/` ⇒ `no_trigger`)
`COMMANDS = ['/status', '/mode mention', '/mode ambient', '/mute 1h', '/mute 24h', '/unmute', '/summary', '/approve <id>', '/reject <id>']`. `hasControlCommand = /^\/[a-z]+/.test(text.trim())`. Lệnh được đưa vào lượt `group_mention` với `trigger='owner_command'`; agent thực thi bằng tool tương ứng (`set_group_mode`, `mute_group`, `decide_approval`…); lệnh lạ ⇒ agent trả lời ngắn danh sách lệnh (đường lùi khi model sập: host trả danh sách lệnh — SPEC-P03 §6.5).

## §7. Tool của agent (BB-01, BB-06)

Mọi tool: `definition.strict = true` (kiểu `ToolDefinition` của `tool-kit.ts`), `input_schema` object bậc 1, `additionalProperties: false`; input kiểm bằng `assertValidToolInput` trước `run` (Gemini không có `strict`). Tool nhận `ctx` do server dựng (BB-04), KHÔNG nhận uid/thread của người yêu cầu làm tham số trừ khi bảng ghi rõ.

### §7.1 Bảng tool × bề mặt × vai (`agent/community/policy.ts::TOOL_POLICY`)

Bề mặt: **G** = lượt nhóm (mọi `group_*`), **D** = DM member/stranger, **O** = DM owner. Vai = `ctx.requester.role` (ambient_flush/unanswered: vai `member`). Ô trống = tool KHÔNG được đưa vào `tools[]` của lời gọi model (không chỉ bị từ chối lúc chạy).

| Tool | Input (JSON schema rút gọn) | G | D | O | Chốt chặn trong tool |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `search_knowledge` | `{query: string, top_k?: integer≤12}` | mọi vai | mọi vai | ✓ | trả `KnowledgeHit[]` có `document_id/section_id/heading/quote` (SPEC-P04 §2) |
| `describe_capabilities` | `{}` | mọi vai | mọi vai | ✓ | trả `persona.capabilities` + danh sách skill |
| `read_skill` | `{name: string}` | mọi vai | mọi vai | ✓ | chỉ skill `enabled`; không có ⇒ `SkillNotFoundError` |
| `send_group_message` | `{text: string≤4000, reply_to_msg_id?: string, mention_uids?: string[]≤5}` | mọi vai | | | ctx nhóm; ngân sách BB-08 (`GroupBudgetExceededError`); `reply_to_msg_id` phải có trong đệm (`MessageNotInBufferError`); `mention_uids` phải là thành viên (`UnknownMemberError`); chunk + quote ở chunk đầu; cờ `answers` (D28: node `tools` cộng `TurnState.answered`, thay `ctx.sent++`); ghi `messages` role assistant |
| `recall_group_history` | `{limit?: integer≤50, before_id?: integer}` | mọi vai | | | chỉ đệm của chính `ctx.threadId`; text đã che SĐT |
| `flag_message` | `{msg_id: string, verdict: 'spam'\|'scam'\|'ad'\|'harass'\|'ok', reason: string}` | mọi vai | | | ghi `moderation_events(source='agent')` ⇒ thang cảnh cáo (SPEC-P05 §4); người gửi owner/moderator ⇒ chỉ log |
| `delete_message` | `{msg_id: string, reason: string}` | mọi vai | | | `moderation_enabled` ∧ `bot_is_admin` (`ActionNotPermittedError`); tin trong đệm, không phải của owner/moderator, ≤ 24 giờ; outbox `delete_message` với `uidFrom = group_messages.sender_uid`; tin của bot: cho phép |
| `warn_member` | `{uid: string, reason: string}` | mọi vai | | | ngân sách cảnh cáo `MOD_WARN_PER_HOUR`; owner/moderator ⇒ `ActionNotPermittedError` |
| `request_member_removal` | `{uid: string, kind: 'kick'\|'block', reason: string}` | mọi vai | | | TẠO `approvals` (`pending`) + DM owner; trả `{status:'pending_approval', approval_id}`; KHÔNG thi hành |
| `invite_to_private` | `{uid: string, note: string≤300}` | mọi vai | | | gửi tin nhóm mention uid "mình nhắn riêng bạn nhé"; nếu đã có `conversations(account, uid)` có tin vào ⇒ DM luôn; ghi `member_profiles.notes` dòng "mời riêng: <note>" |
| `remember_member_note` | `{uid: string, note: string≤500}` | mọi vai | mọi vai | ✓ | chỉ GHI (append) `member_profiles`; CẤM đọc ở G (BB-07); ở G và D chỉ cho uid = requester (D35.10) |
| `handoff_to_owner` | `{reason: string}` | mọi vai | mọi vai | | DM owner `HANDOFF_DM`; đặt `conversations.human_takeover_until = now + HUMAN_TAKEOVER_MIN` cho thread hiện tại |
| `create_poll` | `{question, options: string[2..10], expires_hours?: integer≤168, multi?: boolean, anonymous?: boolean}` | owner, moderator | | ✓ (`thread_id` thêm) | outbox `create_poll` |
| `create_reminder` | `{title, start_at: ISO8601, repeat: 'none'\|'daily'\|'weekly'\|'monthly'}` | owner, moderator | | ✓ (`thread_id`) | outbox `create_reminder`; `start_at` phải > now |
| `create_note` | `{title: string≤500, pin?: boolean}` | owner, moderator | | ✓ (`thread_id`) | outbox `create_note` |
| `set_group_mode` | `{mode: 'mention'\|'ambient'}` | owner, moderator | | ✓ (`thread_id`) | cập nhật `zalo_groups.mode` + audit |
| `mute_group` | `{action: 'mute'\|'unmute'}` | owner, moderator | | ✓ (`thread_id`) | `mute` ⇒ `zalo_groups.mode='mention'`; `unmute` ⇒ `mode='ambient'`; audit `group.mute` (không có cột `mute_until` — Q6) |
| `save_lead` | `{industry?, channels?: string[], msg_volume?, deadline?, budget?, contact?, notes?}` | | mọi vai | | upsert lead mở của requester; tính `score` (SPEC-P06 §3); `new→qualifying→qualified` |
| `submit_lead` | `{}` | | mọi vai | | lead `qualified` ⇒ `handed_off` + DM owner `LEAD_DM`; chưa đủ ⇒ `LeadIncompleteError` |
| `list_groups` | `{}` | | | ✓ | nhóm + chế độ + ngân sách còn lại |
| `set_group_enabled` | `{thread_id, enabled: boolean}` | | | ✓ | audit |
| `decide_approval` | `{approval_id: string, decision: 'approve'\|'reject', note?: string}` | owner, moderator (qua lệnh `/approve`) | | ✓ | BẰNG CHỨNG: `approval_id` (hoặc 6 ký tự đầu) PHẢI xuất hiện trong `latestText` của requester (`IntentNotConfirmedError`); `pending` ⇒ `approved/rejected` ⇒ thi hành |
| `announce` | `{thread_id, text: string≤2000}` | | | ✓ | outbox text tới nhóm (ngân sách nhóm áp); audit `announce` |
| `schedule_automation` | `{name, kind: 'at'\|'every'\|'daily'\|'weekly', at?: ISO8601, every_minutes?: integer≥1, time_of_day?: 'HH:MM', day_of_week?: 0..6, thread_id?, action: 'send_text'\|'weekly_summary'\|'poll', payload?: object}` | | | ✓ | kiểm `schedule.ts::computeNextRun` ⇒ `AutomationInvalidError` |
| `list_automations` / `cancel_automation` | `{}` / `{id}` | | | ✓ | |
| `search_memory` | `{query, limit?≤10}` | | | ✓ | truy hồi lai `daily_notes` + `member_profiles` (SPEC-P06 §4) — CHỈ O (BB-07) |
| `write_daily_note` | `{text: string≤2000}` | | | ✓ | append `daily_notes` hôm nay |
| `daily_report` | `{}` | | | ✓ | số liệu 24 giờ (SPEC-P07 §5) |
| `review_join_request` | `{uid: string, decision: 'approve'\|'reject', reason: string}` | chỉ lượt `group_join_review` | | ✓ (`thread_id`) | policy `agent_review` ⇒ approve: outbox `review_join` ngay; reject: cần `reason`, thi hành ngay (SPEC-P05 §6); policy `manual` ⇒ `ActionNotPermittedError` |

Ghi chú D22: `recall_member_profile` (có trong bản duyệt 2026-10-09) đã BỎ — ghi chú + lead mở của requester được host nạp sẵn vào mỗi lượt DM (§11); KHÔNG được thêm lại tool đọc hồ sơ ở D.

Ghi chú `mute_group`: CẤM thêm cột ngoài DDL §4 trong vòng này; `/mute 1h`/`/mute 24h` (§6.2) đều map sang `{action:'mute'}` — thời lượng bị bỏ qua ở 0.1 (🖐 Q6).

### §7.2 CẤM tồn tại (tên bị `check_agent_tools.mjs` chặn — SPEC-P01 §6)
`exec`, `shell`, `read_file`, `write_file`, `send_file`, `self_update`, `restart`, `restart_channel`, `disperse_group`, `change_group_owner`, `add_group_admin`, `remove_group_admin`, `add_group_deputy`, `remove_group_deputy`, `leave_group`, `send_friend_request`, `list_contacts`, `get_group_chat_history`, `update_config`, `kick_member` (chỉ có `request_member_removal`), `block_member` (tool), `recall_full_history`.

## §8. Transport & worker

### §8.1 `ZaloClientLike` / `ZaloSessionLike` (apps/zalo-worker/src/client.ts — mở rộng, giữ các hàm cũ)
Chữ ký zca-js 2.2.0 đối chiếu `.d.ts` thật (`dist/apis/*.d.ts`):
```ts
export interface ZaloSessionLike {
  readonly ownUid: string;
  startListener(h: ZaloListenerHandlers): void; stopListener(): void;           // thêm handler groupEvent(ev: ZaloGroupEvent)
  sendText(threadId: string, threadType: ThreadKind, content: OutboundText): Promise<{ msgId: string | null }>;   // api.sendMessage(MessageContent|string, threadId, ThreadType)
  sendTyping(threadId: string, threadType: ThreadKind): Promise<void>;
  sendSeen(threadType: ThreadKind, params: SeenParams): Promise<void>;
  probeRead(): Promise<void>;                                                   // api.fetchAccountInfo()
  exportCredentials(): SessionSecret;
  // MỚI (SPEC-P02 §4) — mỗi hàm bọc đúng MỘT api zca-js, phân loại lỗi bằng classify():
  deleteMessage(dest: { data: { msgId: string; cliMsgId: string; uidFrom: string }; threadId: string; type: 'group' | 'user' }, onlyMe: boolean): Promise<{ status: number }>;  // api.deleteMessage(dest, onlyMe)
  removeMember(uid: string, groupId: string): Promise<{ errorMembers: string[] }>;             // api.removeUserFromGroup(memberId, groupId)
  blockMember(uid: string, groupId: string): Promise<void>;                                    // api.addGroupBlockedMember(memberId, groupId) ⇒ ""
  unblockMember(uid: string, groupId: string): Promise<void>;                                  // api.removeGroupBlockedMember
  reviewJoin(uids: string[], approve: boolean, groupId: string): Promise<Record<string, number>>;   // api.reviewPendingMemberRequest({members, isApprove}, groupId) ⇒ {uid: 0|170|178|166}
  getPendingMembers(groupId: string): Promise<Array<{ uid: string; dpn: string }>>;           // api.getPendingGroupMembers(groupId).users
  getGroupInfo(groupId: string): Promise<{ name: string; adminIds: string[]; creatorId: string; memberIds: string[]; memVerList: string[]; totalMember: number; setting: { joinAppr: number } }>;  // api.getGroupInfo(id).gridInfoMap[id]
  getMembersInfo(uids: string[]): Promise<Record<string, { displayName: string; zaloName: string }>>;   // api.getGroupMembersInfo(ids).profiles
  createPoll(o: { question: string; options: string[]; expiredTime?: number; allowMultiChoices?: boolean; isAnonymous?: boolean }, groupId: string): Promise<{ poll_id: number }>;
  lockPoll(pollId: number): Promise<void>;
  createReminder(o: { title: string; startTime: number; repeat: 0 | 1 | 2 | 3; emoji?: string }, threadId: string, type: ThreadKind): Promise<{ id: string }>;
  removeReminder(reminderId: string, threadId: string, type: ThreadKind): Promise<void>;
  createNote(o: { title: string; pinAct?: boolean }, groupId: string): Promise<{ id: string }>;
  updateGroupSettings(o: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean }, groupId: string): Promise<void>;
  addReaction(icon: string, dest: { data: { msgId: string; cliMsgId: string }; threadId: string; type: ThreadKind }): Promise<void>;
}
export interface OutboundText { msg: string; quote?: SendMessageQuote; mentions?: Array<{ uid: string; pos: number; len: number }> }
```
`FakeSession` (testing/fake-client.ts) cài đủ các hàm trên, ghi `sent[]`/`actions[]`, cho phép đặt lỗi kế tiếp (`nextActionError`), trả mã `ReviewPendingMemberRequestStatus` (0/166/170/178) theo kịch bản.

### §8.2 Payload `inbound_events` (worker ghi, core đọc)
```ts
type InboundPayload =
  | { kind: 'text'; text: string; msg_type: 'webchat'; ts: string; cli_msg_id: string; d_name: string | null;
      mentions: Array<{ uid: string; pos: number; len: number }>; quote: { owner_id: string; global_msg_id: string; msg: string } | null; raw: object }
  | { kind: 'unsupported'; text: string /* "[<ai> gửi <loại> — chưa hỗ trợ]" */; unsupported: true; msg_type: string; ts: string; cli_msg_id: string; d_name: string | null; raw: object }
  | { kind: 'group_event'; event: 'join' | 'join_request' | 'leave' | 'remove_member' | 'add_admin' | 'remove_admin' | 'update_setting' | 'update';
      uids: string[]; names: string[]; source_uid: string | null; group_name: string | null; time: string; raw: object }
  | { kind: 'system'; event: 'ambient_flush' | 'welcome_flush' | 'unanswered_question' | 'join_request' | 'automation' | 'approval_executed'; data: Record<string, unknown> };
```
- `zalo_msg_id` text: `String(data.msgId)` (giữ); group_event: `gev-<groupId>-<event>-<time>` (chống trùng khi reconnect phát lại); system: `sys-<uuid>` (giữ Đ27). `sender_uid`: text ⇒ `uidFrom`; group_event ⇒ `data.sourceId || 'zalo'`; system ⇒ `'system'` (DÀNH RIÊNG — `simInbound`/`/api/dev/sim/send` từ chối, giữ).
- Tin nhóm KHÔNG còn bị bỏ (`ignored_group` cũ) — worker ghi mọi tin nhóm; lọc nhóm chưa khai do core (cổng). Tin `is_self` ghi `processed_at=now()` như cũ (echo của outbox) NHƯNG core vẫn đưa vào đệm qua `outbox.zalo_msg_id` ở pacer (SPEC-P02 §4.3).
- `group_event` lấy từ listener `group_event` (`GroupEvent.type` ∈ `GroupEventType` — `models/GroupEvent.d.ts`): `JOIN`→`join` (`data.updateMembers[].id/dName`), `JOIN_REQUEST`→`join_request` (`data.uids`), `LEAVE`, `REMOVE_MEMBER`, `ADD_ADMIN`, `REMOVE_ADMIN`, `UPDATE_SETTING`, `UPDATE`; loại khác KHÔNG ghi.

### §8.3 Body `outbox` theo `kind`
| kind | body | pacer làm gì |
| :-- | :-- | :-- |
| `text` | `{text, quote?, mentions?, split_of?, part?}` | typing → `sendText(threadId, type, {msg: text, quote (chỉ part 0), mentions})`; tách ≤ `PACER_MAX_CHARS` (giữ `splitRow`); ghi `sent_at`, `zalo_msg_id` |
| `typing` / `seen` | giữ | giữ; `seen` CHỈ cho thread `user` (nhóm không gửi seen) |
| `action` | `OutboxAction` (§6) | gọi đúng một hàm §8.1; kết quả ⇒ `result`, `status='sent'`; lỗi `ZaloApiError` ⇒ `failed` + `result.error` + `audit zalo.action_failed`; mã 166 (`INSUFFICIENT_PERMISSION`) ⇒ thêm `update zalo_groups set bot_is_admin=false`; `approvalId` có ⇒ `completeApproval` (§5.1) |
| `react` | `{react: {icon, msgId, cliMsgId}}` | `addReaction`; thất bại ⇒ `failed` im lặng |
| `image` | — | vẫn `failed('image_unsupported')` (không làm ảnh ở 0.1) |

Thứ tự ưu tiên trong một tick: `action` (không tính ngân sách text nhưng tính `maxPerMinute`) → `text` (pacer tài khoản + nhóm BB-08) → sự kiện. Nhóm: trước `text` gửi `typing` (giữ hành vi). CẤM `seen` nhóm.

### §8.4 Ngân sách & pacer (BB-08) — `PacerConfig` mở rộng
`groupGapMs` (`PACER_GROUP_GAP_MS`, 8000) · `groupJitterMs` (`PACER_GROUP_JITTER_MS`, 3000) · `maxPerMinute` 10 (giữ) · `maxRecipients` 15/10 phút (DM, giữ) · `maxChars` 1800 (giữ) · ngân sách `budget_per_hour` đọc từ `zalo_groups` qua `store.groupBudget(threadId)` mỗi tick (cache 60 s); đếm = `select count(*) from outbox where … kind='text' and status in ('sent','sending') and coalesce(sent_at, created_at) > now - 1h` (đã đo `db-checks` (c)). Hết ngân sách ⇒ hàng `queued` chờ (`note: 'group_budget'`), KHÔNG huỷ; quá `GROUP_TEXT_TTL_MIN` (30) ⇒ `cancelled('budget_expired')` + audit.

### §8.5 Sự kiện hệ thống (`services/system-events.ts`)
```ts
export type SystemEvent =
  | { event: 'ambient_flush'; threadId: string }
  | { event: 'welcome_flush'; threadId: string; uids: string[] }
  | { event: 'unanswered_question'; threadId: string; groupMessageId: number }
  | { event: 'join_request'; threadId: string; uid: string }
  | { event: 'automation'; automationId: string; threadId: string | null }
  | { event: 'approval_executed'; approvalId: string; threadId: string };
export async function enqueueSystemEvent(e: SystemEvent): Promise<number>;   // insert inbound_events sender_uid='system', zalo_msg_id='sys-<uuid>', thread_type theo threadId (nhóm) hoặc 'user' (owner DM)
```

## §9. Bảng lỗi & hành vi caller (`domain/errors.ts` — mỗi lớp `code` = tên lớp; giữ `ConflictError`, `ModelUnavailableError`, `TransportDeadError`, `RateLimitedError`, `InvalidToolInputError`; XOÁ lỗi sàn thợ)

| Lỗi | Khi nào | Caller BẮT BUỘC |
| :-- | :-- | :-- |
| `ConflictError` | chuyển trạng thái `approvals`/`leads`/`join_requests` sai `from` | không retry; đọc lại và trả trạng thái hiện tại |
| `GroupBudgetExceededError` | `send_group_message` khi đã đủ `budget_per_hour` | tool_result `is_error`; agent KHÔNG gọi lại trong lượt; lượt `mustReply` ⇒ host vẫn gửi 1 tin fallback ngắn (đi vào hàng `queued`, pacer giữ tới khi có ngân sách) |
| `ToolNotAllowedError` | tool có trong bảng §7.1 nhưng vai/bề mặt không cho (phòng thủ 2 lớp — bình thường tool đã không nằm trong `tools[]`) | `is_error`; audit `tool.denied`; model tự đổi hướng |
| `ActionNotPermittedError` | `delete_message` khi `!bot_is_admin`/tin của owner-moderator/quá 24 giờ; `warn_member` owner/moderator; `review_join_request` khi policy `manual` | `is_error`; agent giải thích ngắn hoặc dùng `request_member_removal`/`handoff_to_owner` |
| `MessageNotInBufferError` | `msg_id` không có trong đệm nhóm hiện tại | `is_error`; agent không bịa id |
| `UnknownMemberError` | `uid` không phải thành viên còn hiệu lực của nhóm | `is_error` |
| `AmbiguousMentionError` | mention theo tên (chỉ dashboard/owner dùng) khớp ≥2 thành viên | hỏi lại người dùng; không đoán |
| `ApprovalRequiredError` | gọi dịch vụ thi hành kick/block mà `approvals.status != 'approved'` (lỗi lập trình) | KHÔNG bắt để "xử lý tiếp" — là bug |
| `IntentNotConfirmedError` | `decide_approval` thiếu id trong tin của requester | hỏi lại đúng mẫu "duyệt <id>" |
| `LeadIncompleteError` | `submit_lead` khi lead chưa `qualified` | agent hỏi thêm trường còn thiếu (tool trả `missing[]`) |
| `SkillNotFoundError` | `read_skill` tên lạ/tắt | `is_error` |
| `AutomationInvalidError` | lịch không tính được `next_run_at` hoặc `at` ở quá khứ | agent sửa tham số; web 400 |
| `EmbeddingUnavailableError` | provider không có embedding / lỗi mạng sau retry | `knowledge.ts` rơi về lexical + audit `kb.embed_unavailable`; KHÔNG chặn trả lời |
| `ModelUnavailableError` | LLM 429/5xx sau retry + fallback | lượt `mustReply` ⇒ host gửi `MODEL_DOWN_GROUP_REPLY` (một câu, không hotline — cộng đồng không có BQL) + `handoff_to_owner('model_unavailable')`; ambient ⇒ im + audit; DM ⇒ `MODEL_DOWN_DM_REPLY` |
| `ModelDeadlineError` (D31, con của `ModelUnavailableError`) | hết hạn chót lượt / còn < `MODEL_MIN_ATTEMPT_MS` | như `ModelUnavailableError` (`stop='model_down'`) + `TurnState.deadlineHit=true`; KHÔNG thử lại sau hạn (SPEC-D31 §14) |
| `InvalidToolInputError` | input sai schema | `is_error`, không chạy tool (giữ) |
| `TransportDeadError` / `RateLimitedError` | phiên `kicked`/`dead` / Zalo giới hạn (221, không msgId) | giữ hành vi P02 cũ: outbox giữ `queued`, lùi `PACER_BACKOFF_MS` |
| `ZaloActionError` (worker) | `ZaloApiError` khi thi hành `action`; `code` zca-js kèm | outbox `failed` + `result.error`; 166 ⇒ `bot_is_admin=false` + DM owner `NEED_DEPUTY_DM` |
| `ConfigError` | env sai (`readCommunityConfig`, `readPacerConfig`); D28: `LANGSMITH_TRACING`/`LANGCHAIN_TRACING_V2` bật | tiến trình exit 1 khi khởi động |
| `GraphRecursionError` (`@langchain/langgraph`) | (D28) đồ thị vượt `recursionLimit` — chỉ xảy ra khi cạnh/trần vòng sai (trần thiết kế đã > số step tối đa, §12.6) | là BUG: KHÔNG bắt để "thử lại"; `runTurn` ghi `turn_traces outcome='error'` (nếu `trace` chưa chạy) rồi ném tiếp ⇒ `processInbound` audit `inbound.handler_error` (nhóm: không `BUSY_REPLY` — D20) |

## §10. Cấu hình (`services/community-config.ts::readCommunityConfig(env)`; số sai ⇒ `ConfigError`)

| Env | Mặc định | Dùng ở |
| :-- | :-- | :-- |
| `ZALO_ACCOUNTS` | `community` (giá trị khác ⇒ `ConfigError`) | worker |
| `MODEL_COMMUNITY` / `MODEL_TRIAGE` | rỗng ⇒ theo provider (§2.1) | adapter |
| `EMBED_PROVIDER` / `EMBED_MODEL` / `EMBED_DIM` | `gemini` / `gemini-embedding-001` / `1024` | §2.2 |
| `GROUP_BUFFER_MAX` / `GROUP_BUFFER_RETENTION_DAYS` | 200 / 7 | BB-11 |
| `AMBIENT_DEBOUNCE_SEC` / `AMBIENT_CONTEXT_MESSAGES` / `MENTION_CONTEXT_MESSAGES` | 20 / 40 / 25 | SPEC-P03 §4 |
| `UNANSWERED_AFTER_MIN` / `UNANSWERED_MAX_AGE_HOURS` / `UNANSWERED_MAX_PER_TICK` | 10 / 6 / 3 | SPEC-P04 §5 |
| `WELCOME_DEBOUNCE_SEC` / `WELCOME_WINDOW_MIN` | 120 / 15 | SPEC-P05 §7 |
| `MOD_SCAM_MIN` / `MOD_SPAM_MIN` / `MOD_LADDER_HALF_LIFE_HOURS` / `MOD_WARN_PER_HOUR` | 0.85 / 0.75 / 168 / 10 | SPEC-P05 §3–§4 |
| `APPROVAL_TTL_HOURS` / `JOIN_REQUEST_TTL_HOURS` | 24 / 48 | §5 |
| `PACER_GROUP_GAP_MS` / `PACER_GROUP_JITTER_MS` / `GROUP_TEXT_TTL_MIN` | 8000 / 3000 / 30 | §8.4 |
| `PACER_MAX_PER_MINUTE` / `PACER_MAX_CHARS` / `PACER_*` khác | 10 / 1800 / giữ `PACER_DEFAULTS` | worker |
| `TIMER_INTERVAL_MS` | 10000 (giữ tên) | runner |
| `DAILY_REPORT_HOUR` / `WEEKLY_SUMMARY_DOW` / `WEEKLY_SUMMARY_HOUR` | 20 / 0 / 19 (giờ VN) | SPEC-P07 |
| `KB_TOP_K` / `MEMORY_HALF_LIFE_DAYS` | 8 / 30 | SPEC-P04, P06 |
| `LEAD_SCORE_HANDOFF` | 60 | SPEC-P06 |
| `MAX_TOOL_ROUNDS` | 8 (1–20) | SPEC-P03 §6; D28: `TURN_RECURSION_LIMIT = 2 × MAX_TOOL_ROUNDS + 11` tính từ biến này (§12.6), KHÔNG có env riêng |
| `LANGSMITH_TRACING` / `LANGCHAIN_TRACING_V2` | KHÔNG đặt. Giá trị `true`/`1` (không phân biệt hoa thường) ⇒ `ConfigError` | D28, BB-17 |
| `DM_HISTORY_TURNS` / `MESSAGES_RETENTION_DAYS` | 5 (1–20) / 30 (≥ 1) | D22: SPEC-P03 §5.1, SPEC-P07 §2 bước 8 |
| `HUMAN_TAKEOVER_MIN` / `TRIAGE_TIMEOUT_MS` / `DATA_MODE` / `TRANSPORT` | 60 / 4000 / `sim` / `sim` (giữ) | D31: triage chỉ còn chạy cho tin KHÔNG gọi bot (SPEC-D31 T3) — giữ 4000 vì không nằm trên đường trả lời |
| (D31) `MODEL_COMMUNITY_FAST` | rỗng ⇒ theo provider (gemini `gemini-3.5-flash-lite`; §2.1) | model lượt tương tác (`group_mention`, `dm`, `owner_dm`) |
| (D31) `MODEL_MAX_OUTPUT_TOKENS` | 1024 (256–16000) | route `community` |
| (D31) `MODEL_CALL_TIMEOUT_MS` / `MODEL_MIN_ATTEMPT_MS` | 30000 (1000–120000) / 800 (200–5000) | §2.1 |
| (D31) `LANE_FAST_DEADLINE_MS` / `LANE_RAG_DEADLINE_MS` / `TURN_BACKGROUND_DEADLINE_MS` | 3500 (1000–4500) / 12500 (5000–14500) / 30000 (10000–120000); BẮT BUỘC fast < rag | BB-18 — trần trên chừa ≥ 500 ms cho pacer + gửi trong SLO 5 s / 15 s |
| (D31) `TOOL_MIN_MS` / `EMBED_TIMEOUT_MS` | 300 (0–5000) / 1500 (200–10000) | node `tools`, §2.2 |
| (D31) `RUNNER_CONCURRENCY` / `RUNNER_POLL_MS` / `RUNNER_DRAIN_MS` | 4 (1–8) / 200 (50–5000) / 30000 (0–120000) | BB-19, SPEC-D31 §6 |
| (D32) `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_STALE_MS` / `TURN_STUCK_MS` | 5000 (1000–60000) / 60000 (≥ 3 × interval) / 120000 (≥ 10000) | SPEC-D31 §9, §10.2 |
| (D32) `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | rỗng ⇒ báo động TẮT + audit `alert.disabled` (KHÔNG `ConfigError`) | BB-20 |
| (D32) `ALERT_REPEAT_MIN` / `ALERT_MAX_PER_HOUR` / `ALERT_TIMEOUT_MS` / `ALERT_MODEL_ERRORS` / `OPS_WATCH_INTERVAL_MS` | 30 (5–1440) / 20 (1–200) / 5000 (1000–15000) / 5 (1–100) / 60000 (10000–600000) | SPEC-D31 §10 |
| (D32) `TRACE_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS` | 180 (≥ 7) / 365 (≥ 30) | SPEC-D31 §11 |

Worker (`readPacerConfig`, D31): `PACER_TICK_MS` mặc định 1000 ⇒ **250**; MỚI `PACER_TYPING_FRESH_MS` 8000 (0–30000; 0 = luôn typing trước text như cũ). Worker đọc thêm `HEARTBEAT_*`, `TELEGRAM_*`, `ALERT_*`, `OPS_WATCH_INTERVAL_MS` cùng giới hạn trên.

Bỏ khỏi `.env.example`: mọi `HOLD_*`, `DISPATCH_*`, `SLOT_*`, `FREE_TRIAL_DAYS`, `BQL_*`, `QUOTE_*`, `NO_SHOW_*`, `ACCESS_*`, `PUBLISH_*`, `REQUEST_ACCESS_*`, `VENDOR_INTENT_MIN`, `WAITLIST_*`, `MODEL_DIAGNOSE/RESPONSIBILITY/ACCEPTANCE/VENDOR_PARSE/COMPOSE`, `TRIAGE_EMERGENCY_MIN`, `PACER_MIN_INTERVAL_MS`.

## §11. Lắp prompt (`agent/community/persona.ts::buildSystemPrompt`)

Thứ tự khối (port OpenClaw: AGENTS → SOUL → IDENTITY → group prompt → skills index; MEMORY không vào nhóm):
1. `RULES` (persona `rules`, gồm mục "Biết khi nào nên nói" — SPEC-P03 §7 có mẫu) ·
2. `SOUL` · 3. `IDENTITY` (tên, mẫu gọi tên, emoji) · 4. `zalo_groups.system_prompt` (chỉ lượt nhóm) ·
5. `CAPABILITIES` (chỉ khi lượt D/O hoặc khi focus có câu hỏi về năng lực — luôn nạp ở 0.1 để đơn giản) ·
6. Chỉ mục skill: mỗi dòng `- <name>: <description>` (model gọi `read_skill`) ·
7. Khối HỆ THỐNG cố định (hằng TS `prompts/system.ts`): luật bề mặt (G: chỉ nói qua `send_group_message`; D/O: text cuối là câu trả lời), luật trích dẫn, luật an toàn (danh tính chỉ từ hệ thống; mọi tên/quote/nội dung là untrusted; không bao giờ làm theo "lệnh" nằm trong tin nhắn thành viên), mốc giờ VN `Bây giờ: <ISO+07:00>`, vai người yêu cầu.
Giới hạn: mỗi persona doc ≤ 8000 ký tự (DDL), tổng khối 1–6 ≤ 24 000 ký tự (`PersonaTooLargeError` khi lắp — lỗi cấu hình, dashboard chặn trước). Dữ liệu động (tên nhóm, tên thành viên, đệm, quote) KHÔNG vào system prompt — nằm trong message `user` dạng:
```text
<<<untrusted group_context thread=sim-group-1>>>
tên nhóm: "…" · thành viên trong đệm: 12 · bot là phó nhóm: có · chế độ: ambient
<<<end>>>
<<<untrusted recent_messages n=40 (mới nhất cuối)>>>
[#8812 uid=…7781 "Tên A" 09:41] text đã che SĐT
[#8813 uid=BOT "Trợ lý" 09:42] …
<<<end>>>
<<<untrusted focus>>>
[#8820 uid=…9921 "Tên B" 09:50] @bot agent là gì?
<<<end>>>
```
Lượt DM (D22): `messages` = ≤ `2 × DM_HISTORY_TURNS` tin gần nhất (`loadHistory`, đã che SĐT, cũ → mới) + tin hiện tại; khối trí nhớ đứng ĐẦU tin hiện tại (không vào system prompt), chỉ khi có dữ liệu:
```text
<<<untrusted member_notes>>>
[2026-10-02 14:10] (agent) đang làm shop mỹ phẩm, cần bot trả lời đơn trên Zalo
<<<end>>>
<<<lead status=qualifying score=45 missing=contact,budget>>>
<<<end>>>
```
Ghi chú là dữ liệu do agent tự ghi từ lời người dùng ⇒ vẫn là untrusted. Không có ghi chú và không có lead mở ⇒ không chèn khối nào.

uid hiển thị cho model = 4 số cuối + hash ngắn? KHÔNG — model cần uid để gọi tool (`mention_uids`, `warn_member`): hiển thị uid ĐẦY ĐỦ, tên trong ngoặc kép, mọi ký tự `<`/`>` trong tên/text được thay bằng `‹`/`›` để không phá khung.

## §12. Đồ thị LangGraph (D28) — `agent/community/graph/*`

> Hình đồ thị = [00-ARCH §4](00-ARCHITECTURE.md) (chờ người dùng duyệt — chặn P03). Hành vi từng node: [SPEC-P03 §2, §6](SPEC-P03-Runtime-Agent.md). Số đo: `evidence/ARCH-D28/{versions,spike}.txt` (spike ngoài repo, Node 22.20.0, model giả, 0 mạng).

### §12.1 Phụ thuộc — PIN CHÍNH XÁC (đo 2026-10-16; mọi gói trong cây cài ≥ 14 ngày, `too_new=0`)
| Chỗ | Khai | Ghi chú |
| :-- | :-- | :-- |
| `packages/core/package.json` `dependencies` | `"@langchain/langgraph": "1.4.18"`, `"@langchain/core": "1.2.14"` | `@langchain/core` là peer bắt buộc của langgraph; mã repo KHÔNG import trực tiếp từ nó |
| root `package.json` `overrides` | `{"@langchain/langgraph-checkpoint": "1.1.5", "@langchain/langgraph-sdk": {".": "1.12.0", "p-queue": "9.3.3"}, "langsmith": "0.10.7", "zod": "4.6.5"}` | không override ⇒ npm kéo bản < 14 ngày (đo: checkpoint 1.2.0, sdk 1.12.4, langsmith 0.11.0, p-queue 9.3.5); `@babel/runtime` trong lock repo đã là 7.29.7 |
| KHÔNG cài | `@langchain/langgraph-checkpoint-postgres`, mọi `@langchain/<provider>` | BB-03, BB-17 |

Xong khi (P03): `npm ls @langchain/langgraph @langchain/core @langchain/langgraph-checkpoint @langchain/langgraph-sdk langsmith zod` in đúng bảng trên, exit 0. Import được phép: `Annotation`, `StateGraph`, `START`, `END`, `GraphRecursionError` từ `@langchain/langgraph` — KHÔNG gì khác (BB-15/BB-17 quét).

### §12.2 State (`graph/state.ts` — kiểu TS CHÍNH XÁC)
```ts
import { Annotation } from '@langchain/langgraph';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

const last = <T>(_prev: T, next: T): T => next;
const keep = <T>(init: () => T) => Annotation<T>({ reducer: last, default: init });

export type PipelineStop = 'group_unknown' | 'group_disabled' | 'self' | 'deleted' | 'not_admitted' | 'ambient_deferred'
  | 'group_event_done' | 'system_no_turn' | 'forged_system_event' | 'takeover' | 'unsupported';

export interface GroupRow {                                // một dòng zalo_groups (§4 008), tên camelCase
  threadId: string; name: string | null; enabled: boolean; mode: GroupMode; joinPolicy: JoinPolicy; welcomeEnabled: boolean;
  moderationEnabled: boolean; budgetPerHour: number; ambientTurnsPerHour: number; systemPrompt: string | null;
  allowUsers: string[]; denyUsers: string[]; botIsAdmin: boolean;
}
// ToolName = (typeof TOOL_NAMES)[number] — policy.ts (SPEC-P03 §8)

export interface TurnRequest {
  kind: TurnKind; account: AccountId; threadId: string; threadType: 'user' | 'group';
  requester: { uid: string; role: Role } | null;          // null: ambient_flush · unanswered · welcome · join_review · automation
  trigger: GroupTrigger | null;
  mustReply: boolean;                                      // NHÓM: bắt buộc có tin ra (BB-05). DM luôn false — DM có luật riêng (§12.5 D5–D7)
  focusMessageIds: number[];                               // group_messages.id; ambient_flush: [] (prepare đọc id > last_seen_message_id)
  dm?: { conversationId: string; latestText: string; latestMessageId: number };
  joinedUids?: string[]; joinRequest?: { uid: string }; automation?: { automationId: string };
  triage: CommunityTriage | null;                          // node `turn` gộp từ PipelineState.triageResult (D35.12)
  // D31 (SPEC-D31 §5.1): node `turn` điền từ event/state
  inboundEventId: number; receivedAt: number; claimedAt: number;   // epoch ms; receivedAt = inbound_events.received_at (mốc SLO)
  triageMs: number | null;                                 // null khi triage không chạy (tin gọi bot — T3)
}
export interface TurnResult { turnId: string; outcome: TurnOutcome; delivery: Delivery | null; rounds: number; answered: number; hostPosted: number }

export const PipelineState = Annotation.Root({
  event: Annotation<InboundEvent>,                         // vào; KHÔNG node nào ghi lại
  group: keep<GroupRow | null>(() => null),                // zalo_groups của thread (ingest/system_event)
  sender: keep<{ uid: string; role: Role } | null>(() => null),
  row: keep<GroupMessageRow | null>(() => null),           // tin vừa đệm
  triageResult: keep<CommunityTriage | null>(() => null),  // D35.12: LangGraph cấm kênh trùng tên node `triage`
  moderation: keep<{ verdict: string; action: string; exempt: boolean } | null>(() => null),
  gateDecision: keep<GateDecision | null>(() => null),     // D35.12: LangGraph cấm kênh trùng tên node `gate`
  turnRequest: keep<TurnRequest | null>(() => null),
  turnResult: keep<TurnResult | null>(() => null),
  stop: keep<PipelineStop | null>(() => null),             // vì sao pipeline dừng không có lượt (test/log)
  triageMs: keep<number | null>(() => null),               // D31: node triage ghi (null = không gọi)
});

export type StopKind = 'tool_use' | 'end_turn' | 'max_tokens' | 'refusal' | 'model_down';
export type Delivery = 'none' | 'auto_post' | 'fallback' | 'model_down' | 'dm_reply' | 'dm_empty' | 'join_default' | 'persona_invalid';
export type TurnOutcome = 'replied' | 'silent' | 'auto_posted' | 'fallback' | 'model_down' | 'refusal' | 'error';   // = CHECK turn_traces.outcome (§4 009)

export const TurnState = Annotation.Root({
  request: Annotation<TurnRequest>,                        // vào; bất biến
  turnId: keep<string>(() => ''),                          // randomUUID() ở prepare = turn_traces.id = agent_runs.turn_id
  startedAt: keep<number>(() => 0),
  ctx: keep<ToolContext | null>(() => null),               // GroupTurnContext | DmTurnContext (§6) — bất biến sau prepare
  personaVersions: keep<PersonaBundle['versions'] | null>(() => null),
  system: keep<string>(() => ''),
  toolNames: keep<ToolName[]>(() => []),                   // = toolsFor(kind, role) — model chỉ thấy các tool này
  messages: Annotation<MessageParam[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),   // KHÔNG MessagesAnnotation
  rounds: keep<number>(() => 0),                           // số lần node tools đã chạy
  roundCap: keep<number>(() => 0),                         // MAX_TOOL_ROUNDS; sau nudge = rounds + NUDGE_ROUNDS (2)
  toolsCalled: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  answered: keep<number>(() => 0),                         // số lần tool có cờ `answers` chạy THÀNH CÔNG
  stop: keep<StopKind | null>(() => null),
  finalText: keep<string>(() => ''),                       // text của message assistant cuối KHÔNG có tool_use
  nudged: keep<boolean>(() => false),
  prepError: keep<'persona_invalid' | null>(() => null),
  delivery: keep<Delivery | null>(() => null),
  hostPosted: keep<number>(() => 0),                       // số tin host tự gửi trong deliver (0|1)
  outcome: keep<TurnOutcome | null>(() => null),
  // D31 (BB-18, SPEC-D31 §5): prepare đặt; tools có thể nâng fast ⇒ rag; agent/tools cộng thời gian
  lane: keep<Lane>(() => 'fast'),
  deadlineAt: keep<number>(() => 0),
  modelMs: keep<number>(() => 0),
  toolMs: keep<number>(() => 0),
  deadlineHit: keep<boolean>(() => false),
});
export type Lane = 'fast' | 'rag' | 'background';
export type PipelineStateT = typeof PipelineState.State;
export type TurnStateT = typeof TurnState.State;
export type NodeFn<S> = (s: S) => Promise<Partial<S>>;   // mọi node: nhận state, trả PHẦN cập nhật; KHÔNG trả Command
```
`AgentTool` (tool-kit.ts) thêm `readonly answers?: true` — tool tính là "đã trả lời lượt": `send_group_message`, `invite_to_private`, `review_join_request`. Không tool nào khác có cờ.
D31: thêm `readonly extendsDeadline?: true` — tool truy hồi nâng làn `fast ⇒ rag`: `search_knowledge`, `search_memory`, `recall_group_history`, `read_skill`. `GroupTurnContext`/`DmTurnContext` (§6) thêm `readonly inboundEventId: number` và `readonly deadlineAt: number` (tool truyền xuống `enqueue`/`embedTexts`).

### §12.3 Node — chữ ký và tác dụng phụ (HỢP ĐỒNG BB-15)
Mỗi node một file `graph/nodes/<tên>.ts`, export `<tênCamel>Node: NodeFn<…>`; node mỏng — gọi hàm nghiệp vụ có sẵn (cột "Gọi").

| Node | Đồ thị | Gọi | Ghi state | Ghi DB | outbox | model |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `ingest` | pipeline | `buffer.ts::ingestGroupMessage`, `roles.ts::resolveRole` | `group, sender, row, stop∈{group_unknown, group_disabled, self}` | `group_members`, `group_messages` (insert, cắt, `answered_at`), audit `group.denied` | ✗ | ✗ |
| `triage` | pipeline | `isAddressedToBot` (THUẦN; namePatterns từ `loadPersonaBundle` cache, lỗi ⇒ `[]`) + `needsTriage` (THUẦN) ⇒ `triage.ts::triageCommunityMessage` (D31: tin gọi bot KHÔNG gọi) | `triage` (null khi không cần/quá hạn), `triageMs` | nhóm: `group_messages.is_question`; DM: `messages.content.triage` | ✗ | `callTriageModel` |
| `moderate` | pipeline | `moderation.ts::moderateGroupMessage` + `applyLadderAction` (SPEC-P05) | `moderation`, `stop='deleted'` | `moderation_events/scores`, `group_messages.deleted_at`, `approvals`, audit | ✓ | ✗ |
| `gate` | pipeline | `persona.ts::loadPersonaBundle` (namePatterns, cache 60 s) + `decideGroupInbound` (THUẦN) | `gateDecision`, `turnRequest` (khi admitted ∧ trigger ≠ ambient), `stop='not_admitted'` | ✗ (chỉ đọc) | ✗ | ✗ |
| `defer` | pipeline | `sessions.ts::markAmbientPending` | `stop='ambient_deferred'` | `group_sessions.pending_since` | ✗ | ✗ |
| `group_event` | pipeline | `join-requests.ts`, `welcome.ts`, đồng bộ admin (SPEC-P05 §6–§7) | `stop='group_event_done'` | `group_members`, `join_requests`, `approvals`, `group_sessions.welcome_pending_since`, audit | ✓ | ✗ |
| `system_event` | pipeline | kiểm `zaloMsgId LIKE 'sys-%'` ∧ `payload.kind='system'`; bảng SPEC-P03 §4.3 | `group`, `turnRequest` hoặc `stop∈{system_no_turn, forged_system_event}` | audit `router.forged_system_event` | ✓ (chỉ `APPROVAL_RESULT_DM`) | ✗ |
| `dm_intake` | pipeline | `resolveRole`, `sessions.ts` (conversation, `saveMessage`) | `sender, turnRequest, stop∈{takeover, unsupported}` | `conversations`, `messages` | ✓ (chỉ `TEXT_ONLY_REPLY`) | ✗ |
| `turn` | pipeline | `runTurn({...s.turnRequest, triage: s.triage, inboundEventId, receivedAt, claimedAt, triageMs})` (D31) | `turnResult` | (qua turnGraph) | (qua turnGraph) | (qua turnGraph) |
| `prepare` | turn | (D31) `enqueue` `typing` NGAY đầu node nếu `isInteractive(kind)`; `initialDeadline`; `loadPersonaBundle`, `buildSystemPrompt` (§11), `toolsFor`, đọc đệm/lịch sử DM/`loadMemberContext` | `turnId, startedAt, ctx, personaVersions, system, toolNames, messages[0], roundCap, prepError, lane, deadlineAt` | `group_sessions` (đánh dấu TRƯỚC model — SPEC-P03 §4.2), `conversations` (D35.12) | ✓ CHỈ `typing` (D31) | ✗ |
| `agent` | turn | `callModel({route:'community', system, messages, tools, conversationId, turnId, tier, deadlineAt})` (D31: `tier='fast'` khi tương tác) | `messages(+assistant), stop, finalText, modelMs, deadlineHit` | `agent_runs` (adapter ghi) | ✗ | `callModel` |
| `tools` | turn | mỗi `tool_use` theo thứ tự: (D31) còn < `TOOL_MIN_MS` tới `deadlineAt` ⇒ `is_error DeadlineExceeded` không chạy; `assertValidToolInput` ⇒ `assertToolAllowed` ⇒ `tool.run(ctx, input)`; `escalateLane` | `messages(+1 user chứa MỌI tool_result), rounds+1, toolsCalled, answered, lane, deadlineAt, toolMs` | theo tool | ✓ (qua tool) | ✗ (embedding của `search_knowledge` qua `embedTexts` được phép) |
| `nudge` | turn | — | `messages(+NUDGE_TEXT), nudged=true, roundCap=rounds+2` | ✗ | ✗ | ✗ |
| `deliver` | turn | `decideDelivery` + `hostText` (THUẦN), `postGroupText` (dùng chung với `send_group_message`), `handoffToOwner`, `enqueue` DM | `delivery, outcome, hostPosted` | `messages` (assistant / `private:true`), `join_requests`, audit | ✓ | ✗ |
| `trace` | turn | `services/turn-traces.ts::recordTurn` (không bao giờ ném — lỗi ⇒ audit `trace.error`) | — | `turn_traces` (1 dòng) | ✗ | ✗ |

### §12.4 Hình đồ thị — hằng `graph/shape.ts` (BB-16; `[nguồn, đích, có điều kiện]`; `__start__`/`__end__` là tên LangGraph)
```ts
export const PIPELINE_SHAPE = {
  nodes: ['ingest', 'triage', 'moderate', 'gate', 'defer', 'group_event', 'system_event', 'dm_intake', 'turn'],
  edges: [
    ['__start__', 'ingest', true], ['__start__', 'group_event', true], ['__start__', 'system_event', true], ['__start__', 'dm_intake', true], // routeEvent
    ['ingest', 'triage', true], ['ingest', '__end__', true],                                   // afterIngest
    ['dm_intake', 'triage', true], ['dm_intake', '__end__', true],                             // afterDmIntake
    ['triage', 'moderate', true], ['triage', 'turn', true],                                    // afterTriage
    ['moderate', 'gate', true], ['moderate', '__end__', true],                                 // afterModerate
    ['gate', 'turn', true], ['gate', 'defer', true], ['gate', '__end__', true],                // afterGate
    ['system_event', 'turn', true], ['system_event', '__end__', true],                         // afterSystemEvent
    ['group_event', '__end__', false], ['defer', '__end__', false], ['turn', '__end__', false],
  ],
} as const;
export const TURN_SHAPE = {
  nodes: ['prepare', 'agent', 'tools', 'nudge', 'deliver', 'trace'],
  edges: [
    ['__start__', 'prepare', false],
    ['prepare', 'agent', true], ['prepare', 'deliver', true],                                  // afterPrepare
    ['agent', 'tools', true], ['agent', 'nudge', true], ['agent', 'deliver', true],            // afterAgent
    ['tools', 'agent', false], ['nudge', 'agent', false], ['deliver', 'trace', false], ['trace', '__end__', false],
  ],
} as const;
```
Hàm cạnh (`graph/edges.ts`, THUẦN — chữ ký chính xác; `END` = `'__end__'`):
```ts
export function routeEvent(s: PipelineStateT): 'ingest' | 'group_event' | 'system_event' | 'dm_intake';
  // senderUid==='system' ⇒ system_event · threadType==='group' ⇒ (payload.kind==='group_event' ? group_event : ingest) · còn lại ⇒ dm_intake
export function afterIngest(s: PipelineStateT): 'triage' | typeof END;          // s.stop !== null ⇒ END
export function afterDmIntake(s: PipelineStateT): 'triage' | typeof END;        // s.stop !== null ⇒ END
export function afterTriage(s: PipelineStateT): 'moderate' | 'turn';            // threadType==='group' ⇒ moderate
export function afterModerate(s: PipelineStateT): 'gate' | typeof END;          // s.stop === 'deleted' ⇒ END
export function afterGate(s: PipelineStateT): 'turn' | 'defer' | typeof END;   // !admitted ⇒ END · trigger==='ambient' ⇒ defer · còn lại ⇒ turn
export function afterSystemEvent(s: PipelineStateT): 'turn' | typeof END;       // turnRequest !== null ⇒ turn
export function needsTriage(i: { threadType: 'user' | 'group'; msgType: string; text: string; group: { moderationEnabled: boolean; mode: GroupMode } | null; addressed: boolean }): boolean;
  // D31: ¬addressed ∧ msgType==='webchat' ∧ text.trim()!=='' ∧ (group.moderationEnabled ∨ group.mode==='ambient')   (DM luôn addressed ⇒ false)
export function isAddressedToBot(i: { threadType: 'user' | 'group'; mentions: ReadonlyArray<{ uid: string }>; quoteOwnerUid: string | null; botUid: string;
  text: string; botNamePatterns: readonly RegExp[]; hasControlCommand: boolean; role: Role }): boolean;
  // D31: threadType==='user' ∨ mention botUid ∨ quoteOwnerUid===botUid ∨ namePattern khớp ∨ (hasControlCommand ∧ role ∈ {owner, moderator}) — = gate dòng 7–10
export function isInteractive(kind: TurnKind): boolean;                          // D31: kind ∈ {group_mention, dm, owner_dm}
export function initialDeadline(req: TurnRequest, startedAt: number, cfg: LaneConfig): { lane: Lane; deadlineAt: number };
  // tương tác ⇒ {fast, req.receivedAt + cfg.fastMs} · khác ⇒ {background, startedAt + cfg.backgroundMs}
export function escalateLane(t: TurnStateT, ranToolNames: readonly string[], cfg: LaneConfig): { lane: Lane; deadlineAt: number } | null;
  // lane==='fast' ∧ có tool extendsDeadline ⇒ {rag, request.receivedAt + cfg.ragMs}; khác ⇒ null
export interface LaneConfig { fastMs: number; ragMs: number; backgroundMs: number }
export function afterPrepare(t: TurnStateT): 'agent' | 'deliver';              // prepError !== null ⇒ deliver
export function isCapped(t: TurnStateT): boolean;                               // stop==='tool_use' ∧ rounds >= roundCap
export function needsNudge(t: TurnStateT): boolean;
  // kind ∈ {group_mention, group_welcome} ∧ mustReply ∧ answered===0 ∧ finalText==='' ∧ !nudged ∧ stop ∈ {end_turn, max_tokens}
export function afterAgent(t: TurnStateT): 'tools' | 'nudge' | 'deliver';       // tool_use ∧ rounds<roundCap ⇒ tools · needsNudge ⇒ nudge · còn lại ⇒ deliver
export function decideDelivery(t: TurnStateT): { delivery: Delivery; outcome: TurnOutcome };   // bảng §12.5
export function hostText(req: TurnRequest, reason: 'fallback' | 'model_down', v: { names: readonly string[]; groupName: string | null; botName: string }): string;
```

### §12.5 `decideDelivery` — bảng (xét theo thứ tự, dừng ở dòng đầu khớp; `capped = isCapped(t)`; DM = `kind ∈ {dm, owner_dm}`)
| # | Điều kiện | `delivery` | `outcome` |
| :-- | :-- | :-- | :-- |
| D1 | `prepError === 'persona_invalid'` | `persona_invalid` | `error` |
| D2 | `kind = group_join_review ∧ answered > 0` | `none` | `replied` |
| D3 | `kind = group_join_review` (model im/sập/refusal/chạm trần) | `join_default` (Q9: CHO VÀO) | `model_down` nếu `stop=model_down`, `refusal` nếu `stop=refusal`, còn lại `fallback` |
| D8 | `¬DM ∧ answered > 0` — (D35.1) xét NGAY SAU D3, trước D4 | `none` | `replied` |
| D4 | `stop = model_down` | `model_down` | `model_down` |
| D5 | DM ∧ `stop = refusal` | `dm_empty` | `refusal` |
| D6 | DM ∧ `finalText ≠ ''` ∧ `!capped` | `dm_reply` | `replied` |
| D7 | DM (rỗng / chạm trần) | `dm_empty` | `fallback` |
| D9 | `!mustReply` | `none` | `silent` |
| D10 | `stop = refusal` | `fallback` | `refusal` |
| D11 | `finalText ≠ ''` ∧ `!capped` | `auto_post` | `auto_posted` |
| D12 | còn lại (rỗng sau nudge · chạm trần) | `fallback` | `fallback` |

`hostText(req, reason, v)`: `kind = group_welcome` ⇒ `WELCOME_TEMPLATE(v.names, v.groupName, v.botName)` (cả hai lý do) · `trigger = owner_command ∧ reason = model_down` ⇒ `COMMANDS_HELP` · `reason = model_down` ⇒ `MODEL_DOWN_GROUP_REPLY` · còn lại ⇒ `FALLBACK_GROUP_REPLY`. Mọi câu là hằng TS trong `prompts/system.ts`.

### §12.6 Chạy đồ thị (`pipeline.ts`, `turn.ts`)
```ts
export const PIPELINE_RECURSION_LIMIT = 10;            // đường dài nhất 5 step: ingest→triage→moderate→gate→turn
export function turnRecursionLimit(maxToolRounds: number): number;   // = 2 × maxToolRounds + 11 (spike J: xấu nhất 2M+10 step; limit = đúng số step VẪN ném)
export const NUDGE_ROUNDS = 2;
export function buildPipelineGraph(): StateGraph<…>;   // không mở DB khi build; addConditionalEdges LUÔN kèm mảng đích
export function buildTurnGraph(): StateGraph<…>;
export const pipelineGraph: ReturnType<…['compile']>;  // compile() KHÔNG truyền checkpointer/store (BB-17); compile 1 lần khi nạp module
export const turnGraph: ReturnType<…['compile']>;
export async function runPipeline(e: InboundEvent): Promise<PipelineStateT>;   // pipelineGraph.invoke({ event: e }, { recursionLimit: PIPELINE_RECURSION_LIMIT })
export async function runTurn(req: TurnRequest): Promise<TurnResult>;
  // turnGraph.stream({ request: req }, { streamMode: ['values', 'updates'], recursionLimit: turnRecursionLimit(cfg.maxToolRounds) })
  // giữ state 'values' cuối + danh sách node đã chạy ('updates'). Ngoại lệ: nếu 'trace' CHƯA chạy ⇒ recordTurn({...lastValues, outcome: 'error'})
  // rồi NÉM LẠI (processInbound audit inbound.handler_error; nhóm không BUSY_REPLY — D20). 'trace' đã chạy ⇒ chỉ ném lại (không ghi lần 2).
```
`routeInboundEvent(e)` (router.ts) = `await runPipeline(e)` — giữ tên để `inbound-runner.ts`, `processInbound`, golden không đổi.

### §12.7 Checkpoint — KHÔNG (BB-17)
Không checkpointer, không Store, không `thread_id` LangGraph. Lý do đo được ở 00-ARCH §7 (bảng tự tạo ngoài migration, nội dung tin lưu nguyên văn, lịch sử tích luỹ theo `thread_id`, 16 checkpoint cho 2 lượt). Bền vững đã có: `inbound_events.processed_at` (nhận-trước-xử-lý-sau, tối đa 1 lần), `group_sessions` (cửa sổ ambient), `messages` (≤ 10 tin DM — D22), `approvals` (chờ người), `turn_traces`. Tiến trình chết giữa lượt ⇒ lượt đó mất, không chạy lại (giống trước D28).
**Ngữ cảnh có trần (D22, BB-13) độc lập với checkpoint:** `TurnState.messages` LUÔN bắt đầu rỗng; `prepare` là nơi DUY NHẤT nạp lịch sử (≤ `2 × DM_HISTORY_TURNS` tin DM; nhóm 25/40 tin đệm); KHÔNG nén, KHÔNG tóm tắt bằng model. Nếu một D sau này cho phép checkpointer (vd treo đồ thị chờ người), nó CHỈ được lưu trạng thái điều khiển (`rounds`, `delivery`…), KHÔNG được dùng `thread_id` để nối `messages` giữa các lượt — spike đã đo cách đó làm lịch sử phình 4 ⇒ 8 messages sau 2 lượt.

### §12.8 `turn_traces` (D24) từ `TurnState`
`id = turnId` · `zalo_account_id = request.account` · `conversation_id = ctx.conversationId` · `thread_id`, `thread_type` từ request · `kind` · `trigger` · `requester_role = request.requester?.role ?? null` · `rounds` · `tools = toolsCalled` · `sent = answered + hostPosted` · `outcome` · `input_tokens/output_tokens = sum(agent_runs where turn_id = id)` · `latency_ms = now − startedAt` · `persona_versions = personaVersions ?? {}` · (D31, cột 010) `inbound_event_id = request.inboundEventId` · `received_at = request.receivedAt` · `lane` · `queued_ms = claimedAt − receivedAt` · `pre_turn_ms = startedAt − claimedAt` · `triage_ms = request.triageMs` · `model_ms = modelMs` · `tool_ms = toolMs` · `deadline_hit = deadlineHit`. KHÔNG cột nào chứa `messages`/`finalText`/`system`.
