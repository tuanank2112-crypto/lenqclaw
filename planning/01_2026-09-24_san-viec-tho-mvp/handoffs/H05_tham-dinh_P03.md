1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THẨM ĐỊNH.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). THẨM ĐỊNH: DỪNG ở `--check`, ghi mã thoát vào report; CẤM chạy chế độ GHI. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ10, Đ17–Đ19) → `specs/00-ARCHITECTURE.md` §6–§7 → `specs/01-CONTRACTS.md` §3–§7, §9 → `specs/SPEC-P03-Resident-Agent.md` (toàn bộ; §10 là hợp đồng thi công) → `specs/TESTING-ACCEPTANCE.md` §1–§3. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH
Repo `D:\lenqclaw`, nhánh `main`. Dải được thẩm định: `4955b5a..e3d2079` (gói P03: migration 002 truy hồi từ khoá, 8 tool agent cư dân, `residentHandler`/`runResidentTurn`, khẩn cấp tất định, PII, `db:seed:sim`, golden + `scripts/eval_golden.mjs`, nối `/dev/sim`). Bất biến trọng tâm: BB-01, BB-02, BB-03, BB-06, BB-08 (00-ARCHITECTURE §6). KHÔNG đọc `reports/R03_*`, `evidence/P03/*`, `handoffs/H03_*` — đó là lời của worker.
Song song với bạn, một worker khác đang sửa `adapters/model.ts` trên `main` (H04 Gemini) — KHÔNG phải việc của bạn; bạn thẩm định ĐÚNG `e3d2079` trong worktree riêng. Máy không có credential Anthropic ⇒ mọi phép phá cần model dùng model giả có kịch bản (`setModelClientForTest`) — model giả đóng vai model bị prompt injection/đưa đầu vào xấu, để thử xem TOOL có tự giữ luật không (BB-01: luật nằm trong tool).
Postgres dev đang chạy (`127.0.0.1:55432`, user/pass `lenqclaw`). Tạo database riêng: `docker exec lenqclaw-db-1 psql -U lenqclaw -d lenqclaw -c "create database lq_audit3"`; CẤM đụng database khác.

## 2. PHẠM VI
CHỈ ĐỌC + chạy lệnh đo. Được ghi ĐÚNG hai chỗ trong repo: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R05_tham-dinh_P03.md` và `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P03-audit/`. Mọi chạy/phá thử làm trong `git worktree add <scratch ngoài repo> e3d2079` (test phá thử viết TẠM trong worktree đó, không commit); `git worktree remove --force` khi xong. CẤM sửa bất kỳ file nào khác trong `D:\lenqclaw`, kể cả tạm thời.

## 3. VIỆC PHẢI LÀM
a. Trong worktree `e3d2079`: `npm ci`, `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_audit3 npm run test:db` (DB rỗng), `npm run gate`, `npm run eval:golden` (kỳ vọng exit 3). Ghi exit code + tổng/pass/fail/skip.
b. `git diff --stat 4955b5a..e3d2079`, so với phạm vi được ghi: `packages/core/**`, `apps/web/**` (chỉ nối handler `/dev/sim` + chọn kịch bản), `db/migrations/002_*.sql`+, `evals/**`, `scripts/eval_golden.mjs`, `package*.json`, `planning/…/{plan.md, reports/R03*, evidence/P03/**}`. File ngoài danh sách ⇒ lệch.
c. Đối chiếu từng mục SPEC-P03 §1–§10 với mã thật; mỗi mục: khớp / lệch (trích `file:dòng`). Chú ý riêng: `max_tokens` so §10.8; vòng tool nối nguyên `content`; một message `user` cho mọi `tool_result`; kiểm `refusal` trước `content`; LLM không chạy trong transaction; `pg-boss` không xuất hiện.
d. Tự thiết kế và chạy ≥6 cách phá KHÁC những gì test hiện có kiểm. Bắt buộc gồm: (1) PII tới model: SĐT/mã căn viết biến thể (cách, chấm, `+84`, không dấu, số chữ) trong tin cư dân và trong lịch sử — có lọt vào `messages` gửi model không; (2) model giả gọi `classify_responsibility` với citation bịa id / id của mục `deprecated` / hết hiệu lực / mục của tòa khác ⇒ phải ép `unclear`; (3) `open_service_case` khi cư dân nói "không đồng ý lắm", "ok để em hỏi vợ", hoặc model giả tự khẳng định đồng ý ⇒ phải từ chối; (4) cư dân A hỏi `get_my_cases` hoặc thao tác case của cư dân B (đổi id trong input tool) ⇒ phải chặn (BB-08); (5) khẩn cấp: không dấu, teencode, viết hoa, chen ký tự ("c.h.á.y") và ≥5 câu gần giống nhưng không khẩn cấp ⇒ đếm bỏ sót/báo nhầm; (6) cùng một tin inbound xử lý hai lần/đồng thời ⇒ đúng một trả lời trong outbox; (7) `search_regulations` với chuỗi chèn SQL / ký tự `'`, `%`, `\`. Mỗi cách: lệnh, kết quả, ĐỎ (tìm ra lỗi) hay XANH (giữ được).
e. Đánh giá bằng lời có số: `scripts/eval_golden.mjs` đang chấm một lượt `callModel` — liệt kê cụ thể nó KHÔNG đo được gì so với vòng agent thật (Đ19-4), để làm đầu vào cho gói viết lại máy chấm.

## 4. LUẬT
Không đọc lời kể của worker; phán bằng số đo; không sửa gì ngoài 2 chỗ được ghi. Không push. Commit đúng một commit `docs(plan-01): audit report R05`: `git add` tường minh report + evidence rồi `git commit -m … -- <đúng các đường đó>` (worker H04 có thể commit cùng lúc; gặp `index.lock` ⇒ chờ vài giây, thử lại). Tắt mọi server đã bật; `drop database lq_audit3`; gỡ worktree.

## 5. TẦNG
🔴 — cổng có bất biến PII, trách nhiệm có trích dẫn, danh tính cư dân.

## 6. REPORT
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai loại thẩm định; `Handoff: handoffs/H05_tham-dinh_P03.md`/`Base: 4955b5a`/`Head: e3d2079`) + mục riêng "Cách phá đã thử → kết quả" + danh sách lệch SPEC có mức độ (chặn / nên sửa / ghi chú) + mục e. Dòng không rỗng cuối cùng = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Evidence = stdout máy, redirect, không sửa tay.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R05_tham-dinh_P03.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P03-audit/rerun.txt`
