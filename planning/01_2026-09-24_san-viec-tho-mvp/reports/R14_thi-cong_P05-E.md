# R14 — Thi công P05-E (dashboard BQL tối thiểu cho P05)

Vai: worker (vai-thi-cong) · loại: THI CÔNG · họ/model: Claude Sonnet 5 · Bước 0: exit 0 · hiểu việc: phạm vi ghi `apps/web/**`, `docs/web.md`, `planning/.../reports/R14_*.md`+`evidence/P05-E/**`; xong khi `npm run typecheck`/`build`/`test`/`test:db` (DB `lq_h14`)/`gate` đều exit 0, 0 skip, test không giảm (nền `npm test` 296, `test:db` 165), vùng cấm §8.5 có test chứng minh; cấm sửa `packages/**`, thêm thư viện UI/state, SQL đổi trạng thái cuốc/ticket trong route, đụng `resident.ts`/file P05-C.

Handoff: `handoffs/H14_thi-cong_P05-E.md`
Base: `ea1bfdc` (docs(brain): P05-B approved, P05-C and P05-E started)
Head: `38d3178` (5 commit: `181240d` policy → `1245d20` API routes → `aed9cb0` pages → `c482f68` db tests → `38d3178` docs+evidence)

## 1. Lệnh + exit code nguyên văn

| Lệnh | Exit | Evidence |
| :-- | :-- | :-- |
| `npm run typecheck` | 0 | `evidence/P05-E/typecheck.txt` |
| `npm run build` (không `DATABASE_URL`) | 0 | `evidence/P05-E/build.txt` |
| `npm test` | 0 | `evidence/P05-E/test.txt` |
| `DATABASE_URL=…/lq_h14 npm run test:db` (DB rỗng, migrate+seed+seed-sim-for-test.mjs, chạy core→web→zalo-worker) | 0 | `evidence/P05-E/test-db.txt` |
| `node scripts/gate.mjs` | 0 | `evidence/P05-E/gate.txt` |
| `npx vitest run --config vitest.db.config.ts tests/tickets-decision.db.test.ts` (đã tạm bỏ kiểm `note_required` — bằng chứng đỏ) | 1 | `evidence/P05-E/red-reject-reason.txt` (đã hoàn nguyên; `git diff` rỗng sau khi chụp) |
| Web `test:db` chạy 3 lần liên tiếp | 0/0/0 | quan sát trực tiếp trong phiên, không lưu file riêng (nội dung giống `test-db.txt`); G24 |

Ghi chú vận hành: `test:db` gốc lần đầu (chạy giữa phiên) đỏ ở `packages/core/src/dbtests/p05-vendor-agent.db.test.ts` — file WIP của worker P05-C đang thi công song song, **không thuộc phạm vi của tôi**; đợi vài phút rồi chạy lại, khi P05-C ổn định thì exit 0 (135 ca core, gồm 8 ca mới của P05-C). Không sửa bất kỳ file nào trong `packages/core/**`.

## 2. Test tổng/pass/fail/skip trước/sau

| Bộ | Nền (R12, trước H14) | Sau (HEAD `38d3178`, cùng lúc P05-C) | Fail | Skip |
| :-- | :-- | :-- | :-- | :-- |
| `npm test` — web | 24 | 36 (+12 policy) | 0 | 0 |
| `npm test` — zalo-worker | 37 | 37 | 0 | 0 |
| `npm test` — core | 235 | 235 | 0 | 0 |
| `npm test` tổng | 296 | 308 (+12) | 0 | 0 |
| `npm run test:db` — core | 127 | 135 (+8, của P05-C — song song) | 0 | 0 |
| `npm run test:db` — web | 11 | 22 (+11, của tôi) | 0 | 0 |
| `npm run test:db` — zalo-worker | 27 | 27 | 0 | 0 |
| `npm run test:db` tổng | 165 | 184 (+19 = 11 của tôi + 8 của P05-C) | 0 | 0 |

Phần của tôi: `+12` `npm test` (policy.test.ts, đủ 4×3 ô bảng §8.1), `+11` `test:db` web (`tickets-decision` 5, `vendors-paid` 3, `vendors-status` 1, `sim-tick` 2 — khớp G07 (a)-(j), tổng 11 ≥ 10 theo yêu cầu). Không có test nào bị xoá/giảm.

## 3. `git diff --stat` (base→HEAD, chỉ phạm vi được ghi) + SHA từng commit

Toàn văn: `evidence/P05-E/diff-stat.txt` (25 files changed, 1864 insertions(+), 26 deletions(-) tính riêng `apps/web` + `docs/web.md`).

| Commit | SHA | Nội dung |
| :-- | :-- | :-- |
| 1 | `181240d` | `feat(web): add SPEC-P04 §8.1 role policy for /tickets, /vendors, /jobs` — mở rộng `canAccess` + 12 test mới |
| 2 | `1245d20` | `feat(web): add SPEC-P04 §8.2 API route handlers for P05-E dashboard` — `_auth.ts`, `tickets/{id}/decision`, `vendors/{id}/slots/paid`, `vendors/{id}/status`, `vendors/capacity`, `dev/sim/tick`; sửa `dev/sim/send` (từ chối `senderUid='system'`) và `dev/sim/replay` (dùng `agent.routeInboundEvent`) |
| 3 | `aed9cb0` | `feat(web): implement /tickets, /gate, /vendors, /jobs P05-E pages` — thay trang tạm + trang `/vendors`, `/jobs`, `/jobs/{code}` mới + SimBoard mở rộng |
| 4 | `c482f68` | `test(web): add P05-E db acceptance tests (SPEC-P04 §8.4 a-j)` — 4 file `*.db.test.ts` + `p05e-helpers.ts` |
| 5 | `38d3178` | `docs(web): document P05-E dashboard routes and pages + evidence` — `docs/web.md` + 7 file evidence |

Không có file nào ngoài `apps/web/**`, `docs/web.md`, `planning/.../reports|evidence/P05-E/**` bị đụng. `resident.ts` không bị stage (đã kiểm `git diff --stat HEAD -- .../resident.ts` rỗng ở mọi commit của tôi).

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu (handoff) | Họ/model đã dùng |
| :-- | :-- | :-- |
| a. Phân quyền `policy.ts` + 12 test | 🟠 | Claude Sonnet 5 |
| b. API route handlers (§8.2) + `_auth.ts` | 🟠 | Claude Sonnet 5 |
| c. Trang `/tickets`, `/gate`, `/vendors` | 🟠 | Claude Sonnet 5 |
| c. Trang `/jobs`, `/jobs/{code}` | 🟢 | Claude Sonnet 5 |
| d. SimBoard + `/api/dev/sim/tick` | 🟠 | Claude Sonnet 5 |
| Test DB chấp nhận (G07 a-j) | 🟠 | Claude Sonnet 5 |

Không có gói nào leo lên 🔴 — hai điểm cần quyết định ngoài SPEC (mục "Câu hỏi mở" dưới) đều chọn được cách an toàn nhất bám sát chữ nghĩa §8.2/§8.6 mà không cần người chốt gấp.

## 5. Việc KHÔNG làm + lý do

- **P04 đầy đủ** (`/regulations`, `/pricing`, `/residents` đầy đủ, `/ledger`, đăng ký thợ): SPEC-P04 §8 ghi rõ "phần còn lại của §4 ... là P04 đầy đủ — gói sau", CẤM tường minh trong §8.5.
- **`packages/core/**`**: mọi phần lõi dùng nguyên trạng (P05-B, `H12`); không sửa dù phát hiện `suspendVendor` không tồn tại (xem Câu hỏi mở #1) — chọn cách ghép logic ngay trong route thay vì tạo/sửa file core.
- **`evals/scenarios/dispatch_smoke.jsonl`**: không thuộc phạm vi ĐƯỢC GHI của handoff này (nằm ở `evals/**`, thuộc P05-C).
- **G16a (`p05-e2e.db.test.ts` qua vòng agent thợ thật)**: cần `vendor-agent.ts` của P05-C hoàn thiện — không thuộc gói P05-E, không dựng lại ở đây.
- **Đo lại `npm test`/`test:db` trên HEAD gốc bằng `git stash`**: không làm vì `git stash` sẽ cuốn theo toàn bộ thay đổi CHƯA COMMIT của worker P05-C đang chạy song song trong `packages/core/**` — rủi ro làm mất/rối công việc của họ. Dùng số nền đã có sẵn từ R12 (296/165) để so sánh thay vì tự đo lại.

## 6. Câu hỏi mở (không tự bịa, ghi lại quyết định an toàn đã chọn)

1. **`suspendVendor` core không tồn tại**: SPEC-P05 §8.2 mô tả `POST /api/vendors/{id}/status {status:'suspended'}` gọi core `suspendVendor({vendorId, staffId, note, now})`, nhưng hàm này KHÔNG có trong `packages/core/src/services/{dispatch,access,slots}.ts` (đã rà soát bằng `grep -n "^export "` toàn bộ 4 file dịch vụ P05). Đã làm: ghép lại ĐÚNG logic SPEC mô tả trực tiếp trong route (`app/api/vendors/[id]/status/route.ts`) bằng hai hàm core ĐÃ XUẤT `releaseHold`/`withdrawConfirmed` cho mọi cuốc `held`/`confirmed`/`access_pending` của thợ (đây là nơi DUY NHẤT đổi trạng thái cuốc — đúng luật §8.2), rồi SQL trực tiếp cho `vendors.status`/`vendor_slots.status` (hai bảng này không phải "trạng thái cuốc/ticket" nên không phạm CẤM của §8.2). Đề xuất: một handoff sau thêm `suspendVendor` vào `packages/core/src/services/dispatch.ts` để web không phải tự ghép.
2. **404 vs 409 khi `decideAccessRequest`/`grantPaidSlot` không phân biệt "không tồn tại" với "sai trạng thái"**: `decideAccessRequest` chỉ ném `ConflictError` cho cả ticket không tồn tại lẫn ticket đã đóng (UPDATE có điều kiện, 0 dòng cả hai trường hợp); `grantPaidSlot` không tự kiểm thợ tồn tại/`active`. Đã làm: route đọc trước (không đổi trạng thái) để tách 404/409 đúng bảng lỗi §8.6, chấp nhận một khoảng TOCTOU rất nhỏ (nếu ticket/thợ đổi trạng thái đúng giữa lúc đọc và lúc gọi core, core vẫn tự bắt lại và route map đúng `ConflictError`→409).

## 7. Bằng chứng vùng cấm §8.5 có test chứng minh

- Vai không phải staff gọi API duyệt: `tickets-decision.db.test.ts` (a) `guard ⇒ 403` + `policy.test.ts` (12 ca mới §8.1).
- Route không tự SQL đổi trạng thái cuốc/ticket: mọi route decision/paid/status đi qua `decideAccessRequest`/`grantPaidSlot`/`releaseHold`/`withdrawConfirmed`; test (c)/(d)/(i) xác nhận trạng thái cuốc đổi đúng qua các hàm đó.
- Từ chối cấp quyền thiếu lý do ⇒ 400: test (b) + bằng chứng đỏ `red-reject-reason.txt`.
- `bql_staff` gọi API chỉ-admin ⇒ 403: `vendors-paid.db.test.ts` (h).
- `senderUid='system'` bị từ chối ở `/api/dev/sim/send`: sửa route (chưa có test DB riêng — hành vi đơn giản, kiểm bằng đọc code; ghi nhận đây là phần chưa có test tự động, nếu cần đo thêm xin báo).

## 8. Câu hỏi cần người

- Xác nhận hướng xử lý Câu hỏi mở #1 (`suspendVendor`) — có cần một WP nhỏ sau này thêm hàm này vào core để dọn logic khỏi web, hay giữ nguyên cách ghép trong route?
- Không có câu hỏi chặn khác để đóng gói P05-E.

⏳ Chờ người duyệt.

## SO phán vòng 1 (2026-09-26)
- Phạm vi sạch (chỉ `apps/web/**`, `docs/web.md`, report/evidence P05-E). Phần policy/API/trang/SimBoard đạt.
- Câu hỏi mở #1 (`suspendVendor`) KHÔNG giữ được cách ghép trong route: nhả cuốc trước khi đặt `suspended` ⇒ thợ bị đình chỉ nhận lại được cuốc vừa nhả; cuốc `access_granted` bị bỏ sót + `dispatchToVendor` không kiểm trạng thái thợ ⇒ lộ PII (BB-02). Gốc: R12 thiếu dịch vụ SPEC đã gọi + lỗ SPEC ⇒ Đ30, SPEC-P05 §10.17, H14 mục 7.
- Câu hỏi mở #2 (đọc trước để tách 404/409): chấp nhận.

🔁 SỬA: route đình chỉ thợ — làm `suspendVendor` trong core theo SPEC-P05 §10.17 (H14 mục 7).
