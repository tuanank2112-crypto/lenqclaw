# 01 — CONTRACTS · Sàn việc thợ MVP

> Đọc sau `00-ARCHITECTURE.md`. Mọi type/DDL/API phải khớp file này. Đổi hợp đồng ⇒ sửa file này trước, ghi Đ mới vào `plan.md`.

## §1. Layout repo

```text
apps/web/                 Next.js 15 (App Router) — dashboard BQL + màn chat giả lập /dev/sim (Đ13)
apps/zalo-worker/         Node 22 — tiến trình dài hạn, zca-js, KHÔNG có logic nghiệp vụ
packages/core/src/
  adapters/db.ts          nơi DUY NHẤT mở kết nối Postgres (driver `pg`)
  adapters/model.ts       nơi DUY NHẤT gọi LLM (@anthropic-ai/sdk)
  adapters/transport.ts   nơi DUY NHẤT nói với zca-js (qua worker) — xem §8
  pipeline/               step0-ingest … step8-close-case (mỗi bước pipeline v0.2 một file)
  agent/                  resident-agent.ts, vendor-agent.ts, tools/*.ts, prompts/*.ts (hằng TS, không .md — R03),
                          triage.ts, vendor-triage.ts, vendor-intent.ts, consent.ts, conversation.ts, vendor-tool-context.ts (Đ27)
  services/               job-state.ts, audit.ts (P01) · dispatch.ts, access.ts, slots.ts, timers.ts, system-events.ts,
                          vendor-messages.ts, pii-gate.ts, vn-time.ts, dispatch-config.ts (P05 — Đ27, SPEC-P05 §10) · pricing.ts, scoring.ts (P06)
  retrieval/              port từ build phase (§8 của 00-ARCHITECTURE)
db/migrations/NNN_*.sql   đánh số tăng dần, có bảng schema_migrations
scripts/                  check_adapter_boundary.mjs, check_agent_tools.mjs, eval_golden.mjs, sim_claims.mjs
evals/golden/             diagnosis.jsonl, responsibility.jsonl, emergency.jsonl, consent.jsonl, pii_probe.jsonl, vendor_intent.jsonl (Đ27)
```

npm workspaces; `packages/core` export ESM; TypeScript `strict: true`.

## §2. Adapter

```ts
// adapters/db.ts
export function sql<T>(text: string, params?: unknown[]): Promise<T[]>;
export function tx<T>(fn: (q: typeof sql) => Promise<T>): Promise<T>;

// adapters/model.ts
export interface ModelCall { route: 'diagnose' | 'responsibility' | 'acceptance' | 'vendor_parse' | 'compose' | 'triage'; // 'triage': Đ21, SPEC-P03 §11.10 · 'vendor_parse': vòng chính agent thợ (Đ27, SPEC-P05 §10.5.3; env MODEL_VENDOR_PARSE)
  system: string; messages: MessageParam[]; tools?: Tool[]; images?: ImageRef[]; }
export function callModel(c: ModelCall): Promise<{ message: Message; usage: Usage; model: string }>;
// model mặc định: env MODEL_DEFAULT (mặc định 'claude-opus-5'); override theo route: MODEL_<ROUTE>.
// BẮT BUỘC: prompt caching cho system + tools; ghi usage vào agent_runs.
```

## §3. Danh tính & vai

| `party_type` | Nguồn | Nói qua tài khoản |
| :-- | :-- | :-- |
| `resident` | tự đăng ký qua chat + BQL duyệt (SPEC-P04 §2) | `bql` |
| `vendor` | tự đăng ký qua chat + BQL duyệt | `market` |
| `staff` (`bql_admin`/`bql_staff`/`guard`) | tạo trên web | web; tin Zalo từ chính tài khoản `bql` (tự gửi tay) ⇒ nhường người thật |
| `unknown` | chưa có trong `zalo_identities` | được hỏi đăng ký, không được tạo cuốc |

UID Zalo **khác nhau theo tài khoản nhìn** ⇒ khoá danh tính là `(zalo_account_id, zalo_uid)`.

## §4. DDL (Postgres 16)

```sql
create extension if not exists vector; create extension if not exists unaccent;
create table organizations (id uuid primary key default gen_random_uuid(), name text not null);
create table buildings (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations, code text not null, name text not null, unique(org_id, code));
create table apartments (id uuid primary key default gen_random_uuid(), building_id uuid not null references buildings, code text not null, floor int, unique(building_id, code));

create table residents (id uuid primary key default gen_random_uuid(), full_name text, phone text,
  status text not null check (status in ('pending','active','blocked')) default 'pending', consent_at timestamptz, created_at timestamptz default now());
create table resident_apartments (resident_id uuid references residents, apartment_id uuid references apartments,
  role text not null check (role in ('owner','tenant','member')), primary key(resident_id, apartment_id));

create table vendors (id uuid primary key default gen_random_uuid(), full_name text not null, phone text not null,
  id_doc_ref text,                      -- đường dẫn ảnh CCCD đã mã hoá, không lưu số CCCD dạng chữ
  status text not null check (status in ('pending','active','suspended')) default 'pending',
  approved_by uuid, approved_at timestamptz, created_at timestamptz default now());
create table vendor_skills (vendor_id uuid references vendors, category_code text references job_categories(code), primary key(vendor_id, category_code));
create table vendor_buildings (vendor_id uuid references vendors, building_id uuid references buildings, primary key(vendor_id, building_id));
create table vendor_scores (vendor_id uuid primary key references vendors, jobs_done int default 0, rating_avg numeric(3,2),
  no_show_count int default 0, redo_count int default 0, updated_at timestamptz default now());

-- Slot tháng đồng giá + dùng thử miễn phí (Đ14)
create table slot_capacity (building_id uuid references buildings, trade_group text not null, capacity int not null check (capacity >= 1),
  reviewed_at timestamptz default now(), primary key(building_id, trade_group));
create table vendor_slots (id uuid primary key default gen_random_uuid(), vendor_id uuid references vendors, building_id uuid references buildings,
  trade_group text not null, is_trial boolean not null default false,
  period_start date not null, period_end date not null, fee int not null check (fee >= 0),   -- dùng thử: fee = 0
  status text not null check (status in ('active','expired','cancelled')) default 'active', created_at timestamptz default now());
create unique index one_active_slot on vendor_slots(vendor_id, building_id, trade_group) where status = 'active';
create unique index one_trial_ever on vendor_slots(vendor_id, building_id, trade_group) where is_trial;   -- dùng thử 1 lần
create table slot_waitlist (building_id uuid references buildings, trade_group text not null, vendor_id uuid references vendors,
  joined_at timestamptz default now(), invited_at timestamptz, primary key(building_id, trade_group, vendor_id));
-- Cấp slot: transaction, khoá slot_capacity FOR UPDATE, đếm vendor_slots active (kể cả dùng thử) < capacity ⇒ INSERT; ngược lại ⇒ slot_waitlist.

create table staff_users (id uuid primary key default gen_random_uuid(), email text unique not null, password_hash text not null,
  role text not null check (role in ('bql_admin','bql_staff','guard')), building_id uuid references buildings);

create table zalo_accounts (id text primary key check (id in ('bql','market')), display_name text,
  session_enc bytea, session_state text not null default 'logged_out', last_event_at timestamptz);
create table zalo_identities (zalo_account_id text references zalo_accounts, zalo_uid text not null,
  party_type text not null check (party_type in ('resident','vendor','staff')), party_id uuid not null,
  primary key(zalo_account_id, zalo_uid));

create table inbound_events (id bigserial primary key, zalo_account_id text not null, zalo_msg_id text not null,
  thread_id text not null, thread_type text not null check (thread_type in ('user','group')), sender_uid text not null,
  is_self boolean not null, payload jsonb not null, received_at timestamptz default now(),
  processed_at timestamptz, unique(zalo_account_id, zalo_msg_id));
create table outbox (id bigserial primary key, zalo_account_id text not null, thread_id text not null, thread_type text not null,
  kind text not null check (kind in ('text','image','typing','seen')), body jsonb not null,
  not_before timestamptz not null default now(), status text not null default 'queued'
  check (status in ('queued','sending','sent','failed','cancelled')), attempts int default 0, zalo_msg_id text,
  job_id uuid, created_at timestamptz default now());
create table conversations (id uuid primary key default gen_random_uuid(), zalo_account_id text not null, thread_id text not null,
  party_type text, party_id uuid, human_takeover_until timestamptz, unique(zalo_account_id, thread_id));
create table messages (id bigserial primary key, conversation_id uuid references conversations, direction text check (direction in ('in','out')),
  role text check (role in ('user','assistant','staff')), content jsonb not null, created_at timestamptz default now());
create table agent_runs (id bigserial primary key, conversation_id uuid, route text, model text, input_tokens int, output_tokens int,
  cache_read_tokens int, latency_ms int, outcome text, created_at timestamptz default now());

create table job_categories (code text primary key, name_vi text not null,
  trade_group text not null check (trade_group in ('dien_nuoc','khoa','dien_lanh','xay_sua')),   -- nhóm nghề, đơn vị tính slot (Đ14)
  default_mode text check (default_mode in ('fixed','quote')),
  emergency boolean default false);
create table price_book (category_code text references job_categories, building_id uuid references buildings,
  p25 int, p50 int, p75 int, sample_size int default 0, source text check (source in ('seed','observed')),
  updated_at timestamptz default now(), primary key(category_code, building_id));

create table jobs (id uuid primary key default gen_random_uuid(), code text unique not null,   -- vd "C-24A7", dùng trong "nhận C-24A7"
  building_id uuid not null references buildings, apartment_id uuid not null references apartments, resident_id uuid not null references residents,
  category_code text references job_categories, draft jsonb not null,                 -- JobDraft (§6)
  responsibility jsonb,                                                              -- ResponsibilityVerdict (§6)
  mode text check (mode in ('fixed','quote')), price_low int, price_high int,
  window_start timestamptz, window_end timestamptz,
  status text not null,                                                              -- §5
  assigned_vendor_id uuid references vendors, hold_expires_at timestamptz,
  case_ticket_id uuid, access_ticket_id uuid,                                        -- FK tới tickets (thêm sau khi tạo bảng tickets)
  final_price int, created_at timestamptz default now(), updated_at timestamptz default now());
create table job_offers (id bigserial primary key, job_id uuid references jobs, vendor_id uuid references vendors,
  kind text check (kind in ('claim','quote')), price int, eta timestamptz, note text,
  status text default 'open' check (status in ('open','won','lost','withdrawn','expired')),
  created_at timestamptz default now(), unique(job_id, vendor_id));
create table job_events (id bigserial primary key, job_id uuid references jobs, from_status text, to_status text not null,
  actor_type text not null, actor_id text, data jsonb, created_at timestamptz default now());
create table job_photos (id bigserial primary key, job_id uuid references jobs, phase text check (phase in ('intake','before','after')),
  storage_ref text not null, sha256 text not null, created_at timestamptz default now());
create table access_passes (id uuid primary key default gen_random_uuid(), job_id uuid references jobs, vendor_id uuid references vendors,
  code text not null, valid_from timestamptz not null, valid_to timestamptz not null, used_at timestamptz, revoked_at timestamptz);
create table ratings (job_id uuid primary key references jobs, stars int check (stars between 1 and 5), comment text, created_at timestamptz default now());

create table ledger_entries (id bigserial primary key, slot_id uuid references vendor_slots, vendor_id uuid references vendors,
  kind text not null check (kind in ('slot_fee','bql_share','waiver','adjustment')), amount int not null,
  status text default 'due' check (status in ('due','paid','waived')), created_at timestamptz default now());
-- Chỉ ghi sổ phí slot (Đ14); KHÔNG có phí theo cuốc. Slot dùng thử không sinh dòng ledger.

create table tickets (id uuid primary key default gen_random_uuid(), building_id uuid references buildings, apartment_id uuid,
  resident_id uuid, source_job_id uuid references jobs,
  kind text not null check (kind in ('bql_responsibility','unclear','service_case','access_request','dispute','emergency','no_vendor')),
  summary text not null, citations jsonb,                                          -- trích dẫn quy chế khi kind là bql_responsibility/service_case
  status text default 'open' check (status in ('open','in_progress','approved','rejected','done','closed')),
  decided_by uuid references staff_users, decided_at timestamptz, decision_note text,  -- dùng cho access_request
  assignee_id uuid references staff_users, created_at timestamptz default now());
-- service_case = case theo dõi việc trong căn (BQL chỉ xem); access_request = BQL duyệt/từ chối cho thợ vào tòa (Đ10).

create table kb_documents (id text primary key, title text not null, version text not null, status text not null check (status in ('approved','draft','deprecated')),
  effective_from date not null, effective_to date);
-- Đ20 (migration 003): kb_documents.building_id uuid not null references buildings — quy chế thuộc đúng một tòa (SPEC-P03 §11.4).
create table kb_sections (document_id text references kb_documents, section_id text, heading text, body text not null,
  tsv tsvector, embedding vector(1024), primary key(document_id, section_id));

create table audit_log (id bigserial primary key, actor_type text, actor_id text, action text not null, target text, data jsonb, created_at timestamptz default now());
```

Ghi chú: thứ tự FK khi tạo bảng tuân `db/migrations` (job_categories trước vendor_skills). Số chiều embedding chốt khi chọn model embedding ở P03 (Đ mới nếu khác 1024).

**Đ27 (migration `006_dispatch_slots.sql`, chỉ THÊM — SPEC-P05 §10.2.1; đã áp thử sau 001–005 ngày 2026-09-25):**

```sql
create table vendor_groups (building_id uuid not null references buildings,
  trade_group text not null check (trade_group in ('dien_nuoc','khoa','dien_lanh','xay_sua')),
  zalo_account_id text not null default 'market' references zalo_accounts, thread_id text not null,   -- id nhóm Zalo thật hoặc 'sim-market-<trade_group>'
  created_at timestamptz default now(), primary key (building_id, trade_group), unique (zalo_account_id, thread_id));
alter table jobs add column publish_expires_at timestamptz;           -- đồng hồ đăng (SPEC-P05 §10.8.1)
alter table jobs add column republish_count int not null default 0;   -- đăng lại vì hết hạn giữ (≤ MAX_HOLD_REPUBLISH)
alter table jobs add column timeout_republished_at timestamptz;       -- đăng lại vì DISPATCH_TIMEOUT (1 lần)
alter table job_offers add column over_band boolean not null default false;  -- báo giá vượt khung chờ cư dân
alter table vendor_slots add column reminded_at timestamptz;          -- nhắc hết hạn slot (1 lần)
alter table tickets add column reminded_at timestamptz;               -- nhắc BQL duyệt access_request (1 lần)
-- + 5 index: jobs(status, publish_expires_at), jobs(status, hold_expires_at), vendor_slots(building_id, trade_group, period_end) where status='active', access_passes(job_id), job_events(job_id, to_status, created_at)
```
Quy ước `jobs.window_start/window_end` (chốt Đ19-3): khung giờ thợ đến do cư dân chọn, ghi bởi `open_service_case` (ISO 8601 có múi giờ), NULL trước `case_open`, BẮT BUỘC khác NULL từ `case_open` — SPEC-P05 §10.2.2. Giá thợ báo ở `job_offers.price` (CẤM cột `jobs.vendor_price`).

## §5. Máy trạng thái cuốc (`jobs.status`) — v0.2 (Đ10)

| Từ | Sang | Tool / tác nhân | Điều kiện & hiệu ứng |
| :-- | :-- | :-- | :-- |
| — | `drafting` | `save_job_draft` | cư dân `active` |
| `drafting` | `routed_bql` | `push_bql_ticket` | verdict `bql`/`unclear` ⇒ ticket `bql_responsibility`/`unclear` lên dashboard |
| `drafting` | `awaiting_consent` | `classify_responsibility` | verdict `resident` có citation hợp lệ |
| `awaiting_consent` | `case_open` | `open_service_case` | cư dân đồng ý tìm thợ (bằng chứng ở lượt SAU — SPEC-P05 §10.7.2) ⇒ ticket `service_case`; `jobs.case_ticket_id`; ghi `window_start/end` (Đ27) |
| `awaiting_consent` | `cancelled` | cư dân / timer 24h | |
| `case_open` | `published` | `publish_job_to_group` (agent cư dân, cùng lượt sau `open_service_case`) / lưới timer `publishFallback` 2 phút (Đ27) | cần `window_start`; `category_code` NULL ⇒ `'khac'`; `JobCard` đã che PII vào outbox nhóm `vendor_groups`; đặt `publish_expires_at` |
| `published` | `held` | `claim_job` (agent thợ — ý định model + lưới tất định, Đ27) | 7 điều kiện BB-10 (SPEC-P05 §10.3.1); UPDATE có điều kiện (BB-05); `hold_expires_at = now + HOLD_MINUTES` (10); thua đua ⇒ tool trả `{won:false}` |
| `held` | `confirmed` | `confirm_assignment` / `respond_to_quote(accept)` (Đ27) | thợ OK trong hạn giữ; `mode='quote'` cần giá khớp tin thợ; giá > `price_high × 1,3` ⇒ VẪN `held` chờ cư dân (`job_offers.over_band`) |
| `held` | `published` | timer / `decline_hold` / `respond_to_quote(decline)` / BQL đình chỉ | `data.reason ∈ {hold_expired, quote_consent_timeout, vendor_declined, quote_declined, vendor_suspended}`; gỡ `assigned_vendor_id`; `hold_expired` ⇒ `no_show_count+1`, đăng lại ≤ `MAX_HOLD_REPUBLISH` (2), quá ⇒ để đồng hồ đăng xử lý |
| `confirmed` | `published` | `decline_hold` (thợ rút) / BQL đình chỉ — cặp MỚI (Đ27) | gỡ gán, đăng lại (không tăng `republish_count`) |
| `access_granted` | `published` | BQL đình chỉ thợ (`withdrawGranted`, Đ30) | thu hồi mã vào (`revoked_at`), ticket `closed` (+ `decision_note`), gỡ gán, đăng lại |
| `confirmed` | `access_pending` | `request_access` (agent thợ, cùng lượt sau `confirm_assignment`) / lưới timer 2 phút | ticket `access_request` lên dashboard; `jobs.access_ticket_id` |
| `access_pending` | `access_granted` | BQL bấm Duyệt (`decideAccessRequest`, actor `staff`) | ticket `approved` ⇒ tạo `access_passes` ⇒ sự kiện hệ thống `access_approved` ⇒ agent thợ `dispatch_to_vendor` (Đ27) |
| `access_pending` | `published` | BQL bấm Từ chối (lý do bắt buộc) / thợ rút / đình chỉ | ticket `rejected` + `decision_note`; gỡ gán; đăng lại; thợ bị từ chối KHÔNG nhận lại cuốc này (`job_offers.note='access_rejected'`) |
| `access_granted` | `dispatched` | `dispatch_to_vendor` (agent thợ, lượt do sự kiện hệ thống kích hoạt) | ticket `approved` ∧ đúng thợ ∧ có mã vào còn hiệu lực ⇒ `JobReveal` DM thợ + báo cư dân |
| `published` | `unassigned` | timer | `publish_expires_at` (`computePublishExpiry`, `DISPATCH_TIMEOUT_MIN` 45 trong 07–21h, ngoài giờ tới 08:00): lần đầu ⇒ đăng lại `mode='quote'`; lần hai ⇒ `unassigned` + ticket `no_vendor` + báo cư dân |
| `dispatched` | `in_progress` | thợ "đến C-xxxx" / bảo vệ bấm đã vào | |
| `in_progress` | `awaiting_acceptance` | thợ "xong C-xxxx <giá>" + ảnh sau | |
| `awaiting_acceptance` | `accepted` | cư dân xác nhận / im 48h | |
| `awaiting_acceptance` | `disputed` | `report_problem` | ticket `dispute` |
| `accepted` | `closed` | `close_case` | điểm + bảng giá + hẹn bảo hành; ticket case `closed` |
| mọi trạng thái trước `in_progress` | `cancelled` | cư dân / BQL | thu hồi `access_passes` |

CẤM chuyển trạng thái không có dòng trong bảng. Mọi chuyển = một `UPDATE jobs SET status=$to … WHERE id=$id AND status=$from` trong transaction cùng `INSERT job_events`; `rowCount=0` ⇒ `ConflictError`.

## §6. Kiểu TypeScript

```ts
type JobDraft = { category_code: string | null; symptoms: string[]; location_in_unit: string;
  urgency: 'normal' | 'soon' | 'emergency'; photo_ids: number[]; questions_asked: number; confidence_note: string };
type Citation = { document_id: string; section_id: string; quote: string };
type ResponsibilityVerdict = { party: 'resident' | 'bql' | 'unclear'; citations: Citation[]; reason_vi: string };
//  service ép party='unclear' nếu citations rỗng hoặc nguồn không 'approved'/hết hiệu lực (BB-03)
type JobCard = { code: string; category_name: string; building_code: string; window: [string, string];
  mode: 'fixed' | 'quote'; price_band: [number, number] | null; summary_vi: string; photo_urls_redacted: string[] };
//  JobCard KHÔNG có apartment, phone, resident name (BB-02). Lint: check_agent_tools cấm các khoá này.
type JobReveal = JobCard & { apartment_code: string; floor: number; resident_phone: string; access_pass_code: string };
//  JobReveal chỉ được tạo trong dispatch_to_vendor khi jobs.status='access_granted' (BB-11).
type Party = { type: 'resident' | 'vendor' | 'staff' | 'unknown'; id: string | null; account: 'bql' | 'market' };
type TradeGroup = 'dien_nuoc' | 'khoa' | 'dien_lanh' | 'xay_sua';   // Đ27
// Đ27: VendorToolContext (agent/vendor-tool-context.ts) và VendorTriageResult (agent/vendor-triage.ts) — SPEC-P05 §10.5.2, §10.4.1.
// AgentTool<TInput, TOutput, TCtx = ToolContext> (tool-kit.ts) — tool phía thợ dùng TCtx = VendorToolContext.
```

## §7. Tool của agent (v0.2 — agent điều phối, Đ10)

Mọi tool `strict: true`. `resident_id`, `apartment_id`, `building_id`, `job_id` hiện hành do server gắn vào context, KHÔNG phải tham số (BB-08). Mỗi tool tự kiểm trạng thái §5; sai ⇒ trả lỗi có kiểu (§9) để agent xử lý tiếp.

**Agent điều phối — phía cư dân (tài khoản `bql`):**

| Tool | Bước | Làm gì · chốt chặn bên trong |
| :-- | :-- | :-- |
| `save_job_draft(draft)` | 1 | lưu phiếu việc; `category_code` phải thuộc danh mục |
| `search_regulations(query)` | 2 | truy hồi quy chế `{section_id, heading, body, status, effective}` |
| `classify_responsibility(verdict)` | 2 | service kiểm BB-03, có thể ép `unclear`; trả verdict đã chốt |
| `push_bql_ticket(summary)` | 2a | tạo ticket BQL kèm trích dẫn; chỉ khi verdict `bql`/`unclear` |
| `open_service_case(window_start, window_end, note)` | 3 | Đ27: chỉ khi verdict `resident` và có bằng chứng đồng ý ở lượt SAU (chuỗi tin sau mốc — SPEC-P05 §10.7.2); ISO 8601 ⇒ `jobs.window_*` |
| `get_price_band(category_code)` | 3–4 | đọc `price_book`, có thể rỗng |
| `publish_job_to_group(job_code)` | 4 | Đ27: chuyển về phía cư dân — gọi cùng lượt ngay sau `open_service_case`; dựng `JobCard` (không PII theo kiểu + PiiGate), outbox nhóm `vendor_groups`; cuốc phải của chính cư dân |
| `respond_to_quote(job_code, accept)` | 5b | Đ27: cư dân trả lời báo giá vượt khung; `accept=true` cần bằng chứng đồng ý; `false` ⇒ nhả cuốc, không tính bùng |
| `get_my_cases()` | mọi lúc | case/cuốc của chính cư dân |
| `report_problem(text)` | 8 | tạo tranh chấp |
| `handoff_to_staff(reason)` | mọi lúc | chuyển người |

**Agent điều phối — phía thợ & BQL (tài khoản `market` + dashboard):**

| Tool | Bước | Làm gì · chốt chặn bên trong |
| :-- | :-- | :-- |
| `claim_job(job_code)` | 5 | Đ27: cần bằng chứng ý định (model ≥ `VENDOR_INTENT_MIN` hoặc cụm an toàn BẰNG NHAU); 7 điều kiện BB-10; UPDATE có điều kiện (BB-05); thua ⇒ `{won:false}` |
| `confirm_assignment(job_code, price_vnd)` | 5 | chỉ khi `held`, đúng thợ, trong hạn giữ; `quote` cần giá khớp tin thợ (lưới tất định); vượt khung >30% ⇒ `awaiting_resident_price_consent` |
| `decline_hold(job_code)` | 5 | Đ27: thợ rút ⇒ `held/confirmed/access_pending → published` |
| `request_access(job_code, note)` | 6 | tạo ticket `access_request` (tên thợ, SĐT thợ, điểm, căn, khung giờ trong `summary`) cho dashboard; gọi cùng lượt sau `confirm_assignment` |
| `dispatch_to_vendor(job_code)` | 7 | chỉ khi ticket cấp quyền `approved` + mã vào còn hiệu lực; `JobReveal` DM thợ (không trả cho model), báo cư dân; kích hoạt bởi sự kiện hệ thống `access_approved` |
| `get_my_assignments()`, `get_my_slot()`, `request_slot(trade_group, building_code)`, `handoff_to_staff(reason)` | — | Đ27: tra cứu (không PII), slot/dùng thử/danh sách chờ (Đ14), chuyển người — SPEC-P05 §10.6, §10.9 |
| `close_case(job_code)` | 8 | P06: chỉ khi `accepted`; cập nhật điểm thợ, giá thật vào bảng giá, hẹn bảo hành |
| `register_vendor(profile)`, `set_availability(slots)` | — | onboarding thợ — SPEC-P04 §3, CHƯA làm ở P05 (vùng cấm SPEC-P05 §10.14) |

Đ27 (thay câu "parse tất định" cũ — Đ21 của người dùng): tin của thợ đi qua **lớp hiểu ý bằng model** (`triageVendorMessage`, SPEC-P05 §10.4) + **lưới tất định** (trích mã cuốc `C-XXXX`, đọc giá, danh sách cụm khớp BẰNG NHAU); agent thợ (route `vendor_parse`) gọi tool; tool tự kiểm bằng chứng ý định + trạng thái + BB-10. Tool chốt (`held`) vẫn là câu UPDATE có điều kiện — agent không chọn người thắng. Lệnh bước 8 ("đến", "xong <giá>") là P06.

CẤM tool: gửi tin tới thread không thuộc cuộc/case hiện tại, liệt kê danh bạ, đọc file, exec, đổi cấu hình, duyệt ticket thay BQL.

## §8. Transport

```ts
interface Transport {
  onInbound(handler: (e: InboundEvent) => Promise<void>): void;     // worker → inbound_events (đã persist trước)
  enqueue(msg: OutboxInsert): Promise<number>;                      // chỉ ghi bảng outbox; pacer gửi (SPEC-P02 §5)
  status(account: 'bql' | 'market'): Promise<SessionState>;
}
type SessionState = 'logged_out' | 'qr_pending' | 'connected' | 'kicked' | 'reconnecting' | 'dead';
```

**`SimTransport` (Đ13 — làm trong P01, dùng trước Zalo):** cùng interface `Transport`, ghi/đọc đúng bảng `inbound_events`/`outbox` nhưng nguồn là **màn chat dev** trên `apps/web` (`/dev/sim`, chỉ bật khi `DATA_MODE=sim`): 3 khung song song — cư dân (thread user), nhóm thợ (thread group, chọn thợ đang gõ), và link sang dashboard BQL. Có nút "phát lại kịch bản" chạy file `evals/scenarios/*.jsonl` để test đầu-cuối không cần người. Chuyển sang Zalo thật = đổi `TRANSPORT=zalo`, không sửa core.

Worker và core nói chuyện qua Postgres (bảng `inbound_events`, `outbox`, `zalo_accounts`); KHÔNG gọi HTTP trực tiếp giữa hai tiến trình. pg-boss: KHÔNG dùng tới P07 (Đ17/Đ22/Đ27) — runner `core:run` tuần tự + đồng hồ `runTimers(now)` (SPEC-P05 §10.8).

**Sự kiện hệ thống (Đ27, SPEC-P05 §10.8.2):** server ghi `inbound_events` với `zalo_msg_id = 'sys-<uuid>'`, `sender_uid = 'system'`, `payload.kind = 'system'` để kích hoạt MỘT lượt agent (vd `access_approved` ⇒ agent thợ `dispatch_to_vendor`). `sender_uid = 'system'` là giá trị DÀNH RIÊNG: `simInbound` và `/api/dev/sim/send` từ chối; worker Zalo không bao giờ sinh (uid Zalo là số). Quy ước thread DM: `thread_type='user'` ⇒ `thread_id = zalo_uid` của người đó (đúng với Zalo; kênh giả lập PHẢI theo cho thợ). `runScenario(path, handler = echoHandler)`; route phát lại `/api/dev/sim/replay` truyền `routeInboundEvent`.

## §9. Bảng lỗi & hành vi caller

| Lỗi | Khi nào | Caller BẮT BUỘC |
| :-- | :-- | :-- |
| `ConflictError` | chuyển trạng thái sai `from` | không retry; đọc lại job, trả tin trạng thái hiện tại |
| `PiiGateError` | dựng tin cho thợ có PII trước `access_granted` | log `audit_log` mức cao, không gửi gì cho thợ |
| `AccessNotApprovedError` | `dispatch_to_vendor` khi ticket cấp quyền chưa `approved` | agent chờ; quá 30 phút trong giờ ⇒ nhắc BQL trên dashboard |
| `IneligibleVendorError` | `message` bắt đầu bằng mã lý do `not_active` \| `no_building` \| `no_skill` \| `no_slot` \| `blocked_no_show` \| `rejected_by_bql` \| `window_overlap` \| `not_assigned` (Đ27, SPEC-P05 §10.3.1) | trả lời thợ lý do ngắn qua DM, không lộ chi tiết cuốc, KHÔNG trả lời trong nhóm |
| `ModelUnavailableError` | LLM 429/5xx sau retry | xin lỗi cư dân + hẹn trả lời; bước 1 khẩn cấp vẫn chạy |
| `RegulationUnavailable` | không truy hồi được quy chế | verdict `unclear` ⇒ ticket |
| `ConsentMissingError` | `open_service_case` khi tin cư dân không phải đồng ý hợp lệ (SPEC-P03 §11.5) | agent hỏi lại: "anh/chị trả lời ĐỒNG Ý để em tìm thợ" |
| `VerdictLockedError` | `classify_responsibility` khi job không còn `drafting` (SPEC-P03 §11.5) | không đổi verdict; báo cư dân "đã kết luận, cần BQL xem lại" + `handoff_to_staff` |
| `InvalidToolInput` | input tool sai `input_schema` (§2b) | `tool_result is_error`, tool không chạy; model tự sửa ở vòng sau |
| `TransportDeadError` | phiên Zalo `kicked`/`dead` | dừng gửi, giữ outbox `queued`, báo động (OPERATIONS §5) |
| `RateLimitedError` | Zalo trả lỗi giới hạn / mã 221 / không có msgId | pacer lùi ≥30 phút cho tài khoản đó |
| `JobNotFoundError` (Đ27) | mã cuốc không tồn tại hoặc không thuộc người đang nói | "Không tìm thấy mã cuốc <code>"; không lộ cuốc khác |
| `IntentNotConfirmedError` (Đ27) | `claim_job`/`confirm_assignment`/`decline_hold` không có bằng chứng ý định (SPEC-P05 §10.4.4) | hỏi thợ trả lời đúng mẫu ("nhận C-XXXX"); không gọi lại tool cùng lượt |
| `HoldExpiredError` (Đ27) | OK/giá sau `hold_expires_at` — tool đã nhả cuốc | "Hết hạn giữ, cuốc đã đăng lại — nhắn «nhận <code>» nếu còn muốn" |
| `QuoteRequiredError` (Đ27) | cuốc `quote` thiếu giá / giá không khớp tin thợ | hỏi giá ("Anh báo giá bao nhiêu? vd 350k") |
| `SlotUnavailableError` (Đ27) | chưa đặt trần / chưa cấu hình nhóm / tòa mơ hồ | báo thợ liên hệ BQL; admin thấy trên `/vendors` |

## §2b. Nhà cung cấp LLM — Gemini mặc định (Đ18, 2026-09-24)

`callModel` giữ NGUYÊN chữ ký §2 (vào/ra theo dạng Anthropic: `MessageParam`, `Tool`, `Message`, `Usage`) — core, agent, tool KHÔNG biết nhà cung cấp. Chỉ `adapters/model.ts` chọn và dịch.

| Hạng mục | Chốt |
| :-- | :-- |
| Chọn nhà cung cấp | env `MODEL_PROVIDER` = `gemini` (mặc định) \| `anthropic` |
| Gọi Gemini | `fetch` tới `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, key qua header `x-goog-api-key` (CẤM đặt key trong URL — URL hay bị log). Đọc `GEMINI_API_KEY` chỉ trong `adapters/model.ts` |
| Model | `MODEL_DEFAULT` (mặc định `gemini-3.6-flash` khi provider gemini, `claude-opus-5` khi anthropic); `MODEL_<ROUTE>` ghi đè. `MODEL_FALLBACKS` (danh sách phẩy, mặc định `gemini-3-flash-preview,gemini-3.5-flash-lite`): model chính hết retry vì 429/503/mạng ⇒ thử lần lượt từng model dự phòng trong CÙNG lời gọi, `agent_runs.model` ghi model thực chạy. Probe 2026-09-24 (key dự án): `gemini-3.6-flash` 200 + functionCall + `thoughtSignature`; `gemini-3-flash-preview` 200 + functionCall; `gemini-3.5-flash-lite` 200; `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-flash-latest` 503; mọi `gemini-2.x` 404 ("no longer available to new users"). CẤM `gemini-2.*`, `gemini-3.7-flash`, `gemini-3.8-flash` |
| Dịch vào | `system` ⇒ `systemInstruction`; `user`/`assistant` ⇒ `user`/`model`; `text` ⇒ `{text}`; `image` ⇒ `inlineData`; `tool_use` ⇒ `functionCall{name,args}`; `tool_result` ⇒ `functionResponse{name, response:{content, is_error}}` (tên lấy từ `tool_use` cùng id); `tools[].input_schema` ⇒ `functionDeclarations[].parametersJsonSchema`; bỏ `cache_control` (Gemini cache ngầm) |
| Dịch ra | `parts[].text` ⇒ `text`; `parts[].functionCall` ⇒ `tool_use` với `id` do adapter sinh (`toolu_gm_<n>`), `input=args`; có `functionCall` ⇒ `stop_reason='tool_use'`, không ⇒ `end_turn`; `finishReason` `SAFETY`/`PROHIBITED_CONTENT`/`BLOCKLIST` hoặc `promptFeedback.blockReason` ⇒ `stop_reason='refusal'`; `MAX_TOKENS` ⇒ `max_tokens`. `usageMetadata` ⇒ `input_tokens`/`output_tokens`/`cache_read_input_tokens` (`cachedContentTokenCount`) |
| Chữ ký suy nghĩ | Gemini 3 trả `thoughtSignature` cùng `functionCall` và BẮT BUỘC nhận lại ở lượt sau trong cùng vòng tool (thiếu ⇒ 400). Adapter giữ bảng `tool_use.id → thoughtSignature` trong bộ nhớ tiến trình và gắn lại khi dịch `tool_use` vào. Lịch sử nạp từ DB chỉ có text ⇒ không cần chữ ký |
| Kiểm input tool | Gemini không có `strict` ⇒ trước khi `run`, mỗi tool kiểm `input` theo `input_schema` (trường `required`, kiểu, enum, không khoá lạ); sai ⇒ `tool_result is_error` mã `InvalidToolInput`, không chạy tool |
| Lỗi | 429/500/503/504, lỗi mạng, timeout ⇒ `ModelUnavailableError` (retry tối đa 2 lần, lùi 1 s rồi 3 s); 400/401/403/404 ⇒ ném lỗi gốc (lỗi cấu hình, không retry) |
| Nhánh `anthropic` | Giữ hành vi hiện có + SPEC-P03 §10.8 (refusal, thinking, vòng tool). Fallback phía server KHÔNG làm (SDK `@anthropic-ai/sdk@0.68.0` không có `fallbacks` — Đ19); dùng chung cơ chế `MODEL_FALLBACKS` phía client, mặc định RỖNG khi provider `anthropic`. CẤM nâng SDK chỉ để lấy `fallbacks` |
| Giới hạn ra | `max_tokens` = 16000 cho cả hai nhánh (Gemini: `generationConfig.maxOutputTokens`). CẤM đặt `temperature`/`top_p`/`thinkingConfig` — để mặc định của model |
| Thử nghiệm | `setModelClientForTest` giữ nguyên cho nhánh anthropic; nhánh gemini có `setGeminiFetchForTest(fake: typeof fetch \| null)` — test dịch vào/ra, `thoughtSignature`, fallback, lỗi đều chạy bằng fetch giả, 0 mạng trong `npm test` |

CẤM: SDK/endpoint Gemini ngoài `adapters/model.ts` (máy đo biên canh chuỗi `generativelanguage.googleapis.com` và `@google/genai`); log key hay URL có key; để core rẽ nhánh theo nhà cung cấp.

## §2c. Nhà cung cấp LLM thứ ba — OpenRouter (Đ24, 2026-09-25)

Lý do: key Gemini trực tiếp hết hạn mức (429 `RESOURCE_EXHAUSTED`, 2026-09-25 ~15:43) giữa lượt chấm model thật. OpenRouter phục vụ CÙNG model Gemini (`google/gemini-3.6-flash`) qua API dạng OpenAI ⇒ số đo so được với lượt chấm Gemini trực tiếp. Chữ ký `callModel`/`callTriageModel` giữ nguyên §2b — chỉ `adapters/model.ts` thêm nhánh.

| Hạng mục | Chốt |
| :-- | :-- |
| Chọn | `MODEL_PROVIDER=openrouter` (thêm vào `ModelProvider`); mặc định vẫn `gemini` |
| Gọi | `fetch` POST `${OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'}/chat/completions`, header `authorization: Bearer <OPENROUTER_API_KEY>`, `content-type: application/json`, `x-title: lenqclaw`. Đọc `OPENROUTER_API_KEY` chỉ trong `adapters/model.ts`. Body BẮT BUỘC có `provider: { data_collection: 'deny' }` (không cho nhà cung cấp dùng dữ liệu cư dân để huấn luyện — Luật 91/2025) và `max_tokens: 16000`. CẤM `temperature`/`top_p`/`reasoning`; CẤM trường `models` (fallback phía server) — fallback làm phía client như §2b để `agent_runs.model` đúng |
| Model | `MODEL_DEFAULT` mặc định `google/gemini-3.6-flash`; `MODEL_<ROUTE>` ghi đè; triage mặc định `google/gemini-3.5-flash-lite` (vẫn KHÔNG rơi về `MODEL_DEFAULT`, §11.10); `MODEL_FALLBACKS` mặc định `google/gemini-3-flash-preview`. Probe 2026-09-25 (key người dùng): 3 model trên + `openai/gpt-4o-mini` đều 200 + `tool_calls` |
| Dịch vào | `system` ⇒ message `{role:'system'}` đầu mảng; `text` ⇒ `content` chuỗi (nhiều khối text nối `
`) hoặc mảng part `{type:'text'}` khi có ảnh; `image` ⇒ `{type:'image_url', image_url:{url:'data:<mime>;base64,<b64>'}}`; `tool_use` (assistant) ⇒ `tool_calls[{id, type:'function', function:{name, arguments: JSON.stringify(input)}}]`; mỗi `tool_result` ⇒ một message `{role:'tool', tool_call_id, content}` (`is_error` ⇒ tiền tố `ERROR: `), đặt NGAY sau message assistant chứa `tool_calls`, theo đúng thứ tự; `tools[]` ⇒ `{type:'function', function:{name, description, parameters: input_schema}}`; bỏ `cache_control` |
| Dịch ra | `choices[0].message.content` ⇒ khối `text` (rỗng ⇒ không có khối); `tool_calls[]` ⇒ `tool_use{id: tool_call.id, name, input: JSON.parse(arguments)}` — `arguments` không parse được ⇒ `input = {}` để lớp kiểm input tool (§2b) trả `InvalidToolInput`; `finish_reason` `tool_calls` ⇒ `tool_use`, `stop` ⇒ `end_turn` (nhưng có `tool_calls` thì luôn `tool_use`), `length` ⇒ `max_tokens`, `content_filter` ⇒ `refusal`. `usage.prompt_tokens`/`completion_tokens`/`prompt_tokens_details.cached_tokens` ⇒ `input_tokens`/`output_tokens`/`cache_read_input_tokens`. `model` trả về ghi vào `agent_runs.model` |
| Lỗi | 429/500/502/503/504, lỗi mạng, timeout ⇒ `ModelUnavailableError` (retry 2 lần, lùi 1 s rồi 3 s, rồi `MODEL_FALLBACKS`); 402 (hết credit) ⇒ `ModelUnavailableError` KHÔNG retry, KHÔNG fallback; 400/401/403/404 ⇒ ném lỗi gốc; body 200 có trường `error` ⇒ xử như mã trong `error.code` |
| Thử nghiệm | `setOpenRouterFetchForTest(fake: typeof fetch \| null)`; triage dùng lại `setTriageFetchForTest` khi provider openrouter. Test dịch vào/ra (vòng tool 2 lượt, nhiều `tool_result` một lượt, ảnh), `data_collection:'deny'` có trong body, 429 ⇒ fallback, 402 ⇒ không retry, `arguments` hỏng — 0 mạng trong `npm test` |
| Máy chấm | `scripts/eval/score.mjs`: `credentialEnvName()` trả `OPENROUTER_API_KEY` khi provider `openrouter` (thiếu ⇒ `blocked`, exit 3) |

CẤM: gọi `openrouter.ai` ngoài `adapters/model.ts` (máy đo biên `check_adapter_boundary.mjs` canh thêm chuỗi `openrouter.ai`); SDK `openai` (chỉ `fetch`); log key; đổi `MODEL_PROVIDER` mặc định khỏi `gemini` (OpenRouter là đường tạm/dự phòng — đổi mặc định cần người chốt).

## §2d. Nhà cung cấp thứ tư — Vyce AI, proxy dạng OpenAI (Đ25, 2026-09-25)

Lý do: Gemini trực tiếp hết quota, tài khoản OpenRouter 0 USD; người dùng đưa key Vyce và chấp nhận DeepSeek. Vyce nói đúng giao thức `/chat/completions` như §2c ⇒ DÙNG CHUNG phần dịch vào/ra, xử lý `tool_calls`, lỗi, fallback của nhánh `openrouter`; chỉ khác bảng dưới.

| Hạng mục | Chốt |
| :-- | :-- |
| Chọn | `MODEL_PROVIDER=vyce`; mặc định vẫn `gemini` |
| Gọi | POST `${VYCE_BASE_URL ?? 'https://vyceai.com/v1'}/chat/completions`, `authorization: Bearer <VYCE_API_KEY>` (đọc chỉ trong `adapters/model.ts`). KHÔNG gửi trường `provider` (riêng OpenRouter). `max_tokens: 16000` |
| Model | `MODEL_DEFAULT` mặc định `deepseek-v4-flash`; triage mặc định `deepseek-v4-flash`; `MODEL_FALLBACKS` mặc định rỗng. Probe SO 2026-09-25: `https://vyceai.com/v1/models` 200; `deepseek-v4-flash` + tool + `max_tokens:16000` ⇒ 200, `finish_reason=tool_calls`, ~2,2 s. (`https://api.vyceai.com` không phân giải) |
| Dữ liệu | Proxy bên thứ ba không có cam kết không lưu dữ liệu ⇒ adapter TỪ CHỐI nhánh `vyce` khi `DATA_MODE !== 'sim'` (ném lỗi cấu hình, không gọi mạng). Cư dân thật ⇒ phải có quyết định mới của người |
| Thử nghiệm | `setVyceFetchForTest(fake)` hoặc dùng chung fetch giả của nhánh OpenAI-compat; test: body không có `provider`, URL/khoá đúng biến, `DATA_MODE=real` ⇒ từ chối 0 lần fetch, dịch tool vòng 2 lượt (dùng lại ca của §2c) |
| Máy chấm | `credentialEnvName()` ⇒ `VYCE_API_KEY` khi provider `vyce` |
| Cổng | G08–G10 ✅ gắn với cặp provider/model ĐÃ chấm (ghi trong report). Model chạy thật khác cặp đó ⇒ chấm lại 1 lượt trước khi bật cho cư dân |

CẤM: chuỗi `vyceai.com` ngoài `adapters/model.ts` (máy đo biên canh thêm); nhân bản code dịch của §2c (tách hàm dùng chung); SDK `openai`.

