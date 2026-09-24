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

- (Chưa có mã nguồn — cập nhật khi gặp.)
