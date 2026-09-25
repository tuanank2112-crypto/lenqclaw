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

⏳ Chờ người duyệt.
