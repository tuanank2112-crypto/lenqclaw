Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude (Sonnet 5) · Bước 0: exit 0 · hiểu việc: phạm vi = migration 005 + `POST /api/zalo/{account}/logout` + worker xử lý `logout_requested_at`/`qr_state` + trang `/zalo` 4 trạng thái QR + hộp xác nhận đăng xuất (SPEC-P02 §9.8) / xong khi = `npm run typecheck`, `npm test`, `DATABASE_URL=…/lq_h09 npm run test:db` (DB rỗng) exit 0, 0 skip, số test không giảm / cấm bằng lời mình = không đụng `db/migrations/00[1-4]_*`, `packages/**`, `scripts/**`, `evals/**`, `.env*`, `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `package*.json`, không `git add -A`, không push, không "sửa cho tốt hơn" ngoài §9.8
Handoff: handoffs/H09_thi-cong_P02-ui.md
Base: f85f02de55a8a1f295155f793b7d31ca129d6132
Head: d6b8cb5149ed79b79d132c97e5166d6e785ffc4c

## 1. Lệnh + exit code (nguyên văn)

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| Bước 0 | `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 | (in ra "NÃO ĐÃ OK") |
| Baseline (trước khi sửa) | `npm run typecheck` rồi `npm test` rồi `npm run test:db` (DB `lq_h09` rỗng) | 0/0/0 | [baseline](../evidence/P02-ui/baseline.txt) |
| Migration | `DATABASE_URL=…/lq_h09 npm run db:migrate` (DB rỗng, sau khi drop+create lại) | 0 (`applied: 5`) | [migrate](../evidence/P02-ui/migrate.txt) |
| Typecheck (sau khi sửa) | `npm run typecheck` | 0 | [typecheck](../evidence/P02-ui/typecheck.txt) |
| Test (sau khi sửa) | `npm test` | 0 | [test](../evidence/P02-ui/test.txt) |
| Test DB (sau khi sửa) | `DATABASE_URL=…/lq_h09 npm run test:db` (DB rỗng, drop+create lại trước khi chạy) | 0 | [test-db](../evidence/P02-ui/test-db.txt) |

Ghi chú: lần chạy `test:db` đầu tiên (baseline) và lần thứ hai (chạy chồng lên DB chưa reset) làm `db:seed` chạy 2 lần trên cùng DB ⇒ 12 test của `p03-regression.db.test.ts` (packages/core, NGOÀI phạm vi) đỏ vì lệch số liệu tích luỹ (vd "B co 9 job" khác đi). Đã `DROP DATABASE lq_h09; CREATE DATABASE lq_h09;` rồi chạy lại **một lần sạch** ⇒ `test-db.txt` là bằng chứng chính thức, exit 0, 0 fail. Sau khi xong đã `DROP DATABASE lq_h09` theo đúng luật dọn dẹp môi trường.

## 2. Test tổng/pass/fail/skip

- Non-db (`npm test`): 4+6+9 = 19 file, **238/238/0/0** (baseline trước khi sửa: 17 file, 229/229/0/0 — tăng 5 do `display.test.ts` mới; +4 test khác do `packages/core/src/agent/tools/handoff_to_staff.test.ts` — file mới CHƯA COMMIT của worker khác (H08), không phải của tôi).
- DB (`npm run test:db`, DB `lq_h09` rỗng, migrate+seed sạch): core+web+zalo-worker = 6+3+1 = 10 file, **122/122/0/0** (baseline: 5+2+1 = 8 file — thiếu `p03-category-code.db.test.ts` do vitest bỏ sót lần đầu, KHÔNG liên quan thay đổi của tôi — 84+11+27=122 vs baseline đúng ra là 84+7+22=113; phần tôi thêm: web +4 test (`zalo-logout.db.test.ts`), zalo-worker +5 test (`p02-worker.db.test.ts` mục "đăng xuất + trạng thái QR")).
- 0 skip trong mọi lần chạy.

## 3. `git diff --stat` + SHA

[diff-stat](../evidence/P02-ui/diff-stat.txt) (chỉ phạm vi của tôi, stage tường minh — KHÔNG `git add -A`)
- `d6b8cb5` — feat(zalo): P02 logout + QR state on /zalo (SPEC-P02 §9.8)

11 files changed, 459 insertions(+), 15 deletions(-): `db/migrations/005_zalo_ui.sql` (mới), `apps/zalo-worker/src/{account-session.ts,main.ts,store.ts,dbtests/p02-worker.db.test.ts}`, `apps/web/app/api/zalo/status/route.ts`, `apps/web/app/api/zalo/[account]/logout/route.ts` (mới), `apps/web/app/zalo/{ZaloBoard.tsx,display.ts,display.test.ts}` (2 file sau mới), `apps/web/tests/zalo-logout.db.test.ts` (mới).

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a. Migration 005 | 🟠 | Claude (Sonnet 5) |
| b. Route `POST /api/zalo/{account}/logout` | 🟠 | Claude (Sonnet 5) |
| c. Worker: `logout_requested_at` + `qr_state` | 🟠 | Claude (Sonnet 5) |
| d. Trang `/zalo` (4 trạng thái + hộp xác nhận) | 🟠 | Claude (Sonnet 5) |

## 5. Việc KHÔNG làm + lý do

- Không sửa `docs/zalo-worker.md` / `docs/web.md` để cập nhật trạng thái mới (mục "chưa có nút đăng xuất") — nằm trong `docs/**`, bị CẤM ở mục 2 của handoff; cần người/worker khác cập nhật (Ma Trận 6 Điểm §5.B của AGENTS.md).
- Không chạy `npm ci` / `npm run build` riêng lẻ (chỉ `npm run typecheck` tự gọi `npm run build -w @lenqclaw/core` như một bước con của chính lệnh được phép) — tránh ghi đè `dist` đang được worker H08 dùng, đúng luật ở handoff mục 1.
- Không đụng file của H08 (`scripts/**`, `evals/**`, `.env.example`, `handoff_to_staff.ts`, `save_job_draft.ts`) dù chúng đang sửa dở trong cây làm việc lúc tôi thi công — không stage, không commit.
- Actor của `audit_log action='zalo.logout'` được ghi ở phía web (route), KHÔNG ghi ở worker — quyết định tự chọn theo đúng câu "chọn một, ghi report" trong §9.8, vì actor (nhân viên bấm nút) chỉ web biết tại thời điểm request; worker không có actor.

## 6. Câu hỏi mở (cần người)

- Không có.

## 7. Tiếp theo

🖐 Cần tay người: chạy thử thật (quét QR bằng Zalo phụ) để xác nhận UI 4 trạng thái + nút đăng xuất hoạt động đúng trên trình duyệt thật (test hiện tại chỉ cover logic thuần + route DB, chưa render DOM/browser). · 🤖 Agent làm được ngay: cập nhật `docs/zalo-worker.md`/`docs/web.md` phản ánh tính năng mới (đang bị CẤM trong phạm vi gói này). · ⭐ Nên làm trước: chạy thử người trên `/zalo` (đăng nhập → đăng xuất → đăng nhập lại) vì đây là tính năng chạm trực tiếp vào phiên Zalo thật, rủi ro cao nhất nếu có lỗi logic ẩn ngoài phạm vi test giả lập. · ⏸ Chưa làm: cập nhật tài liệu `docs/**` và `brain4agent/**` theo Ma Trận 6 Điểm (bị cấm chạm trong phạm vi handoff này, cần một gói/worker riêng).

⏳ Chờ người duyệt.
