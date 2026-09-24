-- 001_init.sql — DDL nen tang (01-CONTRACTS.md §4), sap lai thu tu de FK hop
-- le. Migration chi duoc THEM, khong sua file da ap dung (OPERATIONS.md §7).

create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists unaccent;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table buildings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  code text not null,
  name text not null,
  unique(org_id, code)
);

create table apartments (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings,
  code text not null,
  floor int,
  unique(building_id, code)
);

create table residents (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,
  status text not null check (status in ('pending','active','blocked')) default 'pending',
  consent_at timestamptz,
  created_at timestamptz default now()
);

create table resident_apartments (
  resident_id uuid references residents,
  apartment_id uuid references apartments,
  role text not null check (role in ('owner','tenant','member')),
  primary key(resident_id, apartment_id)
);

create table job_categories (
  code text primary key,
  name_vi text not null,
  trade_group text not null check (trade_group in ('dien_nuoc','khoa','dien_lanh','xay_sua')),
  default_mode text check (default_mode in ('fixed','quote')),
  emergency boolean default false
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  id_doc_ref text,
  status text not null check (status in ('pending','active','suspended')) default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table vendor_skills (
  vendor_id uuid references vendors,
  category_code text references job_categories(code),
  primary key(vendor_id, category_code)
);

create table vendor_buildings (
  vendor_id uuid references vendors,
  building_id uuid references buildings,
  primary key(vendor_id, building_id)
);

create table vendor_scores (
  vendor_id uuid primary key references vendors,
  jobs_done int default 0,
  rating_avg numeric(3,2),
  no_show_count int default 0,
  redo_count int default 0,
  updated_at timestamptz default now()
);

-- Slot thang dong gia + dung thu mien phi (Đ14)
create table slot_capacity (
  building_id uuid references buildings,
  trade_group text not null,
  capacity int not null check (capacity >= 1),
  reviewed_at timestamptz default now(),
  primary key(building_id, trade_group)
);

create table vendor_slots (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors,
  building_id uuid references buildings,
  trade_group text not null,
  is_trial boolean not null default false,
  period_start date not null,
  period_end date not null,
  fee int not null check (fee >= 0),
  status text not null check (status in ('active','expired','cancelled')) default 'active',
  created_at timestamptz default now()
);
create unique index one_active_slot on vendor_slots(vendor_id, building_id, trade_group) where status = 'active';
create unique index one_trial_ever on vendor_slots(vendor_id, building_id, trade_group) where is_trial;

create table slot_waitlist (
  building_id uuid references buildings,
  trade_group text not null,
  vendor_id uuid references vendors,
  joined_at timestamptz default now(),
  invited_at timestamptz,
  primary key(building_id, trade_group, vendor_id)
);

create table staff_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('bql_admin','bql_staff','guard')),
  building_id uuid references buildings
);

create table zalo_accounts (
  id text primary key check (id in ('bql','market')),
  display_name text,
  session_enc bytea,
  session_state text not null default 'logged_out',
  last_event_at timestamptz
);

create table zalo_identities (
  zalo_account_id text references zalo_accounts,
  zalo_uid text not null,
  party_type text not null check (party_type in ('resident','vendor','staff')),
  party_id uuid not null,
  primary key(zalo_account_id, zalo_uid)
);

create table inbound_events (
  id bigserial primary key,
  zalo_account_id text not null,
  zalo_msg_id text not null,
  thread_id text not null,
  thread_type text not null check (thread_type in ('user','group')),
  sender_uid text not null,
  is_self boolean not null,
  payload jsonb not null,
  received_at timestamptz default now(),
  processed_at timestamptz,
  unique(zalo_account_id, zalo_msg_id)
);

create table outbox (
  id bigserial primary key,
  zalo_account_id text not null,
  thread_id text not null,
  thread_type text not null,
  kind text not null check (kind in ('text','image','typing','seen')),
  body jsonb not null,
  not_before timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  attempts int default 0,
  zalo_msg_id text,
  job_id uuid,
  created_at timestamptz default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  zalo_account_id text not null,
  thread_id text not null,
  party_type text,
  party_id uuid,
  human_takeover_until timestamptz,
  unique(zalo_account_id, thread_id)
);

create table messages (
  id bigserial primary key,
  conversation_id uuid references conversations,
  direction text check (direction in ('in','out')),
  role text check (role in ('user','assistant','staff')),
  content jsonb not null,
  created_at timestamptz default now()
);

create table agent_runs (
  id bigserial primary key,
  conversation_id uuid,
  route text,
  model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  latency_ms int,
  outcome text,
  created_at timestamptz default now()
);

create table price_book (
  category_code text references job_categories,
  building_id uuid references buildings,
  p25 int,
  p50 int,
  p75 int,
  sample_size int default 0,
  source text check (source in ('seed','observed')),
  updated_at timestamptz default now(),
  primary key(category_code, building_id)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  building_id uuid not null references buildings,
  apartment_id uuid not null references apartments,
  resident_id uuid not null references residents,
  category_code text references job_categories,
  draft jsonb not null,
  responsibility jsonb,
  mode text check (mode in ('fixed','quote')),
  price_low int,
  price_high int,
  window_start timestamptz,
  window_end timestamptz,
  status text not null check (status in (
    'drafting','routed_bql','awaiting_consent','case_open','published','held','confirmed',
    'access_pending','access_granted','dispatched','in_progress','awaiting_acceptance',
    'accepted','disputed','closed','unassigned','cancelled'
  )),
  assigned_vendor_id uuid references vendors,
  hold_expires_at timestamptz,
  case_ticket_id uuid,
  access_ticket_id uuid,
  final_price int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table job_offers (
  id bigserial primary key,
  job_id uuid references jobs,
  vendor_id uuid references vendors,
  kind text check (kind in ('claim','quote')),
  price int,
  eta timestamptz,
  note text,
  status text default 'open' check (status in ('open','won','lost','withdrawn','expired')),
  created_at timestamptz default now(),
  unique(job_id, vendor_id)
);

create table job_events (
  id bigserial primary key,
  job_id uuid references jobs,
  from_status text,
  to_status text not null,
  actor_type text not null,
  actor_id text,
  data jsonb,
  created_at timestamptz default now()
);

create table job_photos (
  id bigserial primary key,
  job_id uuid references jobs,
  phase text check (phase in ('intake','before','after')),
  storage_ref text not null,
  sha256 text not null,
  created_at timestamptz default now()
);

create table access_passes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs,
  vendor_id uuid references vendors,
  code text not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);

create table ratings (
  job_id uuid primary key references jobs,
  stars int check (stars between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

create table ledger_entries (
  id bigserial primary key,
  slot_id uuid references vendor_slots,
  vendor_id uuid references vendors,
  kind text not null check (kind in ('slot_fee','bql_share','waiver','adjustment')),
  amount int not null,
  status text default 'due' check (status in ('due','paid','waived')),
  created_at timestamptz default now()
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references buildings,
  apartment_id uuid,
  resident_id uuid,
  source_job_id uuid references jobs,
  kind text not null check (kind in ('bql_responsibility','unclear','service_case','access_request','dispute','emergency','no_vendor')),
  summary text not null,
  citations jsonb,
  status text default 'open' check (status in ('open','in_progress','approved','rejected','done','closed')),
  decided_by uuid references staff_users,
  decided_at timestamptz,
  decision_note text,
  assignee_id uuid references staff_users,
  created_at timestamptz default now()
);

alter table jobs add constraint jobs_case_ticket_id_fkey foreign key (case_ticket_id) references tickets(id);
alter table jobs add constraint jobs_access_ticket_id_fkey foreign key (access_ticket_id) references tickets(id);

create table kb_documents (
  id text primary key,
  title text not null,
  version text not null,
  status text not null check (status in ('approved','draft','deprecated')),
  effective_from date not null,
  effective_to date
);

create table kb_sections (
  document_id text references kb_documents,
  section_id text,
  heading text,
  body text not null,
  tsv tsvector,
  embedding vector(1024),
  primary key(document_id, section_id)
);

create table audit_log (
  id bigserial primary key,
  actor_type text,
  actor_id text,
  action text not null,
  target text,
  data jsonb,
  created_at timestamptz default now()
);
