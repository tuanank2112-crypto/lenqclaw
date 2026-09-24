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

## Vòng 2 — 2026-09-24T23:35:07+07:00

Vai: worker (vai-thi-cong) · loại: thi công (vòng sửa 🔁) · họ/model: Claude Sonnet 5 (claude-sonnet-5) · Bước 0: không chạy lại (cùng phiên, không đổi luật khung) · hiểu việc: sửa đúng 10 lỗi D1–D10 + G1 + G3 + bộ test cookie âm liệt kê trong `reports/R02_tham-dinh_P01.md` + `evidence/P01-audit/checker-bypass.txt`/`http-sim.txt`, cùng phạm vi ghi H01, cùng luật H01 (stage tường minh, không push, commit tiếng Anh), không làm gì ngoài danh sách (không viết agent, không phần khác của SPEC-P03 ngoài §10.1).

Base vòng 2: `d1172ea54248a606fabf296f319aeea019152440`
Head vòng 2 (commit công việc cuối): `2cfbbe28cc7e8a97130625011340c20d07e3a9a4`

### 1. Lệnh + exit code (nguyên văn)

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| — | `npm ci` (sau khi xoá sạch `node_modules`) | 0 | (log cài đặt, không redirect riêng) |
| — | `npm run typecheck` (G8: nay bao ca file test) | 0 | [typecheck](../evidence/P01-v2/typecheck.txt) |
| — | `npm run build` (không `DATABASE_URL`/`SESSION_SECRET`) | 0 | [build](../evidence/P01-v2/build.txt) — `/dev/sim` nay là `ƒ` (dynamic), không còn `○` (static) |
| — | `npm test` | 0 | [test](../evidence/P01-v2/test.txt) |
| — | `npm run test:db` (DB rỗng mới — `docker compose down -v` rồi `up`) | 0 | [test-db](../evidence/P01-v2/test-db.txt) |
| — | `npm run gate` | 0 | [gate](../evidence/P01-v2/gate.txt) |
| D1/D2 | kịch bản tái tạo đúng 30 ca bypass (B01–B15, O01–O08, A01–A09) trên bản sao tạm ngoài repo | tất cả `exit=1` (đỏ đúng như kỳ vọng) | [checker-bypass-fixed](../evidence/P01-v2/checker-bypass-fixed.txt) |
| D3 | `next build && next start` (DATA_MODE=sim) → đăng nhập `bql_admin` → `GET /dev/sim` | 200 (trước: 404 trên bản build) | [manual-sim-build](../evidence/P01-v2/manual-sim-build.txt) |
| D5/D8 | gửi tin qua `/api/dev/sim/send` trên server build ở trên | outbox trả `"[sim] đã nhận: …"` (có dấu, đúng UTF-8) | [manual-sim-build](../evidence/P01-v2/manual-sim-build.txt) |
| D10 | `POST /api/auth/login {"email":123,...}` | 400 `invalid_credentials_type` (trước: 500) | [manual-sim-build](../evidence/P01-v2/manual-sim-build.txt) |
| D10 | `POST /api/dev/sim/send {"threadType":"bogus",...}` | 400 `invalid_body` (trước: 500) | [manual-sim-build](../evidence/P01-v2/manual-sim-build.txt) |
| D10 | `POST /api/dev/sim/send {"account":"evil",...}` | 400 `invalid_body` (trước: 200, ghi nhầm vào DB) | [manual-sim-build](../evidence/P01-v2/manual-sim-build.txt) |
| D6 | `GET /ticketsX` (đã đăng nhập `bql_admin`) | 403 (trước: 404 do khớp nhầm tiền tố `/tickets`) | [manual-sim-build](../evidence/P01-v2/manual-sim-build.txt) |

### 2. Test tổng/pass/fail/skip

`npm test`: **28/28 pass, 0 fail, 0 skip** (web 17 — thêm D6 + cookie âm, core 11 — thêm D7 + G3).
`npm run test:db`: **12/12 pass, 0 fail, 0 skip** (core 10 — thêm D5 concurrency 12 lời gọi <5s, web 2).
Tổng: **40/40 pass, 0 fail, 0 skip** — tăng từ 30 (vòng 1), không giảm. Nguồn: [test](../evidence/P01-v2/test.txt), [test-db](../evidence/P01-v2/test-db.txt).

### 3. `git diff --stat` + SHA từng commit

[diff-stat](../evidence/P01-v2/diff-stat.txt) — 20 file, +563/-153.

- `4ffb0c1` fix(p01): D1 rewrite check_adapter_boundary.mjs to scan whole-file content
- `bef7588` fix(p01): D2 rewrite check_agent_tools.mjs with brace-matched JobCard block
- `8e75e64` fix(p01): D3 force /dev/sim to render dynamically
- `17ff4a0` fix(p01): D6 canAccess matches by path segment, not prefix
- `a46a3ab` fix(p01): D4+D10 login route audit ordering and input validation
- `dfdff79` fix(p01): D10 dev/sim send route validates account/threadType enums
- `30b5442` fix(p01): D5+D8 processInbound per SPEC-P03 §10.1 + Vietnamese diacritics
- `0a0da82` fix(p01): D7 images become content blocks + G3 network errors typed
- `4c68321` fix(p01): G1 transitionJob only accepts the q of tx() (branded TxSqlFn)
- `298e470` fix(p01): D9 compose.yaml reads Postgres credentials from env, not hardcoded
- `995e250` chore(p01): G8 core typecheck now covers test files
- `2cfbbe2` test(p01): cookie negative cases for verifySessionCookie (= Head)

### 4. Bảng D1–D10 / G1 / G3 / cookie

| ID | Lỗi (R02) | Sửa | File | Bằng chứng |
| :-- | :-- | :-- | :-- | :-- |
| D1 | Máy đo biên adapter so từng dòng, bỏ lọt subpath/nhiều dòng/`insert into outbox` xuống dòng | Quét theo nội dung cả file (import/export/require/dynamic import, multi-dòng, subpath `pg/*`/`pg-pool`/`@anthropic-ai/sdk/*`/`zca-js/*`), bề mặt chính tắc cho outbox insert, không loại `src/dist` | `scripts/check_adapter_boundary.mjs` | `checker-bypass-fixed.txt` B01–B15, O01–O08 đều đỏ |
| D2 | Máy đo PII dừng ở `};` đầu tiên, bỏ lọt `phone?:`/khoá có nháy | Đếm ngoặc để tìm đúng khối `JobCard`, regex khoá/tên tool rộng hơn, quét thêm `.js/.mjs/.cjs` | `scripts/check_agent_tools.mjs` | `checker-bypass-fixed.txt` A01–A09 đều đỏ |
| D3 | `/dev/sim` bị prerender tĩnh lúc build → 404 cố định | `export const dynamic = 'force-dynamic'` | `apps/web/app/dev/sim/page.tsx` | `manual-sim-build.txt`: build thật → 200 |
| D4 | Ghi `auth.login.ok` trước khi tạo cookie | Tạo cookie trước; lỗi tạo cookie → `auth.login.fail` lý do `no_session_secret` | `apps/web/app/api/auth/login/route.ts` | code review + test hiện có (login ok/fail) |
| D5 | `processInbound` giữ client tx trong khi handler xin client khác → kẹt chết ≥10 đồng thời | Nhận trước xử lý sau: 1 câu UPDATE atomic, handler ngoài transaction, lỗi handler → audit + BUSY_REPLY | `packages/core/src/sim/sim-transport.ts` | `test-db.txt`: 12 đồng thời < 5s |
| D6 | `canAccess` khớp tiền tố, dính `/ticketsX`, `/gatekeeper` | `matchesSegment` (đúng đoạn hoặc `đoạn/…`) | `apps/web/lib/auth/policy.ts` | `manual-sim-build.txt`: `/ticketsX` → 403; test mới |
| D7 | `ModelCall.images` bị bỏ qua | `withImages()` nối content block `image` vào tin cuối | `packages/core/src/adapters/model.ts` | `model.test.ts` ca mới |
| D8 | Seed + tin vọng lại mất dấu tiếng Việt | Khôi phục nguyên văn có dấu theo SPEC-P01 §3 + SPEC-P03 §10.1 | `packages/core/src/db/seed.ts`, `sim-transport.ts` | `manual-sim-build.txt`: `"[sim] đã nhận: …"` |
| D9 | Mật khẩu DB ghi cứng trong `compose.yaml` (bản dùng chung VPS) | `${POSTGRES_USER:?}` v.v., giá trị dev đặt trong `.env`/`.env.example` | `compose.yaml`, `.env.example` | `docker compose up` thành công với `.env` mới |
| D10 | Route không kiểm kiểu input → 500/ghi rác | Kiểm `typeof`/enum tường minh trước khi dùng, 400 khi sai | `login/route.ts`, `dev/sim/send/route.ts` | `manual-sim-build.txt`: 3 ca đều 400 |
| G1 | `transitionJob` nhận cả `sql` của pool | `TxSqlFn` (marker `__tx` gắn lúc runtime bởi `tx()`), kiểm cả kiểu lẫn runtime | `adapters/db.ts`, `services/job-state.ts` | `job-state.test.ts` ca mới |
| G3 | Lỗi mạng/timeout SDK không thành `ModelUnavailableError` | Bắt `APIConnectionError` (và lớp con timeout) trước, luôn quy về `ModelUnavailableError` | `adapters/model.ts` | `model.test.ts` ca mới |
| cookie | Thiếu ca âm cho `verifySessionCookie` | Thêm 5 ca: đổi role/đổi exp giữ chữ ký cũ, chữ ký rỗng, thiếu chữ ký, chuỗi rác | `apps/web/lib/auth/session.test.ts` | `test.txt`: 9/9 pass trong file này |

### 5. Việc KHÔNG làm + lý do

- **G2** (jobId không phải uuid → lỗi pg thô) — chỉ là "ghi chú" trong R02, KHÔNG nằm trong danh sách 10 mục bắt buộc của vòng 2 → không sửa, tránh vượt phạm vi được giao.
- **G4** (lỗi ghi `agent_runs` bị nuốt im lặng), **G5** (không chọn được file kịch bản trên `/dev/sim`), **G6** (`npm audit` 7 lỗ hổng dev-only), **G7** (điểm mù hiếm B11–B13/O08/A07–A09 — thực ra đã sửa cùng D1/D2) — đều là "ghi chú", ngoài danh sách bắt buộc.
- **Cách phá (1) giả mạo/sửa cookie qua HTTP thật** — R02 ghi nhận không chạy được (bộ lọc an toàn của vỏ agent thẩm định); vòng này bù bằng 5 ca unit mới cho `verifySessionCookie` (mục 4 hàng cuối) như SO đã chỉ đạo ở dòng phán quyết vòng 1.
- **Không sửa `plan.md`/`specs/SPEC-P03-Resident-Agent.md`** — chỉ ĐỌC §10.1 theo đúng chỉ đạo; không đụng file ngoài phạm vi H01.
- **Không dọn `brain4agent/memory/hot/today.md`** — vẫn ngoài phạm vi, vẫn không phải do phiên này sửa.

### 6. Câu hỏi mở (cần người)

- Câu hỏi mở vòng 1 (dòng checklist `plan.md` §4 gộp G16 vào P01) vẫn còn nguyên, chưa được người chốt — không lặp lại sửa ở đây vì ngoài danh sách 10 mục của vòng 2.
- G2/G4/G5/G6/G7 (mục "ghi chú" của R02) chưa được xử lý — cần người quyết có đưa vào phạm vi của một vòng sau không, hay để dành cho P02–P04 tương ứng.

### 7. Tiếp theo

🖐 Cần tay người: phán quyết vòng 2 (report này); quyết có cần thẩm định độc lập lại (R03) trước khi mở P03 hay không.
🤖 Agent làm được ngay: không có (đang chờ phán quyết); nếu 🔁 tiếp thì sửa đúng phần bị chỉ ra.
⭐ Nên làm trước: phán quyết vòng 2, vì D1/D2 (máy đo biên) là điều kiện mọi gói sau (P03+) dựa vào để giữ BB-02/04/07.
⏸ Chưa làm: G2/G4/G5/G6/G7 (ghi chú, ngoài danh sách bắt buộc), câu hỏi mở checklist G16 (vòng 1), P02/P03 (ngoài §10.1)/P04/P05/P06/P08.

⏳ Chờ người duyệt.
