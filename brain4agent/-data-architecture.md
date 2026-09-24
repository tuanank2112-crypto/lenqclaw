# Master Data Architecture & Flow

Tài liệu thiết kế về cấu trúc dữ liệu, cơ chế lưu trữ bền vững (Persistence Layer) và luồng luân chuyển dữ liệu đa tầng.

> **Trạng thái 2026-09-24: THIẾT KẾ, CHƯA CÓ DB.** Nguồn chân lý DDL: [`planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md`](../planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md) §4–§5. File này chỉ tóm tắt.

## 1. Các Tầng Lưu Trữ (Data Persistence Stores)

- **PostgreSQL 16 + pgvector** (một instance, Docker, VPS Việt Nam) — mọi thứ: danh tính, hội thoại, cuốc, sổ, quy chế + embedding.
- **pg-boss** (trên chính Postgres) — hàng đợi `inbound.process`, timer giữ cuốc, nhắc bảo hành.
- **`storage/`** (đĩa VPS) — ảnh theo sha256; ảnh CCCD mã hoá bằng `STORAGE_KEY`.
- **Phiên Zalo** — `zalo_accounts.session_enc` mã hoá AES-256-GCM bằng `ZALO_SESSION_KEY`; CẤM lưu dạng rõ, CẤM log.

## 2. Schema & Data Flow

Nhóm bảng:
- **Tổ chức:** `organizations → buildings → apartments` (có `org_id` sẵn cho nhân rộng).
- **Con người:** `residents`, `resident_apartments`, `vendors` (+ `vendor_skills`, `vendor_buildings`, `vendor_scores`), `staff_users`.
- **Zalo:** `zalo_accounts` (`bql`, `market`), `zalo_identities` (khoá `(account, uid)` vì UID khác nhau theo tài khoản nhìn), `inbound_events` (unique `(account, zalo_msg_id)`), `outbox`, `conversations` (`human_takeover_until`), `messages`, `agent_runs`.
- **Cuốc:** `job_categories` (có `trade_group`), `price_book` (p25/p50/p75 theo loại × tòa), `jobs` (máy trạng thái 01-CONTRACTS §5), `job_offers`, `job_events`, `job_photos`, `access_passes`, `ratings`.
- **Phí vào nhóm (Đ14):** `slot_capacity` (trần theo tòa × nhóm nghề), `vendor_slots` (`is_trial`, một slot active mỗi thợ × tòa × nhóm nghề, dùng thử 1 lần), `slot_waitlist`, `ledger_entries` (chỉ `slot_fee`/`bql_share`/`waiver`/`adjustment`, không phí theo cuốc).
- **Sổ lợi ích (Đ15, dự kiến ở SPEC-P08):** view tổng hợp theo tháng — thu nhập mỗi thợ (từ `jobs.final_price` đã `closed`), tỷ lệ thu nhập/phí theo (tòa × nhóm nghề), case agent xử lý trọn, lượt vào tòa có duyệt; không thêm bảng tiền mới ngoài `ledger_entries`.
- **BQL:** `tickets`, `kb_documents`, `kb_sections` (tsv + embedding), `audit_log`.

Luồng:
1. Kênh (`SimTransport` khi phát triển, Zalo worker khi chạy thật — Đ13) → `inbound_events` (chống trùng) → pg-boss theo làn thread → pipeline core.
2. Core → `outbox` → pacer trong worker → Zalo. Không đường tắt (BB-04).
3. Ticket là trục (Đ10): `bql_responsibility`/`unclear` (BQL xử lý) · `service_case` (theo dõi việc trong căn) · `access_request` (BQL duyệt/từ chối). Cuốc đi `drafting → awaiting_consent → case_open → published → held → confirmed → access_pending → access_granted → dispatched → in_progress → awaiting_acceptance → accepted → closed` bằng `UPDATE … WHERE status=<from>` + `job_events` trong một transaction (BB-05, BB-09, BB-11).
4. Cuốc `closed` (tool `close_case`) → cập nhật `price_book` và `vendor_scores` → dùng lại khi đăng cuốc (khung giá, bước 4) và khi lọc thợ đủ điều kiện (bước 5).
