Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude Sonnet 5 (claude-sonnet-5) · Bước 0: exit 0 (NÃO ĐÃ OK, không cần nâng cấp) · hiểu việc: dựng nền tảng monorepo (workspaces, Postgres, migrations, 3 adapter, SimTransport + màn chat dev, auth web 3 vai, audit log) đúng SPEC-P01-Foundation.md, phạm vi ghi = package.json/tsconfig*/.gitattributes/.env.example/compose*.yaml/apps/**/packages/**/db/**/scripts/**/evals/scenarios/** + trong hồ sơ 01 chỉ tick checklist P01/reports/R01/evidence/P01/** / xong khi 8 việc a–h khớp đúng lệnh+kết quả nêu ở handoff mục 3 / cấm đụng AGENTS.md, CLAUDE.md, brain4agent/**, docs/**, .agents/**, .claude/**, specs/**, .gitignore, cấm ORM, cấm NextAuth, cấm agent/tool/pipeline (P02/P03/P05), cấm seed mật khẩu mặc định.

Handoff: handoffs/H01_thi-cong_P01.md
Base: b7e907f5624ad20ac1198049567af667f488e918
Head: e58585114197a7c1726f928b840720e58fb6f729

## 1. Lệnh + exit code (nguyên văn)

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| a | `npm ci` (thực chạy: `npm install` — không có `package-lock.json` từ trước, xem "Câu hỏi mở") | 0 | (cài node_modules, không redirect riêng) |
| a | `npm run typecheck` | 0 | [typecheck](../evidence/P01/typecheck.txt) |
| b | `docker compose -f compose.yaml -f compose.dev.yaml up -d db` | 0 | (log Docker, không redirect riêng) |
| b | `npm run db:migrate` (DB rỗng, lần 1) | 0, in `applied: 1` | [migrate-1](../evidence/P01/migrate-1.txt) |
| b | `npm run db:migrate` (lần 2) | 0, in `applied: 0` | [migrate-2](../evidence/P01/migrate-2.txt) |
| b | `npm run db:seed` ×2 | 0, `job_categories=12 apartments=20` cả hai lần | [seed-counts](../evidence/P01/seed-counts.txt) |
| g | `npm test` | 0 | [test](../evidence/P01/test.txt) |
| g | `npm run test:db` (DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lenqclaw) | 0 | [test-db](../evidence/P01/test-db.txt) |
| g | `npm run gate` | 0 | [gate](../evidence/P01/gate.txt) |
| a/g | `npm run build` (không đặt `DATABASE_URL`) | 0 | [build](../evidence/P01/build.txt) (chạy trong `gate`) |
| f | `node scripts/check_adapter_boundary.mjs` trên bản sao hỏng (`import pg` thêm vào `apps/web/app/page.tsx`) | 1, `violations: 1` | [red-adapter-boundary](../evidence/P01/red-adapter-boundary.txt) |
| f | `node scripts/check_agent_tools.mjs` trên bản sao hỏng (thêm khoá `phone` vào `JobCard`) | 1, `pii_keys_in_jobcard: 1` | [red-agent-tools](../evidence/P01/red-agent-tools.txt) |
| f | `npm run gate` trên bản sao hỏng (repo đầy đủ, node_modules symlink) | 1, dừng đúng ở bước `check_adapter_boundary` | [red-gate](../evidence/P01/red-gate.txt) |
| h | thiếu DATABASE_URL: `npm run test:db` | 1, thông báo rõ, không skip | (đo trước khi có DB — xem mục 5) |
| h | chạy tay `/dev/sim` (DATA_MODE=sim, admin tạo qua `create-admin`) | HTTP: `/login`=200 chưa đăng nhập; `/dev/sim` chưa đăng nhập=307 (redirect `/login`); sau đăng nhập admin `/dev/sim`=200; gửi tin cư dân → `[sim] đã nhận: …` xuất hiện | [manual-sim](../evidence/P01/manual-sim.txt) |

## 2. Test tổng/pass/fail/skip

`npm test`: 3 file test, **19/19 pass, 0 fail, 0 skip** (web 11, core 8, zalo-worker 0 — không có test P02).
`npm run test:db`: 2 file test, **11/11 pass, 0 fail, 0 skip** (core 9 — migrate/seed/job-state ×3/sim-transport, web 2 — login ok/fail).
Tổng: **30/30 pass, 0 fail, 0 skip.** Dòng gate cuối: [gate](../evidence/P01/gate.txt).

## 3. `git diff --stat Base..Head` + SHA từng commit

[diff-stat](../evidence/P01/diff-stat.txt) — 62 files changed, 6365 insertions(+).

- `6404dd3` chore(p01): bootstrap npm workspaces, tsconfig, compose dev, vitest configs
- `dae4b6c` feat(p01): compose dev DB + migrations + idempotent seed
- `ed046b3` feat(p01): db/model/transport adapters, typed errors, job state machine
- `fee32a8` feat(p01): SimTransport (echo handler) + /dev/sim dev console
- `b809215` feat(p01): web auth 3 roles (HMAC cookie) + create-admin CLI
- `4674ffd` feat(p01): boundary/agent-tools static checks + gate runner
- `e585851` test(p01): unit + db test suites for gate G01-G03 and P01 §9 matrix (= Head)

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a (workspace + công cụ) | 🟢→🟠 | Claude Sonnet 5 |
| b (compose/migrate/seed) | 🟢→🟠 | Claude Sonnet 5 |
| c (adapter/lỗi/máy trạng thái/audit) | 🟠 | Claude Sonnet 5 |
| d (SimTransport + echo.jsonl + /dev/sim) | 🟠 | Claude Sonnet 5 |
| e (auth 3 vai + create-admin + audit) | 🟠 | Claude Sonnet 5 |
| f (2 máy đo + gate) | 🟠 | Claude Sonnet 5 |
| g (test bắt buộc P01 §9) | 🟠 | Claude Sonnet 5 |
| h (chạy tay thủ công) | 🟢→🟠 | Claude Sonnet 5 |

Không gói nào chạm quyết định thiếu trong SPEC (không có gói 🔴 cần dừng hỏi). Thẩm định nội bộ do chính worker tự làm ở mỗi bước (đọc lại code + chạy lại lệnh trước khi commit), không thay thế thẩm định nghiệm thu độc lập.

## 5. Việc KHÔNG làm + lý do

- **Không tick dòng checklist `P01 — nền tảng + SimTransport (G01–G03, G16)` trong `plan.md`.** G01–G03 (cổng §1, migrations+seed, auth 3 vai+audit) đã đạt, nhưng **G16** ("kịch bản `evals/scenarios/happy_path.jsonl` chạy trọn bước 0→8 không cần người") cần agent thật (P03 bước 1–3, P05 bước 4–7, P06 bước 8) — SPEC-P01 §10 minh thị CẤM viết agent/pipeline ở P01. Dòng checklist gộp chung G16 vào P01 là một điểm lệch giữa `plan.md` và `SPEC-P01`; không tự tách dòng vì phạm vi chỉ cho "tick", không cho sửa nội dung. Đã KHÔNG tự ý tick để tránh báo sai trạng thái cổng — xem Câu hỏi mở.
- **`npm ci` thay bằng `npm install`.** Repo chưa có `package-lock.json` khi bắt đầu (chưa có `package.json` nào); `npm ci` đòi hỏi lockfile khớp sẵn nên không chạy được ở lần cài đầu tiên của một repo mới. Đã chạy `npm install` (tạo `package-lock.json`, giờ đã commit) — từ lần sau `npm ci` sẽ chạy được trên lockfile này. Không phải lỗi phạm vi, là thứ tự tự nhiên của một repo mới.
- **Không dọn `brain4agent/memory/hot/today.md`** (đang hiện `M` trong `git status`) — file này KHÔNG do phiên này sửa (đã vậy từ trước Bước 0) và nằm trong vùng cấm `brain4agent/**`; không stage, không đụng.
- **Không xoá tài khoản `admin@demo.local`** tạo trong bước h (chạy tay) — không có yêu cầu dọn trong handoff; mật khẩu chỉ tồn tại trong lệnh cục bộ (đọc qua stdin), không vào repo/evidence.

## 6. Câu hỏi mở (cần người)

- `plan.md` §4 checklist ghi `P01 — nền tảng + SimTransport (G01–G03, G16)` nhưng `SPEC-P01-Foundation.md` §10 cấm P01 viết agent/pipeline — tức G16 (happy_path 0→8) không thể đạt trong P01 mà phải chờ P03+P05+P06. Đề nghị người chốt: tách dòng checklist thành `P01 (G01–G03)` riêng và để G16 nằm ở dòng gói cuối cùng đạt được nó (P06), tránh checklist ngầm hiểu P01 gánh cả G16.

## 7. Tiếp theo

🖐 Cần tay người: chốt lại cách viết dòng checklist P01/G16 ở `plan.md` §4 (mục 6) trước khi phóng gói kế tiếp.
🤖 Agent làm được ngay: phóng handoff P03 (agent cư dân bước 0–3) dựa trên nền tảng đã có — SimTransport/adapter/job-state/auth đều sẵn sàng để P03 chỉ thay `echoHandler`.
⭐ Nên làm trước: chốt câu hỏi mở ở mục 6, vì nó quyết định P01 đã "xong" theo nghĩa nào trước khi mở gói tiếp theo.
⏸ Chưa làm: G16 (happy_path 0→8), toàn bộ agent/tool/pipeline (P02/P03/P05/P06), Zalo thật (P02), dashboard thật (P04), slot/ledger (P08) — đúng như Vùng cấm SPEC-P01 §10 và thứ tự gói ở `plan.md` §3.

🔁 SỬA: D1 + D2 (chặn G01 — máy đo biên adapter/PII bỏ lọt import nhiều dòng, `pg/lib/*`, khoá `phone?:`…; SO đo lại xác nhận) · kèm D3–D10, G1, G3 theo R02 · D5 + D8 sửa bằng SPEC-P03 §10.1 (Đ17 a) · thêm test unit cookie giả mạo (đổi role giữ chữ ký, chữ ký rỗng/thiếu, đổi exp) · SO · 2026-09-24 23:13:19
