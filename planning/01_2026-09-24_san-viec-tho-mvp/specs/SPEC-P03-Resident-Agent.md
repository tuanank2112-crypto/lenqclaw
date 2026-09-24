# SPEC-P03 — Agent cư dân (bước 0–3, pipeline v0.2)

> Hợp đồng 🔴, thi công 🟠. Đọc `01-CONTRACTS.md` §5–§7, §9 và `00-ARCHITECTURE.md` §6 (BB-01, 03, 06, 08).

## §1. Bước 1 — Nhận tin & khẩn cấp (tất định)

- Chuẩn hoá (bỏ dấu, thường hoá) rồi khớp danh sách `EMERGENCY_TERMS`: `chay, khoi, kẹt thang/ket thang, mac ket, ngap, ro gas/mui gas, dien giat, chap dien boc khoi, nuoc tran hanh lang`.
- Khớp ⇒ gửi ngay (bỏ qua pacer jitter, vẫn qua outbox) mẫu `EMERGENCY_REPLY` (hotline BQL + 114/115 tuỳ loại) + tạo `tickets(reason='emergency')` + báo ca trực. Agent vẫn chạy sau đó để hỏi thêm.
- LLM ở bước 2 được đặt `urgency='emergency'` ⇒ cùng hành vi; LLM KHÔNG được hạ cờ đã bật (BB-06).
- `Party.type` ≠ `resident` hoặc `status` ≠ `active` ⇒ chỉ được đăng ký (SPEC-P04 §2) hoặc nhận câu trả lời chung; không tạo cuốc.

## §2. Bước 2 — Chẩn đoán

- Mục tiêu: `JobDraft` đủ để thợ báo giá mà không cần gọi điện. Tối đa **3 câu hỏi** trước khi lưu nháp; mỗi câu một ý.
- Luôn xin ảnh nếu loại việc cần (bảng `job_categories` có cột gợi ý ảnh, seed ở P04).
- Ảnh gửi vào model dạng image block; model mô tả, KHÔNG suy đoán giá.
- `category_code` phải thuộc `job_categories`; không chắc ⇒ `null` + ghi `confidence_note`.
- Ghi bằng `save_job_draft` sau mỗi lượt có thông tin mới (không dồn cuối).

## §3. Bước 2 — Phân loại trách nhiệm (Đ10)

1. Agent gọi `search_regulations` (truy hồi lai: `tsv` + `embedding`, port từ build phase) với hiện tượng + vị trí.
2. Agent gọi `classify_responsibility({party, citations, reason_vi})`. Tool chốt:
   - citations rỗng, nguồn không `approved`, hoặc ngoài `effective_from/to` ⇒ ép `unclear`;
   - hai citation còn hiệu lực kết luận ngược nhau ⇒ `unclear`.
3. **Có trách nhiệm BQL** (`bql` hoặc `unclear`) ⇒ agent gọi `push_bql_ticket` ⇒ ticket lên dashboard; trả lời cư dân kèm trích dẫn (hoặc "BQL sẽ xác nhận trong <SLA>"); agent tiếp tục báo tiến độ khi ticket đổi trạng thái.
4. **Không** (`resident`) ⇒ sang §4.
5. Chưa có quy chế thật ⇒ mọi verdict là `unclear` (đúng thiết kế).

## §4. Bước 3 — Ticket case

- Một tin gửi cư dân gồm: kết luận + trích dẫn ("Theo <tài liệu> mục <x>: …"), câu "BQL sẽ tìm thợ đã được duyệt; anh/chị thanh toán trực tiếp với thợ" (Đ05), khung giá tham khảo nếu `get_price_band` có, 2–3 khung giờ gợi ý, câu hỏi đồng ý.
- Cư dân đồng ý + chọn giờ ⇒ `open_service_case` ⇒ ticket `service_case` (BQL chỉ theo dõi) ⇒ chuyển P05 bước 4.
- `mode`: `job_categories.default_mode`; `price_book` rỗng ⇒ `quote` (thợ báo giá khi nhận). Giá là thông tin kèm cuốc, **không phải cổng**.

## §5. Ngữ cảnh & chi phí

- System prompt cố định (vai, luật trả lời, định dạng trích dẫn) + định nghĩa tool ⇒ đặt `cache_control`; phần biến đổi (ngày giờ, thông tin căn) đặt sau breakpoint.
- Lịch sử: 20 lượt gần nhất của conversation + `JobDraft` hiện tại; không nạp tin của thread khác.
- Ghi `agent_runs` mỗi lượt (token, cache_read, latency, outcome).
- Trả lời tiếng Việt, ≤ 4 câu mỗi tin trừ khi trích dẫn; không markdown bảng.

## §6. Phát triển trên kênh giả lập (Đ13)

P03 thi công và nghiệm thu hoàn toàn trên `SimTransport` (01-CONTRACTS §8): người phát triển đóng vai cư dân ở `/dev/sim`; golden và `evals/scenarios` chạy tự động. Chưa cần Zalo.

## §7. Vùng cấm

- CẤM agent tự kết luận `bql`/`resident` mà không có trích dẫn (BB-03).
- CẤM hứa giá cố định; chỉ nói "khung tham khảo".
- CẤM đề xuất thợ cụ thể theo tên (việc của P05).
- CẤM dùng nội dung tin nhắn kiểu "[userId: …]" làm danh tính (BB-08).

## §8. Lỗi

| Tình huống | Hành vi |
| :-- | :-- |
| `ModelUnavailableError` | "Em đang bận, sẽ trả lời trong vài phút"; retry qua pg-boss; khẩn cấp vẫn chạy (§1) |
| `RegulationUnavailable` | `unclear` ⇒ ticket |
| Cư dân gửi ảnh không đọc được | xin lại ảnh, không đoán |
| Quá 3 câu hỏi mà vẫn mơ hồ | lưu nháp `category_code=null`, `mode='quote'` |

## §9. Nghiệm thu (G08–G10)

Golden (TESTING-ACCEPTANCE §3): `emergency` 100% bật đúng, 0 bỏ sót; `responsibility` ≥ 90% đúng `party` và 100% verdict `resident`/`bql` có citation hợp lệ; `diagnosis` ≥ 85% đúng `category_code`.
