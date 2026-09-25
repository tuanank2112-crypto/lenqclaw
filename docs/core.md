# core — `packages/core` (`@lenqclaw/core`)

Lõi nghiệp vụ: adapter, kiểu miền, lỗi có kiểu, máy trạng thái cuốc, audit, kênh giả lập. Hợp đồng gốc: [01-CONTRACTS](../planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md) · [SPEC-P01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P01-Foundation.md). Trạng thái 2026-09-25: P01 xong; P03 agent cư dân ĐÃ DUYỆT sau thẩm định đối kháng + vòng vá (R03/R06 ✅, [SPEC-P03 §11](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P03-Resident-Agent.md)); adapter Gemini xong (Đ18, [01-CONTRACTS §2b](../planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md)). Gate G08–G10 còn chờ máy chấm bằng model thật.

## Cấu trúc

| Đường dẫn | Vai trò |
| :-- | :-- |
| `src/adapters/db.ts` | Nơi DUY NHẤT mở kết nối Postgres (`pg`). `sql<T>(text, params)`, `tx(fn)`, `closeDb()`. Pool tạo lười ⇒ build không cần `DATABASE_URL` (BB-07) |
| `src/adapters/model.ts` | Nơi DUY NHẤT gọi LLM. `MODEL_PROVIDER` = `gemini` (mặc định, `fetch` tới `generateContent`, key ở header) \| `anthropic` (SDK). `callModel(c)` giữ dạng Anthropic, adapter dịch vào/ra + giữ `thoughtSignature`; `MODEL_FALLBACKS` khi 429/503/mạng; `max_tokens` 16000; `callTriageModel` (route `triage`, `MODEL_TRIAGE`, quá hạn `TRIAGE_TIMEOUT_MS`, không retry). Test: `setModelClientForTest`, `setGeminiFetchForTest`, `setTriage*ForTest`. Ghi `agent_runs` mỗi lần gọi |
| `src/adapters/transport.ts` | Interface `Transport`; `enqueue()` là hàm DUY NHẤT ghi `outbox` (BB-04); `createTransport()` theo `TRANSPORT` (`sim` mặc định, `zalo` ⇒ lỗi "P02 chưa làm") |
| `src/domain/types.ts` | Kiểu 01-CONTRACTS §6 + `JobStatus`. `JobCard` không có khoá PII (BB-02) |
| `src/domain/errors.ts` | Lỗi có kiểu 01-CONTRACTS §9 (gồm `ConsentMissingError`, `VerdictLockedError`, `InvalidCategoryError`) + `IllegalTransitionError`; mỗi lớp có `code` = tên lớp |
| `src/domain/password.ts` | `scrypt$N$salt$hash`, so sánh `timingSafeEqual` |
| `src/services/job-state.ts` | `TRANSITIONS` (bảng §5 bung đủ cặp) + `transitionJob(q, …)`: cặp ngoài bảng ⇒ `IllegalTransitionError`; `UPDATE … WHERE status=$from RETURNING` 0 dòng ⇒ `ConflictError`; `job_events` cùng transaction. Chỉ nhận `q` của `tx` |
| `src/services/audit.ts` | `audit(q, {actorType, actorId, action, target, data})` |
| `src/sim/sim-transport.ts` | `simInbound` (chống trùng theo `(account, msg_id)`), `processInbound(handler)` (nhận-trước-xử-lý-sau, mỗi tin tối đa một lần, handler ngoài transaction; lỗi ⇒ audit `inbound.handler_error` + `BUSY_REPLY`), `simDeliver`, `runScenario(path)`, `echoHandler` |
| `src/agent/resident-agent.ts` | `residentHandler(e)`: danh tính từ `zalo_identities` (hội thoại lệch người gửi ⇒ `BUSY_REPLY`, không nạp lịch sử) → khẩn cấp lớp 1 (từ khoá) → người đang tiếp quản ⇒ im → triage lớp 2 → cư dân không `active` ⇒ `REGISTER_REPLY` → `runResidentTurn` (20 tin đã che PII + `JobDraft`, vòng tool ≤6, input sai schema ⇒ `InvalidToolInput`, không có text ⇒ `BUSY_REPLY` + handoff). `routeInboundEvent`: `bql`+`user` ⇒ agent, còn lại `echoHandler` |
| `src/agent/emergency.ts` | `triggerEmergencyFlow` dùng chung cho cả 3 lớp khẩn cấp: ticket `emergency` + `EMERGENCY_REPLY`, chống lặp 30 phút |
| `src/agent/triage.ts` · `prompts/triage.ts` | Lớp hiểu ý (Đ21): `triageMessage(text, recent)` ⇒ `{emergency, emergency_confidence, intent, intent_confidence}` hoặc `null`; kết quả lưu ở `messages.content.triage`, agent chính không đọc/ghi được |
| `src/agent/tools/*` | 8 tool SPEC-P03 §10.3/§11, mỗi file `{definition, run(ctx, input)}`; luật nằm trong tool: citation phải cùng nhãn `party` + cùng tòa, quote lấy từ DB; verdict khoá sau `drafting`; đồng ý = lượt sau + (câu khớp danh sách hoặc triage `consent` ≥0.8); `urgency='emergency'` đơn điệu. `tool-kit.ts`: `validateToolInput` |
| `src/agent/pii.ts` | `detectEmergency` lớp 1 (hai danh sách có dấu/không dấu, ranh giới Unicode); `redactPii` che SĐT có dấu phân cách ⇒ `[SĐT]`, mã căn (DB + mẫu) ⇒ `[CĂN]`, giữ mã cuốc của chính cư dân |
| `src/retrieval/search-regulations.ts` | truy hồi từ khoá theo tòa (`buildingId` bắt buộc; token dựng phía TS chỉ `[a-z0-9]`, OR-tsquery, top 8); lỗi DB ⇒ `RegulationUnavailable` |
| `src/db/migrate.ts` · `seed.ts` | Runner migration (`schema_migrations` + checksum sha256; file đã áp bị sửa ⇒ exit 1) · seed nền idempotent (1 tổ chức, tòa `TOA-A`, 20 căn, 12 danh mục, 2 tài khoản Zalo) |
| `src/scripts/create-admin.ts` | Tạo tài khoản nhân viên; mật khẩu đọc từ stdin |

## Lệnh (chạy từ root)

| Lệnh | Việc |
| :-- | :-- |
| `docker compose -f compose.yaml -f compose.dev.yaml up -d db` | Postgres dev `127.0.0.1:55432` (user/db `lenqclaw`) |
| `npm run db:migrate` · `npm run db:seed` | Áp migration (`applied: N`) · seed nền |
| `npm run create-admin -- --email <e> --role bql_admin` | Tạo admin, gõ mật khẩu qua stdin |
| `npm run db:seed:sim` | dữ liệu mô phỏng — từ chối (exit 1) nếu env `DATA_MODE≠sim`, script KHÔNG tự đặt; `test:db` seed qua `scripts/seed-sim-for-test.mjs`. Quy chế `QC-DEMO`, cư dân `sim-res-1..3` (active), `sim-res-9` (pending), `price_book` |
| `npm run eval:golden` | chấm golden (một lượt — CHỈ là khói, Đ19-4); thiếu credential của provider/429/5xx ⇒ `blocked`, exit 3. Chạy với model thật: `npx tsx --env-file=.env scripts/eval_golden.mjs` |
| `npm test` · `npm run test:db` | Test không DB · test cần `DATABASE_URL` (thiếu ⇒ exit 1, không skip) |
| `npm run gate` | typecheck → build → test → `check_adapter_boundary` → `check_agent_tools` |

## Luật khi sửa

- Thêm bảng/cột: migration MỚI `db/migrations/NNN_*.sql`, chỉ thêm (OPERATIONS §7). CẤM sửa file đã áp.
- Đổi trạng thái cuốc: chỉ qua `transitionJob` trong `tx`. Thêm cặp chuyển ⇒ sửa 01-CONTRACTS §5 trước.
- Import `pg`/`@anthropic-ai/sdk`/`zca-js`/`@google/genai` hoặc chuỗi `generativelanguage.googleapis.com` ngoài adapter ⇒ `gate` đỏ.
- Regex trên tiếng Việt: CẤM `\b` (chỉ hiểu ASCII) — dùng `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` với cờ `u` (gotcha G14).
- Test gọi model phải tự đặt `MODEL_PROVIDER`, không dựa vào mặc định (G16).
