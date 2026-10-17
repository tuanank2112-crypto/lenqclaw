1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (gói P04 — kho tri thức, truy hồi lai RRF, câu hỏi bỏ trống).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` D07, D18, D28, D31, D35 → `specs/SPEC-P04-Tri-Thuc.md` (toàn bộ — hợp đồng gói này) → `specs/01-CONTRACTS.md` §2.2 (`embedTexts`), §4 (`kb_*`, `group_messages`), §7.1 hàng `search_knowledge`, §9, §10, §12.3 → `specs/SPEC-P03-Runtime-Agent.md` §4, §6.1 → `specs/SPEC-D31-Toc-Do-Giam-Sat.md` §5.2 → `specs/SPEC-P07-Lich-Van-Hanh.md` §2 (vị trí bước timer) → `docs/core.md`.

## 1. BỐI CẢNH TỰ CHỨA
- P01–P03b đã nghiệm thu. P03 đã có tool `search_knowledge` bản LEXICAL (cờ `extendsDeadline`, nâng làn fast ⇒ rag), node `system_event` + lượt `group_unanswered` dạng khung, `runTimers` có `flushAmbient`/`pruneBuffers`/`opsWatch`. Gói này nâng truy hồi lên LAI (lexical + vector + RRF), thêm `embedTexts`, `upsertDocument`/`embedPending`, nhặt câu hỏi bỏ trống.
- KHÔNG có credit model thật: mọi test embedding/model dùng fetch giả (`setGeminiFetchForTest` hoặc tương đương). SPEC-P04 §8 hàng 5 (golden thật `unanswered`) thuộc P09a — KHÔNG làm.
- Hình đồ thị chốt (BB-16): KHÔNG thêm/bớt node, cạnh. `embedTexts` chỉ được gọi trong node `tools` (01-CONTRACTS §12.3) và timer.
- Số đo trước: gate exit 0, `npm test` 585 (web 32 · worker 114 · core 439), `test:db` 238 (core 130 · web 30 · worker 78), 0 skip. DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu. Test dọn dữ liệu chỉ đụng dòng do chính test tạo (gotcha G34).

## 2. PHẠM VI
- ĐƯỢC GHI: `packages/core/src/retrieval/**`, `packages/core/src/services/knowledge.ts` (mới) + test, `packages/core/src/adapters/model.ts` (chỉ thêm `embedTexts` + lỗi liên quan) + `model.*.test.ts`, `packages/core/src/agent/community/tools/search_knowledge*`, file chứa `runTimers` (thêm bước `embedPending`, `pickUnanswered` đúng vị trí SPEC-P07 §2), `packages/core/src/domain/errors.ts`, `packages/core/src/services/community-config.ts` (biến `KB_TOP_K`, `UNANSWERED_*`, `EMBED_*` nếu chưa có), `packages/core/src/dbtests/**`, `apps/web/tests/sim-tick*.db.test.ts` (chỉ khi tập `steps` đổi), `docs/core.md`; hồ sơ: `reports/R11_thi-cong_P04.md` + `evidence/P04/*` (file mới).
- CẤM ĐỤNG: `packages/core/src/agent/community/graph/**`, `db/migrations/**` (DDL `kb_*` đã đủ; thiếu cột ⇒ dừng hỏi), `apps/zalo-worker/**`, trang dashboard (P08), `package.json`/`package-lock.json`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `lenqclaw_presentation_transcript.pdf`.

## 3. VIỆC PHẢI LÀM
a. `embedTexts` (01-CONTRACTS §2.2): `batchEmbedContents`, `outputDimensionality: 1024`, batch 100, retry 2 cho 429/5xx ⇒ `EmbeddingUnavailableError`; nhận `deadlineAt`/`AbortSignal`; nhánh không phải Gemini ⇒ ném ngay, 0 fetch. ⇒ SPEC-P04 §8 hàng 2.
b. `services/knowledge.ts`: `upsertDocument`, `embedPending` (§1); `searchKnowledge` lai (§2: lexical top 20 + vector `<=>` top 20 + RRF k=60, lọc `approved` + hiệu lực ngày VN, timeout embed `min(EMBED_TIMEOUT_MS, deadlineAt − now)`); tool `search_knowledge` (§3: rút 600 ký tự quanh token khớp, `note` trích dẫn, audit `kb.search {hits, vector}`). ⇒ hàng 1, 3.
c. Câu hỏi bỏ trống §5 (`findUnansweredQuestions` + bước timer + `enqueueSystemEvent`), lượt `group_unanswered` đi đúng đường đồ thị có sẵn. ⇒ hàng 4 (5 ca q1–q5 + lần 2 ⇒ 0).
d. Mỗi bộ đo MỚI phải từng ĐỎ ít nhất một lần trên mã cố tình hỏng (`evidence/P04/red-*.txt`), tối thiểu: bỏ lọc `status='approved'` ⇒ ca draft đỏ; bỏ RRF vector ⇒ ca "mục chỉ-vector lên top K" đỏ; bỏ điều kiện "không có tin quote/mention sau" ⇒ ca q2/q3 đỏ; bỏ `answered_at` ⇒ ca "lần 2 ⇒ 0" đỏ. Trả mã nguyên trạng sau mỗi lần.
e. Docs module theo thực tế.
f. **Xong khi** (chạy lại cuối, ghi `evidence/P04/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 585 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip, 2 lần liên tiếp đều xanh
   - `npm run latency:slo -- --n 20 --fake-delay-ms 300 > latency-fake.txt` → exit 0 (làn RAG vẫn trong ngân sách)
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh, commit bằng `git commit <đường>…` · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi ⇒ giải thích từng ca) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · CẤM log nội dung tin/tài liệu/key · CẤM crawl URL (§7) · SPEC mâu thuẫn mã ⇒ ghi câu hỏi report, làm phần độc lập; quyết định chưa có trong SPEC ⇒ dừng phần đó, hỏi.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🟠 | hợp đồng SPEC-P04 + 01-CONTRACTS §2.2 + bảng nghiệm thu có sẵn |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H11_thi-cong_P04.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng SPEC-P04 §8 hàng 1–4 → lệnh → kết quả → evidence; bảng bằng chứng đỏ; bảng phân công; việc KHÔNG làm + lý do; câu hỏi cần người. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
