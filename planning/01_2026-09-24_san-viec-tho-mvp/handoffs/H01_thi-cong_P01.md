1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 → `specs/00-ARCHITECTURE.md` → `specs/01-CONTRACTS.md` → `specs/SPEC-P01-Foundation.md` → `specs/TESTING-ACCEPTANCE.md` §1–§2. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw` (git, nhánh `main`, remote `origin` private). Chưa có mã nguồn: chỉ có `brain4agent/`, `planning/`, `docs/`, `.agents/`, `.claude/`. Base: tự đo `git rev-parse HEAD` ngay trước dòng sửa đầu tiên. Máy dev: Windows 11, Git Bash, Node 24, npm 11, Docker chạy sẵn (cổng 3080 đã bị container khác chiếm — không dùng). Repo tham chiếu để PORT (đọc, viết lại, không chép thư mục): `D:\build phase` — `scripts/migrate.mjs`, `scripts/check_adapter_boundary.sh`, `scripts/run_tests.mjs`, `db/migrations/003_knowledge.sql`.

## 2. PHẠM VI
ĐƯỢC GHI: `package.json`, `package-lock.json`, `tsconfig*.json`, `.gitattributes`, `.env.example`, `compose.yaml`, `compose.dev.yaml`, `apps/**`, `packages/**`, `db/**`, `scripts/**`, `evals/scenarios/**`, `planning/01_2026-09-24_san-viec-tho-mvp/{plan.md (chỉ tick checklist mục P01), reports/R01_thi-cong_P01.md, evidence/P01/**}`.
CẤM ĐỤNG: `AGENTS.md`, `CLAUDE.md`, `brain4agent/**`, `docs/**`, `.agents/**`, `.claude/**`, `specs/**`, `.gitignore` (thiếu mục ⇒ ghi Câu hỏi mở). VÙNG CẤM + LÝ DO: SPEC-P01 §10 và 00-ARCHITECTURE §7.

## 3. VIỆC PHẢI LÀM (mỗi việc: xong khi <lệnh> → <kết quả>)
a. Workspace + công cụ theo SPEC-P01 §1. Xong khi: `npm ci` → exit 0; `npm run typecheck` → exit 0.
b. Compose dev + migrate + seed theo SPEC-P01 §2–§3. Xong khi: `docker compose -f compose.yaml -f compose.dev.yaml up -d db` rồi (DB rỗng) `npm run db:migrate` → in `applied: 1`; chạy lại → `applied: 0`; `npm run db:seed` hai lần → số dòng `job_categories`=12, `apartments`=20 cả hai lần.
c. Adapter, lỗi, máy trạng thái, audit theo SPEC-P01 §4–§5.
d. SimTransport + `evals/scenarios/echo.jsonl` + `/dev/sim` theo SPEC-P01 §6.
e. Auth 3 vai + `create-admin` + audit theo SPEC-P01 §7.
f. Hai máy đo + `npm run gate` theo SPEC-P01 §8, kèm bằng chứng ĐỎ trên bản sao tạm NGOÀI repo (không làm hỏng file trong repo).
g. Đủ mọi ca SPEC-P01 §9. Xong khi (c–g): `npm test` → 0 fail, 0 skip; `npm run test:db` (có `DATABASE_URL` tới DB dev) → 0 fail, 0 skip; `npm run gate` → exit 0; `npm run build` KHÔNG đặt `DATABASE_URL` → exit 0.
h. Chạy tay một lần: `DATA_MODE=sim` + `npm run dev -w @lenqclaw/web`, đăng nhập bằng admin tạo qua `create-admin`, mở `/dev/sim`, gửi 1 tin ở khung cư dân thấy tin `[sim] đã nhận: …`. Ghi kết quả (HTTP status các trang `/login`, `/dev/sim` khi chưa/đã đăng nhập, lấy bằng `curl -s -o /dev/null -w "%{http_code}"`) vào `evidence/P01/manual-sim.txt`.

Evidence BẮT BUỘC (stdout máy, redirect, không sửa tay): `evidence/P01/{npm-ci,typecheck,build,test,test-db,migrate-1,migrate-2,seed-counts,gate,red-adapter-boundary,red-agent-tools,red-gate,manual-sim,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`git add .` — stage tường minh từng đường. Không push. Mã thoát 2 ở Bước 0 = dừng hỏi. Không "sửa cho tốt hơn" ngoài SPEC. Commit tiếng Anh Conventional Commits, chia commit theo việc (a…g), mỗi commit kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC mâu thuẫn/thiếu ⇒ ghi "Câu hỏi mở" trong report, làm phần độc lập, KHÔNG sửa `specs/`. Mật khẩu/khoá thật không bao giờ vào repo hay evidence. Không để tiến trình dev server chạy sau khi xong (tắt nó). Lệnh dài chạy CHẶN ở tiền cảnh, redirect thẳng vào evidence; viết report TRƯỚC khi làm bất cứ gì phụ thuộc vào tác vụ nền.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, f | 🟢→🟠 | có mẫu port từ build phase + lệnh tự kiểm; gộp vào 🟠 cho liền mạch |
| c, d, e, g | 🟠 | có SPEC + test tự biết đúng/sai |
Không có gói 🔴: gặp quyết định chưa có trong SPEC ⇒ dừng phần đó, ghi Câu hỏi mở.

## 6. REPORT PHẢI CÓ
Theo mẫu `docs/HANDOFF_PROTOCOL.md` §7 tại hub `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` (dòng 1 khai vai; dòng 2–4 `Handoff:`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence thành commit riêng `docs(plan-01): report R01` SAU commit công việc cuối; `Head:` = SHA commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R01_thi-cong_P01.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P01/gate.txt`
