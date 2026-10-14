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
