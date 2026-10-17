Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude Sonnet 5.5 · Bước 0: exit 0 (`NÃO ĐÃ OK`) · hiểu việc: phạm vi = `embedTexts`, `services/knowledge.ts`, truy hồi lai RRF, tool `search_knowledge`, bước timer `pickUnanswered`/`embedPending`, test, docs (không đụng graph/migration/worker/dashboard/package.json); xong khi = gate · npm test · test:db ×2 · latency fake · diff-stat đều đạt + 4 bằng chứng đỏ; cấm = push, gọi mạng thật, đổi node/cạnh đồ thị, golden thật (P09a).
Handoff: handoffs/H11_thi-cong_P04.md
Base: ffc7212f499f05cfe85543901195e3b439af9af2
Head: 56b383daa6f00003f7b6ed74a54e8b2578e33f97

## Commit
| SHA | Nội dung |
| :-- | :-- |
| 3df5373 | `embedTexts`, `knowledge.ts`, truy hồi lai, tool, bước timer, test (unit + 2 file db), sim-tick `steps` |
| caf2678 | `docs/core.md` |
| 56b383d | test: bỏ phụ thuộc hoà vector trong DB dùng chung (test flaky ở lần chạy test:db đầu) |

## Số đo (tại Head, evidence/P04/)
| Cổng | Lệnh | Kết quả | File |
| :-- | :-- | :-- | :-- |
| gate | `npm run gate` | exit 0, `GATE_OK` | gate.txt |
| npm test | `npm test` | exit 0; 602 pass / 0 fail / 0 skip (web 32 · worker 114 · core 456; trước 585, +17) | test.txt |
| test:db lần 1 | `npm run test:db` | exit 0; 258 pass / 0 fail / 0 skip (core 150 · web 30 · worker 78; trước 238, +20) | test-db.txt |
| test:db lần 2 | như trên | exit 0; 258 pass | test-db-run2.txt |
| latency fake | `npm run latency:slo -- --n 20 --fake-delay-ms 300` | exit 0, `G23 RESULT: PASS`; fast p95 700 ms, rag p95 982 ms, deadline_hit 0 | latency-fake.txt |
| diff-stat | `git diff --stat Base..HEAD` | 11 file, +1324/−59, tất cả trong ĐƯỢC GHI | diff-stat.txt |

## SPEC-P04 §8
| # | Ca | Lệnh | Kết quả |
| :-- | :-- | :-- | :-- |
| 1 | token N14 + RRF ≥ 5 ca | `retrieval/search-knowledge.test.ts` (trong npm test) | 13 pass (giữ 6 ca cũ + 7 ca RRF) |
| 2 | `embedTexts` dịch body, batch 100, 503 ⇒ retry 2 ⇒ `EmbeddingUnavailableError`, nhánh không-Gemini 0 fetch | `adapters/model.gemini.test.ts` | 10 ca mới pass (cả 429, 400 không retry, deadline, thiếu key, sai số chiều, chống mạng thật) |
| 3 | seed 10 mục, lexical, upsert ⇒ `embedding=null`, `embedPending`, mục chỉ-vector lên top K, draft/hết hạn ⇒ 0 hit | `dbtests/p04-knowledge.db.test.ts` | 14 pass |
| 4 | q1–q5 + `runTimers` ⇒ 1 `sys-%`, lần 2 ⇒ 0 | `dbtests/p04-unanswered.db.test.ts` | 6 pass (thêm: ca biên, MAX_PER_TICK, busyThreads, đua 2 tiến trình, lượt `group_unanswered` đi hết đồ thị với model giả) |
| 5 | golden thật `unanswered` | — | KHÔNG làm (P09a) |

## Bằng chứng đỏ (mã cố tình hỏng; mã đã trả nguyên trạng, `git diff` rỗng sau mỗi lần)
| File | Cách hỏng | Test đỏ |
| :-- | :-- | :-- |
| red-no-approved-filter.txt | bỏ lọc `status='approved'` | 2 đỏ: ca draft/deprecated/hết hạn; ca draft có vector |
| red-no-vector-rrf.txt | tắt bước vector | 3 đỏ: ca "mục chỉ-vector lên top K" + 2 ca liên quan |
| red-no-reply-condition.txt | vô hiệu `not exists` (quote/mention sau) | 1 đỏ: ca 5 (q2, q3, q5 bị nhặt nhầm) |
| red-no-answered-at.txt | bỏ `update … answered_at` | 4 đỏ gồm "lần 2 ⇒ 0" |

## Bảng phân công
| Gói | Tầng yêu cầu | Họ/model dùng |
| :-- | :-- | :-- |
| a, b, c (🟠) | 🟠 | Claude Sonnet 5.5 |
| docs (🟢) | 🟢 | Claude Sonnet 5.5 (xuống tầng không có model rẻ hơn; việc ngắn) |

## Quyết định ngoài chữ SPEC (tự chọn, đổi được)
1. `embedTexts` chọn nhánh theo `EMBED_PROVIDER` (không theo `MODEL_PROVIDER`); thiếu `GEMINI_API_KEY` ⇒ `EmbeddingUnavailableError`.
2. Thêm `opts.timeoutMs` cho `embedTexts` (embed tài liệu hàng loạt 20 s/lần thử; truy vấn vẫn `min(EMBED_TIMEOUT_MS, deadlineAt−now)`).
3. Chặn mạng thật: dưới vitest, hoặc đã cài fake model mà chưa cài `setEmbedFetchForTest` ⇒ `embedTexts` ném, 0 fetch. Hệ quả: `latency:slo --fake-delay-ms` đo làn RAG KHÔNG gồm ~450 ms embed thật (SPEC-D31 §2.1), nên p95 rag 982 ms thấp hơn thực tế.
4. `note` của tool giữ mẫu `(theo <tên tài liệu> · <mục>)` (SPEC-P04 §4 + golden), KHÁC chữ §3 `(Tài liệu <title> · mục <heading>)`.
5. `embedPending(limit, now, onlyDocumentIds?)` và `findUnansweredQuestions/pickUnanswered(…, onlyThreads?)` có tham số lọc phụ để test không đụng dữ liệu không phải của test (G34).
6. `pickUnanswered`/`embedPending` bọc `safeStep` (lỗi ⇒ audit `timer.error {step}` + chạy tiếp, theo P07 §2); bước cũ giữ hành vi cũ.
7. Audit `kb.embed_unavailable` ≤ 1/giờ cũng được ghi từ đường tìm kiếm (không chỉ `embedPending`).

## Việc KHÔNG làm
- SPEC-P04 §8 hàng 5 (golden thật, cần credit model) — thuộc P09a.
- Không đổi graph, migration, worker, dashboard, `package.json`, `brain4agent/`, `planning/` ngoài hồ sơ này; không push.

## Câu hỏi cần người
1. SPEC mâu thuẫn: `note` tool §3 (`(Tài liệu … · mục …)`) vs §4/golden (`(theo …)`). Đã chọn §4; xác nhận hoặc sửa SPEC.
2. `ctx.deadlineAt` truyền vào tool là hạn của làn lúc mở lượt (fast 3500 ms), node `tools` chỉ nâng sau khi tool chạy xong. Lượt fast mà model gọi mất >~2 s thì embed bị cắt còn `deadlineAt−now` (lexical thuần). Muốn embed hưởng hạn `rag` ngay từ tool đầu thì cần đổi node `tools` (ngoài phạm vi, đụng graph).
3. Hygiene test (không phải lỗi P04): `apps/zalo-worker/src/dbtests/p03b-worker.db.test.ts` để lại `zalo_accounts.own_uid='7700555'` trong DB dev ⇒ sau `npm run test:db`, `latency:slo` bị treo (mention sim không khớp bot, 0 lượt). Đã đặt lại `own_uid=null` trước khi đo latency (đúng dòng do test tạo ra). Cần worker dọn `own_uid` ở `afterAll` (ngoài phạm vi gói này).

## Tiếp theo
🖐 Cần tay người: xác nhận câu hỏi 1 và 2; quyết có dọn `own_uid` trong test worker (câu 3).
🤖 Agent làm được ngay: gói P08 `/knowledge` (dán văn bản ⇒ `upsertDocument`, nút "Nhúng lại" ⇒ `embedPending(…, [docId])`, tìm thử), hoặc sửa hygiene test worker.
⭐ Nên làm trước: sửa dọn `own_uid` trong test worker, vì nó làm hỏng `latency:slo` ngay sau `test:db`.
⏸ Chưa làm: golden thật `unanswered` (P09a, cần credit); đo embed thật vào latency (cần credit/key thật).

⏳ Chờ phán quyết.
