# Changelog & Semantic Releases

Tất cả các quyết định kiến trúc và lịch sử nâng cấp phiên bản của dự án.

## [Unreleased] - 2026-09-24: Hồ sơ 01 — Sàn việc thợ MVP (🟢 pipeline v0.2 đã duyệt)
### Decided
- Đ01 Sản phẩm = sàn việc thợ trong tòa nhà; agent cư dân là cửa vào; BQL giữ quy chế, PII, cửa ra vào.
- Đ02 Zalo cá nhân, hai tài khoản (`bql`, `market`), sau interface `Transport`.
- Đ03 LLM chỉ đề xuất; gán thợ, giá, mở PII, ghi sổ do code tất định.
- Đ04 Hai chế độ chốt: giá chốt (ai "nhận" trước) và khảo sát (cư dân chọn báo giá).
- Đ05 Không xử lý thanh toán; chỉ ghi sổ phí cuốc.
- Đ06 Stack TypeScript + Next.js 15 + Postgres/pgvector/pg-boss + Claude qua adapter.
- Đ07 Cổng G0 (kiểm chứng tay) khoá P05.
- Đ08 Khoá PII bằng kiểu `JobCard`. Đ09 Đường khẩn cấp tất định.
- Đ10 Pipeline v0.2 theo chỉ đạo người dùng: agent điều phối trọn vòng; ticket là trục (BQL · case · cấp quyền); job ẩn danh đăng thẳng nhóm thợ; BQL duyệt quyền vào tòa trước khi thợ nhận số căn. **Người dùng duyệt 2026-09-24.**
- Đ11 Dashboard BQL riêng + dữ liệu mô phỏng; thứ tự P01 → P04 → P02. **Duyệt 2026-09-24.**
- Đ12 Slot tháng đồng giá (người dùng chốt) — **cùng ngày chuyển thành ghi chú kinh doanh bởi Đ13**.
- Đ15 Sổ lợi ích ba bên hiện trong hệ thống: phiếu hoàn thành (cư dân), bảng thu nhập tháng (thợ), thẻ "Hiệu quả tháng" (BQL), luật cân bằng slot `MIN_EARNINGS_TO_FEE`. **Duyệt 2026-09-24** ("gần đúng ý").
- Đ14 Phí vào nhóm TRONG phạm vi (người dùng sửa Đ13): slot tháng đồng giá theo (tòa × nhóm nghề), trần + danh sách chờ, ai "nhận" trước thắng, slot đầu dùng thử miễn phí `FREE_TRIAL_DAYS` (1 lần); ghi sổ `ledger_entries` (slot_fee, bql_share).
- Đ13 Trọng tâm = xây agent: kinh doanh (phí, slot, FOMO, P00/G0) ra khỏi phạm vi build; agent phát triển trên `SimTransport` trước, Zalo sau; dashboard tối thiểu; thứ tự P01 → P03 → P05 → P06.
- Đ16 P01 có SPEC riêng (`SPEC-P01-Foundation.md`): test không DB tách `test:db`, cookie HMAC tự viết, SQL thuần, SimTransport vọng lại, seed nền.
- Đ17 Chốt thi công P03 (`SPEC-P03` §10): `processInbound` nhận-trước-xử-lý-sau; truy hồi quy chế chỉ từ khoá; đồng ý của cư dân kiểm tất định trong tool; quy chế `QC-DEMO` mô phỏng; golden cần LLM trả `blocked` khi thiếu key.
### Superseded
- `processInbound` gọi handler trong transaction khoá dòng (SPEC-P01 §6 bản đầu) — thay bởi Đ17 (a): gây trả lời trùng và kẹt pool khi đồng thời.
- Phí theo cuốc, slot tháng, sổ phí, cổng G0 chặn P05 — ra khỏi phạm vi build (Đ13).
- Pipeline 10 bước bản đầu (7 bước "dịch vụ tất định", tự cấp thẻ vào tòa, nhắn riêng top 3 thợ) — thay bởi Đ10.
- `docs/DESIGN.md` v0.1 (trợ lý BQL tổng quát) bị thu hẹp bởi Đ01.
### Added
- **P01 nền tảng (mã nguồn đầu tiên):** `apps/web`, `apps/zalo-worker` (khung), `packages/core`, `db/migrations/001_init.sql`, `scripts/{check_adapter_boundary,check_agent_tools,gate}.mjs`, `compose*.yaml`, `evals/scenarios/echo.jsonl`; `docs/core.md`, `docs/web.md`, `docs/zalo-worker.md`. Repo git + GitHub private.
- `docs/images/09-dashboard-bql-mockup.png`, `docs/images/10-kinh-te-ba-ben.png`.
- `docs/SYSTEM-MAP.md` + `docs/images/01…08` (kiến trúc, luồng, nhân rộng, vòng quay, hai agent, giá trị agent, poster ngách, pipeline chuẩn).

## [v0.0.1] - 2026-09-24: Initial Project Scaffolding
### Added
- Khởi tạo hệ thống Bộ Nhớ Não Bộ `brain4agent/` (engine 1.13.1, khung 1.7.1).
