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
