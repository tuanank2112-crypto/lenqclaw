# Giới Thiệu Dự Án (Project Overview)

## 0. Bản chất repo

`lenqclaw` là **agent chăm sóc cộng đồng chạy trên Zalo**: một tài khoản Zalo cá nhân `community` làm **phó nhóm** trong các nhóm Zalo của cộng đồng người quan tâm AI agent và người muốn setup AI chăm sóc khách hàng (CSKH). Agent cũng là bản demo sống của sản phẩm. Hướng này chốt ngày 2026-10-09 (D01 kế hoạch 02; Đ32 kế hoạch 01 dừng sàn việc thợ). Thiết kế nằm trong hồ sơ [`planning/02_2026-10-09_zalo-community-agent/`](../planning/02_2026-10-09_zalo-community-agent/plan.md).

**Trạng thái thật:** bộ SPEC kế hoạch 02 đã duyệt nhưng **mã trong repo vẫn là mã sàn việc thợ** của kế hoạch 01 (monorepo, DB 001–006, adapter, worker zca-js, SimTransport, agent cư dân/thợ). Gói P01 sẽ gỡ 94 file sàn thợ (sau tag `archive/plan-01-marketplace`) khi người xác nhận. Cho tới lúc đó, đọc code sàn thợ là đọc LỊCH SỬ; sản phẩm đích là những gì mô tả dưới đây.

Nguồn mẫu: OpenClaw (MIT) và monas-team/zaloclaw v2.5.11 (MIT) — port theo mô tả, tự customize, không chép nguyên file, không lệ thuộc gói openclaw; đoạn MIT nào chép thì ghi `THIRD_PARTY_NOTICES.md`.

## 1. Mục tiêu (Goals & Objectives)

- **Hỏi đáp** khi được gọi (mention / trả lời tin bot / gọi tên) và nhặt câu hỏi bỏ trống ở nhóm `ambient`; trả lời có trích dẫn từ kho tri thức cộng đồng.
- **Chào thành viên mới** (agent soạn lời) và **duyệt yêu cầu vào nhóm** theo chính sách từng nhóm.
- **Kiểm duyệt** spam/lừa đảo/quảng cáo bằng model + lưới tất định; thang cảnh cáo theo (nhóm, người) có suy giảm; xoá tin người khác; kick/block chỉ qua thẻ duyệt.
- **Kéo việc riêng sang 1-1**, thu thập và sàng lọc lead muốn setup AI CSKH ⇒ thẻ lead ⇒ chuyển chủ.
- **Vận hành nhóm:** thông báo, bình chọn, nhắc lịch, ghi chú, tóm tắt tuần; báo cáo ngày cho chủ qua DM.
- **Không làm (non-goals 0.1):** sàn thợ/BQL/slot/ticket, marketing, nhiều tài khoản/OA, ảnh/file/voice vào agent, gửi file theo đường dẫn, exec/self-update, giải tán nhóm/đổi chủ, regex injection guard, cron, pg-boss, thanh toán.
- **Số đo thành công 0.1:** 4 golden thật (kích hoạt/nên-nói, kiểm duyệt, ý định lead, câu hỏi chưa ai trả lời) bằng `gemini-3.6-flash` đạt ngưỡng; 7 ngày Zalo thật ≥ 2 nhóm không bị khoá tài khoản, 0 hành động quản trị nguy hiểm ngoài thẻ duyệt.

## 2. Công nghệ cốt lõi (Tech Stack)

- **Web:** Next.js 15 (App Router) + TypeScript — `apps/web`: auth 2 vai `admin`/`operator` (cookie HMAC), dashboard (nhóm, persona có phiên bản, thẻ duyệt, lead, kiểm duyệt, tri thức, lịch, dòng thời gian agent), `/zalo` (QR), `/dev/sim` (nhóm giả lập).
- **Kênh:** Zalo cá nhân qua `zca-js` 2.2.0 (pin), MỘT tài khoản `community`, tiến trình riêng `apps/zalo-worker`.
- **Lõi:** TypeScript Node 22, `packages/core` — `agent/community/*` (router, cổng nhận tin, phiên, ambient, persona, policy tool, vòng lượt), tool có luật cứng bên trong, 3 adapter (db, model, transport).
- **LLM:** Gemini mặc định (`gemini-3.6-flash`, embedding `gemini-embedding-001` dim 1024); nhánh anthropic/openrouter/vyce còn chọn được (vyce chỉ `DATA_MODE=sim`). Dev tạm chạy vyce/deepseek, gate luôn chấm bằng Gemini.
- **Data:** PostgreSQL 16 + pgvector, Docker, SQL thuần (`pg`), không ORM, không pg-boss (`runTimers`).
- **Công cụ:** npm workspaces, `tsx`, `vitest` (`npm test` không DB, `npm run test:db` cần DB), `npm run gate`. `SimTransport` mở rộng nhóm thay Zalo khi phát triển.

## 3. Triết lý thiết kế

Agent làm mọi việc qua tool, **luật nằm trong tool** (BB-01); **model hiểu ý, code là lưới tất định** chính xác cao (BB-12). Ở nhóm agent im lặng là mặc định, chỉ nói bằng `send_group_message` qua outbox pacer; hành động nguy hiểm chỉ tạo thẻ duyệt. Danh tính và vai lấy từ DB, nội dung tin là dữ liệu không tin cậy. Bảo mật bằng chính sách tool theo vai, không bằng từ khoá.
