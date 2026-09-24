# SPEC-P02 — Zalo Transport

> Tầng 🔴. Đọc `01-CONTRACTS.md` §3, §4 (bảng `zalo_*`, `inbound_events`, `outbox`, `conversations`), §8, §9 trước.
> Nền kiến thức: `docs/SYSTEM-MAP.md` và phân tích zca-js (phiên 2026-09-24): một tài khoản chỉ một phiên web; mở Zalo Web/PC ⇒ bị đá (mã 3000/3003) và listener chết nhưng gửi vẫn được; listener có thể chết im lặng; IP datacenter bị đối xử kém hơn.

## §1. Tiến trình `apps/zalo-worker`

- Một tiến trình, hai phiên zca-js: `bql`, `market`. `zca-js` pin **đúng một phiên bản** trong `package.json` (không `^`).
- Worker KHÔNG chứa logic nghiệp vụ: chỉ (a) nhận ⇒ ghi `inbound_events`, (b) đọc `outbox` ⇒ gửi, (c) quản lý phiên.
- Khởi động: đọc `zalo_accounts.session_enc` (giải mã bằng `ZALO_SESSION_KEY`, AES-256-GCM) ⇒ `login(cookie, imei, userAgent)`; thất bại ⇒ `session_state='logged_out'`, chờ QR.

## §2. Đăng nhập QR qua web

1. Console `POST /api/zalo/{account}/login` ⇒ đặt job `zalo.login_qr`.
2. Worker gọi `loginQR`, ghi ảnh QR vào `zalo_accounts` (trường tạm, TTL 3 phút) ⇒ web hiển thị.
3. Quét xong ⇒ **chỉ lưu credentials sau khi gọi thử một API đọc thành công** (khác ZaloClaw lưu ngay khi `GotLoginInfo`).
4. Mọi lần refresh cookie từ zca-js ⇒ ghi lại `session_enc` (compare-and-set theo `updated_at`).

## §3. Luồng vào

1. Listener nhận `message` ⇒ chuẩn hoá ⇒ `INSERT … ON CONFLICT (zalo_account_id, zalo_msg_id) DO NOTHING` (chống trùng).
2. **Tin do chính tài khoản gửi (`is_self`)** vẫn được ghi: nếu tài khoản `bql` và tin không đến từ outbox (không khớp `outbox.zalo_msg_id`) ⇒ đặt `conversations.human_takeover_until = now() + 30 phút` (nhân viên đang trả lời tay ⇒ bot im).
3. Ảnh: tải bằng cookie phiên, giới hạn 10 MB, kiểm magic bytes (jpeg/png/webp), lưu `storage/` theo sha256, CẤM theo redirect sang host khác.
4. `pg-boss` job `inbound.process` theo **làn = thread_id**: một thread xử lý tuần tự; tối đa 4 thread song song. Tin đến trong 2,5 giây được gom thành một lượt.
5. Nhóm Zalo của tài khoản `market`: chỉ đưa vào pipeline các tin khớp mẫu `^\s*(nhận|nhan)\s+C-[A-Z0-9]{4}\s*$` hoặc `^\s*ok\s*$` trả lời trong hạn giữ; tin khác trong nhóm **không lưu**.
6. Chỉ nghe sự kiện `message`, `undo` (đánh dấu tin bị thu hồi), `closed`, `error`. Không gửi "đã xem" trước khi tin qua bước nhận diện (khác zalouser).

## §4. Nhận diện người gửi

`(zalo_account_id, sender_uid)` ⇒ `zalo_identities` ⇒ `Party`. Không có ⇒ `unknown` (chỉ được hỏi đăng ký). Nội dung tin KHÔNG BAO GIỜ được dùng để suy ra danh tính (BB-08).

## §5. Outbox pacer

Chạy mỗi 1 giây, lấy `outbox` `queued` có `not_before <= now()`:

| Giới hạn | Giá trị ban đầu | Nguồn |
| :-- | :-- | :-- |
| Giữa 2 tin cùng thread | ≥ 3 s + jitter 0–2 s | thận trọng, suy từ báo cáo cộng đồng zca-js |
| Toàn tài khoản | ≤ 10 tin/phút | như trên |
| Người nhận khác nhau | ≤ 15 / 10 phút / tài khoản | báo cáo "20 người nhận ⇒ bị chặn" |
| Tin dài | tách ≤ 1.800 ký tự, mỗi đoạn một hàng outbox | |
| "Đang gõ" | gửi trước tin trả lời, trễ 1–3 s tỷ lệ độ dài | |
| "Đã xem" | chỉ cho thread đã nhận diện, trễ 2–6 s | |

- Thread có `human_takeover_until > now()` ⇒ tin của bot chuyển `cancelled` (trừ tin khẩn cấp).
- Lỗi giới hạn / không trả `msgId` / mã 221 ⇒ tài khoản vào trạng thái lùi 30 phút, tin giữ `queued` (`RateLimitedError`).
- Mọi con số là cấu hình (`PACER_*` env), đổi phải ghi `-known-gotchas.md` kèm lý do.

## §6. Watchdog phiên

| Tín hiệu | Hành vi |
| :-- | :-- |
| đóng mã 3000/3003 (bị đá / trùng phiên) | `kicked`; **không tự đăng nhập lại**; báo động; chờ người mở QR |
| đóng 1006 / lỗi mạng | `reconnecting`; đăng nhập lại bằng cookie, lùi 5 s → 5 phút; quá 10 lần ⇒ `dead` + báo động |
| không có sự kiện nào 20 phút trong giờ 7–22h | gọi một API đọc nhẹ; lỗi ⇒ coi như 1006 |
| cookie hết hạn | `logged_out` + báo động |

Báo động = banner đỏ trên console + email/Telegram cho `bql_admin` (OPERATIONS §5).

## §7. Vùng cấm

- CẤM gửi lời mời kết bạn tự động; CẤM nhắn chủ động người chưa từng nhắn tài khoản (trừ nhóm thợ).
- CẤM đăng nhập Zalo Web/PC bằng hai tài khoản này (ghi vào OPERATIONS).
- CẤM log cookie/imei; CẤM lưu credentials dạng rõ.
- CẤM để core gọi zca-js trực tiếp (BB-07).

## §8. Nghiệm thu (G04–G06, chi tiết ở TESTING-ACCEPTANCE)

- Tin trùng 3 lần ⇒ 1 dòng `inbound_events`.
- Giả lập 50 tin ra cho 20 người ⇒ không vi phạm bảng §5 (log thời điểm gửi, script kiểm).
- Giả lập đóng 3003 ⇒ `kicked`, không có vòng đăng nhập lại, có báo động.
- Nhân viên gửi tay 1 tin ⇒ tin bot kế tiếp của thread đó bị `cancelled`.
