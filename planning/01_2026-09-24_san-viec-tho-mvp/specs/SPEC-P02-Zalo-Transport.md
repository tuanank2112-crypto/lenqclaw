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

## §9. Giai đoạn 1 — chốt thi công (Đ22 — Super Orchestrator 🔴, 2026-09-25)

Người dùng duyệt đưa P02 lên chạy song song (lật một phần thứ tự Đ13). Mục này THẮNG §1–§8 chỗ mâu thuẫn; chỗ không nói thì §1–§8 giữ nguyên.

### §9.1 Phạm vi giai đoạn 1
- CHỈ tài khoản `bql` (agent cư dân, thread `user`). Mã cho `market` được phép tồn tại nhưng KHÔNG bật: env `ZALO_ACCOUNTS=bql` (danh sách phẩy). Nhóm thợ = P05.
- Chạy trên máy dev (IP nhà), `DATA_MODE=sim` (quy chế `QC-DEMO`), `TRANSPORT=zalo`. VPS = P07.
- Chỉ text. Tin ảnh/sticker/file ⇒ ghi `inbound_events` đủ payload, core nhận nội dung `"[cư dân gửi <loại> — chưa hỗ trợ]"` (tải ảnh §3.3 dời sang giai đoạn 2).
- Báo động = `zalo_accounts.session_state` + banner đỏ trên trang `/zalo` + `audit_log action='zalo.alert'`; email/Telegram dời P07.

### §9.2 Không pg-boss — thay §2.1 và §3.4
- Đăng nhập QR: `POST /api/zalo/{account}/login` (chỉ `bql_admin`) ⇒ `update zalo_accounts set login_requested_at=now()`; worker quét cột này mỗi 2 s ⇒ `loginQR` ⇒ ghi `qr_data_url` + `qr_expires_at` (now()+3 phút) ⇒ trang `/zalo` tự làm mới 3 s và hiển thị. Quét xong ⇒ gọi thử một API đọc ⇒ thành công mới lưu `session_enc`, xoá `qr_*`, `session_state='connected'`.
- Xử lý tin vào: tiến trình MỚI `packages/core/src/runner/inbound-runner.ts` (npm `core:run`): vòng lặp gọi `processInbound(routeInboundEvent)` (có sẵn, nhận-trước-xử-lý-sau) mỗi 1 s, đúng MỘT bản sao ⇒ tuần tự toàn cục, tự nhiên đúng thứ tự theo thread. Gom tin 2,5 s: KHÔNG làm ở giai đoạn 1.
- Migration `004_zalo_login.sql` (chỉ thêm): `zalo_accounts` thêm `login_requested_at timestamptz`, `qr_data_url text`, `qr_expires_at timestamptz`, `updated_at timestamptz not null default now()` (compare-and-set §2.4).

### §9.3 Ranh giới mã
- `apps/zalo-worker` bọc zca-js sau interface `ZaloClientLike` (login bằng cookie, `loginQR`, listener `message/undo/closed/error`, `sendMessage`, `sendTypingEvent`, `sendSeenEvent`, một API đọc nhẹ) — test dùng bản giả, 0 mạng.
- `zca-js`: tra `npm view zca-js version` lúc thi công, pin ĐÚNG bản đó (không `^`), đối chiếu `.d.ts` thật của bản đã cài, ghi phiên bản vào report. `zca-js` chỉ được import trong `apps/zalo-worker` (máy đo biên đã canh).
- Mã hoá phiên: AES-256-GCM, khoá 32 byte từ env `ZALO_SESSION_KEY` (base64 hoặc hex); thiếu/sai độ dài ⇒ worker từ chối khởi động (exit 1). Bản rõ = JSON `{cookie, imei, userAgent}`; CẤM log.
- Pacer §5 chạy trong worker; mọi số lấy từ env `PACER_*` có mặc định bằng bảng §5.

### §9.4 Gắn Zalo thật vào cư dân mô phỏng (chỉ `DATA_MODE=sim`)
- Người lạ nhắn `bql` ⇒ `REGISTER_REPLY` (đúng SPEC-P03). Để thử agent, lệnh `npm run dev:link-zalo -- --account bql --resident sim-res-1 [--uid <uid>]`: bỏ `--uid` ⇒ lấy `sender_uid` của tin `inbound_events` mới nhất chưa có danh tính trên tài khoản đó; ghi `zalo_identities` (party `resident`). `DATA_MODE≠sim` ⇒ exit 1. Đăng ký cư dân thật = SPEC-P04 §2, không làm ở đây.

### §9.5 Nghiệm thu giai đoạn 1
- Máy (fake zca-js, `npm test`/`test:db`): 4 ca §8 + mã hoá/giải mã phiên (sai khoá ⇒ lỗi, không rò bản rõ) + CAS `session_enc` + `is_self` không khớp outbox ⇒ takeover 30 phút + tin ảnh ⇒ nội dung thay thế + `dev:link-zalo` + runner xử lý tin vào ⇒ outbox.
- Người (SO + người dùng, sau khi worker nộp): quét QR bằng Zalo phụ ⇒ `connected`; nhắn từ Zalo cá nhân ⇒ `REGISTER_REPLY`; `dev:link-zalo` ⇒ nhắn "vòi bồn rửa nhà em bị rỉ nước" ⇒ agent trả lời trong ≤ 30 s; nhắn "nhà em bốc khói" ⇒ `EMERGENCY_REPLY`. Ghi `evidence/P02/live.txt`.

### §9.6 Vùng cấm giai đoạn 1
- CẤM bật `market`, CẤM gửi vào nhóm. CẤM tự đăng nhập lại sau 3000/3003 (§6). CẤM pg-boss (lý do: chưa có runner jobs; một runner tuần tự đủ cho 1 tòa).
- CẤM chạy hai bản worker hay hai bản `core:run` cùng lúc (G01 + thứ tự tin).
- CẤM dùng Zalo chính của người dùng làm tài khoản `bql` (rủi ro khoá — OPERATIONS).

### §9.7 Chốt câu hỏi mở R07 (SO, 2026-09-25)
- Q2 takeover: pacer CHỈ huỷ tin bot khi nhân viên gửi tay trong thread (tin `is_self` không khớp outbox) trong 30 phút; takeover do `handoff_to_staff` đặt thì tin đang chờ (vd `BUSY_REPLY`) VẪN gửi, còn agent im ở các lượt sau (SPEC-P03 §11.6). Thay câu "thread có `human_takeover_until > now()` ⇒ `cancelled`" ở §5.
- Q4 `outbox` không có `sent_at`: chấp nhận xấp xỉ theo `created_at` ở giai đoạn 1; cột `sent_at` vào migration giai đoạn 2.
- Q5 các mặc định worker tự chọn (thử lại lỗi gửi 30 s × 5 ⇒ `failed`; đồng bộ cookie 10 phút; `ZaloApiError` khi đăng nhập lại ⇒ cookie hết hạn; outbox `image` ⇒ `failed`; không khoá cứng 2 bản) — chấp nhận cho giai đoạn 1.
- Q6 `createTransport('zalo')`: core chỉ dùng `enqueue()` ghi outbox, không cần transport theo env ⇒ giữ `TRANSPORT=sim` cho `/dev/sim`; bỏ lỗi này ở giai đoạn 2.
- Test đếm migration KHÔNG được ghi cứng số: `applied` = số file `db/migrations/*.sql`.

### §9.8 Đăng xuất + trạng thái QR trên `/zalo` (SO, 2026-09-25 — sau chạy thử: G18, G19)
- Migration `005_zalo_ui.sql` (chỉ thêm): `zalo_accounts` thêm `logout_requested_at timestamptz`, `qr_state text check (qr_state in ('waiting_scan','scanned','expired','declined'))`.
- `POST /api/zalo/{account}/logout` (chỉ `bql_admin`; vai khác 403) ⇒ đặt `logout_requested_at=now()`. Worker quét cùng nhịp 2 s với `login_requested_at` ⇒ dừng listener + pacer của tài khoản đó, `session_enc=null`, xoá `qr_*`, `session_state='logged_out'`, `logout_requested_at=null`, `audit_log action='zalo.logout'` (actor = staff đã bấm, lấy từ route, ghi vào cột tạm hoặc audit phía web — chọn một, ghi report). Worker KHÔNG chạy ⇒ route vẫn tự xoá `session_enc` + đặt `logged_out` trong cùng transaction (không để phiên mồ côi).
- Sự kiện QR của zca-js ⇒ `qr_state`: `qr`⇒`waiting_scan`, `scanned`⇒`scanned`, `expired`⇒`expired`, từ chối trên điện thoại ⇒ `declined`; đăng nhập xong ⇒ `null`.
- Trang `/zalo`: `waiting_scan` ⇒ ảnh QR + đồng hồ đếm ngược tới `qr_expires_at`; `scanned` ⇒ "Đã quét — bấm XÁC NHẬN trên điện thoại Zalo phụ" (ẩn ảnh QR); `expired`/`declined` ⇒ nút "Lấy mã QR mới". `connected` ⇒ nút "Đăng xuất Zalo" có hộp xác nhận nói rõ: "Hệ thống xoá phiên; để gỡ hẳn, vào Zalo trên điện thoại → quản lý thiết bị đăng nhập" (G18).
- CẤM tự động xin QR mới khi hết hạn (tránh vòng QR vô hạn khi không có người).
