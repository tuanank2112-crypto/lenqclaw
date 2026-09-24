# SPEC-P06 — Theo dõi, nghiệm thu, đóng case (bước 8, pipeline v0.2)

> v0.2: "bước 8/9/10" dưới đây là ba pha của bước 8 trong 00-ARCHITECTURE §4; agent thực hiện qua tool `report_problem`, `close_case`. Trạng thái bắt đầu từ `dispatched` (không còn `confirmed`).

> Tầng 🟠. Đọc `01-CONTRACTS.md` §4–§5 và SPEC-P05 §5.

## §1. Bước 8 — Thi công

- Thợ nhắn `đến C-XXXX` (hoặc bảo vệ bấm "đã vào" ở `/passes`) ⇒ `dispatched → in_progress`, `access_passes.used_at`.
- Agent thợ xin ảnh trước khi làm (khuyến khích, không bắt buộc) ⇒ `job_photos(phase='before')`.
- `xong C-XXXX <giá thực> ` + ≥1 ảnh sau ⇒ `awaiting_acceptance`, `final_price`.

## §2. Bước 9 — Nghiệm thu

- Nhắn cư dân: "Thợ báo đã xong, giá <x>. Anh/chị xác nhận và chấm 1–5 sao?".
- Agent (route `acceptance`) so ảnh trước/sau + mô tả phiếu việc ⇒ nhận xét **tư vấn** gửi kèm (vd "ảnh sau cho thấy nước đã thoát"); không tự nghiệm thu thay cư dân.
- Cư dân xác nhận hoặc im 48 giờ ⇒ `accepted` ⇒ agent gọi `close_case` ⇒ `closed`, ticket `service_case` đóng. Báo không đạt ⇒ `disputed` + ticket `dispute`; BQL xử lý, có quyền miễn phí cuốc.
- Chênh `final_price` so với `price_high` > 30% ⇒ gắn cờ để BQL xem, vẫn cho qua.

## §3. Đóng case — dữ liệu agent học lại

| Việc | Quy tắc |
| :-- | :-- |
| Điểm thợ | `vendor_scores`: `jobs_done+1`, `rating_avg` cập nhật; tranh chấp BQL kết luận lỗi thợ ⇒ `redo_count+1` |
| Bảng giá | `final_price` hợp lệ (không tranh chấp) ⇒ tính lại p25/p50/p75 của `(category, building)`; `sample_size ≥ 5` ⇒ `source='observed'` |
| Bảo hành | pg-boss hẹn +7 ngày: hỏi cư dân "việc C-XXXX còn ổn không?"; báo hỏng lại ⇒ ticket `dispute` gắn thợ cũ |
| Đóng | `closed` (qua `close_case`) |

Không thu phí theo cuốc. Phí duy nhất là phí slot vào nhóm (SPEC-P05 §8, Đ14); thu tiền thật nằm ngoài hệ thống (Đ05), hệ thống chỉ ghi sổ.

## §4. Vùng cấm

- CẤM ghi tiền theo cuốc; chỉ `ledger_entries` loại `slot_fee`/`bql_share`/`waiver`/`adjustment` gắn với slot (Đ14).
- CẤM cập nhật `price_book` từ cuốc `disputed`.
- CẤM để agent tự đổi `rating`.

## §5. Nghiệm thu (G13)

- Kịch bản đầu-cuối trên kênh giả lập (1 cư dân, 3 thợ, 5 cuốc) chạy bằng `evals/scenarios` ⇒ đủ `job_events` cho mọi chuyển, `price_book.sample_size` và `vendor_scores` cập nhật đúng.
- Nhắc bảo hành bắn đúng hạn (đồng hồ giả).
