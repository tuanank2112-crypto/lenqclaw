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
