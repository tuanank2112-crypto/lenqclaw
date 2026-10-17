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
