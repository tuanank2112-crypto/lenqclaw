-- 005_zalo_ui.sql — SPEC-P02-Zalo-Transport.md §9.8: dang xuat + trang thai
-- QR tren trang /zalo (G18, G19). Chi THEM (OPERATIONS.md §7) — KHONG sua
-- 001..004.

alter table zalo_accounts add column logout_requested_at timestamptz;
alter table zalo_accounts add column qr_state text check (qr_state in ('waiting_scan','scanned','expired','declined'));
