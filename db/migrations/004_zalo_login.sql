-- 004_zalo_login.sql — SPEC-P02-Zalo-Transport.md §9.2 (Đ22): dang nhap QR
-- khong qua pg-boss. Web dat `login_requested_at`; worker quet cot nay moi
-- 2 s, ghi `qr_data_url` + `qr_expires_at` (now()+3 phut) cho trang /zalo.
-- `updated_at` la moc compare-and-set khi ghi lai `session_enc` (§2.4).
-- Chi THEM (OPERATIONS.md §7) — KHONG sua 001..003.

alter table zalo_accounts add column login_requested_at timestamptz;
alter table zalo_accounts add column qr_data_url text;
alter table zalo_accounts add column qr_expires_at timestamptz;
alter table zalo_accounts add column updated_at timestamptz not null default now();
