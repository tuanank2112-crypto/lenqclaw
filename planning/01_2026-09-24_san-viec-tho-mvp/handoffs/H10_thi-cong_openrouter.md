1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` Đ24 → `specs/01-CONTRACTS.md` §2, §2b, **§2c (hợp đồng gói này)** → `specs/SPEC-P03-Resident-Agent.md` §11.10 (triage) → `docs/core.md` → `packages/core/src/adapters/model.ts` + `model.gemini.test.ts` (mẫu để chép). Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. Adapter model (`packages/core/src/adapters/model.ts`) có hai nhánh `gemini` (mặc định) và `anthropic`. Key Gemini trực tiếp hết hạn mức giữa lượt chấm golden; người dùng đưa key OpenRouter, đã nằm trong `.env` ở root là `OPENROUTER_API_KEY` (gitignore). Gói này thêm nhánh thứ ba `openrouter` đúng §2c để máy chấm chạy lại bằng CÙNG model Gemini qua OpenRouter. Key chỉ nạp bằng `--env-file=.env`; CẤM in/cat/echo/ghi key vào file, evidence, commit. Song song: cây làm việc có `packages/core/src/agent/prompts/resident.ts` chưa commit của worker khác — KHÔNG đụng, KHÔNG stage. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432`; test DB dùng database riêng `lq_h10` (tạo mới, drop khi xong), CẤM đụng database khác.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/src/adapters/model.ts`, `packages/core/src/adapters/model.openrouter.test.ts` (mới), `scripts/check_adapter_boundary.mjs` (chỉ thêm canh `openrouter.ai`) + test/bằng chứng đỏ của nó nếu có sẵn mẫu, `scripts/eval/score.mjs` (CHỈ `currentProvider`/`credentialEnvName`/`hasCredential`), `.env.example` (thêm `OPENROUTER_API_KEY=` rỗng, `OPENROUTER_BASE_URL=` rỗng, chú thích `MODEL_PROVIDER` có `openrouter`), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R10_thi-cong_openrouter.md, evidence/H10-openrouter/**}`.
CẤM ĐỤNG: `package.json`/`package-lock.json` (CẤM thêm dependency — chỉ `fetch`), `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `.env`, `db/**`, `apps/**`, `evals/**`, `packages/core/src/agent/**`, mọi file khác. VÙNG CẤM + LÝ DO: §2c dòng "CẤM".

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Nhánh `openrouter` cho `callModel` và `callTriageModel` theo §2c (chọn, gọi, model mặc định, dịch vào/ra, lỗi, fallback phía client). Xong khi: `npm test` có `model.openrouter.test.ts` phủ đủ dòng "Thử nghiệm" §2c, xanh.
b. Hai nhánh cũ KHÔNG đổi hành vi. Xong khi: `model.test.ts`, `model.gemini.test.ts` xanh không sửa một dòng nào.
c. Máy đo biên canh `openrouter.ai`. Xong khi: chèn tạm một chuỗi `openrouter.ai` vào một file ngoài `adapters/` ⇒ `npm run gate` exit ≠ 0 (ghi `evidence/H10-openrouter/red-boundary.txt`), gỡ ra ⇒ exit 0.
d. `score.mjs` nhận provider `openrouter`. Xong khi: `MODEL_PROVIDER=openrouter` KHÔNG có `OPENROUTER_API_KEY` ⇒ `node scripts/eval_golden.mjs` in `blocked`, exit 3 (`evidence/H10-openrouter/red-no-key.txt`).
e. Khói thật (DUY NHẤT phần gọi mạng): một script tạm trong scratchpad (KHÔNG commit) nạp `.env`, đặt `MODEL_PROVIDER=openrouter`, gọi `callModel` route `diagnose` với 1 tool đơn giản + `callTriageModel` 1 câu ⇒ in `stop_reason`, tên tool, `usage`, `model` (KHÔNG in key, KHÔNG in header) vào `evidence/H10-openrouter/smoke-real.txt`. Tối đa 3 lần gọi thật.
Xong khi (toàn gói): `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h10 npm run test:db` (DB rỗng), `npm run gate` exit 0; 0 skip; số test mỗi lệnh ≥ nền tự đo; `git grep -n "sk-or-"` và `grep -rn "sk-or-" planning/01_2026-09-24_san-viec-tho-mvp/evidence/H10-openrouter/` rỗng.
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/H10-openrouter/{baseline,typecheck,build,test,test-db,gate,red-boundary,red-no-key,smoke-real,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <đúng các đường đó>`. Không push. Không "sửa cho tốt hơn" ngoài §2c. Commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của vỏ bạn. §2c thiếu/mâu thuẫn với API thật ⇒ "Câu hỏi mở", làm phần độc lập, KHÔNG sửa `specs/`. Kiểm mã thoát trực tiếp, không qua pipe.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b | 🟠 | hợp đồng dịch chốt ở §2c; có mẫu nhánh gemini + test fetch giả tự biết đúng/sai |
| c, d, e | 🟢 | theo mẫu có sẵn |

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H10_thi-cong_openrouter.md`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng "dòng §2c → test"). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết. Commit report + evidence riêng `docs(plan-01): report R10` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R10_thi-cong_openrouter.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/H10-openrouter/smoke-real.txt`
