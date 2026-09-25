1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ17–Đ21) → `specs/SPEC-P03-Resident-Agent.md` §10.6, §11 (nhất là §11.1, §11.5, §11.6, §11.10) → `specs/TESTING-ACCEPTANCE.md` §3–§4 → `reports/R05_tham-dinh_P03.md` §8 (vì sao máy chấm cũ không đo được gì) → `docs/core.md` → `scripts/eval_golden.mjs`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. Agent cư dân P03 đã duyệt mã; gate G08 (khẩn cấp), G09 (chẩn đoán), G10 (trách nhiệm) còn ⬜ vì chưa có số đo bằng model thật. Máy chấm hiện có (`scripts/eval_golden.mjs`) chấm một lượt `callModel` — thẩm định R05 chứng minh model giả trả mọi nhãn vẫn đạt 40/40, nên Đ19-4 cấm dùng số đó. Việc của bạn: viết lại máy chấm để đo đúng hành vi agent thật + lớp hiểu ý (Đ21), rồi CHẠY với Gemini thật và nộp số.
`.env` ở root có `GEMINI_API_KEY` (gitignore) — chỉ nạp bằng `--env-file=.env`; CẤM in/cat/echo/ghi key vào file, evidence, commit. Song song với bạn, worker khác làm Zalo (`apps/zalo-worker`, `apps/web` trang `/zalo`, `packages/core/src/{runner,dev}`, migration 004, `package.json`) — KHÔNG đụng. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432`; tạo database riêng `lq_h08`, CẤM đụng database khác, drop khi xong.

## 2. PHẠM VI
ĐƯỢC GHI: `scripts/eval_golden.mjs` (viết lại; có thể tách module con `scripts/eval/*.mjs` mới), `evals/golden/**` (CHỈ thêm trường kịch bản như `answers`; CẤM đổi `expected_*`/`expect_*` đã có), `packages/core/src/agent/tools/handoff_to_staff.ts` (env `HUMAN_TAKEOVER_MIN` mặc định 60, §11.6) + test của nó, `packages/core/src/agent/prompts/{resident,triage}.ts` (chỉ theo mục 3d), `.env.example`, `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R08_thi-cong_eval-real.md, evidence/eval-real/**}`.
CẤM ĐỤNG: `package.json`/`package-lock.json` (giữ tên lệnh `eval:golden`), `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `.env`, `db/migrations/**`, `apps/**`, `packages/core/src/{runner,dev,adapters}/**`, mọi file agent/tool khác ngoài danh sách trên.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Máy chấm 4 bộ, chạy trên DB đã migrate + seed + seed:sim (`DATA_MODE=sim`), mỗi ca một cư dân/hội thoại sim mới:
   - `diagnosis`: đi qua `routeInboundEvent`/vòng agent thật; agent hỏi lại ⇒ trả lời bằng `answers[i]` của ca (thiếu ⇒ câu cố định "Dạ em không rõ thêm, anh/chị cứ ghi nhận giúp em"), tối đa 4 lượt; đọc `jobs.category_code` từ DB; đếm câu hỏi của agent trước `save_job_draft`. Ngưỡng TESTING §3.
   - `responsibility`: vòng agent thật với `symptom_query`; đọc `jobs.responsibility.party` + kiểm citation (tồn tại, cùng tòa, còn hiệu lực, nhãn khớp). Ngưỡng TESTING §3.
   - `emergency`: hai lớp gộp theo §11.1 (`detectEmergency` rồi `triageMessage` thật, ngưỡng `TRIAGE_EMERGENCY_MIN`): 0 bỏ sót, báo nhầm ≤ 5%; in riêng số lớp 1 và lớp 2.
   - `consent`: luật chấp nhận của §11.5 (danh sách + triage `consent` ≥ 0.8) trên từng câu: 0 đồng ý sai, ≥ 90% đồng ý thật.
b. Ngữ nghĩa mã thoát: thiếu credential của provider ⇒ in `blocked`, exit 3; ca lỗi 429/5xx/mạng ⇒ đánh `blocked` riêng từng ca, >10% ca của một bộ blocked ⇒ bộ đó `blocked`, exit 3; mọi bộ đạt ⇒ exit 0; có bộ trượt ⇒ exit 1. In từng ca trượt (`case_id`, kỳ vọng, thực tế) + tổng token/latency theo route từ `agent_runs`.
c. Chứng minh máy chấm biết ĐỎ: chạy với model giả trả mọi nhãn / trả rác ⇒ exit 1 (test hoặc lệnh có evidence).
d. Chạy thật: `npx tsx --env-file=.env scripts/eval_golden.mjs` ⇒ nộp số. Trượt ngưỡng ⇒ được sửa prompt `resident.ts`/`triage.ts` tối đa 2 vòng, mỗi vòng ghi số trước/sau; CẤM sửa kỳ vọng golden, CẤM chèn đáp án golden vào prompt. Vẫn trượt ⇒ nộp số thật + Câu hỏi mở (không phải thất bại của gói).
e. `HUMAN_TAKEOVER_MIN` (§11.6) + `.env.example` thêm `MODEL_TRIAGE`, `TRIAGE_TIMEOUT_MS`, `TRIAGE_EMERGENCY_MIN`, `HUMAN_TAKEOVER_MIN`, `BQL_HOTLINE` (giá trị giả).
Xong khi (toàn gói): `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h08 npm run test:db` (DB rỗng), `npm run gate` exit 0; 0 skip; số test không giảm; lệnh chạy thật có evidence (exit 0, 1 hoặc 3 đều nộp được, kèm số); `git grep -n "AIza"` và `grep -rn "AIza" planning/01_2026-09-24_san-viec-tho-mvp/evidence/eval-real/` rỗng.
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/eval-real/{baseline,typecheck,build,test,test-db,gate,red-fake-model,real-run-1,diff-stat}.txt` (+ `real-run-2/3.txt` nếu sửa prompt).

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <đúng các đường đó>` (worker khác commit song song; `index.lock` ⇒ chờ vài giây thử lại). Không push. Không "sửa cho tốt hơn" ngoài SPEC. Commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn ⇒ "Câu hỏi mở", KHÔNG sửa `specs/`. Kiểm mã thoát trực tiếp, không qua pipe. Lệnh chạy thật dài: chạy CHẶN ở tiền cảnh, redirect thẳng vào evidence.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🟠 | ngưỡng + luật chấp nhận đã chốt ở TESTING §3, SPEC-P03 §11; bằng chứng đỏ tự kiểm |
| d (sửa prompt) | 🟠 | có số trước/sau; cấm chạm kỳ vọng |
| e | 🟢 | theo mẫu có sẵn |

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H08_thi-cong_eval-real.md`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng "bộ → ngưỡng → số đo → đạt/trượt"; chi phí token ước tính cho một lần chạy). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence riêng `docs(plan-01): report R08` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R08_thi-cong_eval-real.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/eval-real/real-run-1.txt`

## 7. PHỤ LỤC VÒNG 2 (SO, 2026-09-25 14:10) — đọc SAU mục 1–6, thắng mục 1–6 khi khác
Worker vòng 1 bị ngắt 12:31 giữa lượt chấm thật, CHƯA commit, CHƯA có R08. Cây làm việc còn nguyên phần dở: `scripts/eval_golden.mjs`, `scripts/eval/{score,red-fake-model}.mjs`, `.env.example`, `handoff_to_staff.ts`, `evidence/eval-real/*` (evidence cũ chụp TRƯỚC khi H07 vào `main` ⇒ typecheck/build/test:db đỏ vì lý do ngoài gói — BỎ, chụp lại hết). Bạn TIẾP TỤC từ cây này, không viết lại từ đầu; đọc kỹ phần dở trước khi sửa.
Số vòng 1 (tham khảo, không nộp): khẩn cấp 100/100 (lớp 1 44, lớp 2 6/56, 0 báo nhầm); đồng ý 42/44, 0 nhận nhầm; chẩn đoán 0/40 `thực tế=null`; trách nhiệm chưa chạy.
Căn nguyên chẩn đoán 0/40 (SO đã xác minh): `save_job_draft` không ghi cột `jobs.category_code` — lỗi sản phẩm. Hợp đồng sửa: `specs/SPEC-P03-Resident-Agent.md` §11.11 (Đ23).
- MỞ PHẠM VI thêm: `packages/core/src/agent/tools/save_job_draft.ts` + test DB mới/sửa trong `packages/core/src/dbtests/` cho §11.11. Mọi CẤM khác giữ nguyên.
- Thứ tự: (0) Bước 0 + đo nền `git rev-parse HEAD`, `npm test`, `test:db` trên DB rỗng `lq_h08` (drop/tạo lại) ⇒ `baseline.txt`; (1) §11.11 + test, commit `fix(core): …`; (2) hoàn tất mục 3a–3e, commit; (3) chụp lại TOÀN BỘ evidence mục 3; (4) `real-run-1.txt` = lượt thật đủ 4 bộ sau §11.11; trượt ngưỡng ⇒ vòng sửa prompt theo 3d (`real-run-2/3.txt`).
- Máy chấm đọc danh mục từ CỘT (§11.11), không từ `draft`.
- Worker H09 (UI Zalo) chạy song song: phạm vi `apps/**`, `db/migrations/005_*` — KHÔNG đụng. Nếu `test:db` của bạn đỏ vì migration 005 xuất hiện giữa chừng ⇒ ghi Câu hỏi mở, không sửa file của họ.
- Lượt chạy thật tốn thời gian/token: chạy MỘT lần mỗi vòng, chặn tiền cảnh, redirect thẳng evidence; CẤM chạy lại chỉ để "đẹp số".
- Report R08 ghi rõ "vòng 1 bị ngắt, vòng 2 tiếp tục" + số vòng 1 ở trên.

## 8. PHỤ LỤC VÒNG 3 (SO, 2026-09-25) — thắng mục 1–7 khi khác
Gemini hết quota, OpenRouter 0 USD ⇒ Đ25: chấm bằng `MODEL_PROVIDER=vyce` (`deepseek-v4-flash`, nhánh adapter R11 ✅, 01-CONTRACTS §2d). `.env` đã có `VYCE_API_KEY`.
- Lệnh: tạo lại `lq_h08` (DB rỗng) → migrate + seed + `DATA_MODE=sim` seed:sim → `MODEL_PROVIDER=vyce DATA_MODE=sim TRIAGE_TIMEOUT_MS=8000 npx tsx --env-file=.env scripts/eval_golden.mjs > evidence/eval-real/real-run-3.txt` (env đặt TRƯỚC nên thắng `.env`; kiểm dòng đầu evidence in đúng provider). Chạy ĐỦ 4 bộ, MỘT lần, với prompt `resident.ts` đang treo — không ghép số với lượt Gemini.
- Đạt cả 4 ⇒ commit `resident.ts` (`fix(core): …`). Trượt ⇒ còn đúng 1 vòng sửa prompt theo mục 3d ⇒ `real-run-4.txt`; vẫn trượt ⇒ nộp số + Câu hỏi mở. Lỗi 402/429 dồn dập ⇒ dừng, nộp `blocked`.
- Ghi vào R08 mục "## Vòng 3": bảng bộ → ngưỡng → số (ghi rõ cặp `vyce/deepseek-v4-flash`), token/latency theo route, số ca triage quá hạn (audit `triage.unavailable`), diff prompt. Dòng cuối `⏳ Chờ người duyệt.`. Drop `lq_h08` khi xong.
