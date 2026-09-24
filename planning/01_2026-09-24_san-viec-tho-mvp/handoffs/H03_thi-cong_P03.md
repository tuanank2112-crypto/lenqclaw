1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (tới Đ17) → `specs/00-ARCHITECTURE.md` → `specs/01-CONTRACTS.md` → `specs/SPEC-P03-Resident-Agent.md` (toàn bộ, §10 là hợp đồng thi công) → `specs/TESTING-ACCEPTANCE.md` §1–§3 → `docs/core.md`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. P01 đã xong (R01 ✅): monorepo, `packages/core` (adapter db/model/transport, `transitionJob`, `audit`, SimTransport với `processInbound` nhận-trước-xử-lý-sau), `apps/web` (`/dev/sim`, auth 3 vai), migration `001_init.sql`, `npm run gate`. Số đo nền: `npm test` 28 pass, `npm run test:db` 12 pass, 0 skip. Base: tự đo `git rev-parse HEAD` trước dòng sửa đầu tiên. Postgres dev: `docker compose -f compose.yaml -f compose.dev.yaml up -d db` (`127.0.0.1:55432`, user/pass/db `lenqclaw`); test DB dùng database riêng bạn tự tạo (`create database lq_p03`), CẤM xoá database `lenqclaw`.
Máy KHÔNG có credential Anthropic (không `ANTHROPIC_API_KEY`, không `ant`) ⇒ mọi test dùng model giả qua `setModelClientForTest`; `eval_golden` cho bộ cần LLM phải trả `blocked`, mã thoát 3. Repo tham chiếu để PORT (đọc, viết lại): `D:\build phase\lib\retrieval\query.ts`, `lib\pipeline\eligibility.ts`, `lib\eval\score.ts`, `db\migrations\007_chunk_heading_tsv.sql`.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/**`, `apps/web/**` (chỉ nối handler vào `/dev/sim` + chọn file kịch bản), `db/migrations/002_*.sql` trở đi (mới, chỉ thêm), `evals/**`, `scripts/eval_golden.mjs`, `package.json`/`package-lock.json` (script mới), `planning/01_2026-09-24_san-viec-tho-mvp/{plan.md (chỉ tick checklist P03), reports/R03_thi-cong_P03.md, evidence/P03/**}`.
CẤM ĐỤNG: `db/migrations/001_init.sql`, `specs/**`, `AGENTS.md`, `CLAUDE.md`, `brain4agent/**`, `docs/**`, `.agents/**`, `.claude/**`, `scripts/check_*.mjs`, `scripts/gate.mjs`. VÙNG CẤM + LÝ DO: SPEC-P03 §7, §10.7; 00-ARCHITECTURE §7.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Migration 002 (`immutable_unaccent`, `kb_sections.tsv` sinh từ heading+body) + truy hồi từ khoá theo SPEC-P03 §10.4. Xong khi: DB rỗng `npm run db:migrate` → `applied: 2`.
b. `db:seed:sim` theo §10.5 (chạy 2 lần ⇒ số dòng không đổi; `DATA_MODE≠sim` ⇒ từ chối, exit 1).
c. 8 tool theo §10.3 + lỗi `InvalidCategoryError`, `ConsentMissingError` (thêm vào `domain/errors.ts`, cùng khuôn lớp lỗi hiện có).
d. `residentHandler` + `runResidentTurn` + prompt `agent/prompts/resident.md` theo §10.1–§10.2 và hợp đồng gọi model §10.8 (sửa `adapters/model.ts` nếu cần cho fallback/refusal). Nối vào `/dev/sim`: `bql`+`user` ⇒ `residentHandler`, còn lại `echoHandler`.
e. Khẩn cấp tất định §1 (bỏ dấu, `EMERGENCY_TERMS`, `EMERGENCY_REPLY` có hotline từ env `BQL_HOTLINE`), ticket `kind='emergency'`, 0 lần gọi model.
f. Golden + máy chấm §10.6: `evals/golden/emergency.jsonl` (20), `diagnosis.jsonl` (40), `responsibility.jsonl` (30), `scripts/eval_golden.mjs`; `npm run eval:golden` không credential → in `blocked` cho diagnosis/responsibility, exit 3.
g. Đủ 9 ca test §10.6 (a)–(i) + test golden emergency trong `npm test` (10/10 bật, ≤1 báo nhầm) + test BB-03 (nguồn `deprecated`, hết hiệu lực, hai citation ngược nhau ⇒ `unclear`).
Xong khi (toàn gói): `npm ci`, `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `npm run test:db` trên DB rỗng mới, `npm run gate` đều exit 0; 0 skip; số test > 40; `check_agent_tools` quét được thư mục `agent/tools` mới (`forbidden_tools: 0`). Chạy tay `/dev/sim` (DATA_MODE=sim, model giả KHÔNG dùng được qua web ⇒ chỉ đo 2 ca không cần LLM: tin "nhà em bị cháy" ⇒ trả `EMERGENCY_REPLY` + ticket; cư dân `pending` ⇒ `REGISTER_REPLY`), ghi HTTP status + nội dung outbox vào `evidence/P03/manual-sim.txt`.
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/P03/{typecheck,build,test,test-db,migrate,seed-sim,gate,eval-golden,manual-sim,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh. Không push. Mã 2 ở Bước 0 = dừng hỏi. Không "sửa cho tốt hơn" ngoài SPEC. Commit tiếng Anh Conventional Commits theo việc (a…g), mỗi commit kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC mâu thuẫn/thiếu ⇒ ghi "Câu hỏi mở" trong report, làm phần độc lập, KHÔNG sửa `specs/`. Chuỗi gửi người dùng: tiếng Việt CÓ DẤU. Không để server dev chạy sau khi xong; drop database test của bạn. Lệnh dài chạy CHẶN ở tiền cảnh, redirect thẳng vào evidence; viết report TRƯỚC mọi việc phụ thuộc tác vụ nền. Kiểm mã thoát trực tiếp, không qua pipe.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, e, f | 🟠 | có SPEC + mẫu port + test tự biết đúng/sai |
| c, d, g | 🟠 | hợp đồng tool/vòng lượt đã chốt ở SPEC-P03 §10 (🔴 đã làm); test model giả tự kiểm |
Gặp quyết định chưa có trong SPEC ⇒ dừng phần đó, ghi Câu hỏi mở.

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff:`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng 9 ca §10.6 → tên test). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence riêng `docs(plan-01): report R03` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R03_thi-cong_P03.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P03/gate.txt`
