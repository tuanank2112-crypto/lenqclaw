# lenqclaw — Trợ lý AI cho Ban Quản Lý chung cư qua Zalo

> Bản thiết kế v0.1 — 2026-09-24. **ĐÃ BỊ THU HẸP** bởi hồ sơ [`planning/01_2026-09-24_san-viec-tho-mvp/`](../planning/01_2026-09-24_san-viec-tho-mvp/plan.md) (Đ01: sàn việc thợ). Chỉ còn giá trị tham khảo.

## 1. Mục tiêu và phạm vi

**Quy mô:** 1–2 tòa. **Kênh cư dân:** tài khoản Zalo cá nhân của BQL (qua `zca-js`). **Triển khai:** VPS chạy 24/7.

| Nghiệp vụ | Trước đây | Với lenqclaw |
|---|---|---|
| Phản ánh | Cư dân → app cư dân → BQL → phòng ban → xử lý | Cư dân → **Zalo bot** → phòng ban / BQL (trên **web BQL**) → xử lý → bot báo lại cư dân |
| Booking tiện ích | App | **Chat Zalo** → hệ thống kiểm tra, giữ chỗ → báo kết quả qua Zalo |
| Hỏi đáp nội quy, dịch vụ | Tự đọc tài liệu, tự tìm | **Hỏi trên Zalo** → bot trả lời theo dữ liệu BQL cung cấp, có trích nguồn |

**Ngoài phạm vi v1:** thu phí/thanh toán, nhiều dự án (multi-tenant), gọi thoại, bot trong nhóm Zalo cư dân.

**Phải có:** chuyển cho người thật, vì bot thay tầng tiếp nhận và điều phối chứ không thay kỹ thuật viên hay quyết định của BQL.

## 2. Nguyên tắc thiết kế

1. **LLM hiểu, code quyết định.** Còn chỗ trống không, ticket chuyển phòng ban nào, ai được làm gì đều do service và database quyết định. LLM chỉ trích xuất ý định, gọi tool và diễn đạt lại.
2. **Danh tính lấy từ server.** `resident_id` và `apartment_id` gắn vào session theo Zalo UID đã xác thực. LLM không bao giờ truyền danh tính.
3. **Từ chối mặc định.** Người chưa xác thực chỉ được hỏi đáp chung và đăng ký. Mỗi tool giới hạn theo căn hộ của người gọi.
4. **Bề mặt tool hẹp.** Chỉ có tool nghiệp vụ, không có exec, không đọc file hệ thống, không tự cập nhật.
5. **Coi Zalo cá nhân là kênh mong manh.** Có lớp `Transport` để thay kênh (OA, web chat) mà không phải sửa lõi. Web BQL luôn là nguồn sự thật.
6. **Gửi tin như người.** Mọi tin gửi ra đều đi qua bộ điều tốc (outbox pacer).

## 3. Kiến trúc

```
                ┌──────────────────────── VPS (VN) ────────────────────────┐
 Cư dân (Zalo) ⇄│ zalo-worker ──(events)──► Postgres queue ──► core-server │
                │  • zca-js listener          (pg-boss)        • Agent (Claude + tools)
                │  • session supervisor                         • Domain services
                │  • outbox pacer ◄──(outbox)───────────────────  - residents / auth
                │                                                 - tickets & routing
                │                                                 - booking
 Nhân viên BQL ⇄│ web (BQL console) ◄──── REST/WS ──────────────  - knowledge base (RAG)
 & phòng ban    │                                                 - notifications, SLA
                │                   PostgreSQL + pgvector · file storage · audit log
                └──────────────────────────────────────────────────────────┘
```

- **`zalo-worker`** là tiến trình riêng, chỉ có **một listener duy nhất**. Nhiệm vụ:
  - nhận tin, chống trùng, đưa vào queue;
  - gửi tin từ outbox;
  - giám sát phiên, đăng nhập QR qua web BQL.
- **`core-server`** (API và worker):
  - chạy agent loop theo từng cư dân, xử lý tuần tự trong mỗi hội thoại;
  - chứa các nghiệp vụ;
  - chạy scheduler cho SLA và nhắc lịch.
- **`web`** là console của BQL và phòng ban, gồm:
  - ticket board, cư dân, tiện ích và booking, knowledge base;
  - tài khoản nhân viên, trạng thái kết nối Zalo.

**Stack:** TypeScript (Node ≥ 22), Fastify, PostgreSQL 16 + pgvector, pg-boss, React (Vite), `@anthropic-ai/sdk`, `zca-js` (pin đúng phiên bản).

## 4. Luồng nghiệp vụ

### 4.1 Đăng ký cư dân (BQL chưa có sẵn dữ liệu)
1. Cư dân quét QR tại sảnh để kết bạn hoặc nhắn tin cho Zalo BQL.
2. Bot hỏi tòa, căn, họ tên, số điện thoại và vai trò (chủ hộ, người thuê, người nhà).
3. Hồ sơ vào trạng thái `pending`, BQL duyệt trên web. Cách này dựng dần danh sách cư dân từ chính người dùng.
4. Khi đã duyệt, cư dân mở khóa phản ánh, booking và các câu hỏi về dữ liệu riêng của căn.

### 4.2 Phản ánh
Luồng: cư dân mô tả (chữ hoặc ảnh) → bot hỏi bổ sung vị trí và mức độ → **tóm tắt để cư dân xác nhận** → tạo ticket.

- **Phân loại:** structured output gồm loại, loại con, ưu tiên, vị trí, khẩn cấp hay không.
- **Chuyển:** tra **bảng routing** trong database (loại → phòng ban). LLM không tự chọn phòng ban.
- **Gộp trùng:** sự cố khu vực chung (ví dụ thang máy) gộp vào incident đang mở, cư dân mới trở thành người theo dõi.
- **Khẩn cấp** (cháy, kẹt thang, rò gas, ngập): trả hotline ngay và đẩy cảnh báo lên ca trực, không chờ hàng đợi.
- **Trên web:** phòng ban đổi trạng thái `mới → đã nhận → đang xử lý → hoàn thành`, kèm ghi chú và ảnh. Mỗi lần đổi, bot báo lại cư dân.
- **Đóng ticket:** cư dân xác nhận hoặc tự đóng sau N ngày, sau đó bot xin đánh giá 1–5 sao.
- **SLA:** quá hạn thì leo thang lên trưởng bộ phận, rồi lên trưởng BQL.

### 4.3 Booking tiện ích
1. Cư dân nói kiểu "đặt BBQ tối thứ 7". Bot gọi `check_availability`, rồi đề xuất khung giờ trống.
2. Cư dân chọn khung. Hệ thống gọi `hold_booking` để giữ chỗ tạm 10 phút, cư dân xác nhận, rồi `confirm_booking`.
3. Cách duyệt cấu hình theo từng tiện ích: **tự duyệt** hoặc **BQL duyệt** trên web. Kết quả báo lại qua Zalo.
4. Quy tắc lưu trong database: giờ mở cửa, độ dài slot, hạn mức mỗi căn mỗi tuần, đặt trước tối đa bao nhiêu ngày, hạn hủy.
5. Chống đặt trùng bằng exclusion constraint của Postgres.
6. Nhắc trước giờ sử dụng. Cư dân có thể hủy qua chat.

### 4.4 Hỏi đáp
- **Nguồn dữ liệu:** BQL tải nội quy, quy chế, bảng phí, thông báo và FAQ lên web. Mỗi tài liệu có ngày hiệu lực.
- **Tìm kiếm:** kết hợp full-text và vector, trả lời kèm trích dẫn (ví dụ "Theo Nội quy mục 5.2").
- **Khi không có dữ liệu:** nói rõ là không có, rồi đề nghị tạo câu hỏi cho BQL. Câu hỏi này là một ticket loại `hỏi đáp`, và câu trả lời có thể lưu thành FAQ mới.

## 5. Mô hình dữ liệu (phác thảo)

```
buildings(id, name)
apartments(id, building_id, code, floor)
residents(id, zalo_uid, display_name, phone, status[pending|active|blocked], consent_at)
resident_apartments(resident_id, apartment_id, role[owner|tenant|member])
staff_users(id, name, email, role[admin|manager|staff], department_id)
departments(id, name, zalo_uid?)            -- zalo_uid: tùy chọn, để báo tin cho trưởng bộ phận
ticket_categories(id, name, parent_id, department_id, sla_hours, is_emergency)
tickets(id, code, category_id, apartment_id?, location, title, description, priority,
        status, department_id, assignee_id?, incident_id?, due_at, created_by_resident_id)
ticket_events(id, ticket_id, actor, type, note, attachments, created_at)
ticket_followers(ticket_id, resident_id)
facilities(id, building_id, name, rules jsonb, approval_mode[auto|manual])
bookings(id, facility_id, apartment_id, resident_id, time_range tstzrange, status, hold_expires_at)
kb_documents(id, title, source_file, effective_from, effective_to, status)
kb_chunks(id, document_id, content, embedding vector, tsv tsvector)
conversations(id, resident_id|zalo_uid, state, handoff_until?)
messages(id, conversation_id, direction, zalo_msg_id, content, attachments, created_at)
zalo_outbox(id, to_uid, payload, status, not_before, attempts)
audit_log(id, actor, action, target, data, created_at)
```

## 6. Rủi ro của kênh Zalo cá nhân và cách giảm

| Rủi ro | Biện pháp |
|---|---|
| Khóa hoặc hạn chế tài khoản | Dùng **tài khoản và SIM riêng của BQL**, không dùng số của nhân viên. Bot **chỉ trả lời** tin cư dân nhắn tới, không chủ động nhắn người lạ, không tự gửi lời mời kết bạn. Cư dân tự kết bạn qua QR. Outbox pacer: tối đa 1 tin mỗi 3–5 giây cho mỗi người, tối đa 10 tin/phút cho cả tài khoản, có jitter, gửi "đang gõ" trước. Thông báo chung đăng **một lần vào nhóm tòa nhà**, không gửi DM hàng loạt. |
| Giới hạn 1.000 bạn / 40 hội thoại người lạ mỗi tháng | Hướng dẫn cư dân **kết bạn trước khi nhắn**. Mỗi căn một người đại diện. Theo dõi số bạn, khi gần 900 thì cảnh báo để cân nhắc tài khoản thứ hai hoặc chuyển sang OA. |
| Mở Zalo Web hoặc PC làm listener bị đá | Quy định **không đăng nhập Zalo Web hay PC** bằng tài khoản này. Chỉ giữ Zalo trên một điện thoại. Web BQL thay cho việc đọc tin trên Zalo PC. |
| Listener chết mà không báo, IP VPS thay đổi | Chọn **VPS đặt tại Việt Nam với IP tĩnh**, đăng nhập QR khi điện thoại ở cùng mạng hoặc cùng khu vực nếu được. Watchdog "tin cuối cùng": quá N phút không có sự kiện thì ping API; 1006 thì đăng nhập lại bằng cookie và giãn thời gian chờ; 3000/3003 thì dừng lại và báo BQL. **Banner đỏ trên web BQL**, kèm email hoặc Telegram báo động. |
| zca-js hỏng khi Zalo cập nhật | Pin đúng phiên bản, dùng interface `Transport` và chạy contract test trên dữ liệu mẫu. Web BQL vẫn hoạt động để tiếp nhận thủ công. |
| Nhân viên và bot cùng trả lời một lúc | Listener nghe cả **tin do chính tài khoản BQL gửi**. Khi nhân viên trả lời tay trên điện thoại, bot tự im ở hội thoại đó 30 phút (`handoff_until`). |
| Lộ cookie phiên | Mã hóa credentials khi lưu (khóa lấy từ biến môi trường hoặc KMS), đặt quyền 0600, không ghi cookie vào log. |
| Dữ liệu cá nhân (Luật 91/2025) | Xin đồng ý khi cư dân đăng ký. Che số điện thoại và số giấy tờ trước khi gửi LLM. Lưu dữ liệu trên VPS tại Việt Nam, có thời hạn lưu trữ. Chuẩn bị hồ sơ đánh giá chuyển dữ liệu ra nước ngoài vì LLM đặt ở nước ngoài. |

## 7. Agent

- **Model:** `claude-opus-5`, dùng tool use và prompt caching. System prompt và định nghĩa tool cố định nằm trước breakpoint cache.
- **Tool theo trạng thái cư dân.**
  - Chưa xác thực: `search_kb`, `register_resident`, `request_human`.
  - Đã xác thực, thêm:
    - `create_ticket`, `list_my_tickets`, `get_ticket`, `add_ticket_info`;
    - `list_facilities`, `check_availability`, `hold_booking`, `confirm_booking`, `cancel_booking`, `list_my_bookings`.
  - Mọi tool tự lấy `resident_id` và `apartment_id` từ context phía server.
- **Hành động có hậu quả** (tạo ticket, xác nhận booking, hủy booking) phải **tóm tắt và hỏi cư dân xác nhận** trước khi thực hiện.
- **Ảnh:** tải về, kiểm tra magic bytes và kích thước, gửi cho model dưới dạng image block, lưu làm đính kèm của ticket.
- **Tin gửi đến dồn dập:** debounce khoảng 2–3 giây rồi gom thành một lượt.

## 8. Lộ trình

| Giai đoạn | Nội dung | Kết quả |
|---|---|---|
| **P0 — Nền móng** | Monorepo, Postgres schema, `zalo-worker` (đăng nhập QR qua web, listener, outbox pacer, watchdog), web đăng nhập nhân viên, màn hình trạng thái Zalo | Bot nhận và gửi tin ổn định, BQL xem hội thoại trên web |
| **P1 — Phản ánh** | Đăng ký và duyệt cư dân, agent và tool ticket, bảng routing, ticket board theo phòng ban, thông báo 2 chiều, handoff | Luồng phản ánh chạy từ đầu đến cuối |
| **P2 — Hỏi đáp** | Tải tài liệu lên, chia đoạn và tạo embedding, `search_kb` có trích dẫn, lưu câu hỏi chưa trả lời thành FAQ | Bot trả lời theo dữ liệu BQL |
| **P3 — Booking** | Tiện ích, quy tắc, giữ chỗ và xác nhận, duyệt trên web, nhắc lịch | Đặt tiện ích qua chat |
| **P4 — Vận hành** | SLA và leo thang, dashboard (số ticket, thời gian xử lý, CSAT), backup, báo động | Sẵn sàng chạy thật |
