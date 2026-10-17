# SPEC-D31 — Tốc độ trả lời (D31) · Giám sát, heartbeat, báo động Telegram (D32) · không cổng eval persona (D33)

> Tầng 🔴 hợp đồng (architect H06, 2026-10-16, HEAD `bfbfc5e`). Đọc sau [00-ARCH](00-ARCHITECTURE.md) §6 (BB-18…BB-20) và [01-CONTRACTS](01-CONTRACTS.md) §2.1, §2.2, §2.4, §2.5, §4 (010), §9, §10, §12.2–§12.4, §12.8. Hành vi trong đồ thị: [SPEC-P03](SPEC-P03-Runtime-Agent.md) §4.2, §5, §6. Gate: [TESTING](TESTING-ACCEPTANCE.md) G23, G24. Vận hành: [OPERATIONS](OPERATIONS.md) §1, §4, §5, §9.
> Số đo: [`evidence/ARCH-D31/latency-probe.txt`](../evidence/ARCH-D31/latency-probe.txt) (110/120 lời gọi model thật) · [`budget-sim.txt`](../evidence/ARCH-D31/budget-sim.txt) (Monte Carlo từ số đo, 0 model).
> **Hình đồ thị (00-ARCH §4, `PIPELINE_SHAPE`/`TURN_SHAPE`) KHÔNG đổi** — không thêm/bớt node hay cạnh. Đổi: hành vi trong node (`triage` bỏ qua tin gọi bot, `prepare` gửi `typing`, `agent`/`tools` theo hạn chót), runner ngoài đồ thị, pacer worker, bảng 010.

## §1. Mục tiêu đo được (D31)

| Làn | Lượt thuộc làn | SLO (p95, 24 giờ, n ≥ 20) | Hạn chót runtime (`deadlineAt`) |
| :-- | :-- | :-- | :-- |
| `fast` | lượt TƯƠNG TÁC (`group_mention`, `dm`, `owner_dm`) chưa gọi tool truy hồi | `core_ms` ≤ **5000** | `received_at + LANE_FAST_DEADLINE_MS` (3500) |
| `rag` | lượt tương tác ĐÃ gọi tool truy hồi (`search_knowledge`, `search_memory`, `recall_group_history`, `read_skill`) | `core_ms` ≤ **15000** | `received_at + LANE_RAG_DEADLINE_MS` (12500) |
| `background` | `group_ambient_flush`, `group_unanswered`, `group_welcome`, `group_join_review`, `automation` | không SLO (không ai đang chờ) | `turn_start + TURN_BACKGROUND_DEADLINE_MS` (30000) |

- `e2e_ms` = `outbox.sent_at` (đoạn 0 của tin trả lời đầu tiên) − `inbound_events.received_at`. `hold_ms` = thời gian pacer GIỮ hàng vì luật chống khoá D09 (`outbox.hold_reason` ∈ `group_gap|thread_gap|per_minute|group_budget|backoff|recipients` ⇒ `picked_at − created_at`; khác ⇒ 0). **`core_ms = e2e_ms − hold_ms`** là số SLO; `e2e_ms` thô vẫn hiển thị. Lý do tách: D09 (gap nhóm 8000 + jitter ≤ 3000) là luật an toàn tài khoản người dùng đã chốt — bot vừa nói trong nhóm < 11 s thì tin sau PHẢI chờ; nới là quyết định 🖐 (§7.3), không phải lỗi tốc độ.
- Thêm điều kiện đạt: `deadline_hit` ≤ **5 %** mỗi làn (chạm hạn ⇒ câu dự phòng — SLO giờ nhanh nhưng không trả lời ⇒ phải đếm riêng).
- "Ngoài công việc" / "công việc, dataset, RAG" của người dùng = làn do MODEL quyết qua việc có gọi tool truy hồi hay không (§4 T1) — không có bộ phân loại riêng.

## §2. Số đo thật (2026-10-16, máy dev VN, Node 24.12, tuần tự; p50/p95 nearest-rank)

| Phép đo | n | p50 ms | p95 ms | Ghi chú |
| :-- | :-- | :-- | :-- | :-- |
| `gemini-3.5-flash-lite` câu ngắn, không tool | 8 | 1047 | 1562 | think 0 token |
| `gemini-3.6-flash` câu ngắn, thinking mặc định | 3 | 3021 | 4537 | think tb 368 token |
| `gemini-3.6-flash` câu ngắn, `thinkingLevel=minimal` | 4 | 1652 | 1862 | 2 pha gộp (1355, 1652, 1691, 1862) |
| `gemini-3.6-flash` minimal, prompt thật (system 3292 ký tự + 25 tin + 11 tool), 1 lời gọi trả lời bằng `send_group_message` | 3 | 3078 | 4419 | 1 lần 503 "high demand" |
| Lượt RAG `gemini-3.6-flash` minimal: call1 (`search_knowledge`) / call2 (`send_group_message`) / tổng | 4 | 1548 / 2201 / 4007 | 2600 / 3302 / 5896 | tool_result 3491 ký tự |
| Lượt RAG `gemini-3.6-flash` thinking mặc định: call1 | 1 | 4543 | — | rồi 429 quota NGÀY |
| Lượt RAG `gemini-3.5-flash-lite`: call1 / call2 / tổng | 4 / 3 / 4 | 1166 / 1516 / 2479 | 1250 / 1520 / 2770 | call2 ra tb 142 token |
| Triage `gemini-3.5-flash-lite` (như adapter, JSON) | 5 | 1577 | 2953 | phase 1: 8/8 lỗi 429 |
| Embedding `gemini-embedding-001`, 1024 chiều, `RETRIEVAL_QUERY` | 10 | 405 | 447 | **trả đúng 1024 chiều ⇒ Q3 đóng** |
| DB tạm 3000 mục (tb 928 ký tự): lexical `ts_rank_cd` top 20 / vector `<=>` top 20 seqscan / lexical+vector+RRF 1 câu / `select 1` | 30 mỗi loại | 53 / 12 / 66 / 1 | 71 / 18 / 95 / 2 | DB tạm đã xoá (`pg_database` còn 0) |
| `vyce/deepseek-v4-flash` (model chính trong `.env`) | 0 | — | — | 14/14 lời gọi `HTTP 401 Invalid API key` ⇒ KHÔNG đo được |

Giới hạn số đo (ghi rõ để không tin quá mức): n nhỏ (3–10) vì key Gemini là **free tier** — chạm quota phút rồi quota NGÀY (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) của `gemini-3.6-flash`; chưa đo `zca-js sendText` (ước p50 300 / p95 600 ms) và độ trễ listener worker (ước 100 ms) — đo thật ở P09 qua `reply_latency` (§8).

## §3. Ngân sách thời gian từng bước (p95 dự kiến, ms) — thiết kế D31

Cột "đo bằng": tên cột/trường của §8 (migration 010 — §12). Tổng cột = cộng p95 từng bước (bảo thủ: p95 của tổng nhỏ hơn); dòng "p95 mô phỏng" là p95 của TỔNG từ `budget-sim.txt` (kịch bản B0/B1, nhóm 1 tin/10 s; B2/B3 nhóm ồn ào).

| # | Bước | Làn `fast` | Làn `rag` | Trần cứng | Đo bằng |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | worker nhận (listener zca-js ⇒ `insert inbound_events`) | 100 (ước) | 100 (ước) | — | `inbound_events.received_at − payload.ts` (đọc trực tiếp khi điều tra; lệch đồng hồ Zalo ⇒ chỉ xem xu hướng) |
| 2 | runner nhặt (poll) | 200 | 200 | `RUNNER_POLL_MS` 200 | `turn_traces.queued_ms` = `processed_at − received_at` |
| 2b | chờ tin trước CÙNG thread (đang triage — tin không gọi bot) | 0 – 2950 (chỉ khi trùng; xác suất ≈ tốc độ tin × 1,6 s) | như fast | `TRIAGE_TIMEOUT_MS` 4000 | gộp trong `queued_ms` |
| 2c | chờ lượt NỀN cùng nhóm đang chạy (ambient/unanswered/welcome — model 3.6-flash) | 0 – ~8000 (chỉ nhóm `ambient`; ≤ 12 lượt/giờ × ~8 s ⇒ trùng ≈ 3 %) | như fast | `TURN_BACKGROUND_DEADLINE_MS` 30000 | gộp trong `queued_ms`; P09 đo riêng theo nhóm `ambient` |
| 3 | `ingest` | 10 | 10 | — | `turn_traces.pre_turn_ms` (claim ⇒ `prepare` bắt đầu) |
| 4 | `triage` | **0** — tin gọi bot KHÔNG triage (T3) | 0 | — | `turn_traces.triage_ms` = null |
| 5 | `moderate` (lưới) + `gate` | 20 | 20 | — | `pre_turn_ms` |
| 6 | `prepare` (+ enqueue `typing` sớm) | 20 | 20 | — | phần dư `runtime_ms − queued − pre_turn − model − tool` |
| 7 | `agent` call 1 (flash-lite) | 1600 (đo 1520 call trả lời ~142 token) | 1250 (đo, call quyết gọi `search_knowledge`) | hạn chót làn | `turn_traces.model_ms` (tổng thời gian tường các lời gọi), `agent_runs.latency_ms` |
| 8 | `tools` `search_knowledge` (embed + RRF) | — | 550 (đo 447 + 95) | `EMBED_TIMEOUT_MS` 1500 ⇒ lexical | `turn_traces.tool_ms` |
| 9 | `agent` call 2 (trả lời có trích dẫn) | — | 1600 (đo 1520) | hạn chót làn | `model_ms` |
| 9b | (20 % lượt) vòng truy hồi thứ 2 | — | +1800 | `MAX_TOOL_ROUNDS` | `model_ms`, `tool_ms` |
| 10 | `deliver`/tool ⇒ `enqueue` | 5 | 5 | — | `outbox.created_at` |
| 11 | pacer nhặt (tick) | 250 | 250 | `PACER_TICK_MS` 250 | `outbox.picked_at − created_at` (khi `hold_reason` null) |
| 12 | typing trước text | 0 (typing sớm ở bước 6 còn "tươi" ⇒ bỏ trễ lặp, T7) | 0 | `PACER_TYPING_FRESH_MS` 8000 | `outbox.picked_at` ⇒ `sent_at` |
| 13 | `sendText` zca-js | 600 (ước) | 600 (ước) | — | `reply_latency.send_ms` = `sent_at − picked_at` |
| — | **Cộng p95 từng bước** (không tính 2b, 2c — trùng < 5 % lượt nên không vào p95 trừ nhóm rất ồn) | **2805** | **6405** (1 vòng 4605) | | |
| — | **SLO** | 5000 ⇒ biên **2195 (44 %)** | 15000 ⇒ biên **8595 (57 %)** | | |
| — | p95 mô phỏng `e2e` (B0 / B1) · nhóm ồn ào (B2 / B3) | 3471 · 3847 | 6179 · 6410 | | `budget-sim.txt` |
| — | `deadline_hit` mô phỏng | 1,9 % · 4,8 % (ồn ào) | 0,9 % · 2,2 % | ≤ 5 % | `turn_traces.deadline_hit` |

So sánh (cùng mô phỏng): **hiện trạng** (3.6-flash minimal, triage trên đường, poll 1000, tick 1000, typing 1,3 s) ⇒ `e2e` p95 làn nhanh **9783**, làn RAG **12116**; bỏ một trong hai thay đổi chính (C0: giữ 3.6-flash · C1: giữ triage) ⇒ 45–49 % lượt chạm hạn chót (trả câu dự phòng). Hai thay đổi đó là ĐIỀU KIỆN CẦN của D31.

## §4. Quyết định thiết kế (chọn · bỏ · vì sao)

| # | Chọn | Bỏ (đã cân nhắc) | Vì sao |
| :-- | :-- | :-- | :-- |
| T1 | **Làn do model quyết bằng hành vi**: mọi lượt tương tác bắt đầu ở `fast`; node `tools` chạy tool có cờ `extendsDeadline` (§5.2) ⇒ nâng `lane='rag'`, `deadlineAt = received_at + LANE_RAG_DEADLINE_MS` | (a) Gộp quyết làn vào triage (thêm trường `lane`) · (b) bộ phân loại riêng trước lượt | (a) triage phải RỜI đường tin gọi bot (T3) nên không thể quyết làn; (b) thêm 1 lời gọi ~1,0–1,5 s vào ngân sách 5 s. BB-12 giữ: ý định = model agent; code chỉ đọc tool đã gọi. Một nguồn chân lý (không có hai bên "triage nói nhanh, agent lại tra") |
| T2 | **Model theo loại lượt, cố định trong lượt**: tương tác ⇒ `MODEL_COMMUNITY_FAST` (mặc định `gemini-3.5-flash-lite`); nền ⇒ `MODEL_COMMUNITY` (giữ `gemini-3.6-flash`) | (a) 3.6-flash cho mọi lượt · (b) đổi model GIỮA lượt (lite call1 ⇒ 3.6 call2 khi lên `rag`) | (a) 3.6-flash minimal 1 lời gọi p95 4419 ⇒ C0: 45 % lượt chạm hạn; (b) chưa đo được thoughtSignature chéo model (Gemini 3 đòi chữ ký cho functionCall) vì hết quota ngày ⇒ Idea Vault. Golden D10 (`activation` = lượt nền) vẫn chạy 3.6-flash ⇒ không đụng D10. 🖐 Q-D31-1 |
| T3 | **Tin gọi bot KHÔNG triage**: `needsTriage` thêm điều kiện `¬addressed` (DM, hoặc tin nhóm mention bot / quote tin bot / khớp tên bot / lệnh owner-moderator) | (a) giữ triage, hạ `TRIAGE_TIMEOUT_MS` · (b) triage song song với lượt · (c) triage chạy hậu kỳ qua sự kiện hệ thống | triage p95 2953 ⇒ C1: 49 % chạm hạn. (a) trần 1500 ⇒ mất kết quả model ~30 % tin, vẫn ăn 1,5 s; (b), (c) đổi hình đồ thị (nhánh song song / loại sự kiện mới) ⇒ cần người duyệt lại hình. Bù: lưới tất định vẫn chạy ở `moderate`; agent có `flag_message` (SPEC-P05 §3 ghi chú D31). Tin KHÔNG gọi bot vẫn triage như cũ (kiểm duyệt, `is_question`, `lead_intent`). 🖐 Q-D31-4 |
| T4 | **Hạn chót lượt + timeout từng lời gọi tính từ hạn chót**: `ModelCall.deadlineAt`; adapter huỷ fetch bằng `AbortSignal` khi hết; retry/fallback chỉ khi còn ≥ `MODEL_MIN_ATTEMPT_MS`; quá hạn ⇒ `ModelDeadlineError extends ModelUnavailableError` ⇒ `stop='model_down'` ⇒ `deliver` = `model_down` (câu dự phòng, BB-05 giữ) | thêm `StopKind`/`Delivery`/`outcome` mới cho "hết giờ" | Không thêm cạnh/dòng bảng `decideDelivery` (§12.5 giữ 12 dòng), không đổi CHECK `turn_traces.outcome`; phân biệt bằng cột `turn_traces.deadline_hit` + `agent_runs.outcome='deadline'`. Call 1 dùng hạn `fast` kể cả khi model định tra cứu — lời hứa 5 s là lời hứa chặt hơn |
| T5 | **Runner song song theo thread, giữ thứ tự trong thread**: MỘT dispatcher nhận tin (`claimNextInbound(exclude)`), tối đa `RUNNER_CONCURRENCY` (4) lượt chạy cùng lúc, không nhận tin của thread đang chạy; `runTimers` chạy vòng riêng | (a) giữ tuần tự · (b) pg-boss/queue ngoài · (c) song song theo (thread, người gửi) | (a) mô phỏng: 1 lượt treo 60 s ⇒ tin nhóm khác chờ tới 46,8 s; song song ⇒ 0 ms. Rủi ro còn lại (đã tính ở §3 dòng 2b/2c): tin gọi bot vẫn chờ tin/lượt TRƯỚC trong cùng nhóm; (b) vùng cấm cũ (Đ22) và không cần; (c) hai lượt cùng nhóm chạy song song ⇒ trả lời trùng (ambient + mention) — thứ tự trong nhóm quan trọng hơn |
| T6 | **Chặn chạy 2 bản bằng advisory lock Postgres** (runner `lenqclaw:runner`, worker `lenqclaw:worker:community`) trên một kết nối riêng giữ suốt đời tiến trình; mất kết nối khoá ⇒ thoát 1 | luật vận hành "CẤM chạy 2 bản" (OPERATIONS §4 cũ) | song song trong một bản chỉ an toàn khi chắc chắn chỉ có MỘT dispatcher; 2 worker = 2 phiên zca-js = rủi ro khoá tài khoản |
| T7 | **Typing sớm**: node `prepare` của lượt tương tác enqueue `{kind:'typing'}` NGAY đầu node; pacer bỏ bước typing + trễ trước text nếu thread đã có typing trong `PACER_TYPING_FRESH_MS` (8000) | giữ typing 1–3 s ngay trước text | người dùng thấy "đang gõ" sau ~0,5 s (prepare + 1 tick pacer) thay vì sau 3–5 s; tiết kiệm 1,0–3,0 s/tin; tổng số sự kiện typing gửi Zalo không tăng (1 typing/tin như cũ) |
| T8 | **Ưu tiên tin trả lời trong pacer** (chỉ thứ tự): `pickNext` xét trước các thread có hàng đầu là tin trả lời (`outbox.inbound_event_id` not null) | nới gap/ngân sách cho tin trả lời | đổi thứ tự KHÔNG đổi bất kỳ giới hạn nào của D09 (gap, per-minute, ngân sách giờ, backoff) ⇒ không thêm rủi ro khoá; nới gap ⇒ 🖐 Q-D31-2 |
| T9 | **Poll/tick ngắn**: `RUNNER_POLL_MS` 1000 ⇒ 200, `PACER_TICK_MS` 1000 ⇒ 250 | LISTEN/NOTIFY Postgres | poll rỗng là 1 câu `skip locked` ~1 ms; NOTIFY cần trigger migration + kết nối lắng nghe riêng + xử lý mất kết nối — phức tạp hơn để lời ≤ 200 ms. Tick ngắn không đổi tốc độ gửi (giới hạn tính theo thời gian, không theo tick) |
| T10 | **Đầu ra ngắn**: `MODEL_MAX_OUTPUT_TOKENS` 16000 ⇒ 1024 cho route `community` (tin Zalo ≤ 1800 ký tự ≈ 500–600 token) | giữ 16000 | trần thấp chặn đuôi dài (model "lan man" 2–4k token ⇒ +10–20 s); thinking không bật cho flash-lite (đo: 0 token) |
| T11 | **Embedding trong lượt**: `EMBED_TIMEOUT_MS` 3000 ⇒ 1500 và ≤ hạn chót còn lại ⇒ quá ⇒ lexical thuần (SPEC-P04 §2) | — | đo p95 447 ms; 1500 = 3× p95 |
| T12 | KHÔNG streaming, KHÔNG tin "đợi mình tra chút" trước câu trả lời | gửi tin tạm ở làn RAG | Zalo không sửa tin; tin tạm = 2 tin/lượt ⇒ ăn ngân sách BB-08 + gap 8–11 s cho tin thật (chậm hơn!). "Đang gõ" (T7) là tín hiệu chờ |

## §5. Làn & hạn chót — hợp đồng

### §5.1 Dữ liệu (01-CONTRACTS §12.2 bổ sung)
- `TurnRequest` thêm: `inboundEventId: number` (id `inbound_events` đang xử lý; lượt nền = id sự kiện `sys-%`), `receivedAt: number` (epoch ms của `inbound_events.received_at`), `claimedAt: number` (epoch ms lúc dispatcher nhận), `triageMs: number | null`.
- `TurnState` thêm: `lane: 'fast' | 'rag' | 'background'`, `deadlineAt: number` (epoch ms), `modelMs: number` (cộng dồn), `toolMs: number` (cộng dồn), `deadlineHit: boolean` — reducer `last`; `AgentTool` thêm cờ `extendsDeadline?: true` (cùng kiểu cờ `answers`) cho `search_knowledge`, `search_memory`, `recall_group_history`, `read_skill`.
- Hàm THUẦN mới ở `graph/edges.ts` (BB-16 — test bảng): `isInteractive(kind): boolean` (= `kind ∈ {group_mention, dm, owner_dm}`) · `initialDeadline(req, startedAt, cfg): { lane, deadlineAt }` · `escalateLane(t: TurnStateT, toolNames: readonly string[], cfg): { lane, deadlineAt } | null` (lane `fast` ∧ có tool `extendsDeadline` ⇒ `rag`, `deadlineAt = request.receivedAt + LANE_RAG_DEADLINE_MS`; khác ⇒ null) · `isAddressedToBot(i: { threadType; mentions; quoteOwnerUid; botUid; text; botNamePatterns; hasControlCommand; role }): boolean` (dùng chung với `decideGroupInbound` dòng 7–10 — một nguồn chân lý).

### §5.2 Hành vi theo node (KHÔNG đổi cạnh)
| Node | D31 thêm |
| :-- | :-- |
| `triage` | gọi `isAddressedToBot` (namePatterns từ `loadPersonaBundle` cache 60 s; lỗi persona ⇒ `[]`); `needsTriage(...) ∧ ¬addressed` mới gọi model; ghi `triageMs` vào state pipeline (`null` khi không gọi). `callTriageModel` nhận `timeoutMs` và HUỶ fetch bằng `AbortSignal` (thay `Promise.race` để fetch chạy tiếp) |
| `turn` (pipeline) | dựng `TurnRequest` có `inboundEventId`, `receivedAt`, `claimedAt`, `triageMs` từ `event`/state |
| `prepare` | ĐẦU node, nếu `isInteractive(kind)`: `enqueue({kind:'typing', body:{typing:true}, threadId, threadType})` (BB-15: `prepare` = outbox "✓ chỉ `typing`"); đặt `lane`, `deadlineAt` theo `initialDeadline`; model của lượt = `MODEL_COMMUNITY_FAST` nếu tương tác, `MODEL_COMMUNITY` nếu nền (truyền qua `ModelCall.tier`) |
| `agent` | `callModel({..., tier, deadlineAt})`; cộng `modelMs`; `ModelDeadlineError` ⇒ `stop='model_down'`, `deadlineHit=true` |
| `tools` | trước mỗi tool: còn < `TOOL_MIN_MS` (300) tới `deadlineAt` ⇒ KHÔNG chạy, `tool_result is_error {code:'DeadlineExceeded'}`; tool `extendsDeadline` chạy ⇒ áp `escalateLane`; cộng `toolMs`; `search_knowledge` truyền `deadlineAt` xuống `embedTexts` |
| `deliver` | không đổi bảng §12.5; tin host/tin tool mang `inboundEventId` (outbox §12) |
| `trace` | ghi thêm cột §8 |

### §5.3 Adapter model (01-CONTRACTS §2.1)
- `ModelCall` thêm `tier?: 'fast' | 'default'` (thiếu ⇒ `default`) và `deadlineAt?: number`. Model: route `community` + `tier='fast'` ⇒ env `MODEL_COMMUNITY_FAST` (mặc định theo provider: gemini `gemini-3.5-flash-lite`, openrouter `google/gemini-3.5-flash-lite`, vyce/anthropic ⇒ = model `community`); khác ⇒ như cũ.
- Mỗi lần thử: `timeoutMs = min(MODEL_CALL_TIMEOUT_MS, deadlineAt − now)`; `deadlineAt − now < MODEL_MIN_ATTEMPT_MS` ⇒ ném `ModelDeadlineError` không gọi mạng. Lùi retry (1 s, 3 s) chỉ khi sau lùi còn ≥ `MODEL_MIN_ATTEMPT_MS`; fallback `MODEL_FALLBACKS` cùng luật. Huỷ fetch bằng `AbortSignal.timeout`; huỷ ⇒ lỗi retryable nếu còn giờ, không thì `ModelDeadlineError`.
- `max_tokens` / `maxOutputTokens` = `MODEL_MAX_OUTPUT_TOKENS` (1024) cho route `community`; triage giữ trần hiện có.
- `agent_runs.outcome` thêm giá trị `'deadline'` (cột text không CHECK — không cần DDL).

## §6. Runner song song theo thread (`runner/inbound-runner.ts`, ngoài đồ thị)

```ts
export async function claimNextInbound(exclude: readonly string[]): Promise<InboundEvent | null>;   // sim-transport.ts — tách từ processInbound
export async function handleClaimed(e: InboundEvent, handler: InboundHandler): Promise<void>;        // phần sau claim của processInbound (audit lỗi, BUSY_REPLY chỉ DM — D20)
export async function processInbound(handler?: InboundHandler): Promise<{ processed: number }>;    // GIỮ = claimNextInbound([]) (ép thứ tự thread — D35.7) + handleClaimed (test/sim)
export async function runDispatcher(opts: RunnerOptions & { concurrency: number; pollMs: number }): Promise<void>;
```
Câu nhận (thread key = `thread_id`; một tài khoản ở 0.1):
```sql
update inbound_events set processed_at = now()
 where id = (select e.id from inbound_events e
              where e.processed_at is null and not (e.thread_id = any($1::text[]))
                and not exists (select 1 from inbound_events p
                                 where p.processed_at is null and p.zalo_account_id = e.zalo_account_id
                                   and p.thread_id = e.thread_id and p.id < e.id)
              order by e.id limit 1 for update skip locked)
returning id, zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, received_at, processed_at
```
- BẮT BUỘC: chỉ MỘT vòng dispatcher gọi `claimNextInbound` (tuần tự, ~2 ms) và truyền tập thread đang chạy ⇒ không có đua hai lần nhận cùng thread. Có ô trống ⇒ nhận tiếp ngay; không có tin ⇒ ngủ `RUNNER_POLL_MS`.
- `runTimers` chạy vòng RIÊNG mỗi `TIMER_INTERVAL_MS`, không chồng lần chạy (cờ bận), không chờ lượt nào; lỗi ⇒ `onError`.
- Idempotent khi song song (SPEC-P03 §4.2 D31, SPEC-P07 §2): `flushAmbient`/`flushWelcomes` BỎ QUA thread đang có sự kiện `sys-%` cùng loại chưa xử lý xong (`processed_at is null`) HOẶC đang chạy (thread trong tập dispatcher — truyền qua `TimerContext.busyThreads`); `prepare` cập nhật `last_seen_message_id = greatest(last_seen_message_id, $max)`.
- Dừng (SIGTERM): ngừng nhận, chờ lượt đang chạy tối đa `RUNNER_DRAIN_MS` (30000), rồi đóng DB, thoát 0.
- Khoá: `adapters/db.ts::holdAdvisoryLock(name, onLost)` (01-CONTRACTS §2.5) gọi TRƯỚC vòng đầu; `null` ⇒ in `RUNNER_ALREADY_RUNNING` (worker: `WORKER_ALREADY_RUNNING`) và `exit 1`.
- Pool DB: `RUNNER_CONCURRENCY` (4) + vòng timers + 1 kết nối khoá ≤ pool mặc định 10 — `RUNNER_CONCURRENCY` tối đa 8.

## §7. Pacer (apps/zalo-worker — sửa P02 đã xong)

### §7.1 Thay đổi
1. `PACER_TICK_MS` mặc định 250.
2. `pickNext`: vòng 1 chỉ xét thread có hàng đầu `inboundEventId != null` (tin trả lời), vòng 2 các thread còn lại; trong một thread vẫn đúng thứ tự cũ.
3. `lastTypingAt: Map<threadId, ms>` cập nhật khi gửi sự kiện `typing` (pha 3) hoặc typing của pha text; hàng text có `now − lastTypingAt(thread) ≤ PACER_TYPING_FRESH_MS` ⇒ KHÔNG gửi typing lại, KHÔNG trễ `typingDelayMs` — gửi ngay khi `policy.check` ok.
4. Ghi đo: khi `markSending` ⇒ `picked_at = now()`; nếu hàng đầu thread từng bị `check` từ chối ⇒ `hold_reason` = lý do ĐẦU TIÊN (`Map<rowId, BlockReason>` trong bộ nhớ). Không ghi DB mỗi tick.
5. Heartbeat worker + báo động phiên (§9, §10).

### §7.2 Không đổi (D09 giữ nguyên)
`PACER_GROUP_GAP_MS` 8000 + `PACER_GROUP_JITTER_MS` 3000, `PACER_MAX_PER_MINUTE` 10, `budget_per_hour`, backoff 30 phút, `maxRecipients`, chunk 1800.

### §7.3 Rủi ro D09 nếu nới gap cho tin trả lời (🖐 Q-D31-2 — architect KHÔNG tự nới)
Bot vừa nói trong nhóm < 8–11 s (vd 2 người mention liên tiếp) ⇒ tin thứ hai chờ tới 11 s ⇒ `e2e` > 5 s (tính vào `hold_ms`, không vào `core_ms`). Nới (vd gap 4000 cho tin trả lời mention) ⇒ nhịp gửi nhóm dày gấp đôi đúng lúc nhóm sôi nổi — kiểu hành vi mà D09 chặn để tránh khoá tài khoản; chưa có số đo Zalo thật về ngưỡng. Khuyến nghị: giữ, đo `hold_ms` 7 ngày ở P09 rồi quyết.

## §8. Đo & SLO

- `turn_traces` thêm (010): `inbound_event_id`, `received_at`, `lane`, `queued_ms`, `pre_turn_ms`, `triage_ms`, `model_ms`, `tool_ms`, `deadline_hit`. `outbox` thêm: `inbound_event_id`, `picked_at`, `hold_reason`. View `reply_latency` (§12) = một dòng/lượt `fast|rag` có tin trả lời: `e2e_ms`, `hold_ms`, `core_ms`, `runtime_ms` (= `outbox.created_at − received_at`), `send_ms` + các cột vết (`worker_lag` đọc thẳng `inbound_events` khi điều tra).
- `enqueue()` nhận `inboundEventId?` và ghi cột; `postGroupText`, `send_group_message`, DM `deliver` truyền `ctx.inboundEventId` (thêm vào `GroupTurnContext`/`DmTurnContext`).
- Dashboard `/agent` (SPEC-P08 §1): thẻ "Tốc độ 24 giờ" theo làn: n, p50/p95 `core_ms`, p95 `e2e_ms`, % `deadline_hit`, % có `hold_ms > 0`, trung vị từng đoạn (`queued`, `pre_turn`, `model`, `tool`, pacer, `send`); đỏ khi p95 vượt SLO §1. Câu SQL: `select lane, count(*), percentile_cont(0.5) within group (order by core_ms), percentile_cont(0.95) within group (order by core_ms), …, avg(deadline_hit::int) from reply_latency where received_at > now() - interval '24 hours' group by lane`.
- Báo động `slo_breach` (§10) dùng cùng view, cửa sổ 60 phút.

## §9. Heartbeat tiến trình + `GET /api/healthz` (D32)

- Bảng `process_heartbeats` (010). Runner: vòng riêng mỗi `HEARTBEAT_INTERVAL_MS` (5000) upsert `beat_at=now()`, `info = {inflight, oldest_inflight_ms, last_claim_at, last_timers_at, concurrency}`. Worker: `every('heartbeat', 5000)` ⇒ `info = {session_state, last_pacer_tick_at, queued_due}`. Lỗi ghi heartbeat ⇒ log, không dừng tiến trình.
- Heartbeat này KHÁC "heartbeat = báo cáo ngày" của SPEC-P07 §5 (DM owner) — không gửi gì cho ai, chỉ là dấu sống trong DB.
- `GET /api/healthz` (apps/web, KHÔNG cần đăng nhập, `dynamic='force-dynamic'`): đọc `process_heartbeats` + `zalo_accounts.session_state`; trả `200 {ok:true, runner:{age_s}, worker:{age_s}, zalo:'connected'}` khi cả hai `age_s ≤ HEARTBEAT_STALE_MS/1000` và phiên `connected` (hoặc `DATA_MODE=sim`); khác ⇒ `503` cùng dạng `ok:false`; DB lỗi ⇒ `503 {ok:false, db:false}`. CẤM trả số thành viên/nhóm/tin, tên, lỗi chi tiết, env.

## §10. Báo động Telegram (D32)

### §10.1 Adapter `packages/core/src/adapters/alert.ts` (BB-03 mở rộng, BB-20)
```ts
export type AlertKind = 'zalo_session' | 'runner_stale' | 'worker_stale' | 'inbound_backlog' | 'model_down' | 'slo_breach' | 'bot_not_admin' | 'db_unreachable';
export interface AlertInput { kind: AlertKind; key: string /* ≤ 64, vd 'community', 'fast', thread_id */; severity: 'critical' | 'warning'; text: string /* ≤ 800 */; resolved?: boolean }
export type AlertResult = 'sent' | 'suppressed' | 'disabled' | 'failed';
export async function sendAlert(a: AlertInput, opts?: { localOnly?: boolean }): Promise<AlertResult>;
export function setAlertFetchForTest(f: typeof fetch | null): void;
```
- Bật khi CẢ `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` có giá trị; thiếu ⇒ `'disabled'`, 0 gọi mạng, audit `alert.disabled` đúng 1 lần/tiến trình, KHÔNG ném.
- Gửi: `POST https://api.telegram.org/bot<token>/sendMessage` body `{chat_id, text: '[lenqclaw] ' + icon + ' ' + text, disable_web_page_preview: true}`, `AbortSignal.timeout(ALERT_TIMEOUT_MS)` (5000), KHÔNG retry trong lời gọi (vòng giám sát kế tiếp thử lại). HTTP ≠ 2xx/lỗi mạng ⇒ `'failed'` + audit `alert.failed {kind, status}`. CẤM log/audit URL, token, body phản hồi thô (URL chứa token).
- Chống spam (CAS trên `alert_state`, an toàn khi runner và worker cùng phát hiện):
  ```sql
  insert into alert_state (kind, key, open, last_sent_at, sent_count) values ($1, $2, true, now(), 1)
  on conflict (kind, key) do update set open = true, last_sent_at = now(), sent_count = alert_state.sent_count + 1
   where not alert_state.open or alert_state.last_sent_at < now() - make_interval(mins => $3)
  returning kind
  ```
  0 dòng ⇒ `'suppressed'` (`update … set suppressed = suppressed + 1`). Gửi thất bại ⇒ hoàn lại (`last_sent_at = null`) để lần sau gửi lại. `$3 = ALERT_REPEAT_MIN` (30): mỗi (kind, key) ≤ 1 tin / 30 phút khi còn mở. Trần toàn cục `ALERT_MAX_PER_HOUR` (20, đếm `audit_log action='alert.sent'` 60 phút) ⇒ `'suppressed'` + audit `alert.capped` (1 lần/giờ).
- `resolved: true` ⇒ `update alert_state set open=false where kind=$1 and key=$2 and open returning` — có dòng ⇒ gửi "✅ đã hồi phục: …" (không qua chống lặp); không ⇒ không gửi.
- `localOnly` (DB không dùng được): chống lặp bằng `Map` trong tiến trình, cùng `ALERT_REPEAT_MIN`.
- Nội dung: loại, khoá, số đo, giờ VN, đường dashboard (`/zalo`, `/agent`, `/groups`). CẤM nội dung tin, tên thành viên, uid người, prompt, token, `DATABASE_URL`.

### §10.2 Bảng sự kiện báo động
| `kind` (`key`) | Điều kiện | Ai phát hiện | Mức | Hồi phục khi |
| :-- | :-- | :-- | :-- | :-- |
| `zalo_session` (`community`) | `session_state ∈ {kicked, dead}` HOẶC audit `zalo.alert` `kind='cookie_expired'` trong 10 phút | **worker** gửi NGAY ở chỗ đang gọi `store.alert('kicked'|'dead'|'cookie_expired')`; **runner** `opsWatch` là lưới dự phòng (đọc DB) | critical | `session_state='connected'` |
| `runner_stale` (`runner`) | `process_heartbeats('runner').beat_at < now − HEARTBEAT_STALE_MS` (60000) hoặc chưa có dòng sau `HEARTBEAT_STALE_MS` kể từ khi worker khởi động | **worker** (runner chết không tự báo được) | critical | beat mới |
| `worker_stale` (`worker`) | như trên cho `worker` | **runner** | critical | beat mới |
| `inbound_backlog` (`queue` · `stuck`) | `inbound_events processed_at is null and received_at < now − 60 s` ≥ 1 · hoặc runner `info.oldest_inflight_ms > TURN_STUCK_MS` (120000) | **worker** (runner sống nhưng kẹt thì không tự thấy) | warning | về 0 |
| `model_down` (`community`) | 10 phút gần nhất: `agent_runs route='community'` lỗi (`error`/`deadline`) ≥ `ALERT_MODEL_ERRORS` (5) VÀ 0 lời gọi `ok` | runner | critical | có lời gọi `ok` |
| `slo_breach` (`fast` · `rag`) | 60 phút gần nhất, n ≥ 10: p95 `core_ms` > SLO §1 HOẶC `deadline_hit` > 5 % | runner | warning | điều kiện hết ở lần kiểm sau |
| `bot_not_admin` (`<thread_id>`) | `zalo_groups.enabled ∧ bot_is_admin=false ∧ last_synced_at not null` | runner | warning | `bot_is_admin=true` |
| `db_unreachable` (`<tiến trình>`) | 3 lần liền `opsWatch` lỗi kết nối DB | mỗi tiến trình (`localOnly`) | critical | lần kiểm thành công |

- `services/ops-watch.ts::checkOps(now: Date, self: 'runner' | 'worker'): Promise<OpsReport>` — SQL thuần, 0 model; runner gọi như bước 13 `opsWatch` của `runTimers` (SPEC-P07 §2) nhưng tự giới hạn mỗi `OPS_WATCH_INTERVAL_MS` (60000); worker gọi bằng `every('ops', OPS_WATCH_INTERVAL_MS)`. Cả hai có thể đánh giá cùng điều kiện (trừ heartbeat của chính mình) — CAS §10.1 bảo đảm ĐÚNG MỘT tin.
- Khoảng mù đã biết: runner VÀ worker cùng chết, hoặc máy/DB chết ⇒ không ai gửi. Lấp: dịch vụ ping ngoài gọi `/api/healthz` (🖐 Q-D31-5); web không tự gửi báo động.

## §11. Chính sách giữ dữ liệu vận hành (D32 e4)
| Bảng | Giữ | Dọn |
| :-- | :-- | :-- |
| `turn_traces` | `TRACE_RETENTION_DAYS` (180) | `runTimers` bước 8 `pruneBuffers`, ≤ 5000 dòng/tick/bảng |
| `agent_runs` | `TRACE_RETENTION_DAYS` (180) | như trên |
| `audit_log` | `AUDIT_RETENTION_DAYS` (365) — dài hơn vì BB-09 (trách nhiệm hành động quản trị) | như trên |
| `alert_state` · `process_heartbeats` | không dọn (vài chục dòng / 2 dòng) | — |
Không bảng nào trên chứa nội dung tin/prompt (D24, §10.1). `inbound_events`/`outbox` (có nội dung tin) CHƯA có hạn giữ trong bộ SPEC — ngoài phạm vi H06, ghi câu hỏi cho SO; `reply_latency` không phụ thuộc `inbound_events` sau khi lượt đã ghi `turn_traces.received_at`.

## §12. Migration MỚI `010_ops_latency.sql` — THIẾT KẾ (đã áp thử trên DB TẠM: `evidence/ARCH-D31/migration-010-probe.txt`), CHƯA áp DB dev
DDL nguyên văn ở [01-CONTRACTS §4 (010)](01-CONTRACTS.md) (một nguồn chân lý cho DDL). Gồm: 9 cột `turn_traces` (§8), 3 cột `outbox`, chỉ mục hàng chờ theo thread (§6), bảng `process_heartbeats` (§9), `alert_state` (§10.1), view `reply_latency` (§8). P03 áp thử từ rỗng sau 009, chạy lại `applied 0`, ghi `evidence/P03/migration-010-probe.txt`; lệch cú pháp ⇒ dừng báo, không tự sửa nghĩa.

## §13. Env mới — bảng đủ ở [01-CONTRACTS §10](01-CONTRACTS.md) (mỗi biến có mặc định + giới hạn; sai ⇒ `ConfigError`; riêng `TELEGRAM_*` thiếu ⇒ tắt báo động, không lỗi). Gồm: `MODEL_COMMUNITY_FAST`, `MODEL_MAX_OUTPUT_TOKENS`, `MODEL_CALL_TIMEOUT_MS`, `MODEL_MIN_ATTEMPT_MS`, `LANE_FAST_DEADLINE_MS`, `LANE_RAG_DEADLINE_MS`, `TURN_BACKGROUND_DEADLINE_MS`, `TOOL_MIN_MS`, `EMBED_TIMEOUT_MS`, `RUNNER_CONCURRENCY`, `RUNNER_POLL_MS`, `RUNNER_DRAIN_MS`, `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_STALE_MS`, `TURN_STUCK_MS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALERT_REPEAT_MIN`, `ALERT_MAX_PER_HOUR`, `ALERT_TIMEOUT_MS`, `ALERT_MODEL_ERRORS`, `OPS_WATCH_INTERVAL_MS`, `TRACE_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`; worker: `PACER_TICK_MS` (đổi mặc định 250), `PACER_TYPING_FRESH_MS`.

## §14. Lỗi & hành vi
| Lỗi / tình huống | Khi | Hành vi BẮT BUỘC |
| :-- | :-- | :-- |
| `ModelDeadlineError` (con của `ModelUnavailableError`) | còn < `MODEL_MIN_ATTEMPT_MS` tới hạn, hoặc fetch bị huỷ vì hết hạn | `agent`: `stop='model_down'`, `deadlineHit=true` ⇒ bảng §12.5 D4 (nhóm `mustReply` ⇒ `MODEL_DOWN_GROUP_REPLY`/`COMMANDS_HELP`/welcome template; DM ⇒ `MODEL_DOWN_DM_REPLY`); `agent_runs.outcome='deadline'`; KHÔNG thử lại sau hạn |
| `DeadlineExceeded` (tool_result) | `tools` còn < `TOOL_MIN_MS` | không chạy tool; model thấy lỗi và (nếu còn giờ) trả lời không có tra cứu |
| Embedding quá `EMBED_TIMEOUT_MS`/hạn | `search_knowledge` | lexical thuần (giữ SPEC-P04 §2), `vectorRank=null` |
| Triage quá `TRIAGE_TIMEOUT_MS` | tin không gọi bot | `null` (giữ), fetch bị huỷ |
| `holdAdvisoryLock` trả `null` | bản thứ hai khởi động | `exit 1` + `RUNNER_ALREADY_RUNNING` / `WORKER_ALREADY_RUNNING` |
| Mất kết nối giữ khoá | mạng/DB restart | log `runner.lock_lost` ⇒ dừng nhận, `exit 1` (supervisor/compose khởi động lại, lấy khoá lại) |
| Telegram lỗi / thiếu cấu hình | §10.1 | `'failed'`/`'disabled'`; KHÔNG ném, KHÔNG làm hỏng vòng gọi |
| Ghi heartbeat lỗi | DB chập chờn | log; `db_unreachable` sau 3 lần liền |

## §15. Vùng cấm (đã cân nhắc, quyết KHÔNG làm)
- Streaming / sửa tin / tin tạm "đợi chút" (T12). Gửi `typing` vào nhóm ngoài lượt tương tác (spam sự kiện).
- Nới `PACER_GROUP_GAP_MS`, ngân sách giờ, `maxPerMinute` để đạt SLO — chỉ người dùng quyết (Q-D31-2); tách `hold_ms` khỏi SLO thay vì nới.
- Bộ phân loại làn riêng (T1); làn quyết bằng regex/từ khoá (BB-12).
- Đổi model giữa lượt (T2b) khi chưa đo thoughtSignature chéo model.
- Thêm node/cạnh để chạy triage song song với lượt (T3b) — đổi hình đã duyệt.
- Runner song song trong CÙNG thread, hoặc nhiều dispatcher (T5c, T6).
- Bắt `ModelDeadlineError` để "thử thêm một lần" sau hạn.
- LISTEN/NOTIFY, pg-boss, Redis (T9).
- Báo động bằng Zalo (phiên chết thì không gửi được — lý do D32), email/SMS ở 0.1; gửi báo động từ `apps/web`.
- Báo động chứa nội dung tin/PII/token; báo động mỗi lần điều kiện đúng không chống lặp.
- (D33) Cổng eval chặn kích hoạt persona: kích hoạt trên dashboard có hiệu lực ngay (SPEC-P08); golden chạy tay theo OPERATIONS §5.

## §16. Nghiệm thu (chi tiết ở TESTING G23, G24 và SPEC-P03 §11 hàng 14–17)
| # | Ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `edges.test.ts` bổ sung | `isInteractive` 8 kind · `initialDeadline` ≥ 3 · `escalateLane` ≥ 4 (fast+search ⇒ rag; rag+search ⇒ null; background ⇒ null; tool thường ⇒ null) · `isAddressedToBot` ≥ 8 (gồm G24/G25 giả mạo không tính là gọi bot) · `needsTriage` thêm ≥ 4 ca `addressed` |
| 2 | `model.*.test.ts` bổ sung (fetch giả, 0 mạng) | fetch giả trễ 5000, `deadlineAt=now+1500` ⇒ `ModelDeadlineError` trong ≤ 1700 ms, `AbortSignal` đã huỷ; còn 600 ms (< `MODEL_MIN_ATTEMPT_MS`) ⇒ 0 fetch; 503 ở lần 1 + còn 900 ms ⇒ KHÔNG lùi 1 s (không đủ giờ) ⇒ `ModelDeadlineError`; body Gemini có `maxOutputTokens: 1024`; `tier:'fast'` ⇒ URL chứa `MODEL_COMMUNITY_FAST` |
| 3 | `p03` DB: (t) mention + fetch giả trễ 6000 | 1 outbox `MODEL_DOWN_GROUP_REPLY` có `created_at − received_at ≤ LANE_FAST_DEADLINE_MS + 300`; `turn_traces.deadline_hit=true lane='fast'`; `agent_runs.outcome='deadline'` |
| 4 | (u) mention ⇒ model gọi `search_knowledge` ⇒ trả lời | `lane='rag'`, outbox text có `inbound_event_id`; 1 outbox `typing` có `created_at` < `agent_runs` đầu tiên `created_at`; 0 `agent_runs route='triage'` cho tin đó |
| 5 | (v) runner: thread A lượt treo 3 s (handler giả), thread B tin tới sau 100 ms | B xong trước A; tin A1, A2 cùng thread chạy ĐÚNG thứ tự, không chồng; `holdAdvisoryLock` lần 2 cùng tên ⇒ `null` |
| 6 | `latency_slo.mjs` (G23) + ca đỏ | TESTING G23 |
| 7 | `alert.test.ts` + `ops-watch.db.test.ts` (G24) + ca đỏ | TESTING G24 |
