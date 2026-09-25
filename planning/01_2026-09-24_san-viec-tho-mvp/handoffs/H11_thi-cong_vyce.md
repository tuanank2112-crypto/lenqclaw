1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` Đ24, Đ25 → `specs/01-CONTRACTS.md` §2c, **§2d (hợp đồng gói này)** → `reports/R10_thi-cong_openrouter.md` → `packages/core/src/adapters/model.ts` + `model.openrouter.test.ts`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. Adapter model có nhánh `openrouter` (R10 ✅) nói giao thức `/chat/completions` dạng OpenAI. Gemini trực tiếp hết quota, OpenRouter 0 USD; người dùng đưa key Vyce AI (proxy dạng OpenAI), đã nằm trong `.env` ở root là `VYCE_API_KEY` (gitignore). Gói này thêm nhánh `vyce` đúng §2d, DÙNG CHUNG phần dịch của nhánh `openrouter` (tách hàm, không chép), để máy chấm golden chạy bằng `deepseek-v4-flash`. Key chỉ nạp bằng `--env-file=.env`; CẤM in/cat/echo/ghi key vào file, evidence, commit. Cây làm việc có `packages/core/src/agent/prompts/resident.ts` chưa commit của worker khác — KHÔNG đụng, KHÔNG stage. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432` (user `lenqclaw`); test DB dùng database riêng `lq_h11` (tạo mới, drop khi xong), CẤM đụng database khác.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/src/adapters/model.ts`, `packages/core/src/adapters/model.vyce.test.ts` (mới), `scripts/check_adapter_boundary.mjs` (chỉ thêm canh `vyceai.com`), `scripts/eval/score.mjs` (CHỈ `currentProvider`/`credentialEnvName`/`hasCredential`), `.env.example` (thêm `VYCE_API_KEY=` rỗng, `VYCE_BASE_URL=` rỗng, chú thích `MODEL_PROVIDER` có `vyce`), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R11_thi-cong_vyce.md, evidence/H11-vyce/**}`.
CẤM ĐỤNG: `package.json`/`package-lock.json` (CẤM thêm dependency), `model.test.ts`/`model.gemini.test.ts`/`model.openrouter.test.ts` (phải xanh KHÔNG sửa dòng nào — chứng minh tách hàm không đổi hành vi), `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `.env`, `db/**`, `apps/**`, `evals/**`, `packages/core/src/agent/**`, mọi file khác. VÙNG CẤM + LÝ DO: §2d dòng "CẤM".

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Nhánh `vyce` cho `callModel` + `callTriageModel` theo §2d, phần dịch/lỗi/fallback dùng chung với `openrouter`. Xong khi: `model.vyce.test.ts` phủ đủ dòng "Thử nghiệm" §2d, xanh; ba file test model cũ xanh không sửa.
b. Chặn `DATA_MODE !== 'sim'`. Xong khi: test — `DATA_MODE=real` + `MODEL_PROVIDER=vyce` ⇒ ném lỗi, fetch giả được gọi 0 lần.
c. Máy đo biên canh `vyceai.com`. Xong khi: chèn tạm chuỗi vào một file ngoài `adapters/` ⇒ `npm run gate` exit ≠ 0 (`evidence/H11-vyce/red-boundary.txt`), gỡ ⇒ 0.
d. `score.mjs` nhận `vyce`. Xong khi: `MODEL_PROVIDER=vyce` không `VYCE_API_KEY` ⇒ `node scripts/eval_golden.mjs` in `blocked`, exit 3 (`evidence/H11-vyce/red-no-key.txt`).
e. Khói thật (DUY NHẤT phần gọi mạng, tối đa 3 lời gọi): script tạm trong scratchpad (KHÔNG commit), `DATA_MODE=sim`, `MODEL_PROVIDER=vyce`, gọi `callModel` route `diagnose` với 1 tool + `callTriageModel` 1 câu ⇒ in `stop_reason`, tên tool, `usage`, `model`, latency (KHÔNG in key/header) vào `evidence/H11-vyce/smoke-real.txt`. Ghi rõ latency triage so với `TRIAGE_TIMEOUT_MS` (4000).
Xong khi (toàn gói): `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h11 npm run test:db` (DB rỗng), `npm run gate` exit 0; 0 skip; số test ≥ nền tự đo; `git grep -n "sk-a747"` và `grep -rn "sk-" planning/01_2026-09-24_san-viec-tho-mvp/evidence/H11-vyce/` rỗng.
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/H11-vyce/{baseline,typecheck,build,test,test-db,gate,red-boundary,red-no-key,smoke-real,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <đúng các đường đó>`. Không push. Không "sửa cho tốt hơn" ngoài §2d. Commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của vỏ bạn. §2d thiếu/mâu thuẫn với API thật ⇒ "Câu hỏi mở", KHÔNG sửa `specs/`. Kiểm mã thoát trực tiếp.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b | 🟠 | hợp đồng chốt ở §2c/§2d; test fetch giả tự biết đúng/sai |
| c, d, e | 🟢 | theo mẫu H10 |

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H11_thi-cong_vyce.md`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng "dòng §2d → test"). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết. Commit report + evidence riêng `docs(plan-01): report R11` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R11_thi-cong_vyce.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/H11-vyce/smoke-real.txt`
