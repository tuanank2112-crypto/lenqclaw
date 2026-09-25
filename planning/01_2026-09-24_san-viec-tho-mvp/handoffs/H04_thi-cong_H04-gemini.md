1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 Đ18–Đ19 → `specs/01-CONTRACTS.md` §2, §2b, §9 → `specs/SPEC-P03-Resident-Agent.md` §10.6, §10.8 → `docs/core.md` → `packages/core/src/adapters/model.ts` → `packages/core/src/agent/tools/tool-kit.ts` → `packages/core/src/agent/resident-agent.ts`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. P03 (agent cư dân, 8 tool, vòng tool) đã thi công, đang được thẩm định SONG SONG bởi agent khác trong worktree riêng — không đụng tới họ. `adapters/model.ts` hiện CHỈ gọi Anthropic; hợp đồng Gemini (01-CONTRACTS §2b) đã chốt nhưng chưa ai làm. Máy có `.env` ở root chứa `GEMINI_API_KEY` và `MODEL_PROVIDER` (gitignore) — CHỈ nạp bằng `--env-file=.env`, CẤM in, cat, echo, ghi key vào bất kỳ file/evidence/commit nào. Không có `ANTHROPIC_API_KEY`.
Base: tự đo `git rev-parse HEAD` trước dòng sửa đầu tiên. Postgres dev đang chạy (`127.0.0.1:55432`, user/pass `lenqclaw`); tạo database riêng `lq_h04` (`docker exec lenqclaw-db-1 psql -U lenqclaw -d lenqclaw -c "create database lq_h04"`), CẤM đụng database khác; drop khi xong. Số đo nền: `npm test` 54 pass, `npm run test:db` 23 pass, 0 skip.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/src/adapters/model.ts` + test mới cạnh nó (`packages/core/src/adapters/*.test.ts`, thêm vào script test DB-less hiện có nếu cần), `packages/core/src/agent/tools/tool-kit.ts` (kiểm input theo schema), `packages/core/src/domain/errors.ts` (chỉ thêm lớp lỗi), `scripts/check_adapter_boundary.mjs` (chỉ thêm mẫu Gemini), `scripts/eval_golden.mjs` (chọn credential theo provider), `.env.example`, `packages/core/package.json` (script test), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R04_thi-cong_H04-gemini.md, evidence/H04-gemini/**}`.
CẤM ĐỤNG: `.env`, `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `db/migrations/**`, `agent/resident-agent.ts` và 8 file tool (trừ `tool-kit.ts`), `apps/**`, `scripts/gate.mjs`, `scripts/check_agent_tools.mjs`, dependency mới (dùng `fetch` có sẵn của Node 22 — CẤM `@google/genai`). VÙNG CẤM + LÝ DO: 01-CONTRACTS §2b dòng "CẤM".

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Nhánh `gemini` trong `adapters/model.ts` đúng TỪNG hàng bảng §2b: chọn provider, endpoint + header key, dịch vào, dịch ra, `thoughtSignature` (bảng id→chữ ký trong tiến trình), lỗi + retry 1 s/3 s, `MODEL_FALLBACKS`, `max_tokens` 16000 cả hai nhánh, `setGeminiFetchForTest`. Chữ ký `callModel`/`ModelCall`/`CallModelResult` KHÔNG đổi. `agent_runs.model` = model thực chạy.
b. Kiểm input tool theo `input_schema` trong `tool-kit.ts` (required, kiểu, enum, khoá lạ) ⇒ sai trả `tool_result is_error` mã `InvalidToolInput`, không chạy tool.
c. `check_adapter_boundary.mjs` báo vi phạm khi chuỗi `generativelanguage.googleapis.com` hoặc import `@google/genai` xuất hiện ngoài `adapters/model.ts`. Xong khi: bằng chứng ĐỎ — thêm tạm một file vi phạm trong bản sao `git worktree` ở thư mục scratch NGOÀI repo ⇒ `violations: 1`, exit 1; cây thật ⇒ exit 0.
d. `eval_golden.mjs`: `blocked` theo credential của provider đang chọn (SPEC-P03 §10.6).
e. Test fetch giả (0 mạng) phủ tối thiểu: dịch system/user/assistant/image/tool_use/tool_result; functionCall ⇒ `tool_use` + `stop_reason`; `thoughtSignature` gửi lại đúng ở lượt sau; key ở header và KHÔNG có trong URL; 503 ×3 model chính ⇒ fallback thành công, `model` = fallback; 400 ⇒ ném ngay, 1 lần fetch; SAFETY ⇒ `refusal`; MAX_TOKENS ⇒ `max_tokens`; `InvalidToolInput`.
f. Khói bằng model thật (cần mạng + key): (1) `npx tsx --env-file=.env scripts/eval_golden.mjs` — ghi exit code + số đúng/tổng; con số này CHỈ là khói, KHÔNG dùng đánh G09/G10 (Đ19-4); (2) một hội thoại `runResidentTurn` trên DB `lq_h04` (sau `db:migrate` + `db:seed` + `db:seed:sim`, `DATA_MODE=sim`) với cư dân sim, tin "vòi nước bồn rửa nhà em bị rỉ" qua ≥2 lượt tool thật (có `thoughtSignature` gửi lại) ⇒ in các `tool_use.name` theo thứ tự + `stop_reason` cuối + dòng `agent_runs` (model, tokens) — viết script tạm trong scratch NGOÀI repo, ghi lệnh vào report. Lỗi 503/429 lặp ⇒ ghi nguyên văn, không tự đổi model ngoài danh sách §2b.
Xong khi (toàn gói): `npm ci`, `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h04 npm run test:db`, `npm run gate` đều exit 0; 0 skip; `npm test` > 54; `git grep -n "AIza"` rỗng; `grep -rn "AIza" planning/01_2026-09-24_san-viec-tho-mvp/evidence/H04-gemini/` rỗng.
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/H04-gemini/{typecheck,build,test,test-db,gate,red-boundary,eval-golden-smoke,agent-loop-smoke,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <đúng các đường đó>` (một agent khác có thể commit cùng lúc; gặp `index.lock` ⇒ chờ vài giây, thử lại). Không push. Không "sửa cho tốt hơn" ngoài SPEC. Commit tiếng Anh Conventional Commits theo việc, kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn ⇒ ghi "Câu hỏi mở", làm phần độc lập, KHÔNG sửa `specs/`. Chuỗi gửi người dùng: tiếng Việt CÓ DẤU. Kiểm mã thoát trực tiếp, không qua pipe. Không để server chạy sau khi xong.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, e | 🟠 | hợp đồng dịch/lỗi chốt ở §2b; test fetch giả tự biết đúng/sai |
| c, d, f | 🟢 | có mẫu sẵn trong file; chạy lệnh ghi số |
Gặp quyết định chưa có trong §2b ⇒ dừng phần đó, ghi Câu hỏi mở.

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff:`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng "hàng §2b → test đo nó"). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence riêng `docs(plan-01): report R04` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R04_thi-cong_H04-gemini.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/H04-gemini/gate.txt`
