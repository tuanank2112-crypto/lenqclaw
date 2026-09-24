# OPERATIONS — Triển khai & vận hành

## §1. Hạ tầng

- VPS **đặt tại Việt Nam, IP tĩnh**, 2 vCPU / 4 GB RAM / 60 GB SSD, Ubuntu 24.04. Lý do: zca-js nhạy IP; IP datacenter nước ngoài bị đối xử kém hơn (SYSTEM-MAP, phân tích 2026-09-24).
- Domain + HTTPS (Caddy) cho console. Console đứng sau đăng nhập; không mở cổng Postgres ra ngoài.

## §2. Docker Compose

| Service | Image | Ghi chú |
| :-- | :-- | :-- |
| `db` | `pgvector/pgvector:pg16` | volume `pgdata`; chỉ mạng nội bộ |
| `web` | build `apps/web` | cổng 3000 sau Caddy |
| `worker` | build `apps/zalo-worker` | `restart: unless-stopped`; **đúng 1 bản sao** (không scale) |
| `jobs` | build `packages/core` runner pg-boss | xử lý `inbound.process`, timer cuốc, nhắc bảo hành |
| `caddy` | `caddy:2` | TLS |

## §3. Biến môi trường (`.env`, không commit)

`DATABASE_URL` · `SESSION_SECRET` · `ZALO_SESSION_KEY` (32 byte, mã hoá phiên) · `STORAGE_KEY` (mã hoá ảnh CCCD) · `ANTHROPIC_API_KEY` · `MODEL_DEFAULT=claude-opus-5` · `MODEL_<ROUTE>` (tuỳ chọn) · `PACER_*` · `DATA_MODE` (`sim`|`real`) · `TRANSPORT` (`sim`|`zalo`) · `FREE_TRIAL_DAYS` · `SLOT_FEE_MONTHLY` · `SLOT_MIN_JOBS_PER_VENDOR` · `BQL_SHARE_PCT` · `DISPATCH_TIMEOUT_MIN` · `ALERT_EMAIL` / `ALERT_TELEGRAM_*`.

## §4. Quy định tài khoản Zalo (dán lên phòng BQL)

1. Hai tài khoản riêng, SIM riêng: **"BQL Tòa X"** (cư dân) và **"Sàn thợ Tòa X"** (thợ). Không dùng số cá nhân nhân viên.
2. Mỗi tài khoản chỉ đăng nhập trên **một điện thoại**. **CẤM mở Zalo Web / Zalo PC** bằng hai tài khoản này (làm bot bị đá).
3. Đăng nhập QR cho bot làm tại console `/zalo`, điện thoại cùng mạng/khu vực nếu có thể.
4. Nhân viên được trả lời tay trên điện thoại; bot tự im 30 phút ở thread đó.

## §5. Runbook

| Sự cố | Dấu hiệu | Làm gì |
| :-- | :-- | :-- |
| Bị đá phiên | banner đỏ `kicked` | kiểm tra ai mở Zalo Web/PC ⇒ đóng ⇒ đăng nhập QR lại ở `/zalo` |
| Phiên chết | `dead` sau 10 lần thử | QR lại; nếu lặp lại trong ngày ⇒ kiểm IP VPS có đổi không |
| Bị giới hạn gửi | log `RateLimitedError`, tài khoản lùi 30 phút | không làm gì; nếu lặp >3 lần/ngày ⇒ giảm `PACER_*` và ghi `-known-gotchas.md` |
| Tài khoản bị khoá | đăng nhập báo khoá | chuyển thông báo cư dân sang nhóm tòa + hotline; web vẫn nhận ticket tay |
| LLM lỗi kéo dài | nhiều `ModelUnavailableError` | bot trả lời mẫu "BQL sẽ liên hệ"; nhân viên xử lý tay trên console |

## §6. Thứ tự deploy lần đầu

1. `docker compose up -d db` ⇒ chạy migrations ⇒ seed `organizations/buildings/apartments/job_categories`.
2. Tạo `bql_admin` bằng script (mật khẩu nhập tay, không lưu file).
3. `up -d web jobs worker caddy` ⇒ `/zalo` đăng nhập QR 2 tài khoản.
4. Tải quy chế ở `/regulations`; nhập giá seed ở `/pricing`.
5. Chạy `eval_golden` trên VPS (cột `vps` của TESTING-ACCEPTANCE).

## §7. Backup & rollback

- `pg_dump` hằng ngày 02:00, giữ 14 bản, chép ra ngoài VPS (mã hoá). Thư mục `storage/` sao lưu cùng.
- Rollback: giữ image tag trước; `docker compose` về tag cũ; migration chỉ được **thêm** (không drop/đổi kiểu) trong 0.1.x ⇒ code cũ chạy được trên schema mới.

## §8. Nâng zca-js

Chỉ nâng khi có lỗi cần vá hoặc Zalo đổi giao thức: đọc release notes + issue mở ⇒ nâng trên máy dev ⇒ chạy bộ test transport (G04–G06) với tài khoản thử ⇒ deploy ngoài giờ cao điểm. Ghi phiên bản mới vào `-known-gotchas.md`.

## §9. Dữ liệu cá nhân

- Thông báo xử lý dữ liệu khi cư dân/thợ đăng ký (một câu + link). Lưu `consent_at`.
- Giữ tin nhắn 12 tháng, ảnh 6 tháng sau `closed`; job hằng tháng xoá quá hạn.
- Gửi LLM: che SĐT và số căn trong văn bản trước khi gọi model (thay bằng nhãn), trừ khi cần cho nhiệm vụ.
- Chuẩn bị hồ sơ đánh giá chuyển dữ liệu ra nước ngoài (LLM nước ngoài) theo Luật 91/2025/QH15 trước khi chạy với dữ liệu thật — 🖐 việc của người.
