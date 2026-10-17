# Changelog & Semantic Releases

Tất cả các quyết định kiến trúc và lịch sử nâng cấp phiên bản của dự án.

## [Unreleased] - 2026-10-17: P04 nghiệm thu — kho tri thức + truy hồi lai
### Changed
- `services/knowledge.ts` (`upsertDocument`, `embedPending`, `findUnansweredQuestions`), `retrieval/search-knowledge.ts` lai RRF, `adapters/model.ts::embedTexts`, `runTimers` thêm `pickUnanswered` + `embedPending`.
### Decided
- **D39 (SO):** trích dẫn `(theo …)`; nâng làn trước tool tra cứu; sim luôn dùng `BOT_UID_SIM`.

## [Unreleased] - 2026-10-17: P03b nghiệm thu — vận hành: báo động Telegram, heartbeat, healthz
### Changed
- Worker: pacer D31 (tick 250, ưu tiên tin trả lời, typing tươi, `picked_at`/`hold_reason`), advisory lock `lenqclaw:worker:community`, heartbeat, ghi `own_uid`.
- Core: `adapters/alert.ts` (Telegram, chống lặp CAS `alert_state`, trần 20 tin/giờ), `services/ops-watch.ts` (8 loại sự cố), dọn `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày; migration `011_bot_uid.sql`.
- Web: `GET /api/healthz` (không đăng nhập, không lộ số liệu).
### Decided
- **D37/D38 (SO):** phạm vi P03b, nguồn `botUid` thật; nghiệm thu R10, sửa SPEC-D31 §10.1 (hoàn lại khi gửi lỗi không đặt `null`).

## [Unreleased] - 2026-10-17: P03 nghiệm thu — runtime agent trên LangGraph + tốc độ D31
### Changed
- `agent/community/graph/*`: `pipelineGraph` + `turnGraph` (LangGraph.js 1.4.18, không checkpointer), cổng nhận tin thuần, đệm + phiên nhóm, persona/prompt, policy tool theo bề mặt × vai, host ép trả lời; tool nền (tra cứu lexical, gửi nhóm, ghi chú thành viên, chuyển chủ, quản lý nhóm).
- D31 runtime: làn `fast`/`rag`, hạn chót + `AbortSignal` + `ModelDeadlineError`, `MODEL_COMMUNITY_FAST`, `maxOutputTokens` 1024, runner song song theo thread + advisory lock + heartbeat runner, migration `010_ops_latency.sql`, `scripts/latency_slo.mjs` (G23).
### Decided
- **D35 (SO):** phán R07 🔁 theo thẩm định R08; 13 điểm sửa — `decideDelivery` xét D8 trước D4, adapter phân loại lỗi đọc thân, `owner_dm` không takeover, bỏ lời gọi chốt sau vòng tool `answers` (không đổi hình), rào dữ liệu không tin cậy chặt hơn, `remember_member_note` chỉ cho chính người nói.
- **D36 (SO):** R09 ✅ — SO đo lại + tự đột biến; G07/G08/G14/G15 ✅ local.

## [Unreleased] - 2026-10-16: D31–D34 tốc độ trả lời + báo động Telegram (SPEC, mã CHƯA đổi)
### Decided
- **D31 (người dùng):** tin ngoài công việc < 5 s, công việc/RAG < 15 s. Thiết kế SPEC-D31: làn `fast`/`rag`/`background`, hạn chót lượt + `AbortSignal` + `ModelDeadlineError` (BB-18), runner song song theo thread, tuần tự trong thread + advisory lock (BB-19), typing sớm, tin gọi bot không triage, `MODEL_COMMUNITY_FAST`, migration `010_ops_latency`, cổng G23.
- **D32 (người dùng):** báo động vận hành qua Telegram (`adapters/alert.ts`, BB-20) + heartbeat tiến trình + `/api/healthz`; giữ `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày; cổng G24.
- **D33 (người dùng):** kích hoạt persona không bắt buộc qua eval.
- **D34 (SO):** duyệt kỹ thuật R06; hình đồ thị không đổi (không cần duyệt lại ảnh 12); xếp runtime D31 vào P03, phần worker/Telegram/dọn dữ liệu thành gói P03b.
### Superseded
- Runner tuần tự toàn cục; lời gọi model không timeout; triage mọi tin DM; `max_tokens` 16000 — xem plan 02 §2 bảng thay thế.

## [Unreleased] - 2026-10-16: P02 nghiệm thu + D28 runtime LangGraph
### Changed
- P02: transport nhóm (tin + sự kiện nhóm, action quản trị qua outbox, pacer + ngân sách theo nhóm, kênh giả lập nhóm). Thẩm định đối kháng tìm lỗi CHẶN kick/block không kiểm thẻ duyệt ⇒ sửa (D29): worker là lớp chặn cuối BB-06.
### Decided
- **D28 (người dùng):** runtime agent dựng trên LangGraph.js 1.4.18, pipeline là đồ thị tường minh — nền cho kế hoạch 03 và giai đoạn doanh nghiệp. BB-15/16/17 mới (tác dụng phụ theo node, cạnh thuần, cấm checkpointer/LangSmith/ChatModel LangChain).
- **D29/D30:** cách sửa P02 và các điểm chốt sau nghiệm thu.
### Superseded
- Vòng tool tự viết SPEC-P03 §6 (port `resident-agent.ts`) — thay bởi `turnGraph` (D28).

## [Unreleased] - 2026-10-16: P01 kế hoạch 02 nghiệm thu — repo không còn mã sàn thợ
### Changed
- Gỡ 95 file sàn thợ (agent cư dân/thợ, dispatch, slot, access, ticket, golden cũ); migration `007_drop_marketplace`, `008_community`, `009_tenant_trace`; tài khoản Zalo `community`; vai web `admin`/`operator`; seed persona/skill/nhóm mô phỏng; khung `agent/community/router.ts`; máy đo `check_pivot_cleanup` vào `gate`. Không bump version (D11: `0.1.0` khi đóng kế hoạch 02).
- Cổng Postgres dev `55432` → `15432` (Windows giữ dải cổng động — G31).
### Decided
- **D27** nghiệm thu P01 (SO đo lại độc lập); SPEC-P01 §10 hàng 4 (`applied: 9` đo trên DB tạm) và hàng 6 (95 file) chỉnh theo thực đo.

## [Unreleased] - 2026-10-14: Bổ sung D22–D25 vào hồ sơ 02 (SPEC, mã CHƯA đổi)
### Decided
- **D22** ngữ cảnh DM có trần: ≤ `DM_HISTORY_TURNS` (5) lượt + ghi chú thành viên + lead mở; KHÔNG nén/tóm tắt bằng model; `messages` giữ 30 ngày; bỏ tool `recall_member_profile` (BB-13).
- **D23** đường nối tenant: migration MỚI `009_tenant_trace.sql` — bảng `tenants` + `tenant_id` ở `zalo_accounts`/`staff_users`/`kb_documents` (mặc định `default`); bảng 008 suy tenant qua tài khoản.
- **D24** vết từng lượt `turn_traces` + `agent_runs.turn_id`, thay audit `turn.done` (BB-14).
- **D25** chỉ zca-js cho cả cộng đồng lẫn doanh nghiệp của chủ; không Zalo OA, không lớp `ChannelAdapter`.
- Lộ trình chuẩn doanh nghiệp 5 giai đoạn (`0.1.0` → `1.0.0`) ghi ở `roadmap.md`; GĐ1 `0.2.0` = khung Skill · Voice · Constraint.
### Superseded
- SPEC-P03 §5.1 "lịch sử 20 tin", tool `recall_member_profile`, audit `turn.done`, hướng "Zalo OA song song" — xem plan 02 §2 bảng thay thế.

## [Unreleased] - 2026-10-09: Pivot sang agent chăm sóc cộng đồng Zalo — hồ sơ 02 (🟢 SPEC đã duyệt, mã CHƯA đổi)
### Decided
- **Kiến trúc (không bump version; `0.1.0` khi đóng kế hoạch 02, `package.json` ×4 vẫn `0.0.1`):** Đ32 (kế hoạch 01) DỪNG sàn việc thợ; D01 (kế hoạch 02) sản phẩm = agent chat chăm sóc cộng đồng trong Zalo, tài khoản `community` làm phó nhóm, port mẫu OpenClaw + monas-team/zaloclaw (MIT), tự customize.
- D02 giữ nền kỹ thuật (Node 22, Postgres+pgvector, zca-js 2.2.0, adapters, SimTransport, mẫu "luật trong tool" + "model hiểu ý, code là lưới"). D03 gỡ mã sàn thợ thành gói P01 đi đầu (94 file, tag `archive/plan-01-marketplace`, migration mới 007/008 append-only). D04–D21: cổng nhận tin kiểu OpenClaw, năng lực MVP, vai & quyền, persona có phiên bản, lịch `at|every|daily|weekly`, chống khoá tài khoản, golden thật bằng Gemini, một tài khoản `community`, vai web admin/operator, đệm nhóm Postgres, ambient gom cửa sổ, thang cảnh cáo, embedding dim 1024, thẻ duyệt TTL 24 h, host ép trả lời.
- Bất biến BB-01…BB-12 (00-ARCHITECTURE §6); Q1–Q12 giữ giá trị tạm; SO duyệt `f6a4465`, architect `7a58d6d`. Chờ người xác nhận gỡ 94 file trước khi phóng P01.
### Superseded
- Toàn bộ hồ sơ 01 (sàn thợ, BQL, slot, ticket, access pass, vai `bql_admin/bql_staff/guard`, tài khoản `bql`/`market`) — thay bởi hồ sơ 02; xem bảng "Quyết định bị thay thế" trong plan 02 §2. Mục `[Unreleased] - 2026-09-24` bên dưới là LỊCH SỬ của hồ sơ 01.

## [Lịch sử, DỪNG 2026-10-09] - 2026-09-24: Hồ sơ 01 — Sàn việc thợ MVP (pipeline v0.2)
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
- Đ18 LLM mặc định là Gemini (`gemini-3.6-flash`, dự phòng `gemini-3-flash-preview`, `gemini-3.5-flash-lite`) sau cùng adapter `callModel`; Claude giữ qua `MODEL_PROVIDER=anthropic`. Người dùng chốt 2026-09-24 (chỉ có key Gemini).
- Đ19 (2026-09-25) Chốt câu hỏi mở R03: SPEC-P03 §10.8 chỉ cho nhánh anthropic; fallback phía client `MODEL_FALLBACKS` cho cả hai nhà cung cấp; `max_tokens` 16000; `window_start/end` NULL tới SPEC-P05; G09/G10 chỉ ✅ khi chấm qua vòng agent thật.
- Đ20 (2026-09-25) Vòng 2 P03 sau thẩm định R05 (SPEC-P03 §11): citation cùng nhãn + cùng tòa (`kb_documents.building_id`), quote từ DB; verdict khoá sau `drafting`; đồng ý chỉ ở lượt sau; che PII theo mã căn trong DB + regex có dấu phân cách; khẩn cấp theo ranh giới từ.
- Đ21 (2026-09-25, người dùng: "bắt key rất khó và dễ sai") Lớp hiểu ý `triageMessage` (model rẻ, JSON, 4 s) cho khẩn cấp và đồng ý; từ khoá lùi về lưới an toàn ưu tiên chính xác, không chờ model (Đ09 giữ). C1 giữ: BQL thu phí slot ⇒ trích dẫn buộc chặt kết luận là thứ giữ lòng tin cư dân.
- Đ22 (2026-09-25, người dùng "ok làm đi") Đưa P02 Zalo thật lên chạy song song, giai đoạn 1 chỉ `bql` trên máy dev, chỉ text, không pg-boss (runner `core:run` + cột `login_requested_at`); gắn Zalo thật vào cư dân mô phỏng bằng `dev:link-zalo`. Takeover: pacer chỉ huỷ tin bot khi nhân viên gửi tay (SPEC-P02 §9.7).
- Đ23 (2026-09-25) Cột `jobs.category_code` là nguồn chân lý của danh mục; `save_job_draft` ghi cột cùng câu lệnh với `draft` (SPEC-P03 §11.11). Lộ ra khi lượt chấm model thật đầu tiên cho chẩn đoán 0/40.
- Đ24 (2026-09-25, người dùng đưa key OpenRouter) Nhánh `MODEL_PROVIDER=openrouter` (fetch, `data_collection: deny`, fallback phía client) để chấm bằng CÙNG model Gemini khi quota Gemini trực tiếp hết; mặc định sản phẩm vẫn `gemini`.
- Đ25 (2026-09-25, người dùng đưa key Vyce: "chọn deepseek cũng được") Nhánh `MODEL_PROVIDER=vyce` (proxy dạng OpenAI `https://vyceai.com/v1`, `deepseek-v4-flash`) dùng chung phần dịch với `openrouter`; chỉ chạy khi `DATA_MODE=sim`; G08–G10 chỉ có giá trị cho cặp provider/model đã chấm.
- Đ26 (2026-09-25) DeepSeek v4 flash qua Vyce trượt 3/4 bộ golden (bỏ sót khẩn cấp, nhận nhầm đồng ý) ⇒ cổng G08–G10 chấm bằng Gemini 3.6 flash; nhánh `vyce` giữ trong mã nhưng không dùng cho agent cư dân.
- Đ28 (2026-09-26, người dùng) tạm dùng `vyce/deepseek-v4-flash` làm provider chạy dev khi Gemini cạn quota (R08 vòng 4 ⛔, G26); gate G08–G10 vẫn chỉ đóng bằng lượt chấm đạt ngưỡng (Đ26). Đ27 (SPEC-P05 §10 + SPEC-P04 §8) CHỜ DUYỆT.
### Superseded
- Đ13 (thứ tự Zalo sau cùng) và SPEC-P02 §2.1/§3.4 (pg-boss) — thay bởi Đ22.
- SPEC-P03 §1/§10.2/§10.3 (danh sách `EMERGENCY_TERMS` so chuỗi con, regex PII hẹp, `CONSENT` regex chứa) — thay bởi Đ20/Đ21.
- SPEC-P03 §10.8 fallback phía server Anthropic và golden một lượt làm thước đo G09/G10 — thay bởi Đ19.
- Đ06 phần LLM (Claude `claude-opus-5` mặc định) — thay bởi Đ18.
- `processInbound` gọi handler trong transaction khoá dòng (SPEC-P01 §6 bản đầu) — thay bởi Đ17 (a): gây trả lời trùng và kẹt pool khi đồng thời.
- Phí theo cuốc, slot tháng, sổ phí, cổng G0 chặn P05 — ra khỏi phạm vi build (Đ13).
- Pipeline 10 bước bản đầu (7 bước "dịch vụ tất định", tự cấp thẻ vào tòa, nhắn riêng top 3 thợ) — thay bởi Đ10.
- `docs/DESIGN.md` v0.1 (trợ lý BQL tổng quát) bị thu hẹp bởi Đ01.
### Added
- **Máy chấm + UI Zalo + OpenRouter (2026-09-25, R09/R10 ✅, R08 mã ✅ chờ lượt 3):** `scripts/eval/{score,red-fake-model}.mjs` (vòng agent thật, 4 bộ, exit 0/1/3); fix `save_job_draft` ghi cột danh mục; `handoff_to_staff` đọc `HUMAN_TAKEOVER_MIN` (mặc định 60); migration `005_zalo_ui.sql` + `POST /api/zalo/{account}/logout` + `qr_state`; `adapters/model.ts` nhánh `openrouter`. `npm test` 245, `test:db` 122.
- **P02 giai đoạn 1 (2026-09-25, R07 ✅):** `apps/zalo-worker` thật (zca-js 2.2.0), `packages/core/src/{runner,dev}`, `apps/web` `/zalo` + `/api/zalo/*`, migration `004_zalo_login.sql`. Chạy thử Zalo phụ đạt phần QR/nhận tin/trả lời.
- **P03 vòng 2 + adapter Gemini (2026-09-25, R03/R04/R06 ✅):** `adapters/model.ts` nhánh Gemini + `callTriageModel`; `agent/{emergency,triage}.ts`, `prompts/triage.ts`; migration `003_kb_building.sql`; `scripts/seed-sim-for-test.mjs`; golden `emergency.jsonl` 100 ca, `consent.jsonl` 44 ca; bộ hồi quy `p03-regression.db.test.ts` từ bộ phá thẩm định. `npm test` 173, `test:db` 76.
- **P03 agent cư dân (thi công xong, chờ thẩm định):** migration `002_search.sql` (`immutable_unaccent`, `kb_sections.tsv` sinh tự động), `retrieval/search-regulations.ts`, 8 tool `agent/tools/*`, `resident-agent.ts` (khẩn cấp tất định, vòng tool ≤6, che PII trước model), `db:seed:sim` (QC-DEMO + cư dân mô phỏng), golden `emergency`/`diagnosis`/`responsibility` + `scripts/eval_golden.mjs` (thiếu credential ⇒ exit 3).
- **P01 nền tảng (mã nguồn đầu tiên):** `apps/web`, `apps/zalo-worker` (khung), `packages/core`, `db/migrations/001_init.sql`, `scripts/{check_adapter_boundary,check_agent_tools,gate}.mjs`, `compose*.yaml`, `evals/scenarios/echo.jsonl`; `docs/core.md`, `docs/web.md`, `docs/zalo-worker.md`. Repo git + GitHub private.
- `docs/images/09-dashboard-bql-mockup.png`, `docs/images/10-kinh-te-ba-ben.png`.
- `docs/SYSTEM-MAP.md` + `docs/images/01…08` (kiến trúc, luồng, nhân rộng, vòng quay, hai agent, giá trị agent, poster ngách, pipeline chuẩn).

## [v0.0.1] - 2026-09-24: Initial Project Scaffolding
### Added
- Khởi tạo hệ thống Bộ Nhớ Não Bộ `brain4agent/` (engine 1.13.1, khung 1.7.1).
