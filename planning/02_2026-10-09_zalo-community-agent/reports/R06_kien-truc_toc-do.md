Vai: worker (vai-thi-cong) · loại: thi công (architect — chỉ ghi SPEC + evidence, KHÔNG mã sản phẩm) · họ/model: Claude / Opus 5.5 (🔴) · Bước 0: exit 0 · hiểu việc: đo thật độ trễ model/embedding/DB rồi thiết kế làn nhanh (< 5 s) / làn RAG (< 15 s), runner song song theo thread, hạn chót, typing sớm, đo SLO, heartbeat + báo động Telegram, sửa bộ SPEC / xong khi `latency-probe.txt` có số thật, bảng ngân sách 2 làn cộng ≤ 5000 / ≤ 15000 có biên, mọi env mới có mặc định + giới hạn, gate tốc độ có ca đỏ / cấm mã sản phẩm, package.json, plan.md, planning/01, planning/03, brain4agent/, docs/, tự nới gap pacer, push.
Handoff: handoffs/H06_kien-truc_toc-do.md
Base: bfbfc5e
Head: 33248d1

## 1. Lệnh + exit code (nguyên văn)
| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| Bước 0 | `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 | (stdout phiên: "NÃO ĐÃ OK") |
| a | `set -a; . ./.env; set +a; node probe.mjs` (phase 1, tuần tự, 87 lời gọi) | 0 | [latency-probe](../evidence/ARCH-D31/latency-probe.txt) |
| a | `node probe.mjs --phase2` (giãn cách 13 s/5 s sau 429 free tier, 23 lời gọi; lần chạy đầu `exit 1` do lỗi TDZ trong script, 0 lời gọi model — sửa script, chạy lại) | 0 | [latency-probe](../evidence/ARCH-D31/latency-probe.txt) · script [probe.mjs.txt](../evidence/ARCH-D31/probe.mjs.txt) |
| a | kiểm không lộ key: `grep -cF <giá trị key> latency-probe.txt probe.mjs.txt` × 3 key | 1 (0 dòng khớp — đúng kỳ vọng) | — |
| b | `node budget-sim.mjs` (Monte Carlo N=100 000 từ số đo, 0 model) | 0 | [budget-sim](../evidence/ARCH-D31/budget-sim.txt) · [budget-sim.mjs.txt](../evidence/ARCH-D31/budget-sim.mjs.txt) |
| d | áp 001–009 + DDL 010 (trích nguyên văn 01-CONTRACTS §4) lên DB TẠM `lenqclaw_mig010_probe`, ca view/CAS/CHECK đỏ, xoá DB | 0 | [migration-010-probe](../evidence/ARCH-D31/migration-010-probe.txt) |
| — | `npm run gate --silent` | 0 (`GATE_OK`) | [gate](../evidence/ARCH-D31/gate.txt) |

Tổng lời gọi model: **110 / 120** (phase 1: 87, phase 2: 23). DB tạm của probe và của migration đều đã xoá (`pg_database` còn 0).

## 2. Test tổng/pass/fail/skip
218/218/0/0 (web 31 · core 102 · worker 85; `violations: 0`, `forbidden_tools: 0`, `forbidden_actions: 0`, `unlisted_tools: 0`, `pivot_hits: 0`) — gói chỉ đổi `.md` + evidence; gate chạy để chứng minh cây vẫn xanh.

## 3. `git diff --stat bfbfc5e..Head` + SHA từng commit
[diff-stat](../evidence/ARCH-D31/diff-stat.txt) · `33248d1` docs(plan-02): design D31 latency lanes, D32 Telegram alerting and ops monitoring specs · commit report: `docs(plan-02): add R06 architect report for D31/D32`. Mọi file trong phạm vi H06 §2 (`specs/*.md`, `evidence/ARCH-D31/*`, report).

## 4. Số đo thật (n nhỏ — key Gemini free tier chạm quota phút rồi quota NGÀY)
| Phép đo | n | p50 | p95 (ms) |
| :-- | :-- | :-- | :-- |
| `gemini-3.5-flash-lite` câu ngắn | 8 | 1047 | 1562 |
| `gemini-3.6-flash` câu ngắn, thinking mặc định / `minimal` | 3 / 4 | 3021 / 1652 | 4537 / 1862 |
| `gemini-3.6-flash` minimal, prompt thật (system 3,3k ký tự + 25 tin + 11 tool), 1 lời gọi trả lời | 3 | 3078 | 4419 |
| Lượt RAG `gemini-3.6-flash` minimal (call1 + call2) | 4 | 4007 | 5896 |
| Lượt RAG `gemini-3.5-flash-lite` (call1 + call2) | 4 | 2479 | 2770 |
| Triage `gemini-3.5-flash-lite` | 5 | 1577 | 2953 |
| Embedding `gemini-embedding-001` (trả đúng **1024 chiều** ⇒ Q3 đóng) | 10 | 405 | 447 |
| DB 3000 mục: lexical / vector seqscan / lexical+vector+RRF | 30 | 53 / 12 / 66 | 71 / 18 / 95 |
| `vyce/deepseek-v4-flash` (model chính trong `.env`) | 0 | — | 14/14 `401 Invalid API key` |

## 5. Ngân sách 2 làn (p95 dự kiến, ms — chi tiết + cột đo: SPEC-D31 §3)
| Bước | `fast` | `rag` |
| :-- | :-- | :-- |
| worker nhận (ước) | 100 | 100 |
| runner nhặt (`RUNNER_POLL_MS` 200) | 200 | 200 |
| ingest + moderate(lưới) + gate + prepare | 50 | 50 |
| triage | 0 (tin gọi bot không triage) | 0 |
| model call 1 (flash-lite) | 1600 | 1250 |
| `search_knowledge` (embed + RRF) | — | 550 |
| model call 2 | — | 1600 |
| (20 %) vòng truy hồi 2 | — | +1800 |
| enqueue + pacer tick 250 + typing 0 (typing sớm) + sendText (ước 600) | 855 | 855 |
| **Cộng p95 từng bước** | **2805** | **6405** (1 vòng 4605) |
| **SLO / biên** | 5000 / **2195 (44 %)** | 15000 / **8595 (57 %)** |
| p95 mô phỏng `e2e` · nhóm ồn ào | 3471 · 3847 | 6179 · 6410 |
| chạm hạn chót (⇒ câu dự phòng) | 1,9 % · 4,8 % | 0,9 % · 2,2 % |
| Hiện trạng (mô phỏng cùng nguồn) | 9783 | 12116 |
Hạn chót runtime: `fast` = nhận + 3500 · `rag` = nhận + 12500 (chừa ≥ 1500/2500 ms cho pacer + gửi). Thời gian pacer giữ vì gap D09 (`hold_ms`) tách khỏi số SLO (`core_ms = e2e − hold`), vẫn hiển thị.

## 6. Quyết định (chọn · bỏ · vì sao — đủ ở SPEC-D31 §4)
- T1 Làn do model quyết bằng hành vi (gọi tool truy hồi ⇒ `rag`) · bỏ triage quyết làn / bộ phân loại riêng · không thêm lời gọi, BB-12 giữ.
- T2 Model theo loại lượt: tương tác ⇒ `MODEL_COMMUNITY_FAST` = `gemini-3.5-flash-lite`; nền ⇒ `gemini-3.6-flash` · bỏ 3.6-flash cho mọi lượt (45 % chạm hạn) và đổi model giữa lượt (thoughtSignature chéo model chưa đo được) · golden D10 `activation` vẫn chạy 3.6-flash.
- T3 Tin gọi bot (DM, mention, quote, tên, lệnh) KHÔNG triage · bỏ hạ timeout triage / triage song song (đổi hình) · triage p95 2953 ⇒ 49 % chạm hạn; bù bằng lưới + agent `flag_message`.
- T4 Hạn chót lượt + `AbortSignal` mọi lời gọi; quá hạn = `ModelDeadlineError` ⇒ đường `model_down` có sẵn · bỏ thêm StopKind/Delivery/outcome · không đổi bảng `decideDelivery`, đo bằng `deadline_hit`.
- T5/T6 Runner một dispatcher, song song ≤ 4 thread, tuần tự trong thread; advisory lock chặn bản thứ hai (runner + worker) · bỏ tuần tự (1 lượt treo 60 s ⇒ nhóm khác chờ 46,8 s), pg-boss, song song theo người gửi.
- T7 Typing sớm ở `prepare` + pacer bỏ typing lặp · T8 ưu tiên THỨ TỰ tin trả lời (không nới giới hạn nào) · T9 poll 200 / tick 250 (bỏ LISTEN/NOTIFY) · T10 `max_tokens` 1024 · T11 embed timeout 1500 · T12 không streaming/tin tạm.
- Đo: migration 010 (9 cột `turn_traces`, 3 cột `outbox`, `process_heartbeats`, `alert_state`, view `reply_latency`) — đã áp thử DB tạm. Gate G23 (tốc độ, 3 ca đỏ thiết kế sẵn), G24 (báo động, ca đỏ CAS).
- D33: ghi vào vùng cấm SPEC-D31 §15 + TESTING đầu file — không cổng eval chặn kích hoạt persona.

## 7. Hình đồ thị
KHÔNG đổi node/cạnh (`PIPELINE_SHAPE`/`TURN_SHAPE` giữ) ⇒ KHÔNG cần người dùng duyệt lại luồng. Đổi chữ/mũi tên phụ ở 00-ARCH §4.1/§4.2: nhãn mũi tên vào `processInbound` "1 runner tuần tự" ⇒ "1 runner, song song theo thread (D31)"; thêm mũi tên tác dụng phụ `prepare → outbox` "typing sớm" (bảng node 01-CONTRACTS §12.3: `prepare` outbox "✓ chỉ `typing`" — đổi hợp đồng BB-15 mức node, không đổi hình). Ảnh 12 (bản người duyệt) không có các chi tiết này ⇒ không đổi; ảnh 13 (render nguyên văn §4.1) cần render lại — `docs/` ngoài phạm vi H06.

## 8. Báo động Telegram (tóm tắt SPEC-D31 §9–§11)
`adapters/alert.ts::sendAlert` (duy nhất gọi Telegram; thiếu `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` ⇒ tắt + audit, không lỗi; timeout 5 s; không log URL/token) · chống spam CAS `alert_state`: mỗi (loại, khoá) ≤ 1 tin/30 phút, trần 20 tin/giờ, tin hồi phục khi hết · phát hiện chéo `ops-watch.ts::checkOps`: worker canh `runner_stale` + `inbound_backlog`, runner canh `worker_stale`, `model_down` (≥ 5 lỗi/10 phút, 0 ok), `slo_breach` (p95 `core_ms` hoặc `deadline_hit` > 5 %, 60 phút), `bot_not_admin`; `zalo_session` (kicked/dead/cookie_expired) worker gửi NGAY + runner dự phòng; `db_unreachable` chống lặp trong tiến trình · heartbeat `process_heartbeats` 5 s, cũ > 60 s ⇒ báo · `GET /api/healthz` 200/503 không đăng nhập, không số liệu · giữ `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày · khoảng mù: cả hai tiến trình/máy/DB chết ⇒ cần ping ngoài (Q-D31-5).

## 9. Đề xuất dòng "Quyết định bị thay thế" (plan.md §2 — SO ghi, tôi không được sửa plan.md)
| Mốc cũ | Phát biểu cũ | Thay bằng | Lý do |
| :-- | :-- | :-- | :-- |
| 00-ARCH §3, §7 · OPERATIONS §1 · `inbound-runner.ts` (Đ22 cũ) | Một runner xử lý TUẦN TỰ toàn cục | D31 — BB-19, SPEC-D31 §6: một runner, song song theo thread, tuần tự trong thread | một lượt treo chặn mọi nhóm (mô phỏng: chờ 46,8 s) |
| OPERATIONS §4 mục 2 | "advisory lock vẫn là Idea Vault — vận hành bằng luật" | D31 — advisory lock bắt buộc (runner + worker) | song song chỉ an toàn khi chắc một dispatcher |
| SPEC-P03 §5.1 bước 4, §5.2 (b) · 01-CONTRACTS §12.4 `needsTriage` | Mọi tin DM (và mọi tin nhóm có kiểm duyệt, kể cả tin gọi bot) qua triage | D31 T3 — tin gọi bot không triage | triage p95 2953 ms ⇒ 49 % lượt chạm hạn 5 s |
| 01-CONTRACTS §2.1 (`max_tokens` 16000) · route `community` một model | 16000 token; một model cho mọi lượt | D31 T2, T10 — `MODEL_COMMUNITY_FAST` cho lượt tương tác, `MODEL_MAX_OUTPUT_TOKENS` 1024 | 3.6-flash 1 lời gọi p95 4419 ms |
| 01-CONTRACTS §2.1 / `callModel` | lời gọi model không timeout; retry + fallback không trần | D31 BB-18 — hạn chót lượt + `AbortSignal` + `ModelDeadlineError` | trường hợp xấu không có trần |
| SPEC-P04 §2 bước 2 | embed timeout 3 s | D31 T11 — `EMBED_TIMEOUT_MS` 1500 ∧ ≤ hạn lượt | p95 đo 447 ms |
| SPEC-P02 §5 / `PACER_DEFAULTS` | tick 1000 ms; typing 1–3 s ngay trước mọi text | D31 T7, T9 — tick 250; bỏ typing lặp khi đã có typing sớm | tiết kiệm 1–3,7 s/tin, không đổi giới hạn D09 |
| SPEC-P07 §5 "Heartbeat = CHÍNH báo cáo này — không có heartbeat khác" | không có heartbeat khác | D32 — dấu sống tiến trình `process_heartbeats` (không gửi cho ai) + báo động Telegram | runner/worker chết thì không ai biết |
| D24 "không cần hạn giữ ở 0.1" · SPEC-P07 §2 bước 8 "KHÔNG chạm `turn_traces`, `audit_log`" | giữ vết vô hạn | D32 e4 — `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày | bảng tăng không giới hạn; 365 ngày cho BB-09 |
| 01-CONTRACTS §2.2 / plan.md Q3 | "giả định 1024 chiều; probe ở P04" | đóng Q3 — đo trả đúng 1024 | `latency-probe.txt` |

## 10. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a (đo thật) | 🔴 | Claude Opus 5.5 |
| b (ngân sách + mô phỏng) | 🔴 | Claude Opus 5.5 |
| c (thiết kế) | 🔴 | Claude Opus 5.5 |
| d (sửa SPEC) | 🔴 | Claude Opus 5.5 |
| e (giám sát + báo động) | 🔴 (handoff xếp a–d; e cùng tầng vì là hợp đồng mới) | Claude Opus 5.5 |
Thẩm định nội bộ: tự đối chiếu chéo tham chiếu §/tên env giữa 6 file + áp thử DDL 010 có ca đỏ; KHÔNG tự tuyên bố đạt cổng.

## 11. Việc KHÔNG làm + lý do
- Không đo được model chính trong `.env` (`vyce/deepseek-v4-flash`): key trả 401 (14 lời gọi). Không thử OpenRouter thay thế (ngoài danh sách model handoff, tốn ngân sách gọi).
- Không đo `gemini-3.6-flash` đủ n (quota NGÀY free tier hết sau ~15 lời gọi) và không đo được thoughtSignature chéo model (lý do bỏ T2b). Không đo `zca-js sendText`, độ trễ listener (cần Zalo thật — P09); ngân sách dùng ước lượng, ghi rõ "ước".
- Không sửa `plan.md` (cấm): D-mới, dòng "Quyết định bị thay thế", WP cho phần worker/báo động, đóng Q3 — để SO ghi (§9, §12).
- Không render lại ảnh 13 (`docs/` cấm).
- Không viết mã, không áp 010 lên DB dev.

## 12. Câu hỏi mở (cần người)
- 🖐 Q-D31-1: Trả lời mention/DM bằng `gemini-3.5-flash-lite` (nhanh, kém 3.6-flash một bậc), lượt nền vẫn 3.6-flash? Mặc định: **CÓ** — không thì mục tiêu 5 s không đạt (3.6-flash một lời gọi p95 4,4 s).
- 🖐 Q-D31-2: Nới khoảng cách gửi trong nhóm cho tin trả lời mention (vd 8 s ⇒ 4 s) để không phải chờ khi bot vừa nói? Mặc định: **KHÔNG** (giữ D09, chống khoá tài khoản); thời gian chờ này tách riêng khỏi số SLO và đo 7 ngày ở P09.
- 🖐 Q-D31-3: Key Gemini đang là free tier (chạm quota ngày) và key Vyce trong `.env` báo 401 — bật billing Gemini và đổi `MODEL_PROVIDER=gemini` trước khi thi công P03/G23? Mặc định: **CÓ** (gộp với mục checklist quota Gemini đang mở).
- 🖐 Q-D31-4: Tin gọi bot không qua bước phân loại spam bằng model (chỉ còn lưới + agent tự gắn cờ). Mặc định: **chấp nhận**.
- 🖐 Q-D31-5: Dùng dịch vụ ping ngoài miễn phí gọi `/api/healthz` để biết khi cả máy chết? Mặc định: **chưa** — làm ở P09/VPS nếu người dùng tạo tài khoản.
- 🖐 Q-D31-6: Giữ vết vận hành 180 ngày, nhật ký quản trị 365 ngày? Mặc định: **CÓ**.
- SO (không phải người): (1) xếp WP cho SPEC-D31 §7 (sửa worker P02 đã xong), §9–§11 (báo động/healthz/dọn) — đề xuất: phần runtime vào P03, phần worker + báo động thành gói `P03b` 🟠 sau P03, healthz/thẻ dashboard vào P08; (2) hạn giữ `inbound_events`/`outbox` (có nội dung tin) chưa có trong SPEC — cần D riêng.

## 13. Tiếp theo
🖐 Cần tay người: trả lời Q-D31-1…6 (mặc định đã ghi); bật billing Gemini + sửa `.env` (Q-D31-3); tạo bot Telegram khi tới P09 (OPERATIONS §9). · 🤖 Agent làm được ngay: SO ghi D34 + 10 dòng "Quyết định bị thay thế" (§9) + đóng Q3 vào `plan.md`, xếp WP, render lại ảnh 13. · ⭐ Nên làm trước: Q-D31-1 + Q-D31-3 — quyết định model và quota chặn mọi số đo G23 của P03. · ⏸ Chưa làm: đo 3.6-flash đủ n, đo chéo model, đo zca-js sendText (thiếu quota / cần Zalo thật); hạn giữ `inbound_events`/`outbox` (ngoài phạm vi).

## Phán quyết SO (2026-10-16, Claude Opus 5.5)
Kiểm: 0 key lộ; gate exit 0; hình không đổi node/cạnh. Bảng thay thế đã chép vào plan.md; Q-D31-4/5/6 SO chốt, Q-D31-1/2/3 chờ người (plan D34).

✅ DUYỆT (kỹ thuật)
