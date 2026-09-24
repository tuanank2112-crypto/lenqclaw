# core — `packages/core` (`@lenqclaw/core`)

Lõi nghiệp vụ: adapter, kiểu miền, lỗi có kiểu, máy trạng thái cuốc, audit, kênh giả lập. Hợp đồng gốc: [01-CONTRACTS](../planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md) · [SPEC-P01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P01-Foundation.md). Trạng thái: P01 xong (2026-09-24); P03 agent cư dân thi công xong 2026-09-25, chờ thẩm định; adapter Gemini (Đ18, [01-CONTRACTS §2b](../planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md)) chưa làm — `model.ts` hiện chỉ gọi Anthropic.

## Cấu trúc

| Đường dẫn | Vai trò |
| :-- | :-- |
| `src/adapters/db.ts` | Nơi DUY NHẤT mở kết nối Postgres (`pg`). `sql<T>(text, params)`, `tx(fn)`, `closeDb()`. Pool tạo lười ⇒ build không cần `DATABASE_URL` (BB-07) |
| `src/adapters/model.ts` | Nơi DUY NHẤT gọi LLM (`@anthropic-ai/sdk`). `callModel(c)`, `resolveModel(route)`, `setModelClientForTest(fake)`. `cache_control` trên system + tool cuối; 429/5xx/lỗi mạng ⇒ `ModelUnavailableError`; ghi `agent_runs` mỗi lần gọi |
| `src/adapters/transport.ts` | Interface `Transport`; `enqueue()` là hàm DUY NHẤT ghi `outbox` (BB-04); `createTransport()` theo `TRANSPORT` (`sim` mặc định, `zalo` ⇒ lỗi "P02 chưa làm") |
| `src/domain/types.ts` | Kiểu 01-CONTRACTS §6 + `JobStatus`. `JobCard` không có khoá PII (BB-02) |
| `src/domain/errors.ts` | 8 lỗi 01-CONTRACTS §9 + `IllegalTransitionError`; mỗi lớp có `code` = tên lớp |
| `src/domain/password.ts` | `scrypt$N$salt$hash`, so sánh `timingSafeEqual` |
| `src/services/job-state.ts` | `TRANSITIONS` (bảng §5 bung đủ cặp) + `transitionJob(q, …)`: cặp ngoài bảng ⇒ `IllegalTransitionError`; `UPDATE … WHERE status=$from RETURNING` 0 dòng ⇒ `ConflictError`; `job_events` cùng transaction. Chỉ nhận `q` của `tx` |
| `src/services/audit.ts` | `audit(q, {actorType, actorId, action, target, data})` |
| `src/sim/sim-transport.ts` | `simInbound` (chống trùng theo `(account, msg_id)`), `processInbound(handler)` (nhận-trước-xử-lý-sau, mỗi tin tối đa một lần, handler ngoài transaction; lỗi ⇒ audit `inbound.handler_error` + `BUSY_REPLY`), `simDeliver`, `runScenario(path)`, `echoHandler` |
| `src/agent/resident-agent.ts` | `residentHandler(e)`: danh tính từ `zalo_identities` → khẩn cấp tất định (0 lời gọi model, ticket `emergency`) → cư dân không `active` ⇒ `REGISTER_REPLY` → `runResidentTurn` (20 tin gần nhất, vòng tool ≤6, lỗi tool ⇒ `is_error`, quá vòng ⇒ handoff). `routeInboundEvent`: `bql`+`user` ⇒ agent, còn lại `echoHandler` |
| `src/agent/tools/*` | 8 tool SPEC-P03 §10.3, mỗi file `{definition, run(ctx, input)}`; luật nằm trong tool (BB-03 ép `unclear`, đồng ý tất định, `transitionJob`) |
| `src/agent/pii.ts` | che SĐT ⇒ `[SĐT]`, mã căn ⇒ `[CĂN]` trước khi gửi model |
| `src/retrieval/search-regulations.ts` | truy hồi từ khoá (OR-tsquery + `immutable_unaccent`, top 8); lỗi DB ⇒ `RegulationUnavailable` |
| `src/db/migrate.ts` · `seed.ts` | Runner migration (`schema_migrations` + checksum sha256; file đã áp bị sửa ⇒ exit 1) · seed nền idempotent (1 tổ chức, tòa `TOA-A`, 20 căn, 12 danh mục, 2 tài khoản Zalo) |
| `src/scripts/create-admin.ts` | Tạo tài khoản nhân viên; mật khẩu đọc từ stdin |

## Lệnh (chạy từ root)

| Lệnh | Việc |
| :-- | :-- |
| `docker compose -f compose.yaml -f compose.dev.yaml up -d db` | Postgres dev `127.0.0.1:55432` (user/db `lenqclaw`) |
| `npm run db:migrate` · `npm run db:seed` | Áp migration (`applied: N`) · seed nền |
| `npm run create-admin -- --email <e> --role bql_admin` | Tạo admin, gõ mật khẩu qua stdin |
| `npm run db:seed:sim` | dữ liệu mô phỏng (chỉ `DATA_MODE=sim`): quy chế `QC-DEMO`, cư dân `sim-res-1..3` (active), `sim-res-9` (pending), `price_book` |
| `npm run eval:golden` | chấm golden; thiếu credential/429/5xx ⇒ `blocked`, exit 3 |
| `npm test` · `npm run test:db` | Test không DB · test cần `DATABASE_URL` (thiếu ⇒ exit 1, không skip) |
| `npm run gate` | typecheck → build → test → `check_adapter_boundary` → `check_agent_tools` |

## Luật khi sửa

- Thêm bảng/cột: migration MỚI `db/migrations/NNN_*.sql`, chỉ thêm (OPERATIONS §7). CẤM sửa file đã áp.
- Đổi trạng thái cuốc: chỉ qua `transitionJob` trong `tx`. Thêm cặp chuyển ⇒ sửa 01-CONTRACTS §5 trước.
- Import `pg`/`@anthropic-ai/sdk`/`zca-js` ngoài adapter ⇒ `gate` đỏ.
