-- 006_dispatch_slots.sql — SPEC-P05-Dispatch.md §10.2.1 (Đ27, P05-B). Chi
-- THEM (OPERATIONS.md §7) — KHONG sua 001..005.

create table vendor_groups (
  building_id uuid not null references buildings,
  trade_group text not null check (trade_group in ('dien_nuoc','khoa','dien_lanh','xay_sua')),
  zalo_account_id text not null default 'market' references zalo_accounts,
  thread_id text not null,                      -- id nhom Zalo that (P02 g2) hoac 'sim-market-<trade_group>'
  created_at timestamptz default now(),
  primary key (building_id, trade_group),
  unique (zalo_account_id, thread_id)
);

alter table jobs add column publish_expires_at timestamptz;          -- §10.8.1 (2)
alter table jobs add column republish_count int not null default 0;  -- so lan dang lai vi het han giu
alter table jobs add column timeout_republished_at timestamptz;      -- dang lai vi DISPATCH_TIMEOUT (1 lan)
alter table job_offers add column over_band boolean not null default false;  -- bao gia vuot khung cho cu dan
alter table vendor_slots add column reminded_at timestamptz;         -- nhac 3 ngay truoc han (1 lan)
alter table tickets add column reminded_at timestamptz;              -- nhac BQL duyet (1 lan)

create index if not exists jobs_status_publish_expires_idx on jobs(status, publish_expires_at);
create index if not exists jobs_status_hold_expires_idx on jobs(status, hold_expires_at);
create index if not exists vendor_slots_active_idx on vendor_slots(building_id, trade_group, period_end) where status = 'active';
create index if not exists access_passes_job_idx on access_passes(job_id);
create index if not exists job_events_job_to_status_idx on job_events(job_id, to_status, created_at);
