Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Sonnet 5 (claude-sonnet-5) · Bước 0: exit 0 · hiểu việc: phạm vi = `scripts/eval_golden.mjs`, `scripts/eval/*.mjs` mới, `evals/golden/**` (chỉ thêm trường), `packages/core/src/agent/tools/handoff_to_staff.ts` + test, `packages/core/src/agent/prompts/{resident,triage}.ts` (chỉ theo mục 3d), `.env.example`, `planning/.../reports/R08_*.md` + `evidence/eval-real/**`, mở rộng vòng 2: `packages/core/src/agent/tools/save_job_draft.ts` + test DB mới (§11.11) / xong khi = viết lại máy chấm chạy qua vòng agent thật (không còn một lượt `callModel`), chứng minh máy chấm biết ĐỎ, chạy thật với Gemini và nộp số, vá `jobs.category_code` theo §11.11 + test / cấm (bằng lời mình) = không đụng `package.json`, `specs/**`, `plan.md`, `apps/**`, `packages/core/src/{runner,dev,adapters}/**`, không `git add -A`, không sửa kỳ vọng golden hay chèn đáp án golden vào prompt, không tự phán quyết report của mình.

Handoff: handoffs/H08_thi-cong_eval-real.md
Base: f85f02de55a8a1f295155f793b7d31ca129d6132
Head: 372cbae256eb786f8fabc790d7d953c04734685b

**Vòng 1 bị ngắt lúc 12:31 giữa lượt chấm thật (worker trước), CHƯA commit, CHƯA có R08.** Số vòng 1 (tham khảo, KHÔNG nộp — cây làm việc dở, `jobs.category_code` chưa được `save_job_draft` ghi cột): khẩn cấp 100/100 (lớp 1 44, lớp 2 6/56, 0 báo nhầm); đồng ý 42/44, 0 nhận nhầm; chẩn đoán **0/40** `thực tế=null` (căn nguyên: §11.11); trách nhiệm chưa chạy tới. Báo cáo này là **vòng 2**, tiếp tục từ cây làm việc đó (không viết lại từ đầu).

## 1. Lệnh + exit code (nguyên văn)

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| Bước 0 | `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 | (in trực tiếp, NÃO ĐÃ OK) |
| Baseline (trước §11.11, DB rỗng `lq_h08`) | `git rev-parse HEAD` + `npm run build` + `npm test` + `DATABASE_URL=…/lq_h08 npm run test:db` | 0 | [baseline](../evidence/eval-real/baseline.txt) |
| Sau §11.11 — typecheck | `npm run typecheck` | 0 | [typecheck](../evidence/eval-real/typecheck.txt) |
| Sau §11.11 — build | `npm run build` | 0 | [build](../evidence/eval-real/build.txt) |
| Sau §11.11 — test | `npm test` | 0 | [test](../evidence/eval-real/test.txt) |
| Sau §11.11 — test:db (DB rỗng `lq_h08`) | `DATABASE_URL=…/lq_h08 npm run test:db` | 0 | [test-db](../evidence/eval-real/test-db.txt) |
| Sau §11.11 — gate | `npm run gate` | 0 | [gate](../evidence/eval-real/gate.txt) |
| §3c — chứng minh máy chấm biết ĐỎ | `DATABASE_URL=…/lq_h08 node --import tsx scripts/eval/red-fake-model.mjs` | 0 (script tự lật: `decideExit≠0` ⇒ script thoát 0 = "biết đỏ") | [red-fake-model](../evidence/eval-real/red-fake-model.txt) |
| §3d — lượt chạy thật 1 | `DATABASE_URL=…/lq_h08 npx tsx --env-file=.env scripts/eval_golden.mjs` | 1 (`EVAL_GOLDEN_FAIL`: bộ `responsibility` chưa đạt ngưỡng) | [real-run-1](../evidence/eval-real/real-run-1.txt) |
| §3d — lượt chạy thật 2 (sau sửa prompt vòng 1) | `DATABASE_URL=…/lq_h08 npx tsx --env-file=.env scripts/eval_golden.mjs` | 3 — **NGƯỜI DÙNG RA LỆNH DỪNG lúc 16:07** giữa chừng vì quota Gemini hết hạn mức (429 `RESOURCE_EXHAUSTED` trên cả 3 model từ ~15:43); tiến trình bị `TaskStop`, nối tay dòng `STOPPED_BY_SO` + `EXIT:3` vào evidence, KHÔNG chạy lại | [real-run-2](../evidence/eval-real/real-run-2.txt) |

Sửa prompt vòng 1 (`resident.ts`, xem mục 5) **CHƯA CÓ SỐ SAU** (bị chặn bởi lệnh dừng) ⇒ **CHƯA COMMIT**, giữ nguyên trong worktree — diff đầy đủ ở mục 5. Không có vòng sửa prompt 2.

## 2. Test tổng/pass/fail/skip

`npm test` (không DB, dòng gate cuối — evidence/eval-real/gate.txt): **238/238/0/0** (web 24 · zalo-worker 37 · core 177 — lưu ý web/zalo-worker gồm cả phần của H09 chạy song song trên cùng cây, không thuộc phạm vi H08).
`npm run test:db` (DB rỗng `lq_h08`, evidence/eval-real/test-db.txt): **122/122/0/0** (core 84 · web 11 · zalo-worker 27). Core tăng từ 81 (baseline trước §11.11) → 84 (+3, đúng bằng 3 ca test mới của `p03-category-code.db.test.ts`); `npm test` core tăng từ 173 → 177 (+4, đúng bằng 4 ca `handoff_to_staff.test.ts`). Không giảm số test ở bất kỳ workspace nào, 0 skip.

## 3. `git diff --stat <Base>..<Head>` + SHA từng commit

[diff-stat](../evidence/eval-real/diff-stat.txt) (đã tách 2 commit + phần chưa commit) ·
`e6f2e08` fix(core): write jobs.category_code column in save_job_draft (SPEC-P03 §11.11) — 2 files, +213/-6 ·
`372cbae` feat(core,scripts): real-model eval scorer for P03 golden sets (Đ19-4, Đ21) — 6 files, +694/-154 ·
CHƯA COMMIT: `packages/core/src/agent/prompts/resident.ts` — 1 file, +3/-3 (giữ nguyên chưa commit theo lệnh dừng).

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a, b, c (máy chấm vòng agent thật + ngữ nghĩa exit + red-fake-model) | 🟠 | Sonnet 5 |
| d (sửa prompt theo số trước/sau) | 🟠 | Sonnet 5 — chỉ làm được **vòng 1** (sửa `resident.ts`); vòng 2 bị chặn bởi lệnh dừng khẩn (quota), KHÔNG có số sau — không tự ý commit |
| e (`HUMAN_TAKEOVER_MIN` + `.env.example`) | 🟢 | Sonnet 5 |
| §11.11 (mở phạm vi vòng 2: `save_job_draft.ts` + test DB) | 🔴 theo Đ23 (Super Orchestrator đã quyết hợp đồng) · thi công mã đúng hợp đồng đã chốt = 🟠 | Sonnet 5 |

## 5. Việc KHÔNG làm + lý do

- **Không hoàn tất vòng chạy thật lần 2** (đo số "sau" của sửa prompt `resident.ts`): người dùng ra lệnh dừng lúc 16:07 vì key Gemini hết hạn mức (429 `RESOURCE_EXHAUSTED` trên `gemini-3.6-flash`, `gemini-3-flash-preview`, `gemini-3.5-flash-lite`, mọi `agent_runs` route `diagnose` đã `outcome=error` từ ~15:43). Diff prompt (mục 3) giữ nguyên CHƯA COMMIT theo đúng chỉ đạo — không có bằng chứng "sau" nên không thể khẳng định sửa có tác dụng, không tự ý commit một thay đổi chưa đo được.
- **Không chạy lại real-run-2 hay thử model khác**: lệnh dừng cấm tường minh ("KHÔNG chạy lại, KHÔNG thử model khác").
- **Không sửa `triage.ts`**: mục 3d chỉ cho phép sửa khi trượt ngưỡng; bộ liên quan tới triage (`emergency`, `consent`) đều đã đạt ngưỡng ở real-run-1, không có lý do để sửa.
- **Không đụng `apps/**`, `packages/core/src/{runner,dev,adapters}/**`, `db/migrations/005_*`**: thuộc phạm vi H09 chạy song song — quan sát các file đó đổi trong `git log`/`git status` nhưng không đọc/sửa nội dung.
- **Không backfill dữ liệu hay thêm migration cho §11.11**: SPEC-P03 §11.11 CẤM tường minh (cột đã có từ `001_init.sql`, DB dev/sim dựng lại được).

## 6. Câu hỏi mở (cần người)

1. **Quota Gemini hết hạn mức** (429 `RESOURCE_EXHAUSTED`, cả 3 model từ ~15:43 2026-09-25) — cần người kiểm hạn mức/billing của key `GEMINI_API_KEY` trước khi chạy lại bất kỳ lượt chấm thật nào (vòng 2 của gói d, hoặc nghiệm thu G08–G10 sau này).
2. **Bộ golden `responsibility` — 4 ca trượt R25/R26/R27/R29 (real-run-1, kỳ vọng `unclear`)**: đọc lại nội dung 4 ca này cho thấy chúng là **câu hỏi về hiệu lực/áp dụng quy chế đã hết hạn/deprecated** ("quy định cũ về điện trong căn hết hiệu lực từ 2020 có còn dùng được không", "áp dụng quy định thay trần cũ đã deprecated"...), KHÔNG phải mô tả sự cố hỏng hóc như phần lớn bộ `responsibility` còn lại. Cần người xác nhận: (a) đây có đúng là dạng câu hỏi agent PHẢI xử lý ở P03 hay không (SPEC-P03 §3/§4 mô tả luồng "báo việc hỏng", không nói rõ luồng "hỏi về quy chế"); (b) nếu đúng phạm vi, sửa prompt vòng 1 (mục 3, 5) đã thêm hướng dẫn chung "câu hỏi về quy chế ⇒ bỏ qua bước hỏi lại, vào thẳng search_regulations; không tìm được trích dẫn còn hiệu lực ⇒ gọi classify_responsibility ngay với unclear" — nhưng CHƯA CÓ SỐ ĐO xác nhận sửa này có tác dụng (bị chặn bởi lệnh dừng); cần một lượt chạy thật (khi quota hồi phục) để đo trước khi quyết định commit hay bỏ.

## 7. Tiếp theo

🖐 Cần tay người: kiểm tra/nâng hạn mức key `GEMINI_API_KEY` (hoặc xác nhận thời điểm quota reset), rồi cho phép chạy lại **đúng một** lượt chấm thật để đo số "sau" của sửa prompt `resident.ts` đang treo chưa commit · 🤖 Agent làm được ngay: khi quota hồi phục và được phép — tạo lại `lq_h08`, chạy `npx tsx --env-file=.env scripts/eval_golden.mjs`, ghi số trước/sau vào report, commit prompt nếu số cải thiện (hoặc bỏ diff nếu không) · ⭐ Nên làm trước: xác nhận Câu hỏi mở #2 (phạm vi P03 có bao gồm "hỏi về hiệu lực quy chế" không) trước khi chi thêm quota cho vòng chạy kế — tránh sửa prompt cho một luồng có thể ngoài phạm vi SPEC · ⏸ Chưa làm: đo số "sau" của sửa prompt (mục 5), commit hoặc bỏ diff `resident.ts`, mở khóa gate G08–G10 (còn phụ thuộc kết quả responsibility đạt ngưỡng 90%).

## SO phán câu hỏi mở (2026-09-25 16:40)
- Q1 quota: Đ24 — chấm lại qua OpenRouter bằng CÙNG model `google/gemini-3.6-flash` sau khi H10 (nhánh adapter `openrouter`, 01-CONTRACTS §2c) được duyệt.
- Q2 R24–R29: TRONG phạm vi, giữ nguyên kỳ vọng. Căn cứ dữ liệu QC-DEMO: R29 không mô tả hỏng hóc nào mà agent kết luận `resident`; R25 (trần) có hai mục trái chiều theo nguyên nhân (sec05 BQL / sec06 cư dân) mà agent chốt `resident` — đổ trách nhiệm cho cư dân khi thiếu dữ kiện là hướng sai nguy hiểm nhất (BB-03). R26/R27 `null` = hỏi vòng không kết luận. Sửa prompt đang treo (thiếu căn cứ ⇒ `unclear` ngay, câu hỏi quy chế ⇒ không hỏi lại) đúng hướng, là hướng dẫn chung, không chèn đáp án golden ✅.
- SO đã soát `e6f2e08` (§11.11): cả 3 nhánh ghi cột cùng câu lệnh với `draft`, thứ tự tham số đúng. Đo lại toàn gói để SAU lượt chấm vòng 3 (tránh đo khi H10 đang sửa adapter trên cùng cây).
- Việc còn lại của H08 (vòng 3, sau R10 ✅): `MODEL_PROVIDER=openrouter` chạy lại đủ 4 bộ một lần với prompt đang treo ⇒ `real-run-3.txt`; đạt ⇒ commit prompt; trượt ⇒ còn đúng 1 vòng sửa theo mục 3d.

## Vòng 3 (2026-09-25, provider `vyce`/`deepseek-v4-flash` — Đ25 sau khi OpenRouter 0 USD)

Lệnh: `lq_h08` tạo lại rỗng → migrate + seed + `DATA_MODE=sim` seed:sim → `MODEL_PROVIDER=vyce DATA_MODE=sim TRIAGE_TIMEOUT_MS=8000 npx tsx --env-file=.env scripts/eval_golden.mjs`. Dòng đầu evidence xác nhận đúng provider: `provider=vyce building=f5162a3c-222a-4a88-b066-c4a7457ff6b5 apartments=20`. Prompt `resident.ts` đang treo (mục 5) GIỮ NGUYÊN để chạy, KHÔNG sửa thêm cho lượt này.

**SO dừng giữa chừng lúc 17:46** (bộ `responsibility` chưa kịp chạy) sau khi đọc số của 3 bộ đầu, quyết định KHÔNG làm vòng sửa prompt cho DeepSeek — số kém là do chất lượng model (đã đối chiếu DB: tool VẪN được gọi — 13 `save_job_draft`, 8 `search_regulations`, 4 `classify_responsibility` — nhưng DeepSeek hỏi dồn 3 câu một lượt, không lưu nháp sớm; triage trả `emergency=null` kèm `emergency_confidence` 0.95–1, tức model tự mâu thuẫn), không phải lỗi adapter `vyce` (nhánh đã duyệt R11 ✅). Tiến trình bị dừng tay (`TaskStop`), nối `STOPPED_BY_SO: deepseek-v4-flash duoi nguong, khong sua prompt cho model khong dung that` + `EXIT:1` vào [real-run-3](../evidence/eval-real/real-run-3.txt).

### Bảng bộ → ngưỡng → số (vyce/deepseek-v4-flash) — **bằng chứng so sánh model, KHÔNG phải số dùng để đóng gate G08–G10** (gate đóng bằng lượt Gemini/OpenRouter đạt ngưỡng)

| Bộ | Ngưỡng | Số đo (vyce/deepseek-v4-flash) | Đạt/trượt |
| :-- | :-- | :-- | :-- |
| emergency | 0 bỏ sót, báo nhầm ≤5% | 91/100 pass, layer1=44 layer2=13/56, **bỏ sót=1** (E02), **báo nhầm=8 (8.0%)** | ❌ |
| consent | 0 nhận nhầm, recall ≥90% | 41/44 pass, **nhận nhầm=2** (K31, K43), recall=96.0% (bỏ sót K25) | ❌ |
| diagnosis | ≥85% đúng category_code | 2/40 scored=40, **rate=5.0%**, avg_questions=3.80, blocked=0 | ❌ |
| responsibility | ≥90% đúng party, citation 100% | **KHÔNG CHẠY TỚI** — SO dừng trước khi bộ này bắt đầu | — |

Đối chiếu cùng bộ golden, cùng prompt (chưa sửa), lượt Gemini real-run-1: emergency 100/100, consent 42/44 (0 nhận nhầm), diagnosis 36/37 (97.3%) — chênh lệch lớn xác nhận kết luận của SO: `deepseek-v4-flash` dưới ngưỡng dùng thật cho P03 ở cấu hình hiện tại, không phải lỗi mã.

### Số ca triage quá hạn/lỗi

`audit_log action='triage.unavailable'` (tự đo trên `lq_h08` trước khi drop, không lấy lời kể): **33** ca (trên tổng 297 lượt gọi route `triage`, ~11%) dù `TRIAGE_TIMEOUT_MS=8000` (gấp đôi mặc định 4000) — `deepseek-v4-flash` chậm/lỗi ở route triage đáng kể hơn Gemini.

### Token/latency theo route (toàn bộ `agent_runs` của lượt vyce, đo trực tiếp trên DB trước khi drop)

| route | calls | input_tokens | output_tokens | avg_latency_ms |
| :-- | :-- | :-- | :-- | :-- |
| diagnose | 215 | 701795 | 47078 | 4765 |
| triage | 297 | 352395 | 47768 | 3453 |

Số lượt gọi tool (`audit_log action LIKE 'tool.%'`): `save_job_draft`=13, `search_regulations`=8, `classify_responsibility`=4 — xác nhận quan sát của SO: trên 40 ca diagnosis, phần lớn (27/40) KHÔNG có nổi một lần `save_job_draft` trong 4 lượt (DeepSeek dồn câu hỏi, không lưu nháp sớm như prompt yêu cầu ở bước 1).

### Diff prompt (không đổi so mục 3/5 — vẫn CHƯA COMMIT)

Không có thay đổi mới ở vòng 3 — `resident.ts` giữ nguyên diff đã ghi ở mục 3/5 (giữ nguyên để chạy theo đúng lệnh, không sửa thêm cho một lượt biết trước là model yếu). Xem [diff-stat](../evidence/eval-real/diff-stat.txt) (không cập nhật ở vòng này vì không có commit mã mới) và diff nguyên văn ở mục 5.

### Đã làm theo lệnh dừng vòng 3

1. Dừng tiến trình (`TaskStop` 2 task nền), giữ nguyên `real-run-3.txt`, nối `STOPPED_BY_SO`+`EXIT:1`.
2. KHÔNG commit, KHÔNG sửa thêm `resident.ts` — vẫn treo chờ lượt Gemini/OpenRouter.
3. Mục "## Vòng 3" này + evidence commit riêng `docs(plan-01): report R08 round 3`.
4. `lq_h08` đã drop sau khi đo xong `audit_log`/`agent_runs` (mục trên).

⏳ Chờ người duyệt.

## Vòng 4 (2026-09-25/26, provider `gemini`/`gemini-3.6-flash` — Đ26, sau probe SO 22:50 xác nhận quota hồi)

Lệnh: Docker Desktop (dừng sẵn ở đầu phiên) khởi động lại tự phục hồi (Tầng 1) → `lq_h08` tạo lại rỗng (`docker exec lenqclaw-db-1 psql … DROP/CREATE DATABASE`) → `npm run build -w @lenqclaw/core` → migrate + seed + `DATA_MODE=sim` seed:sim → `MODEL_PROVIDER=gemini DATA_MODE=sim DATABASE_URL=postgres://lenqclaw:***@127.0.0.1:55432/lq_h08 npx tsx --env-file=.env scripts/eval_golden.mjs > evidence/eval-real/real-run-4.txt` (chặn tiền cảnh; lệnh vượt 10 phút nên chuyển nền tự động theo luật, không sửa lại thành `&`). Dòng đầu evidence xác nhận đúng provider: `provider=gemini building=fbf5cae4-830a-45b2-9182-57596d1dd682 apartments=20`. Prompt `resident.ts` đang treo (mục 5) GIỮ NGUYÊN, KHÔNG sửa trước lượt này. Evidence: [real-run-4](../evidence/eval-real/real-run-4.txt), exit code nguyên văn (nối tay từ log nền, script không tự ghi vào file redirect): `EXIT:3`.

### Bảng bộ → ngưỡng → số (gemini/gemini-3.6-flash, vòng 4) — so với real-run-1 (vòng 1, cùng model, prompt CHƯA sửa)

| Bộ | Ngưỡng | Vòng 4 (số đo) | Đạt/trượt | Vòng 1 (đối chiếu) |
| :-- | :-- | :-- | :-- | :-- |
| emergency | 0 bỏ sót, báo nhầm ≤5% | 97/100 pass, layer1=44, layer2=3/56, **bỏ sót=3** (E08, E09, E42), báo nhầm=0 (0.0%) | ❌ (bỏ sót>0) | 100/100 pass, 0 bỏ sót, 0 báo nhầm — ✅ |
| consent | 0 nhận nhầm, recall ≥90% | 42/44 pass, nhận nhầm=0, recall=92.0% (bỏ sót K20, K25) | ✅ | 42/44 pass, 0 nhận nhầm, recall=92.0% — ✅ (giống hệt, cùng 2 ca bỏ sót) |
| diagnosis | ≥85% đúng category_code | **`blocked` (>10% ca lỗi hạ tầng: 40/40 ca)** | `blocked` | 37/40 scored, 36 pass, rate=97.3%, blocked=3 — ✅ |
| responsibility | ≥90% đúng party, citation 100% | **`blocked` (>10% ca lỗi hạ tầng: 30/30 ca)** | `blocked` | 30/30 scored, 26 pass, rate=86.7%, citation 25/25 — ❌ (R25–R29) |

Kết quả tổng (`decideExit`, `scripts/eval/score.mjs:379-384`): có bộ `blocked` ⇒ toàn cục **exit 3**, bất kể 2 bộ còn lại đã có số thật. Theo đúng chỉ đạo mục 9 (Đ26, gạch đầu dòng 4): "429 RESOURCE_EXHAUSTED dồn dập (máy chấm báo bộ `blocked`) ⇒ dừng, nộp `blocked`, KHÔNG chuyển provider" — hai bộ `diagnosis`/`responsibility` rơi đúng định nghĩa `blocked` của máy chấm (header `scripts/eval_golden.mjs` dòng 13-16: lỗi 429/5xx/mạng trên từng ca ⇒ `agent_runs.outcome='error'` riêng ca đó, >10% một bộ ⇒ cả bộ `blocked`) — `diagnose` route lỗi 267/277 ca (96.4%), `triage` route lỗi 342/346 ca (98.8%), toàn DB. `agent_runs.avg_latency_ms` route `diagnose`=14433ms (so với 10889ms vòng 1, cùng cỡ nhưng số cuộc gọi thành công cực ít) khớp mẫu hình quota bị ép: request đi qua đủ retry/fallback rồi mới lỗi, không phải lỗi tức thời. Máy chấm KHÔNG lưu message lỗi thô (chỉ `outcome` + đếm), nên không trích được chuỗi "429/RESOURCE_EXHAUSTED" nguyên văn từ DB — kết luận dựa trên đúng định nghĩa `blocked` mà máy chấm tự áp dụng (không phải suy diễn của worker) + đối chiếu độ trễ.

**Dừng tại đây theo đúng chỉ đạo**: KHÔNG chuyển provider, KHÔNG chạy vòng sửa prompt (mục 3d chỉ áp dụng khi "trượt ngưỡng", không áp dụng khi `blocked` do hạ tầng), KHÔNG commit `resident.ts` (diff vẫn treo, chưa có lượt "đạt cả 4" để đo tác dụng).

### Số ca triage quá hạn/lỗi (`audit_log action='triage.unavailable'`, đo trên `lq_h08` trước khi drop)

**269** ca (trên tổng 346 lượt gọi route `triage` — 77.7%), cao hơn nhiều so với vòng 3 (`vyce`: 33/297 ≈ 11%) — xác nhận đây là sự cố hạ tầng/quota của lượt Gemini này, không phải chất lượng model (model đã chứng minh tốt hơn hẳn `vyce` ở vòng 3 trên đúng 2 bộ chạy được, xem bảng trên).

### Token/latency theo route (toàn bộ `agent_runs` của lượt gemini vòng 4, đọc thẳng từ `real-run-4.txt`)

| route | calls | input_tokens | output_tokens | avg_latency_ms |
| :-- | :-- | :-- | :-- | :-- |
| diagnose | 277 | 29665 | 1066 | 14433 |
| triage | 346 | 3043 | 138 | 257 |

So với vòng 1 (diagnose calls=297 input=829771 output=24997 avg=10889ms; triage calls=178 input=89323 output=3671 avg=1086ms): input/output tokens vòng 4 thấp hơn nhiều dù số `calls` gần bằng — phần lớn "calls" vòng 4 là các lượt gọi lỗi sớm (retry/backoff bị chặn trước khi model sinh nội dung), không phải do đổi cấu hình prompt/route.

### Diff prompt

Không đổi so mục 3/5/Vòng 3 — `resident.ts` vẫn GIỮ NGUYÊN diff cũ, CHƯA COMMIT (theo đúng chỉ đạo: không sửa prompt cho lượt bị `blocked` do hạ tầng).

### Đã làm theo mục 9 (vòng 4)

1. Docker Desktop dừng sẵn khi bắt đầu phiên (Tầng 1 hạ tầng) — tự khởi động lại, xác minh `docker ps` trước khi đụng DB.
2. Tạo lại `lq_h08` rỗng, migrate+seed+seed:sim, build lại core để `dist/**` khớp prompt đang treo.
3. Chạy đúng MỘT lượt `MODEL_PROVIDER=gemini` đủ 4 bộ, chặn tiền cảnh (tự động chuyển nền khi vượt 10 phút, không đổi cờ `&`), redirect thẳng `real-run-4.txt`.
4. Kết quả `blocked` (2/4 bộ) ⇒ dừng đúng chỉ đạo, KHÔNG chuyển provider, KHÔNG sửa prompt, KHÔNG commit `resident.ts`.
5. `lq_h08` đã drop sau khi đo xong `audit_log`/`agent_runs` (mục trên).
6. Mục "## Vòng 4" này + evidence commit riêng `docs(plan-01): report R08 round 4`.

### Câu hỏi mở (vòng 4)

1. **Quota Gemini vẫn bị ép giữa lượt chạy thật** dù probe 22:50 báo HTTP 200 — có thể quota hồi phục tạm thời rồi cạn lại khi tải nhiều request liên tiếp (đủ 4 bộ gọi ~600+ lượt model). Cần người xác nhận hạn mức thật sự (RPD/RPM) của key `GEMINI_API_KEY` trước khi cho phép vòng chạy kế, hoặc cân nhắc giãn `PACER_MIN_INTERVAL_MS`/`PACER_MAX_PER_MINUTE` (ngoài phạm vi H08 — thuộc cấu hình hệ thống, không phải prompt).
2. **`emergency` trượt mới xuất hiện** (3 bỏ sót E08/E09/E42, vòng 1 là 0/100) — đúng lúc `triage` route lỗi hạ tầng 342/346 lượt; nhiều khả năng 3 ca bỏ sót này rơi vào các request bị lỗi hạ tầng (không tính vào `blocked` vì bộ `emergency` chưa vượt ngưỡng 10% lỗi, nhưng từng ca lỗi lẻ tẻ vẫn có thể kéo kết quả sai theo hướng "bỏ sót" nếu máy chấm coi lỗi = không phát hiện khẩn cấp). Cần người xác nhận: số này có phản ánh đúng chất lượng model, hay là nhiễu do cùng đợt lỗi hạ tầng — quyết định có cần chạy lại (vòng 5, vẫn tính là "1 lần" theo mục 9) khi hạ tầng ổn định hơn.

⏳ Chờ người duyệt.

## SO phán vòng 4 (2026-09-26)
- SO đo lại: evidence dòng 1 `provider=gemini` ✅; `diagnosis` blocked 40/40, `responsibility` blocked 30/30; commit `3be813e` chỉ report + evidence; `resident.ts` vẫn chưa commit ✅. Worker làm đúng mục 9 (blocked ⇒ dừng, không đổi provider, không vòng sửa prompt).
- Căn nguyên: hạn mức Gemini không đủ cho MỘT lượt đủ 4 bộ (~600 lượt gọi model); probe 1 request trả 200 không chứng minh đủ quota (G26). Số emergency/consent vòng 4 KHÔNG dùng để chấm gate — lượt bị nhiễm lỗi hạ tầng.
- Phát hiện an toàn (không phải lỗi của gói): 3 ca khẩn cấp gián tiếp (E08, E09, E42) bị bỏ sót khi lớp 2 (`triage`) và lớp 3 (agent chính) cùng chết — đúng như SPEC-P03 §11.1 cho phép ("lỗi ⇒ chỉ còn lớp 1 + 3"), nhưng khi model sập toàn phần thì chỉ còn lưới từ khoá. Đưa vào Câu hỏi mở cho người (đường lùi khi model sập: báo hotline/đẩy người), KHÔNG sửa trong H08.
- Gate G08–G10 giữ ⬜. Lượt kế chỉ chạy khi người xác nhận quota/billing đủ cho một lượt đủ 4 bộ (hoặc duyệt chấm chia bộ theo ngày, cùng model + prompt).

⛔ DỪNG: quota Gemini cạn giữa lượt (route diagnose 96% lỗi, triage 99% lỗi) — chờ người chốt quota/billing trước lượt chấm kế.

## Vòng 5 (2026-09-26, Đ29 — cham bu theo route, CHUA chay luot that)

Bối cảnh (Đ29, plan.md §2): gate gắn với cặp (model, prompt) theo TỪNG ROUTE — `emergency`/`consent` chấm route `triage` (prompt `triage.ts`, KHÔNG đổi từ real-run-1) nên số real-run-1 (100/100; 42/44, 0 nhận nhầm) GIỮ giá trị cho G08; `diagnosis`/`responsibility` chấm agent chính (prompt `resident.ts` đang treo) nên chỉ hai bộ này cần chấm lại. Việc của vòng này CHỈ là thêm cờ chọn bộ cho máy chấm (H08 §10) — **KHÔNG chạy lượt thật** (Gemini vẫn chờ quota), `resident.ts` GIỮ NGUYÊN chưa commit (mục 3/5).

### Việc đã làm

1. `scripts/eval/args.mjs` (mới): `parseSetArg(argv)` thuần (không `process.exit`) — không có `--set` ⇒ `{ok:true, sets:null}` (chạy đủ 4 bộ, hành vi cũ); có `--set <tên>[,<tên>]` hợp lệ ⇒ `{ok:true, sets:Set}`; thiếu giá trị hoặc tên lạ ⇒ `{ok:false, error}`. `shouldRun(sets, name)` + `setsLabel(sets)`.
2. `scripts/eval/run.mjs` (mới): `runSelectedSets(...)` — vòng lặp chạy/in log CHUNG cho cả `scripts/eval_golden.mjs` (CLI thật) và `scripts/eval/red-fake-model.mjs` (kịch bản đỏ), nhận `scorers` tiêm được (mặc định = hàm thật từ `score.mjs`) để test gọi trực tiếp với hàm cham GIẢ, không cần DB. Bộ không chạy ⇒ in `<tên>: skipped (--set)`; `results` trả về CHỈ chứa key của bộ đã chạy ⇒ `decideExit(results)` tự động bỏ qua bộ skip (không đọc lại logic `decideExit` trong `score.mjs`).
3. `scripts/eval_golden.mjs`: parse `--set` NGAY ĐẦU `main()`, tên lạ ⇒ `console.error` + `process.exit(2)` — kiểm TRƯỚC `hasCredential()` (không cần DB/credential để báo lỗi cờ). Dòng đầu log giữ `provider=…` + thêm `sets=…` (`all` khi không lọc). Gọi `runSelectedSets(...)` thay cho gọi tuần tự 4 hàm cham như bản cũ; `decideExit(results)` thay vì object cứng 4 khoá.
4. `scripts/eval/red-fake-model.mjs`: thêm `--set` (dùng chung `args.mjs`/`run.mjs`), giữ nguyên client model GIẢ (`setModelClientForTest`/`setTriageClientForTest`, không gọi mạng) và ngữ nghĩa exit cũ (`RED_TEST_OK` khi `decideExit(results) !== 0`).
5. `scripts/eval/set-flag.test.mjs` (mới, test THUẦN): Phần 1 (không DB) — (3) không cờ ⇒ `sets=null`, `shouldRun` true cho cả 4 tên; (2) tên lạ ⇒ `parseSetArg` trả `ok:false` VÀ end-to-end `node scripts/eval_golden.mjs --set bogus` ⇒ exit 2 thật (không cần DB/credential); (1) `runSelectedSets({sets:[diagnosis,responsibility]})` với 4 hàm cham GIẢ (spy) ⇒ `scoreEmergencySet`/`scoreConsentSet` bị gọi thì THROW (chứng minh KHÔNG được gọi — đếm=0), `scoreDiagnosisSet`/`scoreResponsibilitySet` được gọi đúng 1 lần, `results` chỉ có 2 khoá; thêm ca đối chứng `sets=null` gọi đủ cả 4. Phần 2 (BẮT BUỘC `DATABASE_URL` — DB `lq_h08` rỗng đã migrate+seed+seed:sim): chạy THẬT `node --import tsx scripts/eval/red-fake-model.mjs --set responsibility` (client model vẫn GIẢ, không mạng) ⇒ xác nhận vẫn `RED_TEST_OK` (đỏ đúng) khi chỉ lọc MỘT bộ.

### Lệnh + exit code (nguyên văn) + số test

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| Phần 1 test (không DB) | `node scripts/eval/set-flag.test.mjs` (không `DATABASE_URL`) | 1 (đúng kỳ vọng script tự dừng ở "phần 2 chưa chạy vì thiếu `DATABASE_URL`" — 7/7 PASS phần 1) | chạy tay, không lưu riêng (xem phần dưới, evidence gộp `set-flag-test.txt` là bản CÓ `DATABASE_URL`, chạy đủ cả 2 phần) |
| DB setup | tạo lại `lq_h08` rỗng → `db:migrate` → `db:seed` → `DATA_MODE=sim db:seed:sim` | 0 | (không redirect riêng, log ngắn) |
| `npm run typecheck` (không `DATABASE_URL`) | | 0 | [typecheck-v5](../evidence/eval-real/typecheck-v5.txt) |
| `npm test` (không `DATABASE_URL`) | | 0 — Test Files 4+6+11=21 passed, Tests 24+37+190=**251 passed** (baseline vòng 4: 238 — tăng do nhánh H09 chạy song song trên cùng cây, KHÔNG phải test của gói này; gói này không thêm test vào bất kỳ workspace vitest nào vì `scripts/` không phải workspace) | [test-v5](../evidence/eval-real/test-v5.txt) |
| `DATABASE_URL=…/lq_h08 npm run test:db` (DB rỗng) | | 0 — Tests core+web+zalo-worker đều pass (dòng cuối mỗi khối `passed`) | [test-db-v5](../evidence/eval-real/test-db-v5.txt) |
| `npm run gate` (không `DATABASE_URL`) | | 0 | [gate-v5](../evidence/eval-real/gate-v5.txt) |
| `DATABASE_URL=…/lq_h08 node scripts/eval/set-flag.test.mjs` (đủ cả 2 phần) | | 0 — `SET_FLAG_TEST (phan 1, khong DB): 7 passed, 0 failed`; `SET_FLAG_TEST_DB: red-fake-model --set responsibility exit=0 (PASS)`; `SET_FLAG_TEST_FINAL: PASS` | [set-flag-test](../evidence/eval-real/set-flag-test.txt) |
| `git diff --stat` (Base `f85f02d`..commit mã) | | — 5 files, +635/-154 (`args.mjs`, `run.mjs`, `set-flag.test.mjs` mới; `eval_golden.mjs`, `red-fake-model.mjs` sửa) | [diff-stat-v5](../evidence/eval-real/diff-stat-v5.txt) |

Bằng chứng cốt lõi (trích từ `set-flag-test.txt`, phần 2 DB): với `--set responsibility`, log in đúng `[RED] emergency: skipped (--set)` / `[RED] consent: skipped (--set)` / `[RED] diagnosis: skipped (--set)`, CHỈ bộ `responsibility` chạy thật (`total=30 scored=30 pass=0 rate=0.0% ok=false`), và `RED_TEST_OK: may cham bao do dung nhu ky vong (exit 1 != 0)` ⇒ script thoát 0 (đỏ đúng, đúng MỘT bộ). Chứng minh (1) và ý "`red-fake-model` vẫn đỏ với `--set responsibility`" của H08 §10.

`git grep -n "AIza"` (repo, trừ các dòng tài liệu hoa mô tả chính chuỗi kiểm tra trong handoff/report cũ — không phải key thật) và `grep -rn "AIza" evidence/eval-real/`: rỗng trong `evidence/eval-real/`.

### Commit

`0347210` `feat(scripts): add --set filter to eval scorer (D29)` — 5 files, +635/-154 (`scripts/eval/args.mjs`, `scripts/eval/run.mjs`, `scripts/eval/set-flag.test.mjs` mới; `scripts/eval_golden.mjs`, `scripts/eval/red-fake-model.mjs` sửa). `resident.ts` GIỮ NGUYÊN CHƯA COMMIT (không stage, không đụng nội dung).

### Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| Cờ `--set` cho `eval_golden.mjs`/`red-fake-model.mjs` + `args.mjs`/`run.mjs` | 🟠 | Sonnet 5 |
| `set-flag.test.mjs` (test THUẦN chứng minh 3 điều H08 §10 yêu cầu) | 🟠 | Sonnet 5 |

### Việc KHÔNG làm + lý do

- **Không chạy lượt chấm thật với Gemini** — H08 §10 CẤM tường minh ("CẤM chạy máy chấm với model thật ở vòng này"); Gemini vẫn đang chờ quota theo Câu hỏi mở vòng 4.
- **Không đụng `resident.ts`** — CẤM tường minh, prompt vẫn treo chưa commit từ vòng 1.
- **Không đổi ngưỡng, không đổi golden, không đổi ngữ nghĩa exit của bộ đã chạy** — chỉ thêm lớp lọc bên ngoài `decideExit`/`score.mjs`, không sửa logic chấm của từng bộ.
- **Không sửa `scripts/eval/score.mjs`** — không cần thiết; toàn bộ logic lọc nằm ở `args.mjs`/`run.mjs` mới, `score.mjs` giữ nguyên 100%.

### Câu hỏi mở (vòng 5)

Không có câu hỏi mở mới — vòng này thuần kỹ thuật (thêm cờ), không đụng số đo/ngưỡng. Câu hỏi mở còn treo từ vòng 4 (quota Gemini) vẫn giữ nguyên, chưa có cập nhật.

### Bước kế tiếp (khi quota đủ)

Chạy MỘT lượt `--set diagnosis,responsibility` với Gemini thật (giữ nguyên `resident.ts` đang treo hoặc sửa theo mục 3d nếu trượt), so với real-run-1 cho hai bộ này; `emergency`/`consent` GIỮ số real-run-1 (không chấm lại) theo đúng Đ29, trừ khi `triage.ts`/`triage.ts` (agent) hoặc `MODEL_TRIAGE` đổi.

⏳ Chờ người duyệt.

## SO phán vòng 5 (2026-09-26)
- SO đo lại: `0347210` chỉ 5 file `scripts/eval*` ✅ · `08f3830` chỉ report + evidence ✅ · `resident.ts` không bị stage ✅ · `node scripts/eval_golden.mjs --set bogus` ⇒ exit 2 ✅ · `set-flag.test.mjs` trên DB rỗng riêng của SO (`lq_so_v5`, đã drop) ⇒ 7/7 + phần DB PASS, `red-fake-model --set responsibility` chỉ chạy bộ responsibility (0/30) và 3 bộ `skipped` ✅ · `npm run gate` (không DB) exit 0, core 190 test, 0 skip ✅.
- H08 CHƯA đóng: còn lượt Gemini `--set diagnosis,responsibility` (Đ29) khi quota ngày hồi.

✅ DUYỆT: vòng 5 (cờ `--set`, Đ29).
