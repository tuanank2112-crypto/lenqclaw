1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THẨM ĐỊNH.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). THẨM ĐỊNH: DỪNG ở `--check`, ghi mã thoát vào report; CẤM chạy chế độ GHI. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 → `specs/00-ARCHITECTURE.md` → `specs/01-CONTRACTS.md` → `specs/SPEC-P01-Foundation.md` → `specs/TESTING-ACCEPTANCE.md` §1–§2. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH
Repo `D:\lenqclaw`, nhánh `main`. Dải được thẩm định: `b7e907f..e585851` (gói P01: monorepo, migrations/seed, adapter db/model/transport, máy trạng thái cuốc, SimTransport + `/dev/sim`, auth web 3 vai, máy đo). SPEC đối chiếu: SPEC-P01 toàn bộ, 01-CONTRACTS §2–§6, §8–§9, 00-ARCHITECTURE §6 (BB-02, BB-04, BB-05, BB-07, BB-09). KHÔNG đọc `reports/R01_*`, `evidence/P01/*`, `handoffs/H01_*` — đó là lời của worker.
Postgres dev: `docker compose -f compose.yaml -f compose.dev.yaml up -d db` (đã chạy sẵn, container `lenqclaw-db-1`, `127.0.0.1:55432`, user/pass/db `lenqclaw`). Tạo database riêng cho mình để phá thử: `docker exec lenqclaw-db-1 psql -U lenqclaw -d lenqclaw -c "create database lq_audit"`; CẤM đụng database `lenqclaw` và `lq_verify`.

## 2. PHẠM VI
CHỈ ĐỌC + chạy lệnh đo. Được ghi ĐÚNG hai chỗ: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R02_tham-dinh_P01.md` và `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P01-audit/`. Phá thử trên bản sao tạm NGOÀI repo (vd `git worktree add <thư mục scratch> e585851` rồi `git worktree remove` khi xong, hoặc `git clone`). CẤM sửa bất kỳ file nào khác trong repo, kể cả tạm thời.

## 3. VIỆC PHẢI LÀM
a. Chạy lại mọi "xong khi" của TESTING §1 và SPEC-P01 §9 trên HEAD `e585851` (worktree sạch): `npm ci`, `npm run typecheck`, `npm run build` (KHÔNG đặt `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_audit npm run test:db`, `npm run gate`. Ghi exit code + tổng/pass/fail/skip.
b. `git diff --stat b7e907f..e585851` và so với phạm vi: chỉ được `package*.json`, `tsconfig*.json`, `.gitattributes`, `.env.example`, `compose*.yaml`, `apps/**`, `packages/**`, `db/**`, `scripts/**`, `evals/scenarios/**`.
c. Đối chiếu từng mục SPEC-P01 §1–§8 với mã thật; mỗi mục: khớp / lệch (trích `file:dòng`).
d. Tự thiết kế và chạy ≥5 cách phá KHÁC những gì test hiện có kiểm. Bắt buộc gồm: (1) giả mạo/sửa cookie `lq_session` (đổi role, đổi exp, bỏ chữ ký, chữ ký rỗng) qua HTTP thật tới `next start`/`next dev` với `SESSION_SECRET` đặt sẵn; (2) truy cập `/dev/sim` và API của nó khi `DATA_MODE≠sim` và khi role `bql_staff`/`guard`; (3) gọi thẳng các route API ghi dữ liệu (sim, auth) không cookie; (4) `transitionJob` đua đồng thời + cặp ngoài bảng; (5) máy đo `check_adapter_boundary` bỏ lọt: import `pg` bằng `require`/dynamic `import()`/đường dẫn con (`pg/lib/...`), `INSERT  INTO outbox` nhiều khoảng trắng/xuống dòng. Mỗi cách: lệnh, kết quả, ĐỎ (tìm ra lỗi) hay XANH (giữ được).
e. Kiểm bí mật: không có mật khẩu/khoá thật trong cây (`git grep` các mẫu `sk-ant-`, `password=`, `SESSION_SECRET=` có giá trị thật).

## 4. LUẬT
Không đọc lời kể của worker; phán bằng số đo; không sửa gì ngoài 2 chỗ được ghi. Không push. Commit đúng một commit `docs(plan-01): audit report R02` chứa report + evidence, stage tường minh. Tắt mọi server đã bật; `drop database lq_audit` khi xong; gỡ worktree tạm.

## 5. TẦNG
🔴 — cổng có auth/phân quyền và bất biến PII/outbox.

## 6. REPORT
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai loại thẩm định; `Handoff:`/`Base: b7e907f`/`Head: e585851`) + mục riêng "Cách phá đã thử → kết quả" + danh sách lệch SPEC có mức độ (chặn / nên sửa / ghi chú). Dòng không rỗng cuối cùng = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết, CẤM để trống. Evidence = stdout máy, redirect, không sửa tay.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R02_tham-dinh_P01.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P01-audit/rerun.txt`
