# SPEC-P04 — Thợ & Console BQL

> Tầng 🟠. Đọc `01-CONTRACTS.md` §3, §4, §7.

## §1. Auth console

- Đăng nhập email + mật khẩu (scrypt), cookie phiên HMAC, hết hạn 12 giờ. Vai: `bql_admin` (mọi thứ), `bql_staff` (cuốc, ticket, duyệt cư dân), `guard` (chỉ xem thẻ vào tòa hôm nay).
- Mọi Server Action ghi `audit_log`.

## §2. Đăng ký cư dân (qua tài khoản `bql`)

Người lạ nhắn ⇒ agent hỏi: tòa, căn, họ tên, SĐT, vai (chủ/thuê/thành viên), đồng ý điều khoản dữ liệu (một câu, có link) ⇒ `residents(status='pending', consent_at)` + `zalo_identities`. Nhân viên duyệt trên console ⇒ `active`.

## §3. Đăng ký thợ (qua tài khoản `market`)

1. Thợ nhắn tài khoản `market` hoặc được thêm vào nhóm ⇒ agent thợ hỏi: họ tên, SĐT, loại việc (chọn từ `job_categories`), tòa phục vụ, ảnh CCCD mặt trước.
2. Ảnh CCCD lưu mã hoá (`id_doc_ref`), chỉ `bql_admin` xem được; CẤM OCR số CCCD vào DB.
3. `vendors(status='pending')` ⇒ console hàng chờ duyệt ⇒ `active` (ghi `approved_by/at`) hoặc từ chối kèm lý do.
4. Thợ `active` **có slot còn hạn (trả phí hoặc dùng thử)** mới được vào nhóm "Thợ Tòa X · <nhóm nghề>" (nhân viên thêm tay; hệ thống không tự thêm) (Đ14).

## §3b. Dữ liệu mô phỏng (Đ11)

`scripts/seed_sim.mjs`: 1 tổ chức, 1 tòa ("B"), 300 căn, 40 cư dân, 12 thợ (4 nhóm nghề; có slot trả phí, slot dùng thử, danh sách chờ), 30 ngày ticket/case phân bố theo giờ trong ngày, đủ mọi trạng thái của 01-CONTRACTS §5, dòng thời gian `job_events` đầy đủ. Mọi dòng có cờ `is_sim=true`; dashboard hiện nhãn "DỮ LIỆU MÔ PHỎNG" khi `DATA_MODE=sim`. CẤM trộn dữ liệu mô phỏng với dữ liệu thật trong cùng DB production. Mockup tham chiếu: `docs/images/09-dashboard-bql-mockup.png` (UI sẽ tinh gọn sau — Đ11).

## §4. Trang console (vòng 0.1 — TỐI THIỂU, Đ13)

Chỉ những trang agent cần để chạy pipeline v0.2: 2 điểm duyệt (`/tickets`), xem case + dòng thời gian agent (`/jobs`), quy chế (`/regulations`), duyệt cư dân/thợ, trạng thái kênh (`/zalo`), thẻ vào tòa cho bảo vệ (`/passes`). `/pricing` chỉ để nhập giá seed. Thêm `/vendors` (thợ & slot) và `/ledger` cho phí vào nhóm (Đ14).

| Trang | Vai | Chức năng |
| :-- | :-- | :-- |
| `/zalo` | admin | trạng thái 2 tài khoản, nút đăng nhập QR, lịch sử kick/reconnect |
| `/residents` | staff | hàng chờ duyệt, tìm theo căn |
| `/vendors` ("Thợ & slot") | admin | duyệt thợ, kỹ năng, tòa, điểm, số bùng, đình chỉ · **slot (Đ14)**: trần theo (tòa × nhóm nghề), thành viên (dùng thử / trả phí), ngày hết hạn, danh sách chờ, nút "Đã thu phí", nhắc "cần thêm/gỡ khỏi nhóm Zalo" |
| `/ledger` | admin | sổ phí slot theo thợ và kỳ; phần BQL; đánh dấu đã thu/miễn |
| `/jobs` | staff | bảng case/cuốc theo trạng thái + dòng thời gian việc agent đã làm (`job_events`) |
| `/tickets` | staff | **dashboard chính**: ticket `bql_responsibility`/`unclear` (BQL xử lý) · `service_case` (theo dõi việc trong căn) · **`access_request` với nút Duyệt / Từ chối** (Đ10, một bấm; từ chối bắt buộc lý do) · `dispute`/`emergency`/`no_vendor`; gán người, đổi trạng thái; ticket quá hạn đổi màu |
| `/regulations` | admin | tải quy chế (docx/pdf/md) ⇒ tách mục ⇒ `kb_sections`; đặt `status`, `effective_from/to`; loại mục khỏi trả lời |
| `/pricing` | admin | seed `job_categories` + `price_book` (p25/p50/p75); xem giá quan sát được |
| `/passes` | guard | thẻ vào tòa sinh ra từ ticket `access_request` đã duyệt, còn hiệu lực hôm nay: mã, tên thợ, căn, khung giờ; nút "đã vào" |

## §5. Seed `job_categories` ban đầu

`thong_tac_bon_rua`, `thong_tac_bon_cau`, `thong_tac_thoat_san`, `thay_ruot_khoa`, `mo_khoa`, `sua_voi_nuoc`, `ro_ri_ong_nhanh`, `ve_sinh_may_lanh`, `sua_may_lanh`, `thay_o_cam_cong_tac`, `sua_den`, `chong_tham` (mặc định `quote`), `khac` (`quote`). Mỗi dòng có `default_mode`; giá seed do BQL nhập từ số đo P00.

## §6. Vùng cấm

- CẤM console hiển thị số CCCD dạng chữ; CẤM xuất danh sách cư dân kèm SĐT ra file.
- CẤM tạo cuốc từ console bỏ qua bước 3 (trách nhiệm) — trừ khi admin ghi lý do (lưu `audit_log`).

## §7. Nghiệm thu (G07)

- Thợ `pending` gửi "nhận C-xxxx" ⇒ bị từ chối (BB-10).
- `guard` truy cập `/vendors` ⇒ 403.
- Tải quy chế mẫu 10 mục ⇒ 10 dòng `kb_sections`, `search_regulations` trả đúng mục trong 5 truy vấn thử.
