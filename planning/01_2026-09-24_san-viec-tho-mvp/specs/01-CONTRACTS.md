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
  agent/                  resident-agent.ts, vendor-agent.ts, tools/*.ts, prompts/*.md
  services/               pricing.ts, dispatch.ts, reveal.ts, access-pass.ts, scoring.ts, responsibility.ts
  retrieval/              port từ build phase (§8 của 00-ARCHITECTURE)
db/migrations/NNN_*.sql   đánh số tăng dần, có bảng schema_migrations
scripts/                  check_adapter_boundary.mjs, check_agent_tools.mjs, eval_golden.mjs, sim_claims.mjs
evals/golden/             diagnosis.jsonl, responsibility.jsonl, emergency.jsonl, pii_probe.jsonl
```

npm workspaces; `packages/core` export ESM; TypeScript `strict: true`.

## §2. Adapter

```ts
// adapters/db.ts
export function sql<T>(text: string, params?: unknown[]): Promise<T[]>;
export function tx<T>(fn: (q: typeof sql) => Promise<T>): Promise<T>;

// adapters/model.ts
export interface ModelCall { route: 'diagnose' | 'responsibility' | 'acceptance' | 'vendor_parse' | 'compose';
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

## §5. Máy trạng thái cuốc (`jobs.status`) — v0.2 (Đ10)

| Từ | Sang | Tool / tác nhân | Điều kiện & hiệu ứng |
| :-- | :-- | :-- | :-- |
| — | `drafting` | `save_job_draft` | cư dân `active` |
| `drafting` | `routed_bql` | `push_bql_ticket` | verdict `bql`/`unclear` ⇒ ticket `bql_responsibility`/`unclear` lên dashboard |
| `drafting` | `awaiting_consent` | `classify_responsibility` | verdict `resident` có citation hợp lệ |
| `awaiting_consent` | `case_open` | `open_service_case` | cư dân đồng ý tìm thợ ⇒ ticket `service_case`; `jobs.case_ticket_id` |
| `awaiting_consent` | `cancelled` | cư dân / timer 24h | |
| `case_open` | `published` | `publish_job_to_group` | tin cuốc vào nhóm thợ qua outbox |
| `published` | `held` | parse "nhận C-xxxx" (tất định) | thợ `active`, đúng kỹ năng/tòa; `hold_expires_at=now()+10m` |
| `held` | `confirmed` | `confirm_assignment` | thợ trả "OK" trong hạn giữ |
| `held` | `published` | timer | hết hạn giữ ⇒ `no_show_count+1`, đăng lại (≤2 lần) |
| `confirmed` | `access_pending` | `request_access` | ticket `access_request` lên dashboard; `jobs.access_ticket_id` |
| `access_pending` | `access_granted` | BQL bấm Duyệt | ticket `approved` ⇒ tạo `access_passes` |
| `access_pending` | `published` | BQL bấm Từ chối | agent báo thợ, gỡ gán, đăng lại |
| `access_granted` | `dispatched` | `dispatch_to_vendor` | gửi số căn + SĐT + mã vào cho đúng thợ được gán |
| `published` | `unassigned` | timer | quá `DISPATCH_TIMEOUT` ⇒ ticket `no_vendor` |
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
| `open_service_case(window_options, note)` | 3 | chỉ khi verdict `resident` và cư dân đã đồng ý trong lượt hiện tại |
| `get_price_band(category_code)` | 3–4 | đọc `price_book`, có thể rỗng |
| `get_my_cases()` | mọi lúc | case/cuốc của chính cư dân |
| `report_problem(text)` | 8 | tạo tranh chấp |
| `handoff_to_staff(reason)` | mọi lúc | chuyển người |

**Agent điều phối — phía thợ & BQL (tài khoản `market` + dashboard):**

| Tool | Bước | Làm gì · chốt chặn bên trong |
| :-- | :-- | :-- |
| `publish_job_to_group(job_code)` | 4 | dựng `JobCard` từ job (không PII theo kiểu), đưa vào outbox nhóm |
| `confirm_assignment(job_code)` | 5 | chỉ khi `held` và người trả "OK" chính là thợ đang giữ |
| `request_access(job_code, note)` | 6 | tạo ticket `access_request` (tên thợ, khung giờ, căn) cho dashboard |
| `dispatch_to_vendor(job_code)` | 7 | chỉ khi ticket cấp quyền `approved`; gửi `JobReveal` cho đúng thợ, báo cư dân |
| `close_case(job_code)` | 8 | chỉ khi `accepted`; cập nhật điểm thợ, giá thật vào bảng giá, hẹn bảo hành |
| `register_vendor(profile)`, `set_availability(slots)`, `get_my_assignments()` | — | onboarding & tra cứu của thợ |

Lệnh của thợ trong nhóm ("nhận C-xxxx", "OK", "đến C-xxxx", "xong C-xxxx 350k") được **parse tất định** thành sự kiện; agent nhận sự kiện và gọi tool tương ứng. Tool chốt (`held`) là câu UPDATE có điều kiện — agent không chọn người thắng.

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

Worker và core nói chuyện qua Postgres (bảng `inbound_events`, `outbox`, `zalo_accounts`) + `pg-boss`; KHÔNG gọi HTTP trực tiếp giữa hai tiến trình.

## §9. Bảng lỗi & hành vi caller

| Lỗi | Khi nào | Caller BẮT BUỘC |
| :-- | :-- | :-- |
| `ConflictError` | chuyển trạng thái sai `from` | không retry; đọc lại job, trả tin trạng thái hiện tại |
| `PiiGateError` | dựng tin cho thợ có PII trước `access_granted` | log `audit_log` mức cao, không gửi gì cho thợ |
| `AccessNotApprovedError` | `dispatch_to_vendor` khi ticket cấp quyền chưa `approved` | agent chờ; quá 30 phút trong giờ ⇒ nhắc BQL trên dashboard |
| `IneligibleVendorError` | thợ không active/không đúng kỹ năng/tòa | trả lời thợ lý do ngắn, không lộ chi tiết cuốc |
| `ModelUnavailableError` | LLM 429/5xx sau retry | xin lỗi cư dân + hẹn trả lời; bước 1 khẩn cấp vẫn chạy |
| `RegulationUnavailable` | không truy hồi được quy chế | verdict `unclear` ⇒ ticket |
| `TransportDeadError` | phiên Zalo `kicked`/`dead` | dừng gửi, giữ outbox `queued`, báo động (OPERATIONS §5) |
| `RateLimitedError` | Zalo trả lỗi giới hạn / mã 221 / không có msgId | pacer lùi ≥30 phút cho tài khoản đó |

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
