# core — `packages/core` (`@lenqclaw/core`)

Lõi của agent chăm sóc cộng đồng Zalo: adapter (DB, model, transport), kiểu miền, lỗi có kiểu, audit, kênh giả lập, runner, seed, khung router/timers. Hợp đồng: [00-ARCHITECTURE](../planning/02_2026-10-09_zalo-community-agent/specs/00-ARCHITECTURE.md) · [01-CONTRACTS](../planning/02_2026-10-09_zalo-community-agent/specs/01-CONTRACTS.md) · [SPEC-P01](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P01-Go-San-Tho.md).

Trạng thái: **P01 kế hoạch 02 xong** (gỡ mã sàn thợ, migration 007/008/009, tài khoản `community`, vai web `admin`/`operator`, seed cộng đồng, máy đo `check_pivot_cleanup`). Mã sàn thợ cũ lưu ở tag git `archive/plan-01-marketplace` (`git show archive/plan-01-marketplace:<đường>`). `routeInboundEvent` và `runTimers` mới chỉ là KHUNG — logic thật (cổng nhận tin, phiên, lượt agent, kiểm duyệt, lịch…) là P02–P07.

## Cấu trúc

| Đường dẫn | Vai trò |
| :-- | :-- |
| `src/adapters/db.ts` | Nơi DUY NHẤT mở kết nối Postgres (`pg`). `sql<T>(text, params)`, `tx(fn)`, `closeDb()`. Pool tạo lười ⇒ build không cần `DATABASE_URL` (BB-03) |
| `src/adapters/model.ts` | Nơi DUY NHẤT gọi LLM. `ModelRoute = 'community' \| 'triage'` (env `MODEL_COMMUNITY`/`MODEL_TRIAGE`). `MODEL_PROVIDER` = `gemini` (mặc định) \| `anthropic` \| `openrouter` \| `vyce` (chỉ `DATA_MODE=sim`). `callModel(c)` giữ dạng Anthropic, adapter dịch vào/ra + giữ `thoughtSignature`; `MODEL_FALLBACKS` khi 429/503/mạng; `callTriageModel` không retry, quá hạn `TRIAGE_TIMEOUT_MS`. Test: `setModelClientForTest`, `setGeminiFetchForTest`, `setOpenRouterFetchForTest`, `setTriage*ForTest`. Ghi `agent_runs` mỗi lần gọi. `embedTexts`/`turnId` là P04/P03 |
| `src/adapters/transport.ts` | `AccountId = 'community'`, `OutboxKind` (6 giá trị), `OutboxInsert` (không còn `jobId`), `Transport`; `enqueue()` là hàm DUY NHẤT ghi `outbox` (BB-02). `createTransport()` theo `TRANSPORT`: `sim` (mặc định) và `zalo` trả cùng object (core chỉ dùng `enqueue`/`status`; worker là tiến trình riêng) |
| `src/domain/types.ts` | Kiểu 01-CONTRACTS §6: `AccountId`, `Role`, `GroupMode`, `JoinPolicy`, `StaffRole = 'admin' \| 'operator'`, `GroupTrigger`, `GateReason/Input/Decision`, `TurnKind`, `GroupMessageRow`, `CommunityTriage`, `PersonaBundle`, `OutboxAction`, `OutboxBody`, `QuoteRef`, `SeenParams`, `GroupTurnContext`/`DmTurnContext`/`ToolContext` |
| `src/domain/errors.ts` | Lỗi có kiểu 01-CONTRACTS §9 (`ConflictError`, `ModelUnavailableError`, `TransportDeadError`, `RateLimitedError`, `InvalidToolInputError`, `ConfigError`, `GroupBudgetExceededError`, `ToolNotAllowedError`, `ActionNotPermittedError`, `MessageNotInBufferError`, `UnknownMemberError`, `AmbiguousMentionError`, `ApprovalRequiredError`, `IntentNotConfirmedError`, `LeadIncompleteError`, `SkillNotFoundError`, `AutomationInvalidError`, `EmbeddingUnavailableError`, `KnowledgeUnavailableError`, `ZaloActionError`); mỗi lớp có `code` = tên lớp (riêng `InvalidToolInputError`: `code`/`name` = `InvalidToolInput`, giữ từ bản trước) |
| `src/domain/password.ts` | `scrypt$N$salt$hash`, so sánh `timingSafeEqual` |
| `src/services/audit.ts` | `audit(q, {actorType, actorId, action, target, data})` |
| `src/services/community-config.ts` | `readCommunityConfig(env)`: toàn bộ bảng 01-CONTRACTS §10 (mặc định + khoảng hợp lệ); số/`ZALO_ACCOUNTS`/`TRANSPORT` sai ⇒ `ConfigError` |
| `src/services/system-events.ts` | `enqueueSystemEvent(e: SystemEvent)`: chỉ `insert` vào `inbound_events` (`sender_uid='system'`, `zalo_msg_id='sys-<uuid>'`, payload `{kind:'system', event, data}`), trả id. Nhóm ⇒ `thread_type='group'`; `automation` không gắn nhóm ⇒ DM owner |
| `src/services/timers.ts` | `runTimers(now, cfg)` — KHUNG: trả `{ steps: {} }`; từng bước (flush ambient, chào, câu hỏi bỏ trống, lịch, hết hạn thẻ duyệt, cắt đệm, báo cáo ngày) do P03–P07 điền, `now` luôn là tham số |
| `src/services/vn-time.ts` | `isBusinessHours`/`isOfficeHours`/`vnDateString`/`fmtWindowVn`/`fmtHhmmVn`/`computePublishExpiry` — giờ VN (UTC+7, không DST), thuần |
| `src/agent/conversation.ts` | `getOrCreateConversation(account, threadId, threadType, partyType)` (upsert, ghi `thread_type`), `saveMessage`, `maskForModel` (che SĐT), `loadHistory(conversationId, excludeMessageId)`. Danh tính/vai KHÔNG ở đây (BB-04) |
| `src/agent/community/router.ts` | KHUNG `routeInboundEvent(e)`: `sender_uid='system'` ⇒ audit `system.unhandled`; tin nhóm ⇒ audit `group.ingest_stub`, không trả lời; DM ⇒ `STUB_DM_REPLY` qua `enqueue` |
| `src/agent/community/redact.ts` | `normalizeVi`, `PHONE_RE`, `redactPhones` (port từ `pii.ts` cũ; không khẩn cấp, không mã căn) |
| `src/agent/community/tools/tool-kit.ts` | `AgentTool`, `ToolDefinition` (`strict: true`), `validateToolInput`/`assertValidToolInput` (kiểm `input_schema` vì Gemini không có `strict`) — chưa có tool nào (P03) |
| `src/retrieval/search-knowledge.ts` | `searchKnowledge(query, topK)`: truy hồi từ khoá lexical thuần (token dựng phía TS chỉ `[a-z0-9]`, OR-tsquery); lỗi DB ⇒ `KnowledgeUnavailableError`. Truy hồi lai là P04 |
| `src/sim/sim-transport.ts` | `simInbound` (chống trùng theo `(account, msg_id)`, từ chối `senderUid='system'`), `processInbound(handler)` (nhận-trước-xử-lý-sau; lỗi ⇒ audit `inbound.handler_error` + `BUSY_REPLY` — đổi hành vi cho nhóm là D20/P03), `simDeliver`, `runScenario(path, handler=echoHandler)`, `echoHandler` |
| `src/runner/inbound-runner.ts` | Runner `core:run`: vòng `processInbound(routeInboundEvent)` mỗi 1 s, đúng MỘT bản, dừng êm khi SIGINT; sau mỗi vòng, nếu đã qua `TIMER_INTERVAL_MS` thì gọi `runTimers(new Date())` |
| `src/dev/link-zalo.ts` | `dev:link-zalo -- --owner [--uid <uid>]`: ghi `account_owners('community', uid, 'dev')` (mặc định lấy người gửi DM mới nhất chưa là owner/thành viên nhóm); `DATA_MODE≠sim` ⇒ exit 1 |
| `src/db/migrate.ts` | Runner migration (`schema_migrations` + checksum sha256; file đã áp bị sửa ⇒ exit 1) |
| `src/db/seed.ts` | Seed nền idempotent: tài khoản `community`, 4 persona (`soul`/`rules`/`identity`/`capabilities`, v1, active; `identity` có `Tên: Claw` + mẫu gọi tên), 2 skill (`gioi-thieu-agent`, `huong-dan-setup-cskh`). `runSeed()` ⇒ `{personaDocs, skills}` |
| `src/db/seed-sim.ts` | Dữ liệu mô phỏng (chỉ `DATA_MODE=sim`, idempotent): owner `sim-owner`, nhóm `sim-group-1` (`mention`, `agent_review`) / `sim-group-2` (`ambient`) / `sim-group-off` (tắt), thành viên `sim-mod-1`/`sim-mem-1..5`, tài liệu `kb-cong-dong` 10 mục (embedding NULL). `runSeedSim()` ⇒ `{groups, members, kbSections}` |
| `src/scripts/create-admin.ts` | Tạo tài khoản nhân viên (`--role admin\|operator`); mật khẩu đọc từ stdin |

Migration (`db/migrations/`): 001–006 giữ nguyên (append-only); `007_drop_marketplace` (drop bảng sàn thợ, đổi `bql`→`community` giữ `session_enc`, vai `admin`/`operator`, `outbox` thêm `action`/`react`/`sent_at`/`result`, bỏ `job_id`); `008_community` (16 bảng cộng đồng); `009_tenant_trace` (`tenants`, `tenant_id` ở 3 bảng gốc, `turn_traces`, `agent_runs.turn_id`). Sơ đồ: [01-CONTRACTS §4](../planning/02_2026-10-09_zalo-community-agent/specs/01-CONTRACTS.md).

## Lệnh (chạy từ root)

| Lệnh | Việc |
| :-- | :-- |
| `docker compose -f compose.yaml -f compose.dev.yaml up -d db` | Postgres dev `127.0.0.1:55432` (user/db `lenqclaw`) |
| `npm run db:migrate` · `npm run db:seed` | Áp migration (`applied: N`) · seed nền |
| `npm run create-admin -- --email <e> --role admin` | Tạo admin, gõ mật khẩu qua stdin |
| `npm run db:seed:sim` | Dữ liệu mô phỏng — từ chối (exit 1) nếu env `DATA_MODE≠sim`; `test:db` seed qua `scripts/seed-sim-for-test.mjs` |
| `npm test` · `npm run test:db` | Test không DB · test cần `DATABASE_URL` (thiếu ⇒ exit 1, không skip). `TEST_DB_RESET=1 npm run test:db`: `p01.db.test.ts` drop schema `public` và migrate từ rỗng (kiểm `applied` = số file `.sql`) — CHỈ dùng trên DB dev/test |
| `npm run gate` | typecheck → build → test → `check_adapter_boundary` → `check_agent_tools` → `check_pivot_cleanup` |
| `node scripts/check_pivot_cleanup.mjs` | Quét định danh sàn thợ (`vendor`, `resident`, `dispatch`, `bql`, `market`…) trong `apps`, `packages`, `scripts`, `evals`, migration 007–009; `pivot_hits` > 0 ⇒ exit 1 (ngoại lệ duy nhất: file 007) |

## Luật khi sửa

- Thêm bảng/cột: migration MỚI `db/migrations/NNN_*.sql`, chỉ thêm. CẤM sửa file đã áp (001–009).
- Import `pg`/`@anthropic-ai/sdk`/`zca-js`/`@google/genai` hoặc chuỗi `generativelanguage.googleapis.com` ngoài adapter ⇒ `gate` đỏ. Chỉ `adapters/transport.ts` ghi `outbox` (BB-02).
- Tên tool/hành động cấm (01-CONTRACTS §7.2, §8): `scripts/check_agent_tools.mjs` in `forbidden_tools`, `forbidden_actions`, `unlisted_tools`.
- Regex trên tiếng Việt: CẤM `\b` (chỉ hiểu ASCII) — dùng `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` với cờ `u` (gotcha G14).
- Test gọi model phải tự đặt `MODEL_PROVIDER`, không dựa vào mặc định (G16).
