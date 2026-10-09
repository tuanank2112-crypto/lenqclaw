# SPEC-P01 — Gỡ sàn thợ, đổi nền sang cộng đồng (D03)

> Tầng 🟠 (thi công theo danh sách; không có quyết định mới). Đọc `00-ARCHITECTURE.md` §3, §7; `01-CONTRACTS.md` §1, §2, §3, §4, §9, §10 trước.
> Mục tiêu gói: sau gói này repo KHÔNG còn mã sàn thợ, `npm run gate` và `npm run test:db` xanh trên schema 001–008, tài khoản Zalo là `community`, vai web là `admin`/`operator`. Gói này KHÔNG viết tính năng cộng đồng (chỉ khung rỗng để biên dịch).

## §1. Thứ tự bắt buộc

1. `git tag archive/plan-01-marketplace eada365` (hoặc HEAD lúc nhận việc nếu khác — ghi SHA vào report) và `git tag` phải in ra tag đó. KHÔNG push.
2. Thêm `db/migrations/007_drop_marketplace.sql` và `008_community.sql` NGUYÊN VĂN 01-CONTRACTS §4 (so sha256 với `evidence/ARCH/migration-draft-sha256.txt` sau khi chuẩn hoá LF; lệch ⇒ dừng, báo).
3. Gỡ file theo §2; sửa file theo §3; viết lại seed §4, máy đo §6, `.env.example` §5.
4. `npm run gate` ⇒ exit 0; `npm run test:db` ⇒ exit 0 (DB dev `127.0.0.1:55432`, migrations 001–008 áp sạch từ DB rỗng — test P01 mới kiểm `applied = 8` theo số file, không ghi cứng).
5. Cập nhật `docs/core.md`, `docs/web.md`, `docs/zalo-worker.md` (Ma Trận 6 Điểm): xoá mọi mục sàn thợ, ghi trạng thái "P01 kế hoạch 02 xong".

## §2. Danh sách GỠ (đo từ cây mã HEAD `eada365`, 2026-10-09; `git rm`)

**packages/core/src/agent/** (17 tool + agent cũ):
`resident-agent.ts`, `vendor-agent.ts`, `emergency.ts`, `job-code.ts`, `pii.ts`, `pii.test.ts`, `tool-context.ts`, `triage.ts`, `vendor-intent.ts`, `vendor-intent.test.ts`, `vendor-tool-context.ts`, `vendor-triage.ts`, `vendor-triage.test.ts`, `prompts/resident.ts`, `prompts/triage.ts`, `prompts/vendor.ts`, `prompts/vendor-triage.ts`, `prompts/vendor-golden-leak.test.ts`, `tools/index.ts`, `tools/claim_job.ts`, `tools/classify_responsibility.ts`, `tools/classify_responsibility.test.ts`, `tools/confirm_assignment.ts`, `tools/decline_hold.ts`, `tools/dispatch_to_vendor.ts`, `tools/get_my_assignments.ts`, `tools/get_my_cases.ts`, `tools/get_my_slot.ts`, `tools/get_price_band.ts`, `tools/handoff_to_staff.ts`, `tools/handoff_to_staff.test.ts`, `tools/open_service_case.ts`, `tools/open_service_case.test.ts`, `tools/push_bql_ticket.ts`, `tools/request_access.ts`, `tools/request_slot.ts`, `tools/save_job_draft.ts`, `tools/search_regulations.ts`, `tools/vendor_handoff_to_staff.ts`.
GIỮ: `agent/tools/tool-kit.ts` (chuyển sang `agent/community/tools/tool-kit.ts`), `agent/tools/tool-kit.test.ts` (viết lại ca test với 2 definition giả — không còn import 8 tool P03), `agent/conversation.ts` (sửa §3).

**packages/core/src/services/**: `access.ts`, `dispatch.ts`, `dispatch-config.ts`, `dispatch-config.test.ts`, `job-state.ts`, `job-state.test.ts`, `pii-gate.ts`, `pii-gate.test.ts`, `slots.ts`, `vendor-messages.ts`, `vendor-messages.test.ts`, `vendors.ts`. GIỮ: `audit.ts`, `vn-time.ts`, `vn-time.test.ts`; SỬA: `timers.ts`, `system-events.ts` (§3).

**packages/core/src/dbtests/**: `p03.db.test.ts`, `p03-category-code.db.test.ts`, `p03-model-down.db.test.ts`, `p03-regression.db.test.ts`, `p05-access.db.test.ts`, `p05-dispatch.db.test.ts`, `p05-helpers.ts`, `p05-pii-probe.db.test.ts`, `p05-slots.db.test.ts`, `p05-suspend.db.test.ts`, `p05-timers.db.test.ts`, `p05-vendor-agent.db.test.ts`. SỬA: `p01.db.test.ts`, `p02-link-zalo.db.test.ts`, `p02-runner.db.test.ts`.

**packages/core/src/retrieval/**: `search-regulations.ts` ⇒ `git mv` thành `search-knowledge.ts` (giữ `buildQueryTokens`, `buildTsQueryExpr`, `DEFAULT_TOP_K`; bỏ tham số `buildingId` và điều kiện `d.building_id`; đổi tên `RegulationHit`→`KnowledgeHit`, `RegulationUnavailable`→`KnowledgeUnavailableError`; truy hồi lai làm ở P04).

**apps/web/**: `app/api/tickets/[id]/decision/route.ts`, `app/api/vendors/[id]/slots/paid/route.ts`, `app/api/vendors/[id]/status/route.ts`, `app/api/vendors/capacity/route.ts`, `app/gate/page.tsx`, `app/jobs/page.tsx`, `app/jobs/[code]/page.tsx`, `app/tickets/page.tsx`, `app/tickets/TicketDecisionForm.tsx`, `app/vendors/page.tsx`, `app/vendors/CapacityForm.tsx`, `app/vendors/SlotPaidButton.tsx`, `app/vendors/VendorStatusActions.tsx`, `tests/p05e-helpers.ts`, `tests/tickets-decision.db.test.ts`, `tests/vendors-paid.db.test.ts`, `tests/vendors-status.db.test.ts`.

**scripts/**: `eval_golden.mjs`, `eval/args.mjs`, `eval/red-fake-model.mjs`, `eval/run.mjs`, `eval/score.mjs`, `eval/set-flag.test.mjs`, `eval/vendor-intent.mjs`, `sim_claims.mjs`. GIỮ: `check_adapter_boundary.mjs`, `gate.mjs`, `seed-sim-for-test.mjs`; VIẾT LẠI: `check_agent_tools.mjs` (§6); THÊM: `check_pivot_cleanup.mjs` (§6).

**evals/**: `golden/consent.jsonl`, `golden/diagnosis.jsonl`, `golden/emergency.jsonl`, `golden/pii_probe.jsonl`, `golden/responsibility.jsonl`, `golden/vendor_intent.jsonl`. SỬA `scenarios/echo.jsonl` (§4.3).

**Root**: `package.json` `description` ⇒ `"Zalo community-care agent (lenqclaw) - monorepo root"`; KHÔNG đổi `version` (0.0.1 giữ tới khi đóng kế hoạch — D11). `.env.example` §5.

Tổng: 94 file `git rm` (agent 39 · services 12 · dbtests 12 · web 17 · scripts 8 · evals 6) (đếm lại bằng `git diff --stat --diff-filter=D <base>..HEAD | tail -1` và ghi vào report).

## §3. Danh sách SỬA (chỉ đủ để biên dịch + test; tính năng ở gói sau)

| File | Sửa |
| :-- | :-- |
| `packages/core/src/domain/types.ts` | Xoá `JobStatus`, `JobDraft`, `Citation`, `ResponsibilityVerdict`, `JobCard`, `JobReveal`, `Party`, `TradeGroup`; thêm kiểu 01-CONTRACTS §6 (`AccountId`, `Role`, `GroupMode`, `JoinPolicy`, `StaffRole = 'admin' \| 'operator'`, `GroupTrigger`, `GateReason`, `GateInput`, `GateDecision`, `TurnKind`, `GroupMessageRow`, `CommunityTriage`, `PersonaBundle`, `OutboxAction`, `OutboxBody`, `QuoteRef`) |
| `packages/core/src/domain/errors.ts` | Xoá lỗi sàn thợ; thêm lớp theo 01-CONTRACTS §9 (mỗi lớp `code` = tên lớp, `name` = tên lớp) |
| `packages/core/src/adapters/model.ts` + 4 file test | `ModelRoute = 'community' \| 'triage'`; `ROUTE_ENV` 2 khoá; test đổi `route: 'diagnose'` ⇒ `'community'`; `embedTexts` làm ở P04 |
| `packages/core/src/adapters/transport.ts` | `AccountId = 'community'`; `OutboxKind` 6 giá trị; `OutboxInsert` bỏ `jobId`, `enqueue` bỏ cột `job_id`; `createTransport('zalo')` không ném |
| `packages/core/src/agent/conversation.ts` | Xoá `resolveParty`; `getOrCreateConversation(account, threadId, threadType, partyType: 'owner'\|'member'\|'stranger'\|'group')` ghi `thread_type`; `maskForModel(text)` chỉ che SĐT (`redactPhones`); `loadHistory(conversationId, excludeMessageId)` |
| `packages/core/src/agent/community/redact.ts` (MỚI, port từ `pii.ts`) | `normalizeVi`, `PHONE_RE` (giữ nguyên biểu thức `pii.ts:137`), `redactPhones(text)`; KHÔNG port khẩn cấp, mã căn |
| `packages/core/src/agent/community/router.ts` (MỚI, khung) | `routeInboundEvent(e)`: `senderUid==='system'` ⇒ `handleSystemEvent` (khung, audit `system.unhandled`); `threadType==='group'` ⇒ `ingestGroupMessage` (khung: chỉ ghi `audit 'group.ingest_stub'`, không trả lời); DM ⇒ trả `STUB_DM_REPLY = 'Trợ lý đang được nâng cấp, bạn quay lại sau nhé.'` qua `enqueue`. Toàn bộ logic thật ở P03 |
| `packages/core/src/services/timers.ts` | `runTimers(now, cfg = readCommunityConfig())` trả `TimerReport` rỗng `{ steps: {} }` (khung; P07 điền) |
| `packages/core/src/services/system-events.ts` | chữ ký 01-CONTRACTS §8.5; chỉ `insert` + trả id |
| `packages/core/src/services/community-config.ts` (MỚI) | `readCommunityConfig(env)` đủ bảng 01-CONTRACTS §10 (mẫu `dispatch-config.ts` cũ: số sai ⇒ `ConfigError`) + test ≥ 4 ca |
| `packages/core/src/runner/inbound-runner.ts` | import `routeInboundEvent` từ `agent/community/router.js`, `runTimers` mới, `readCommunityConfig().timerIntervalMs` |
| `packages/core/src/sim/sim-transport.ts` | kiểu `account: AccountId`; giữ toàn bộ hành vi |
| `packages/core/src/dev/link-zalo.ts` | `npm run dev:link-zalo -- --owner [--uid <uid>]`: ghi `account_owners('community', uid, 'dev')`; bỏ `--resident` |
| `packages/core/src/scripts/create-admin.ts` | `--role admin\|operator` |
| `packages/core/src/index.ts` | export: types, errors, password, db, `model`, transport, audit, `sim`, `agent` (= `agent/community/router.js`), `retrieval` (= `search-knowledge.js`) |
| `packages/core/src/db/seed.ts`, `seed-sim.ts` | §4 |
| `packages/core/src/dbtests/p01.db.test.ts` | migrations từ rỗng `applied === số file *.sql`; seed nền idempotent; `zalo_accounts` đúng 1 dòng `community`; `audit()` ghi được; `enqueue` ghi `outbox` kind `action`; bỏ mọi ca `transitionJob` |
| `packages/core/src/dbtests/p02-link-zalo.db.test.ts` | ca `--owner` |
| `packages/core/src/dbtests/p02-runner.db.test.ts` | `community`; handler khung trả `STUB_DM_REPLY` |
| `apps/zalo-worker/src/config.ts` + test | `AccountId = 'community'`; `readAccounts` chỉ nhận `community` (khác ⇒ `ConfigError`); mặc định `community` |
| `apps/zalo-worker/src/pacer.ts` | xoá `isEmergencyRow` + import `@lenqclaw/core/agent/pii`; `staff_takeover` ⇒ huỷ không ngoại lệ |
| `apps/zalo-worker/src/store.ts` | `isIdentified(account, uid)` ⇒ `exists account_owners ∪ group_members(left_at is null)`; `OutboxRow` bỏ `job_id`; `fetchDue` bỏ cột `job_id`; `splitRow` bỏ `jobId`; `markSent` ghi thêm `sent_at = now()` |
| `apps/zalo-worker/src/dbtests/p02-worker.db.test.ts` | `community`; bỏ ca `market` cấm; giữ 4 ca §8 SPEC-P02 cũ |
| `apps/web/lib/auth/policy.ts` + `policy.test.ts` | bảng mới §3.1; ≥ 14 ca |
| `apps/web/app/api/_auth.ts`, `app/api/auth/login/route.ts`, `tests/00-login.db.test.ts` | vai `admin`/`operator` |
| `apps/web/app/api/zalo/_shared.ts`, `[account]/*`, `status/route.ts`, `policy.test.ts`, `tests/zalo-*.db.test.ts`, `app/zalo/*` | `ZaloAccountId = 'community'`; chuỗi UI "Tài khoản bql" ⇒ "Tài khoản community" |
| `apps/web/app/page.tsx`, `layout.tsx` | tiêu đề "lenqclaw — Trợ lý cộng đồng"; menu tạm: `/zalo`, `/dev/sim` (admin) |
| `apps/web/app/dev/sim/SimBoard.tsx`, `api/dev/sim/*`, `tests/sim-tick.db.test.ts` | P01: chỉ đổi hằng (`account: 'community'`, một khung DM + một khung nhóm `sim-group-1`); giao diện nhóm thật ở P02 |
| `docs/core.md`, `docs/web.md`, `docs/zalo-worker.md` | viết lại mục cấu trúc theo thực tế sau P01 |

### §3.1 Bảng phân quyền web mới (`canAccess(role, pathname)`)
| Đường dẫn | admin | operator | chưa đăng nhập |
| :-- | :-- | :-- | :-- |
| `/login`, `/api/auth/*` | ok | ok | ok |
| `/` | ok | ok | → /login |
| `/groups/*`, `/api/groups/*`, `/persona/*`, `/api/persona/*`, `/knowledge/*`, `/api/knowledge/*`, `/automations/*`, `/api/automations/*` | ok | **đọc** (GET) / POST ⇒ 403 | → /login |
| `/approvals/*`, `/api/approvals/*`, `/leads/*`, `/api/leads/*`, `/moderation/*`, `/api/moderation/*`, `/agent/*` | ok | ok | → /login |
| `/zalo`, `/api/zalo/*`, `/dev/*`, `/api/dev/*`, `/admin/*` | ok | 403 | → /login |
| khác | 403 | 403 | → /login |

`canAccess` nhận thêm tham số `method: 'GET' \| 'POST' \| …` (mặc định `'GET'`); `middleware.ts` truyền `req.method`. Khớp theo đoạn đường dẫn (giữ `matchesSegment`).

## §4. Seed

### §4.1 `npm run db:seed` (idempotent) — `packages/core/src/db/seed.ts`
- `zalo_accounts`: `('community', 'Trợ lý cộng đồng', 'logged_out')` on conflict do nothing.
- `persona_docs` phiên bản 1, `is_active=true` cho 4 kind (chỉ khi chưa có dòng nào của kind đó): nội dung mẫu tiếng Việt có dấu, ≤ 2000 ký tự mỗi doc; `identity` chứa dòng `Tên: Claw` và `Gọi tên: claw ơi; bé claw; @claw` (nguồn `namePatterns` — SPEC-P03 §7.2).
- `skill_docs`: 2 skill mẫu `gioi-thieu-agent` (mô tả năng lực agent), `huong-dan-setup-cskh` (các bước dựng AI CSKH) — thân ≤ 1500 ký tự.
- Hàm `runSeed()` trả `{ personaDocs: number; skills: number }`.

### §4.2 `npm run db:seed:sim` (chỉ `DATA_MODE=sim`, idempotent) — `seed-sim.ts`
- `account_owners`: `('community', 'sim-owner', 'Chủ mô phỏng')`.
- `zalo_groups`: `sim-group-1` (enabled, `mention`, `join_policy='agent_review'`), `sim-group-2` (enabled, `ambient`, `budget_per_hour=20`), `sim-group-off` (enabled=false).
- `group_members`: `sim-group-1`/`sim-group-2`: `sim-mod-1` (moderator), `sim-mem-1..5` (member) với `display_name` có dấu tiếng Việt; `sim-group-off`: `sim-mem-1`.
- `kb_documents`/`kb_sections`: 1 tài liệu `kb-cong-dong` (`approved`, `effective_from = current_date`, `source='seed'`) với 10 mục về AI agent / Zalo / CSKH (mỗi mục `[CHỦ ĐỀ: …]` + 2–4 câu), để `embedding` NULL.
- Trả `{ groups, members, kbSections }`.

### §4.3 `evals/scenarios/echo.jsonl`
Đổi `account` ⇒ `community`; thread user `u-101` sender `sim-mem-1`; thread group `sim-group-1` sender `sim-mem-2` có `msg_id` trùng để kiểm chống trùng (giữ ngữ nghĩa `runScenario`: 1 duplicate).

## §5. `.env.example`
Xoá mọi biến ở 01-CONTRACTS §10 "Bỏ khỏi"; thêm toàn bộ bảng §10 với giá trị mặc định và một dòng chú thích mỗi nhóm; giữ `POSTGRES_*`, `DATABASE_URL`, `SESSION_SECRET`, `ZALO_SESSION_KEY`, `MODEL_PROVIDER`…, `DATA_MODE`, `TRANSPORT`, `PACER_*` (sửa `PACER_MAX_PER_MINUTE=10`, thêm `PACER_GROUP_GAP_MS`, `PACER_GROUP_JITTER_MS`, bỏ `PACER_MIN_INTERVAL_MS`). `ZALO_ACCOUNTS=community`.

## §6. Máy đo

### §6.1 `scripts/check_agent_tools.mjs` (viết lại)
In 3 dòng, tổng > 0 ⇒ exit 1:
- `forbidden_tools: <n>` — quét `packages/core/src/agent/**/*.{ts,tsx,js,mjs,cjs}` (trừ `*.test.ts`) tìm `name: '<x>'` (nháy đơn/kép/template) với `x` ∈ danh sách 01-CONTRACTS §7.2 (22 tên).
- `forbidden_actions: <n>` — quét `packages/core/src/**` + `apps/zalo-worker/src/**` tìm chuỗi `action: '<x>'` với `x` ∈ `['disperse_group','change_group_owner','add_group_deputy','remove_group_deputy','leave_group','send_file','self_update','restart']`.
- `unlisted_tools: <n>` — mọi `definition.name` trong `agent/community/tools/*.ts` (trừ test, `tool-kit.ts`, `index.ts`) PHẢI thuộc `TOOL_NAMES` xuất từ `agent/community/policy.ts` (đọc bằng regex `name:\s*['"]([a-z_]+)['"]` trên cả hai file; P01 chưa có tool ⇒ 0).
Bằng chứng ĐỎ bắt buộc: bản sao tạm có tool `name: 'exec'` ⇒ `forbidden_tools: 1`, exit 1 (`evidence/P01/red-check-agent-tools.txt`).

### §6.2 `scripts/check_pivot_cleanup.mjs` (MỚI, chạy trong `gate` sau `check_agent_tools`)
Quét `apps/`, `packages/`, `scripts/`, `evals/`, `db/migrations/00[7-9]*` (trừ `node_modules`, `.next`, `dist`, file `.md`) tìm định danh sàn thợ (không phân biệt hoa thường, theo ranh giới `[A-Za-z0-9_]`): `vendor`, `resident`, `JobCard`, `JobReveal`, `dispatch`, `access_pass`, `slot_capacity`, `vendor_slots`, `ledger`, `price_book`, `job_categories`, `tickets`, `bql`, `market`, `apartment`, `trade_group`, `claim_job`, `search_regulations`, `hotline`. In `pivot_hits: <n>` + từng `file:line`; n > 0 ⇒ exit 1. `gate.mjs` thêm bước `{ label: 'check_pivot_cleanup', cmd: nodeCmd, args: ['scripts/check_pivot_cleanup.mjs'] }`. Ngoại lệ DUY NHẤT: `db/migrations/007_drop_marketplace.sql` (chứa tên bảng cũ để drop) — loại trừ bằng tên file trong script. Bằng chứng ĐỎ: chạy trên cây TRƯỚC khi gỡ ⇒ `pivot_hits` > 1000 (ghi số thật vào `evidence/P01/red-pivot-before.txt`).

## §7. THIRD_PARTY_NOTICES.md
Chỉ tạo khi có chép đoạn mã ≥ 10 dòng từ OpenClaw (MIT, OpenClaw Foundation) hoặc zaloclaw (MIT, monasprox). Nội dung: tên dự án, URL, giấy phép, file đích + file nguồn. P01 không chép gì ⇒ không tạo.

## §8. Vùng cấm P01
- CẤM sửa `db/migrations/001–006` (checksum trong `schema_migrations`; `MigrationChecksumError`).
- CẤM "tiện tay" viết tính năng cộng đồng trong gói này (router là khung trả `STUB_DM_REPLY`).
- CẤM đổi `package.json.version`.
- CẤM xoá `evidence/`, `handoffs/`, `reports/` của `planning/01_*` (Path Invariant) và CẤM sửa bất kỳ file nào trong `planning/01_*`.
- CẤM giữ lại "để sau" file nào trong §2: danh sách là toàn bộ, grep `pivot_hits: 0` là cổng.

## §9. Lỗi & hành vi
| Tình huống | Hành vi |
| :-- | :-- |
| `test:db` trên DB dev đã có dữ liệu sàn thợ + phiên `bql` | migration 007 giữ `session_enc` khi đổi tên sang `community` (đã đo: `enc: deadbeef` còn nguyên) — KHÔNG được xoá tay bảng trước khi migrate |
| `MigrationChecksumError` | file 001–006 bị sửa ⇒ `git checkout` lại, không "sửa checksum" |
| `pivot_hits > 0` sau gỡ | gỡ tiếp, không thêm ngoại lệ vào script |

## §10. Nghiệm thu P01 ("xong khi" — mọi lệnh từ root, Git Bash, LF)
| # | Lệnh | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `git tag --list 'archive/*'` | `archive/plan-01-marketplace` |
| 2 | `npm run gate` | `GATE_OK`, exit 0 (5 bước + `check_pivot_cleanup`) |
| 3 | `node scripts/check_pivot_cleanup.mjs` | `pivot_hits: 0` |
| 4 | `npm run test:db` | exit 0, 0 skip; `p01.db.test.ts` in `applied: 8` (từ DB rỗng — test tự `drop schema public cascade; create schema public` ở `beforeAll` khi `TEST_DB_RESET=1`, mặc định dùng DB hiện có đã migrate) |
| 5 | `npm test` | core ≥ 60, web ≥ 30, worker ≥ 37 test, 0 fail, 0 skip |
| 6 | `git diff --stat --diff-filter=D <base>..HEAD \| tail -1` | `94 files changed` (rename `search-regulations→search-knowledge`, `tool-kit` không tính; sai lệch ⇒ giải thích từng file trong report) |
| 7 | `grep -rn "bql\|market" apps packages scripts --include=*.ts --include=*.tsx --include=*.mjs -l \| grep -v node_modules \| wc -l` | `0` |
| 8 | `ls planning/01_2026-09-24_san-viec-tho-mvp/specs \| wc -l` | `11` (không đổi) |
