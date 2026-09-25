# 00 — KIẾN TRÚC & BẤT BIẾN · Sàn việc thợ MVP

> **Trạng thái:** hợp đồng kiến trúc, khoá cho vòng `0.1.x`.
> **Nguồn chân lý cấp trên:** [`../plan.md`](../plan.md) §2 (Đ01–Đ09). Mâu thuẫn ⇒ `plan.md` thắng, rồi tới file này, rồi `docs/`.
> **Người đọc mục tiêu:** worker không có lịch sử hội thoại.
> **Sơ đồ:** [`../../../docs/images/08-pipeline-chuan.png`](../../../docs/images/08-pipeline-chuan.png)

## 1. Router thứ tự đọc

| # | File | Đọc khi nào | Bỏ qua được |
| :-- | :-- | :-- | :-- |
| 1 | `00-ARCHITECTURE.md` | Luôn luôn | ❌ |
| 2 | [`01-CONTRACTS.md`](01-CONTRACTS.md) | Trước khi viết bất kỳ type/DDL/API | ❌ |
| 3 | [`SPEC-P00-Concierge-Validation.md`](SPEC-P00-Concierge-Validation.md) | Tham khảo — ngoài phạm vi build (Đ13) | ✅ |
| 4 | [`SPEC-P02-Zalo-Transport.md`](SPEC-P02-Zalo-Transport.md) | Làm P02, hoặc bất cứ gì gửi/nhận Zalo | ✅ |
| 5 | [`SPEC-P03-Resident-Agent.md`](SPEC-P03-Resident-Agent.md) | Làm P03 | ✅ |
| 6 | [`SPEC-P04-Vendor-Console.md`](SPEC-P04-Vendor-Console.md) | Làm P04 | ✅ |
| 7 | [`SPEC-P05-Dispatch.md`](SPEC-P05-Dispatch.md) | Làm P05 | ✅ |
| 8 | [`SPEC-P06-Execution-Settlement.md`](SPEC-P06-Execution-Settlement.md) | Làm P06 | ✅ |
| 9 | [`OPERATIONS.md`](OPERATIONS.md) | Trước lần deploy đầu tiên | ❌ |
| 10 | [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md) | Trước khi báo "xong" bất kỳ gói nào | ❌ |

P01: [`SPEC-P01-Foundation.md`](SPEC-P01-Foundation.md) (Đ16) — đọc cùng `01-CONTRACTS.md` §1–§4, §8 và `OPERATIONS.md` §2–§3.

## 2. Mục tiêu

1. Cư dân nhắn Zalo mô tả hỏng hóc trong căn ⇒ nhận được thợ đã được BQL duyệt, có khung giá tham chiếu, thợ vào được tòa.
2. BQL không còn phải từ chối "việc trong căn" và không còn kẹt giữa tranh chấp trách nhiệm: mọi phân định có trích dẫn quy chế.
3. Thợ nhận cuốc chuẩn hoá qua Zalo, chốt bằng một chữ "nhận".
4. Mỗi cuốc để lại dữ liệu: giá thật, điểm thợ, lịch sử sự cố theo căn.

## 3. Non-goals (vòng 0.1)

| Không làm | Lý do |
| :-- | :-- |
| Thanh toán, ví, thu hộ | Đ05 |
| FOMO / marketing kéo thợ, kiểm chứng thị trường (P00/G0) | Đ13 — tài liệu cho nhà đầu tư, không phải việc build (phí vào nhóm thì TRONG phạm vi — Đ14) |
| Booking tiện ích, hỏi đáp tổng quát | Đ01 — vào Idea Vault |
| Zalo OA, app di động | Đ02 — chỉ giữ interface `Transport` |
| Nhiều tổ chức, liên tòa | Pilot 1–2 tòa; schema có `org_id` để khỏi migrate sau |
| Đấu giá hạ giá | Đ04 — chống phá giá |
| Tool `exec`, đọc file hệ thống, tự cập nhật từ chat | Bài học từ ZaloClaw (xem `docs/SYSTEM-MAP.md`) |

## 4. Pipeline v0.2 — agent điều phối trọn vòng (Đ10)

Agent là tác nhân thực hiện **mọi** bước bằng tool. Luật cứng nằm **trong** tool: tool nào vi phạm luật thì từ chối, agent nhận lỗi và xử lý tiếp. Người chỉ can thiệp ở 2 điểm duyệt trên dashboard BQL.

| # | Bước | Agent làm (tool) | Chốt chặn trong tool | Người |
| :-- | :-- | :-- | :-- | :-- |
| 0 | Nhận tin | (worker) chống trùng, xếp làn, gắn `Party` | khẩn cấp khớp từ khoá ⇒ hotline + ca trực ngay, không chờ agent (Đ09) | — |
| 1 | Chẩn đoán | hỏi ≤3 câu, xem ảnh, `save_job_draft` | `category_code` phải thuộc danh mục | — |
| 2 | Phân loại trách nhiệm | `search_regulations` → `classify_responsibility` | không có trích dẫn còn hiệu lực ⇒ ép `unclear` (BB-03) | — |
| 2a | ↳ **có** (BQL / chưa rõ) | `push_bql_ticket` ⇒ ticket lên dashboard, báo cư dân kèm trích dẫn | — | **BQL xử lý** ticket |
| 3 | ↳ **không**: Ticket case | báo cư dân kết luận + xin đồng ý tìm thợ ⇒ `open_service_case` | cần cư dân đồng ý | — |
| 4 | Job ẩn danh → nhóm thợ giữ slot (Đ14) | `publish_job_to_group` (mẫu cuốc, khung giá nếu có) | kiểu `JobCard` không có trường PII (BB-02) | — |
| 5 | Chốt thợ | agent thợ hiểu ý bằng model (`triageVendorMessage`) ⇒ `claim_job` / `confirm_assignment`; code chỉ là lưới tất định trích mã `C-XXXX` + đọc giá, bằng chứng ý định kiểm TRONG tool (Đ27, SPEC-P05 §10.4) | một cuốc một người thắng (BB-05); chỉ thợ `active` (BB-10) | — |
| 6 | Ticket cấp quyền | `request_access` ⇒ ticket `access_request` lên dashboard (tên thợ, khung giờ, căn) | — | **BQL duyệt/từ chối** |
| 7 | Giao việc | `dispatch_to_vendor` (số căn, SĐT, mã vào tòa) + báo cư dân tên thợ, giờ đến | từ chối nếu ticket cấp quyền chưa `approved` (BB-11) | — |
| 8 | Theo dõi → đóng case | nhắc giờ, nhận "đến/xong" + ảnh, hỏi cư dân nghiệm thu, `close_case` (điểm thợ, giá thật, hẹn bảo hành +7 ngày) | tranh chấp ⇒ ticket `dispute` cho BQL | BQL xử lý tranh chấp |

Kênh ra: mọi tin gửi đi qua **Outbox pacer** (SPEC-P02 §5). Sơ đồ: `docs/images/08-pipeline-chuan.png`.

## 5. Thành phần

```text
apps/zalo-worker  ── zca-js ×2 tài khoản (bql, market) ── inbound_events / outbox (Postgres)
packages/core     ── pipeline bước 1–10, agent, services, adapters (db, model, transport)
apps/web          ── console BQL (Next.js 15): QR đăng nhập Zalo, thợ, cuốc, ticket, quy chế, bảng giá, sổ
Postgres 16 + pgvector + pg-boss (một instance, Docker, VPS Việt Nam)
```

## 6. Bất biến (BẮT BUỘC)

| Mã | Bất biến | Cách canh |
| :-- | :-- | :-- |
| BB-01 | Agent thực hiện mọi bước qua tool (Đ10), trên kênh giả lập hay Zalo thật như nhau (Đ13); luật cứng nằm trong tool, không trong prompt: tool tự kiểm trạng thái, quyền, PII và từ chối khi sai. Agent không có tool ngoài danh sách 01-CONTRACTS §7 | `check_agent_tools`; test mỗi tool bị gọi sai trạng thái ⇒ lỗi có kiểu |
| BB-02 | Thợ chỉ thấy `JobCard`; PII chỉ qua `dispatch_to_vendor` khi `status='access_granted'` (Đ08, Đ10) | Kiểu `JobCard` không có trường PII; golden PII-probe = 0 rò |
| BB-03 | Phân định trách nhiệm phải có ≥1 trích dẫn quy chế còn hiệu lực; thiếu/mâu thuẫn ⇒ `unclear` ⇒ người | Golden responsibility; không có citation ⇒ service ép `unclear` |
| BB-04 | Mọi tin Zalo gửi đi qua `outbox`; CẤM gọi `sendMessage` ngoài `transport.ts` | Script `check_adapter_boundary` |
| BB-05 | Một cuốc có tối đa một người thắng; chuyển trạng thái bằng câu `UPDATE … WHERE status = …` có điều kiện | Test đua 200 claim đồng thời ⇒ 1 người thắng |
| BB-06 | Lưới khẩn cấp tất định không chờ LLM; lớp hiểu ý (triage) và agent chỉ được BẬT cờ, không được gỡ (Đ09, Đ21) | Golden emergency: 0 bỏ sót (hai lớp, model thật); lớp tất định 0 báo nhầm |
| BB-07 | Chỉ `adapters/db.ts` mở kết nối DB, chỉ `adapters/model.ts` gọi LLM, chỉ `adapters/transport.ts` nói với zca-js | `check_adapter_boundary` |
| BB-08 | Danh tính (`Party`) lấy từ bảng `zalo_identities`, không bao giờ từ nội dung tin hoặc output LLM | Code review + test giả mạo "[userId: …]" |
| BB-09 | Mọi chuyển trạng thái cuốc/ticket ghi `job_events`/`audit_log` | Test đếm event = đếm chuyển trạng thái |
| BB-10 | Chỉ thợ `status='active'` (BQL duyệt) **và đang giữ slot còn hạn** (trả phí hoặc dùng thử) đúng (tòa × nhóm nghề) nhìn thấy/nhận cuốc (Đ14); số slot (kể cả dùng thử) không vượt `slot_capacity` | Test thợ `pending` / hết hạn slot / hết dùng thử gửi "nhận" ⇒ bị từ chối; cấp slot khi đầy ⇒ vào danh sách chờ |
| BB-11 | Thợ chỉ nhận số căn/SĐT/mã vào tòa khi ticket `access_request` của cuốc đó đã được BQL `approved` (Đ10) | Test `dispatch_to_vendor` khi ticket `open`/`rejected` ⇒ `AccessNotApprovedError` |

## 7. Vùng cấm (đã cân nhắc, quyết KHÔNG làm)

- **Tự gửi lời mời kết bạn / nhắn chủ động người lạ** — rủi ro khoá tài khoản; thợ tự vào nhóm, cư dân tự nhắn.
- **Một mega-tool nhiều action cho agent** — bài học ZaloClaw (tốn ~4k token/lượt, không phân quyền được); mỗi tool một việc.
- **Regex "injection guard" làm lớp bảo mật chính** — dễ vượt; bảo mật nằm ở BB-01/BB-02/BB-08.
- **Để agent đọc tin nhắn nhóm thợ làm ngữ cảnh** — nhóm là kênh phát, không lưu lịch sử nhóm; chỉ bắt tin theo luật 3 điều kiện của SPEC-P05 §10.4.3 (có mã cuốc / người gửi đang giữ cuốc / nhóm có cuốc đang đăng) (Đ27 thay "chỉ parse lệnh nhận <mã>").
- **Lưu toàn bộ lịch sử nhóm (passive collector)** — rủi ro Luật BVDLCN; chỉ lưu tin liên quan cuốc.

## 8. Tái sử dụng từ build phase (`D:\build phase`)

| Thứ | File gốc | Dùng ở |
| :-- | :-- | :-- |
| Truy hồi lai + trích dẫn mục | `lib/retrieval/query.ts`, `lib/pipeline/retrieval.ts` | P03 bước 3 |
| Cổng hiệu lực nguồn (thiếu/mâu thuẫn/hết hạn ⇒ từ chối) | `lib/pipeline/eligibility.ts` | P03 bước 3 (BB-03) |
| Precheck → ghi → biên nhận → hoàn tác | `lib/simbackend/contract.ts` | P05/P06 mẫu cho lệnh ghi |
| Bộ chấm golden duy nhất | `lib/eval/score.ts` | P07 |
| Schema tri thức (documents/sections/chunks + tsv) | `db/migrations/003_knowledge.sql`, `007_chunk_heading_tsv.sql` | P01 |

Port = đọc, hiểu, viết lại theo contract ở đây; KHÔNG copy nguyên thư mục.
