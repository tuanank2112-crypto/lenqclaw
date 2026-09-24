# Known Gotchas & Bugs

Tổng hợp các lỗi khó, các lưu ý dị biệt hoặc cách workaround đặc thù của dự án này để AI không dẫm lại vết xe đổ.

## Zalo cá nhân / zca-js (biết trước khi code — từ phân tích 2026-09-24)

- **G01 — Một tài khoản, một phiên web.** Mở Zalo Web (có tài khoản cả Zalo PC) ⇒ listener bị đá (đóng 3000/3003); sau đó **gửi vẫn được nhưng không nhận được gì**. Đừng tự đăng nhập lại vòng lặp — dừng và báo người.
- **G02 — Listener chết im lặng** sau vài ngày hoặc khi VPS đổi IP. Phải có watchdog "tin cuối cùng" + gọi API đọc nhẹ.
- **G03 — UID khác nhau theo tài khoản nhìn.** Cùng một người có UID khác với `bql` và `market` ⇒ khoá danh tính là `(account, uid)`.
- **G04 — Giới hạn gửi không công bố và hay đổi.** Báo cáo cộng đồng: ~20 người nhận khác nhau ⇒ bị chặn tạm; mã 221 khi gọi `getUserInfo` dồn dập; không trả `msgId` thường là bị giới hạn. Mọi số pacer là cấu hình.
- **G05 — IP datacenter bị đối xử kém** (vd thu hồi tin lỗi 100% từ VPS, chạy tốt từ IP nhà). Dùng VPS Việt Nam IP tĩnh.
- **G06 — `getGroupChatHistory` đã chết (404) từ 06/2026.** Không thiết kế gì dựa vào lấy lại lịch sử nhóm.
- **G07 — Pin đúng phiên bản zca-js** (không `^`); ZaloClaw từng dùng `^2.1.2` và có thể trôi lên bản lỗi.

## Môi trường & Config

- **G08 — Máy đo tĩnh quét theo từng dòng thì bỏ lọt.** `check_adapter_boundary` bản đầu cho qua `import {
 Pool
} from 'pg'`, `pg/lib/client`, `pg-pool`, `INSERT
 INTO outbox`; `check_agent_tools` cho qua `phone?:`, khoá có nháy. Máy đo phải quét cả nội dung file và có ca ĐỎ cho từng dạng (`planning/01_2026-09-24_san-viec-tho-mvp/evidence/P01-v2/checker-bypass-fixed.txt`). Kiểm mã thoát trực tiếp — `script | tail` trả mã của `tail`.
- **G09 — Trang Next đọc biến môi trường lúc chạy phải `force-dynamic`.** `/dev/sim` đọc `DATA_MODE`; bản build prerender tĩnh ⇒ 404 ở `next start` dù `next dev` trả 200. Luôn đo bằng `next build && next start`.
- **G10 — Không chạy handler (nhất là LLM) trong transaction khoá dòng.** `processInbound` bản đầu: handler trong `tx`, `enqueue` ghi outbox qua kết nối khác ⇒ lỗi thì trả lời trùng; 12 lời gọi đồng thời cạn pool, treo. Nhận-trước (`UPDATE … RETURNING`) rồi xử lý ngoài transaction.
- **G11 — Windows:** `spawn('npm', …)` cần `shell: true` (không thì `EINVAL`). Máy dev có container `zalo-crm` giữ cổng 3080 ⇒ Postgres dev dùng `127.0.0.1:55432`.
- **G12 — Ghi audit "thành công" SAU bước có thể hỏng cuối cùng.** Login bản đầu ghi `auth.login.ok` trước khi tạo cookie ⇒ thiếu `SESSION_SECRET` vẫn có dòng ok.
- **G13 — Gemini: đời 2 đã đóng với key mới, đời 3 hay 503.** Probe 2026-09-24: mọi `gemini-2.x` trả 404 "no longer available to new users" dù vẫn có tên trong `ListModels`; `gemini-3.5-flash`/`3.1-flash-lite`/`flash-latest` 503 "high demand"; `gemini-3.6-flash` và `gemini-3-flash-preview` 200, gọi tool được, trả `thoughtSignature` (phải gửi lại trong vòng tool). Luật: probe trước khi chạy golden; model dự phòng đặt ở `MODEL_FALLBACKS`. Key đặt ở `.env` (gitignore), gửi qua header `x-goog-api-key`, không để trong URL.
