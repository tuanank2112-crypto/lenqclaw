1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P02-Zalo-Transport.md` §9 (**§9.8 là hợp đồng gói này**) → `brain4agent/-known-gotchas.md` G18–G20 → `docs/zalo-worker.md` → `docs/web.md`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. Zalo giai đoạn 1 (`apps/zalo-worker`, trang `/zalo`) đã duyệt và chạy thử thật: người dùng quét QR nhưng không biết phải bấm xác nhận trên điện thoại (mã hết hạn), và không có cách đăng xuất (zca-js không có API đăng xuất). Gói này thêm đăng xuất + trạng thái QR theo §9.8. Song song, một worker khác đang chạy máy chấm (`scripts/eval*`, `evals/**`, `.env.example`, `handoff_to_staff.ts`) — KHÔNG đụng; KHÔNG chạy `npm ci`/`npm run build` khi chưa hỏi (ghi đè `dist` làm hỏng lượt chấm của họ): chỉ `npm run typecheck`, `npm test`, `test:db`. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432`; tạo database riêng `lq_h09`, CẤM đụng database khác (nhất là `lenqclaw` đang dùng cho chạy thử), drop khi xong.

## 2. PHẠM VI
ĐƯỢC GHI: `apps/zalo-worker/src/**`, `apps/web/app/zalo/**`, `apps/web/app/api/zalo/**`, `apps/web/tests/*zalo*`, `db/migrations/005_zalo_ui.sql` (mới), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R09_thi-cong_P02-ui.md, evidence/P02-ui/**}`.
CẤM ĐỤNG: mọi thứ khác — nhất là `db/migrations/00[1-4]_*`, `packages/**`, `scripts/**`, `evals/**`, `.env*`, `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `package*.json`.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Migration 005 §9.8. Xong khi: DB rỗng `npm run db:migrate` ⇒ `applied: 5`.
b. Route `POST /api/zalo/{account}/logout` + nhánh worker không chạy. Xong khi: test route 401/403/200; sau 200 khi worker không chạy ⇒ `session_enc` null + `logged_out`.
c. Worker: xử lý `logout_requested_at` (dừng listener/pacer tài khoản, xoá phiên, audit) + ghi `qr_state` theo sự kiện QR. Xong khi: test với zca-js giả — logout ⇒ không còn gửi/nhận, `session_enc` null; chuỗi sự kiện qr→scanned→expired ⇒ `qr_state` đúng từng bước; hết hạn KHÔNG tự xin QR mới.
d. Trang `/zalo` theo §9.8 (4 trạng thái hiển thị + hộp xác nhận đăng xuất có câu G18). Xong khi: test render/logic trạng thái (hoặc test hàm chọn hiển thị thuần) xanh.
Xong khi (toàn gói): `npm run typecheck`, `npm test`, `DATABASE_URL=…/lq_h09 npm run test:db` (DB rỗng) exit 0; 0 skip; số test không giảm so với nền tự đo.
Evidence BẮT BUỘC: `evidence/P02-ui/{baseline,typecheck,test,test-db,migrate,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <paths>`. Không push. Không "sửa cho tốt hơn" ngoài §9.8. Commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu ⇒ "Câu hỏi mở", KHÔNG sửa `specs/`. Chuỗi hiển thị tiếng Việt CÓ DẤU. CẤM kết nối Zalo thật. Kiểm mã thoát trực tiếp.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c, d | 🟠 | hợp đồng chốt ở §9.8; test giả tự biết đúng/sai |

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H09_thi-cong_P02-ui.md`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence riêng `docs(plan-01): report R09` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R09_thi-cong_P02-ui.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P02-ui/test.txt`
