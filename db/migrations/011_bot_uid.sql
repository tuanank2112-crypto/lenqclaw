-- 011_bot_uid.sql — ke hoach 02 (D37). Chi THEM: uid cua chinh tai khoan Zalo (worker ghi khi phien connected).
alter table zalo_accounts add column own_uid text;
