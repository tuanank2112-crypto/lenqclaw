Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude / claude-sonnet-5-5 (🟠) · Bước 0: exit 1 (`CẦN NÂNG CẤP` — duy nhất BRN-011 "state.json không kết thúc bằng 0x0A", nằm trong `brain4agent/` thuộc vùng CẤM của H07 ⇒ KHÔNG chạy chế độ GHI) · hiểu việc: phạm vi = `packages/core/src/**` (trừ `adapters/alert.ts`), pin `@langchain/*`, `package-lock.json`, migration 010, `check_adapter_boundary.mjs`, `latency_slo.mjs`, `group-mention.jsonl`, `apps/web/tests/**`, docs core/web, hồ sơ R07 + `evidence/P03`; xong khi gate `GATE_OK`, test ≥218 + ca mới 0 fail 0 skip, `test:db` 2 lần xanh, `npm ls` khớp §12.1, migration 010 áp từ rỗng rồi `applied 0`, G23 3 ca đỏ exit 1 + lượt model thật exit 0/3, diff ⊆ phạm vi; cấm đụng `apps/zalo-worker`, `alert.ts`, migration 001–009, `brain4agent/`, `planning/` ngoài hồ sơ, version `0.0.1`, push
Handoff: handoffs/H07_thi-cong_P03.md
Base: 72732812c9e7b122b8d8e7076e1b8c3b147bb249
Head: d8e744f2041564a18fade4b95568dc581ea2aa2c

## 1. Lệnh + exit code (nguyên văn)
| Bước | Lệnh | Exit | Số đo | Evidence |
| :-- | :-- | :-- | :-- | :-- |
| 0 | `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | **1** | `CẦN NÂNG CẤP (1 lệch engine tự sửa · 0 việc cần người)`: BRN-011 `state.json` thiếu byte `0x0A` cuối — ngoài phạm vi, chưa sửa (câu hỏi 1) | (in ở đầu phiên) |
| gate | `npm run gate` | 0 | `GATE_OK`; `violations: 0`; `forbidden_tools 0 · forbidden_actions 0 · unlisted_tools 0`; `pivot_hits: 0` | [gate](../evidence/P03/gate.txt) |
| test | `npm test` | 0 | web 31 + worker 102 + core **366** = **499** pass / 0 fail / 0 skip | [test](../evidence/P03/test.txt) |
| test:db #1 | `npm run test:db` | 0 | core **84** + web **25** + worker 73 = **182** pass / 0 fail / 0 skip | [test-db](../evidence/P03/test-db.txt) |
| test:db #2 (liền sau) | `npm run test:db` | 0 | y hệt (84 + 25 + 73) | [test-db-run2](../evidence/P03/test-db-run2.txt) |
| deps | `npm ls @langchain/langgraph @langchain/core @langchain/langgraph-checkpoint @langchain/langgraph-sdk langsmith zod` | 0 | langgraph 1.4.18 · core 1.2.14 · checkpoint 1.1.5 · sdk 1.12.0 · langsmith 0.10.7 · zod 4.6.5 = bảng §12.1; `package.json` core không có `^`/`~` ở 2 gói `@langchain/*` | [npm-ls](../evidence/P03/npm-ls.txt) |
| migration | 010 áp từ rỗng trên DB tạm `lenqclaw_probe010` (đã xoá) | 0 | lần 1 `applied: 10` · lần 2 `applied: 0`; view + 2 bảng + 9/3 cột D31 đủ | [migration-010-probe](../evidence/P03/migration-010-probe.txt) |
| Node 22 | `npx -y node@22` (v22.23.3): tsc, boundary, agent-tools, vitest core (366) và `test:db` core (84) | 0 | cả 5 lệnh exit 0 | [node22](../evidence/P03/node22.txt) |
| G23 đỏ ×3 | `latency_slo.mjs` (xem mục 2b) | **1** ×3 | đúng kỳ vọng | [deadline](../evidence/P03/red-latency-deadline.txt) · [p95](../evidence/P03/red-latency-p95.txt) · [serial](../evidence/P03/red-latency-serial.txt) |
| G23 đối chứng | `--n 20 --fake-delay-ms 300` | 0 | `G23 RESULT: PASS` | [fake-pass](../evidence/P03/latency-slo-fake-pass.txt) |
| G23 model THẬT | `--n 20` (cấu hình `.env`: Vyce) | **3** | preflight 5/5 lỗi `ModelUnavailableError … Insufficient balance (402)` ⇒ `BLOCKED` (chấp nhận theo H07 §1) | [real](../evidence/P03/latency-slo-real.txt) |
| G23 model THẬT (ép Gemini) | `MODEL_PROVIDER=gemini … --n 20` | **3** | `BLOCKED: 68.3% lượt đo lỗi model thật` (free tier) | [real-gemini](../evidence/P03/latency-slo-real-gemini.txt) |

## 2. Test tổng/pass/fail/skip
Gate/`npm test`: **499/499/0/0** (nền 218 ⇒ +281). `test:db`: **182/182/0/0** (nền 130 ⇒ +52). Dòng gate cuối: [gate](../evidence/P03/gate.txt).

### 2a. SPEC-P03 §11 hàng 1–17 → lệnh → kết quả
| # | Lệnh / ca | Kết quả | Evidence |
| :-- | :-- | :-- | :-- |
| 1 | `gate.test.ts` | 38 test: 28 ca G01–G28 (tên = `gate-ref.txt`; đầu vào dựng lại từ bảng §3 vì file ref chỉ có tên ca) + 4 nhóm `namePatterns` (G14) + ca thứ tự/`lastIndex` ⇒ pass | [test](../evidence/P03/test.txt) |
| 2 | `policy.test.ts` | 82 test (≥30 ca tool×bề mặt×vai); `TOOL_NAMES` ∩ 22 tên cấm §7.2 = ∅ ⇒ pass | idem |
| 3 | `triage.test.ts` | 10 test; `parseCommunityTriage` JSON hỏng/thiếu khoá (cả 7)/enum/ngoài [0,1]/sai kiểu ⇒ `null` | idem |
| 4 | `persona.test.ts` | 10 test: 7 khối đúng thứ tự, `<`/`>` ⇒ `‹›`, >24k ⇒ `PersonaTooLargeError`, prompt nhóm không chứa `member_notes`/`member_profiles`; `grep -c member_profiles persona.ts` = 0 | idem |
| 5 | `p03-group-turn.db.test.ts` | 38 test: (a) (b) (c) (d) (e) (f) (g) (h) (i) (j) (k) (l) (m) (n) (o) (p) (q) (r) (s) + thêm công cụ/chính sách (xem mục 5 và câu hỏi 3 về số `agent_runs` ở (a)) ⇒ pass | [test-db](../evidence/P03/test-db.txt) |
| 6 | `apps/web/tests/sim-replay-group.db.test.ts` | `group-mention.jsonl` 6 dòng ⇒ `{inbound:6, duplicates:0, outbound:3}`, 6 lần gọi model community, trigger `mention`/`reply_to_bot`/`name_pattern`; chạy lại ⇒ 6 duplicates | idem |
| 7 | 20 tin thường nhóm `mention` | `select count(*) from agent_runs where route='community'` không đổi (+0) (test (b)) | idem |
| 8 | `edges.test.ts` | 109 test (≥60): `routeEvent` 7 ca, `afterIngest` 4, `afterDmIntake` 3, `afterModerate`/`afterSystemEvent`/`afterTriage` ≥2 mỗi hàm, `afterGate` 7, `needsTriage` 11, `afterPrepare`+`afterAgent`+`needsNudge`+`isCapped` ≥10, `decideDelivery` 24 ca phủ D1–D12 + biên, `hostText` 4 | [test](../evidence/P03/test.txt) |
| 9 | `graph-shape.test.ts` | 5 test; `getGraph()` hai đồ thị = `PIPELINE_SHAPE` (9 node/20 cạnh) và `TURN_SHAPE` (6/10); `drawMermaid()` không ném | idem; đỏ: [red-graph-shape](../evidence/P03/red-graph-shape.txt) |
| 10 | `npm ls …` | khớp §12.1, exit 0 | [npm-ls](../evidence/P03/npm-ls.txt) |
| 11 | `community-config.test.ts` | `LANGSMITH_TRACING=true`/`LANGCHAIN_TRACING_V2=1` ⇒ `ConfigError`; không đặt ⇒ ok; `MAX_TOOL_ROUNDS=0/21` ⇒ lỗi (+ ca D31) | [test](../evidence/P03/test.txt); đỏ: [red-config](../evidence/P03/red-config-langsmith.txt) |
| 12 | `node scripts/check_adapter_boundary.mjs` | `violations: 0`; đỏ: file tạm `MemorySaver` ⇒ `violations: 1` exit 1 | [gate](../evidence/P03/gate.txt) · [red-boundary-langgraph](../evidence/P03/red-boundary-langgraph.txt) (7 ca đỏ) |
| 13 | Node 22 | v22.23.3: hàng 1–12 chạy exit 0 | [node22](../evidence/P03/node22.txt) |
| 14 | `edges.test` + `model.*.test` | `model.deadline.test.ts` 13 test: fetch trễ 5000 + hạn +1500 ⇒ `ModelDeadlineError` ≤1700 ms, signal đã huỷ; còn 600 ms ⇒ 0 fetch; 503 + còn 900 ms ⇒ KHÔNG lùi 1 s (1 fetch); `maxOutputTokens 1024`; `tier:'fast'` ⇒ URL chứa `MODEL_COMMUNITY_FAST`; không thử `MODEL_FALLBACKS` sau hạn; triage `timeoutMs` huỷ bằng signal. D31 trong `edges.test`: `isInteractive` 8 ca, `initialDeadline` 4 ca, `escalateLane` 6 test (fast+search ⇒ rag, từng tool `extendsDeadline`, rag+search ⇒ null, background ⇒ null, tool thường ⇒ null, không tool), `isAddressedToBot` 13 ca (gồm G24/G25), `needsTriage` có 4+ ca `addressed` | [test](../evidence/P03/test.txt) · [red-model-deadline](../evidence/P03/red-model-deadline.txt) |
| 15 | (t) (u) | (t): outbox `MODEL_DOWN_GROUP_REPLY`, `created_at − received_at ≤ 3800 ms`, `deadline_hit=true lane=fast`, `agent_runs.outcome='deadline'`; (u): `lane='rag'`, typing tạo TRƯỚC `agent_runs` đầu, 0 triage cho tin đó, outbox text mang `inbound_event_id`. (a)–(s) vẫn xanh | [test-db](../evidence/P03/test-db.txt) |
| 16 | `runner.db.test.ts` (v) | 9 test: B xong trước A (A treo 3 s); A1/A2/A3 cùng thread đúng thứ tự không chồng; `RUNNER_CONCURRENCY=1` thì B phải chờ; `claimNextInbound(exclude)`; heartbeat; drain; `holdAdvisoryLock` lần 2 ⇒ `null`, mất kết nối ⇒ `onLost`; `flushAmbient` khi đã có `sys-%` chưa xử lý / thread bận ⇒ 0 sự kiện mới | idem · [red-runner-order](../evidence/P03/red-runner-order.txt) |
| 17 | migration 010 + G23 | xem mục 1; `p03-migration-010.db.test.ts` 4 test (cột, chỉ mục, CHECK, view `core_ms = e2e_ms − hold_ms` đúng 1700/9500/7800) | [probe](../evidence/P03/migration-010-probe.txt) · [red-migration-view](../evidence/P03/red-migration-view.txt) |

### 2b. G23 (TESTING §4)
| Ca | Lệnh | Exit | Số đo chính |
| :-- | :-- | :-- | :-- |
| đỏ 1 | `--n 3 --fake-delay-ms 6000` | 1 | `deadline_hit` 100 % cả hai làn; p95 fast 3529 ms (> 3500); phân làn rag 0 % |
| đỏ 2 | `LANE_FAST_DEADLINE_MS=4500 … --n 3 --fake-delay-ms 4200` | 1 | p95 fast **4532 ms > 3500**; `deadline_hit` 100 % |
| đỏ 3 | `RUNNER_CONCURRENCY=1 … --n 3 --fake-delay-ms 300 --block-ms 5000` | 1 | ca HOL **5182 ms > 3500** (thread khác treo 5 s) |
| đối chứng | `--n 20 --fake-delay-ms 300` | 0 | p95 fast 660 ms · rag 888 ms, `deadline_hit` 0, phân làn 100 %, HOL 561 ms |
| thật | `--n 20` / ép Gemini | 3 / 3 | `BLOCKED` (402 hết credit; 68,3 % lượt lỗi free tier) |
Các ca đỏ chạy `--n 3` (thời gian: mỗi lượt đỏ chờ đủ 3,5 s) — script nhận `--n` bất kỳ; ca đối chứng dùng `--n 20` đúng lệnh G23.

## 3. `git diff --stat <Base>..<Head>` + SHA từng commit
[diff-stat](../evidence/P03/diff-stat.txt) — 91 file, +7342/−279; mọi đường dẫn ⊆ ĐƯỢC GHI (kiểm bằng `git diff --name-only`; không file nào ở `apps/zalo-worker`, `adapters/alert.ts`, migration 001–009, `brain4agent/`, `planning/`). Root `package.json`: thêm `overrides` (BẮT BUỘC theo 01-CONTRACTS §12.1, SPEC-P03 §1) + script `latency:slo` (lý do: lệnh G23); version giữ `0.0.1`.
- `5c959ec37211bf5f2b5b50060688291a0d5e746d` feat(core): add pure runtime pieces for community agent graph (P03-A)
- `a87cd1cc868f22a7bda2ff922b6662fe0b33672f` feat(core): wire LangGraph pipeline + turn graphs, nodes, tools and sessions (P03-B)
- `092d069f977bed87ea53a0301f94e16fce231ab2` feat(core): add D31 latency runtime - lanes, deadlines, parallel runner, migration 010 (P03-C)
- `e7a04a3bbdb50fdbb31cbd7fe589a5dc3e818737` docs(core): document P03 runtime and seed the rules persona template
- `afae211ed5dbaecdc79fd594c3df3459cbc80e3a` fix(scripts): classify real-model failures as blocked in latency_slo (G23)
- `a5bb367b112b19e93f54fa05186b08dfa4e9de5a` fix(core): keep private final text only for turns that need no reply
- `d8e744f2041564a18fade4b95568dc581ea2aa2c` test(core): clean test group buffer rows so fixed out-<id> ids never collide ← **Head**
- (commit hồ sơ R07 + `evidence/P03/*` — riêng, sau Head)
Không push. Không `git add -A`.

## 4. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| P03-A (hàm thuần, state, shape, edges) | 🟠 | Claude / claude-sonnet-5-5 |
| P03-B (đồ thị, node, tool nền, buffer/session, timers) | 🟠 | Claude / claude-sonnet-5-5 |
| P03-C (model D31, runner, migration 010, `latency_slo.mjs`) | 🟠 | Claude / claude-sonnet-5-5 |
| docs core/web, scenario jsonl | 🟢 | Claude / claude-sonnet-5-5 (🟠 — không có model 🟢 trong phiên; lên một tầng, không xuống) |
| Bằng chứng đỏ (mutation) và tự rà trước nộp | 🟠 | cùng phiên — đây là rà nội bộ, KHÔNG phải thẩm định nghiệm thu (cần agent khác, khác họ) |
Prompt seed `rules` (SO review 🔴): [`packages/core/src/db/seed.ts`](../../../packages/core/src/db/seed.ts) (khối `PERSONA_SEED.rules`, theo SPEC-P03 §7.3) + khối hệ thống cố định [`prompts/system.ts`](../../../packages/core/src/agent/community/prompts/system.ts) + prompt triage [`prompts/triage.ts`](../../../packages/core/src/agent/community/prompts/triage.ts).

### Bảng bằng chứng đỏ (mỗi bộ đo MỚI từng ĐỎ trên mã cố tình hỏng, mã đã trả nguyên trạng)
| Bộ đo | Đột biến | Kết quả | Evidence |
| :-- | :-- | :-- | :-- |
| `graph-shape.test` | `nudge → agent` thành `nudge → deliver` | đỏ | [red-graph-shape](../evidence/P03/red-graph-shape.txt) |
| `edges.test` | bỏ `!t.nudged` ở `needsNudge`; D9 ambient đổi `auto_post` | đỏ ×2 | [nudge](../evidence/P03/red-edges-nudge.txt) · [delivery](../evidence/P03/red-edges-delivery.txt) |
| `gate.test` | moderator hết miễn allowUsers; cổng tin chuỗi `[userId: bot]` (G24) | đỏ ×2 | [allowlist](../evidence/P03/red-gate-allowlist.txt) · [selfmention](../evidence/P03/red-gate-selfmention.txt) |
| `policy.test` | stranger DM được mọi tool bề mặt D | đỏ | [red-policy-stranger](../evidence/P03/red-policy-stranger.txt) |
| `community-config.test` | bỏ chặn `LANGSMITH_TRACING` | đỏ | [red-config-langsmith](../evidence/P03/red-config-langsmith.txt) |
| `seed.test` | prompt `rules` thiếu mục "An toàn" | đỏ | [red-seed-rules](../evidence/P03/red-seed-rules.txt) |
| `model.deadline.test` | còn < `MODEL_MIN_ATTEMPT_MS` vẫn gọi mạng | đỏ | [red-model-deadline](../evidence/P03/red-model-deadline.txt) |
| `runner.db.test` | dispatcher không loại thread đang chạy | đỏ | [red-runner-order](../evidence/P03/red-runner-order.txt) |
| `p03` (d) | host không đăng text của mention (BB-05) | đỏ | [red-db-autopost](../evidence/P03/red-db-autopost.txt) |
| `p03` (m) | `DM_HISTORY_TURNS` bị bỏ qua, nạp 30 tin (G21) | đỏ | [red-db-history](../evidence/P03/red-db-history.txt) |
| `p03` (u) | không còn gửi typing sớm | đỏ | [red-db-typing](../evidence/P03/red-db-typing.txt) |
| `p03` TOOL_MIN_MS | tool vẫn chạy khi hết giờ | đỏ | [red-db-tool-deadline](../evidence/P03/red-db-tool-deadline.txt) |
| `p03` BB-07 | ghi chú thành viên lọt vào lượt nhóm | đỏ | [red-db-bb07](../evidence/P03/red-db-bb07.txt) |
| `check_adapter_boundary` | MemorySaver, import checkpoint, node outbox✗ nạp transport, `callModel` ngoài `agent.ts`, `triage` ngoài `triage.ts`, `api.telegram.org`, `@langchain/core/*` | đỏ ×7 (`violations 1/2/1/1/1/1/1`) | [red-boundary-langgraph](../evidence/P03/red-boundary-langgraph.txt) |
| `p03-migration-010` | view `core_ms` không trừ `hold_ms` (DB tạm) | đỏ | [red-migration-view](../evidence/P03/red-migration-view.txt) |
| G23 | 3 ca theo TESTING | exit 1 ×3 | mục 2b |

## 5. Việc KHÔNG làm + lý do
- **Tool lead/kiểm duyệt/lịch/tri nhớ** (`save_lead`, `submit_lead`, `flag_message`, `delete_message`, `warn_member`, `request_member_removal`, `invite_to_private`, `create_poll/reminder/note`, `decide_approval`, `announce`, `schedule/list/cancel_automation`, `search_memory`, `write_daily_note`, `daily_report`, `review_join_request`): có trong `policy.ts`, CHƯA cài — SPEC-P03 §1 chỉ giao 11 tool nền; P05/P06/P07.
- **Node khung** `moderate` (trả `{}`), `group_event` (audit `group.event_stub`), nhánh `welcome_flush`/`join_request`/`automation` của `system_event` (audit `system.unhandled`) — đúng chữ ký/cạnh, logic là P05/P07.
- **`apps/zalo-worker`** (pacer ưu tiên, `picked_at`/`hold_reason`, typing tươi, heartbeat worker, khoá worker), `adapters/alert.ts`, `ops-watch`, `/api/healthz`, dọn dữ liệu 180/365 ngày: gói P03b (cấm đụng). `holdAdvisoryLock('lenqclaw:worker:community')` đã có sẵn trong core.
- **Truy hồi lai/embedding** (`embedTexts`, RRF): P04 — `search_knowledge` hiện lexical + tiêu đề tài liệu.
- **`.env.example`**: không nằm trong ĐƯỢC GHI ⇒ chưa liệt kê biến D31 (danh sách ở `docs/core.md`).
- **Chưa đo model thật**: không có billing; G23 phần thật exit 3 (chất lượng prompt `rules` và độ trễ thật chưa kiểm).
- **Chưa cập nhật `persona_docs` rules v1 trong DB dev** (seed chỉ ghi khi chưa có) — chất lượng agent trên dev dùng bản cũ cho đến khi dashboard/seed ghi v2.
- Không chạy chế độ GHI của Bước 0 (xem câu hỏi 1); không push; không sửa version.

## 6. Câu hỏi mở (cần người)
1. **Bước 0 (BRN-011):** `brain4agent/memory/hot/state.json` thiếu `\n` cuối — engine tự sửa được nhưng vùng `brain4agent/` bị CẤM trong H07. SO/người chạy `init_brain.js` (không cờ `--check`, kèm `--preserve-symlinks-main`) sau khi duyệt?
2. **SPEC lệch thư viện (cần sửa 01-CONTRACTS §12.2 + SPEC-P03):** LangGraph `StateGraph.addNode` ném lỗi khi tên node trùng tên kênh state ⇒ `PipelineState.triage` và `.gate` không dùng được cùng node `triage`/`gate`. Đã đổi TÊN TRƯỜNG state thành `triageResult`/`gateDecision` (tên NODE và hình đồ thị — bản người dùng duyệt — giữ nguyên). Xin SO chốt/sửa SPEC.
3. **SPEC-P03 §11 5(a) ghi "1 `agent_runs`"** cho mention gọi `send_group_message`: không thể — cạnh cố định `tools → agent` bắt model được gọi thêm một lần sau mỗi lần `tools` (spike A: search+send = 3 lần). Test khẳng định 2 (tool + chốt). Sửa SPEC hay đổi hình?
4. **SPEC-D31 §6 "`processInbound` = `claimNextInbound([]) + handleClaimed`" mâu thuẫn test P01** "12 `processInbound` đồng thời" (cùng một thread; câu nhận có điều kiện "không còn tin cũ hơn chưa xử lý" nên 11/12 lời gọi nhận `null`). Đã giữ test nguyên và để `processInbound` dùng câu nhận KHÔNG ép thứ tự thread (`claimInbound(…, ordered=false)`); `claimNextInbound` (dispatcher) ép đúng SQL SPEC. Chấp nhận lệch này, hay đổi test P01 sang 12 thread?
5. **uid của bot ở Zalo thật:** SPEC không nói core biết `botUid` từ đâu (worker có `ownUid` nhưng không ghi DB). Tạm: env `BOT_ZALO_UID` hoặc `BOT_UID_SIM` (`agent/community/bot.ts`). Chốt nguồn (cột `zalo_accounts`? payload?) ở P03b/P09.
6. **Bảng 01-CONTRACTS §12.3 ghi `gate` "Ghi DB ✗ (chỉ đọc)"**, còn SPEC-P03 §2 cuối bảng ghi "audit khi có quyết định (admitted/denied với reason)": tôi theo bảng ⇒ `sender_denied`/`sender_not_allowed` KHÔNG audit ở node `gate` (lý do nằm ở `PipelineState.gateDecision.reason`); `group.denied` chỉ audit ở `ingest` (nhóm chưa khai/tắt). Cần audit thêm ở chỗ nào?
7. **`npm` bỏ qua `overrides`** khi cài trong workspace này (lock cũ có sẵn): `npm install` luôn kéo checkpoint 1.2.0/sdk 1.12.5/langsmith 0.11.0 dù root `package.json` có `overrides`. Đã sinh lock bằng cây cài sạch (có override đúng) rồi chỉ GỘP các mục MỚI vào `package-lock.json` (diff chỉ thêm, +286 dòng, không đổi bản nào đang có). Lần sau đổi dependency nên cài trong thư mục sạch hoặc kiểm `npm ls` ngay.
8. **Test cũ ĐÃ ĐỔI kỳ vọng (giải thích từng ca):** (i) 4 test model `maxOutputTokens/max_tokens` 16000 ⇒ 1024 — D31 T10 (route `community`); (ii) `p02-runner.db.test` — runner nay chạy pipeline thật ⇒ DM nhận câu trả lời của agent (model giả) thay `STUB_DM_REPLY`, nhóm chưa khai bị từ chối thay vì audit `group.ingest_stub`; (iii) `sim-send.db.test` ca `/thread` — tin đã được pipeline lưu vào đệm nên đánh dấu xoá bằng `update` thay `insert` (trùng khoá); (iv) `sim-tick.db.test` — `steps` nay `{flushAmbient, pruneBuffers}` thay `{}`; (v) `p01.db.test` — danh sách bảng + `001..010`; (vi) `errors.test` thêm 3 lớp lỗi; (vii) `simDeliver` không đếm `typing`/`seen` vào `delivered` (để `outbound=3` ở hàng 6 vẫn là số TIN). Không test nào bị nới (ngưỡng/độ chặt).
9. **Prompt `rules` thật (SO review 🔴):** đường file ở mục 4. Nên cho SO chạy golden `activation` (OPERATIONS §5) trước khi kích hoạt trên dashboard.

## 7. Tiếp theo
🖐 Cần tay người: trả lời câu hỏi 1–6 (đặc biệt 2, 3, 4 — sửa SPEC) · nạp credit/chốt model để chạy G23 thật (`npm run latency:slo -- --n 20`) · duyệt `.env.example` bổ sung biến D31 · 🤖 Agent làm được ngay: thẩm định đối kháng P03 bởi agent khác họ (≥3 cách phá), P03b (worker pacer/heartbeat/alert) theo H06/SPEC-D31 §7–§11 · ⭐ Nên làm trước: SO thẩm định P03 (cổng 🔴: luật mới + bảo mật) — vì mọi gói P04–P08 cắm vào đồ thị này · ⏸ Chưa làm: tool P05–P07, node khung, worker/alert/healthz, embedding, `.env.example`, cập nhật persona DB dev, đo model thật.

⏳ Chờ phán quyết.
