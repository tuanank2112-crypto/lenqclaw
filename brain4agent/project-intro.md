# Giới Thiệu Dự Án (Project Overview)

## 0. Bản chất repo

`lenqclaw` là **sàn việc thợ trong tòa nhà chạy trên Zalo**, pilot 1–2 tòa. Từ 2026-09-24 repo có **mã nền P01** (monorepo, DB, adapter, auth, kênh giả lập — chưa có agent); git ở `github.com/tuanank2112-crypto/lenqclaw` (private). Thiết kế nằm trong hồ sơ [`planning/01_2026-09-24_san-viec-tho-mvp/`](../planning/01_2026-09-24_san-viec-tho-mvp/plan.md).

Nguồn gốc: phân tích OpenClaw (extension `zalouser`) và ZaloClaw (monas-team) khi dùng tài khoản Zalo cá nhân, rồi thu hẹp dần từ "trợ lý thay BQL" (`docs/DESIGN.md` v0.1) xuống một ngách có người trả tiền. Bối cảnh chiến lược và các sơ đồ: [`docs/SYSTEM-MAP.md`](../docs/SYSTEM-MAP.md).

## 1. Mục tiêu (Goals & Objectives)

- **Cư dân** nhắn Zalo mô tả hỏng hóc trong căn ⇒ được chẩn đoán, biết rõ việc của ai (có trích dẫn quy chế), nhận thợ đã được BQL duyệt với khung giá tham chiếu.
- **BQL** hết phải từ chối "việc trong căn", hết kẹt giữa tranh chấp trách nhiệm, kiểm soát người vào tòa, có thêm nguồn thu.
- **Thợ** nhận cuốc chuẩn hoá qua nhóm Zalo, chốt bằng một chữ "nhận" (liên tưởng nhóm taxi Zalo), có điểm uy tín; chỉ nhận số căn + mã vào tòa sau khi BQL duyệt ticket cấp quyền.
- **Agent là người điều phối trọn vòng** (pipeline v0.2, Đ10): phân loại trách nhiệm → ticket BQL hoặc ticket case → job ẩn danh → nhóm thợ → chốt → xin BQL cấp quyền → giao việc → đóng case.
- **Lợi ích ba bên phải hiện ra trong sản phẩm** (Đ15): phiếu hoàn thành cho cư dân (phí 0đ), bảng thu nhập tháng cho thợ (thu nhập/phí), thẻ "Hiệu quả tháng" cho BQL; luật cân bằng giữ thợ luôn lời để cả vòng bền.
- **Dữ liệu tích luỹ**: giá thật, điểm thợ, lịch sử sự cố — thứ làm agent khôn hơn theo thời gian và khó bị sao chép.

Phạm vi build (Đ13, Đ14): agent — pipeline, tool, máy trạng thái, kênh, dashboard tối thiểu, eval — **và cơ chế thu phí thợ vào nhóm** (slot tháng đồng giá, miễn phí thời gian đầu, ghi sổ). FOMO/marketing và kiểm chứng thị trường là tài liệu cho nhà đầu tư, ngoài phạm vi.

## 2. Công nghệ cốt lõi (Tech Stack)

- **Web:** Next.js 15 (App Router) + TypeScript — console BQL (`apps/web`).
- **Kênh:** Zalo cá nhân qua `zca-js` (pin đúng phiên bản), 2 tài khoản `bql` và `market`, tiến trình riêng `apps/zalo-worker`.
- **Lõi:** TypeScript Node 22, `packages/core` — pipeline v0.2 (8 bước, agent điều phối), tool có luật cứng bên trong, 3 adapter (db, model, transport).
- **LLM (Đ18):** Gemini mặc định (`gemini-3.6-flash`, gọi qua REST trong `adapters/model.ts`, key ở `.env`); Claude (`@anthropic-ai/sdk`, `claude-opus-5`) vẫn chọn được qua `MODEL_PROVIDER=anthropic`. Core chỉ thấy `callModel` dạng Anthropic — adapter lo dịch.
- **Data Persistence:** PostgreSQL 16 + pgvector + pg-boss, Docker, VPS Việt Nam IP tĩnh. SQL thuần (driver `pg`), không ORM.
- **Công cụ:** npm workspaces, `tsx` chạy CLI, `vitest` (`npm test` không DB, `npm run test:db` cần DB), `npm run gate`. Kênh giả lập `SimTransport` + `/dev/sim` thay Zalo khi phát triển agent (Đ13).

## 3. Triết lý thiết kế

Agent điều phối, luật nằm trong tool (Đ10). Agent thực hiện mọi bước; mỗi tool tự kiểm luật cứng (không lộ số căn trước khi BQL duyệt, một cuốc một thợ, chỉ BQL cấp quyền vào tòa) và từ chối khi sai. Dữ liệu tích luỹ (giá thật, điểm thợ) là thứ làm hệ thống khó bị sao chép.
