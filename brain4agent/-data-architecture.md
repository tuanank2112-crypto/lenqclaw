# Master Data Architecture & Flow

Tài liệu thiết kế về cấu trúc dữ liệu, cơ chế lưu trữ bền vững (Persistence Layer) và luồng luân chuyển dữ liệu đa tầng.

> **Trạng thái 2026-10-09 — ĐỌC KỸ:** DB thật trong repo = migration `001`–`006` của **sàn việc thợ** (33+ bảng: buildings, residents, vendors, jobs, slots…; `004` QR qua DB, `005` UI Zalo, `006` dispatch/slots). Kế hoạch 02 (pivot cộng đồng) thiết kế thêm **migration `007` + `008`** (DDL nguyên văn ở `planning/02_2026-10-09_zalo-community-agent/specs/01-CONTRACTS.md` §4). Chúng **là THIẾT KẾ, CHƯA áp vào repo** (kiến trúc sư đã áp thử từ rỗng sau 001–006: `applied 2`, chạy lại `applied 0`, 27 bảng, 21/21 kiểm OK — `evidence/ARCH/migration-probe.txt`). Gói P01 mới đưa 007/008 vào `db/migrations/`. 001–006 append-only, không sửa.

## 1. Các Tầng Lưu Trữ (Data Persistence Stores)

- **PostgreSQL 16 + pgvector 0.8.5** (một instance, Docker, VPS Việt Nam) — danh tính, hội thoại, đệm nhóm, persona, tri thức + embedding `vector(1024)`, thẻ duyệt, lead, lịch.
- **Không pg-boss, không hàng đợi ngoài Postgres:** một runner tuần tự + `runTimers(now)` (idempotent từng bước).
- **Phiên Zalo** — `zalo_accounts.session_enc` mã hoá AES-256-GCM bằng `ZALO_SESSION_KEY`; CẤM lưu dạng rõ, CẤM log. Tài khoản duy nhất `community` (007 đổi tên từ `bql`, GIỮ `session_enc`, bỏ `market`).
- **`storage/`** (đĩa VPS) chỉ còn là di sản sàn thợ; vòng 0.1 không nhận ảnh/file/voice vào agent.

## 2. Schema & Data Flow (đích sau P01, theo 01-CONTRACTS §4)

Bảng mới (007/008): `account_owners`, `zalo_groups` (allowlist nhóm, chế độ `mention|ambient`, `budget_per_hour`), `group_members` (vai), `group_messages` (đệm vòng: `sender_uid` + `cli_msg_id` mọi tin kể cả tin bot), `group_sessions`, `persona_docs` (có phiên bản), `skill_docs`, `member_profiles`, `daily_notes` (+ tsv), `moderation_events`, `moderation_scores` (thang cảnh cáo), `approvals` (thẻ duyệt), `join_requests`, `leads`, `automations`, `automation_runs`. Giữ nền cũ: `zalo_accounts`, `zalo_identities`, `inbound_events`, `outbox` (mở rộng `kind` + `body.action`), `conversations`, `messages`, `agent_runs`, `audit_log`, `staff_users` (vai `admin|operator`), kho tri thức `kb_*`. Bảng sàn thợ không dùng bị DROP bằng migration mới.

Migration `009_tenant_trace.sql` (D23/D24, 2026-10-14 — THIẾT KẾ, CHƯA áp thử): bảng `tenants` (0.1 chỉ `default`) + `tenant_id` ở `zalo_accounts`/`staff_users`/`kb_documents` (bảng 008 suy tenant qua tài khoản); `turn_traces` (1 dòng/lượt agent: outcome, tools, token, latency, phiên bản persona — không nội dung) + `agent_runs.turn_id`. Hạn giữ (D22): `messages` 30 ngày (timer `pruneBuffers`); trí nhớ dài hạn DM chỉ là `member_profiles.notes` + `leads`.

Luồng:
1. `zca-js` listener (worker `community`) → `inbound_events` (text, group_event, undo; unique `(account, zalo_msg_id)`) → runner `core:run` → `agent/community/router.ts`.
2. Router: ingest nhóm (`group_members`, `group_messages` ring 200 tin/nhóm, ≤ 7 ngày — BB-11) → kiểm duyệt (lưới + triage, thang cảnh cáo) → cổng `decideGroupInbound` (hàm thuần trả mã lý do) → lượt agent theo loại (`group_mention | group_ambient_flush | group_welcome | group_unanswered | group_join_review | dm | owner_dm | automation`).
3. Agent làm mọi việc qua tool; mọi lời nói/hành động ra Zalo qua `enqueue()` → `outbox` (`text|action|typing|seen|react`) → pacer theo tài khoản + theo nhóm (≤ 1800 ký tự/chunk, jitter, ngân sách tin/nhóm/giờ) → zca-js.
4. `runTimers(now)` ghi `inbound_events` với `sender='system'`: flush ambient (gom 20 s), welcome, câu hỏi bỏ trống, automations (`at|every|daily|weekly`, giờ VN), hết hạn thẻ duyệt (TTL 24 h), cắt đệm, báo cáo ngày.
5. Hồ sơ thành viên và ghi chú ngày KHÔNG BAO GIỜ vào lượt nhóm (BB-07); tri thức truy hồi lai lexical + vector RRF, thiếu embedding ⇒ lexical thuần. Mọi hành động quản trị ghi `audit_log` (BB-09).
