1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (vệ sinh test DB để đo được cổng G13; KHÔNG đổi mã sản phẩm).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` D42 → `specs/TESTING-ACCEPTANCE.md` dòng G13 → `brain4agent/-known-gotchas.md` G34, G35 → các file test ở §2.

## 1. BỐI CẢNH TỰ CHỨA
- Cổng G13: sau MỌI `npm run test:db`, truy vấn `select count(*)::int as violations from outbox o where o.kind='action' and (o.body->>'action') in ('remove_member','block_member') and not exists (select 1 from approvals a where a.id::text = o.body->>'approvalId' and a.status in ('approved','executed','failed'))` PHẢI = 0.
- SO đo (D42) trên DB tạm mới tinh sau `test:db` xanh 315: violations = 33. Cả 33 hàng đều có thẻ ĐÃ BỊ XOÁ bởi bước dọn của test (`delete from approvals …`), trong khi hàng `outbox` tham chiếu thẻ đó vẫn ở lại. Mã sản phẩm đúng; bộ đo bị nhiễm do dọn dữ liệu lệch.
- Ca `apps/zalo-worker/src/dbtests/p02-worker.db.test.ts:376` ("giả lập 50 tin / 20 người", timeout 120 s, baseline ~99 s) hết giờ khi máy tải cao ⇒ đỏ giả.
- DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). DB dev có rác cũ từ các lần đột biến — KHÔNG xoá dữ liệu ngoài dòng do test tạo; đo G13 trên DB tạm (§3.c).

## 2. PHẠM VI
- ĐƯỢC GHI: bước dọn (`afterAll`/cuối ca) trong `packages/core/src/dbtests/{sim-actions,p05-moderation,p05-join-welcome,p05-fix,p05-fix-f11}.db.test.ts`, `apps/zalo-worker/src/dbtests/{p02-fix,p02-group,p05-approval-event,p02-worker}.db.test.ts`, và file test khác nếu lần đo §3.c chỉ ra (ghi tên trong report); `scripts/check_g13.mjs` (mới — in `violations` dạng JSON, exit 1 nếu > 0); hồ sơ: `reports/R15_thi-cong_test-hygiene.md` + `evidence/TEST-HYGIENE/*`.
- CẤM ĐỤNG: mọi file KHÔNG phải test ngoài `scripts/check_g13.mjs`; assertion của test (chỉ sửa bước dọn và timeout); `package.json`; `planning/**` ngoài 2 đường hồ sơ; `brain4agent/`.

## 3. VIỆC PHẢI LÀM
a. Mọi chỗ test xoá `approvals` thì xoá TRƯỚC các hàng `outbox` mà `body->>'approvalId'` trỏ tới thẻ đó (chỉ dòng do chính test tạo — lọc theo id thẻ). Ca đột biến/hỏng giữa chừng (`afterAll` không chạy) không thuộc phạm vi.
b. `p02-worker.db.test.ts:407` timeout 120 s ⇒ 300 s, kèm chú thích lý do (đỏ giả khi máy tải cao); KHÔNG đổi số tin/người/kỳ vọng.
c. **Xong khi** (ghi `evidence/TEST-HYGIENE/`):
   - `scripts/check_g13.mjs` từng ĐỎ: chạy trên DB dev hiện tại (có rác) ⇒ exit 1 ⇒ `red-g13.txt`
   - Tạo DB tạm `lenqclaw_h15` trong container `lenqclaw-db-1` (`docker exec lenqclaw-db-1 psql -U lenqclaw -d lenqclaw -c "create database lenqclaw_h15"`), trỏ `DATABASE_URL` sang nó, `npm run test:db > test-db.txt` → exit 0, 0 skip, tổng 315 (203/30/82); rồi `node scripts/check_g13.mjs > g13.txt` → `violations: 0`, exit 0; chạy `test:db` lần 2 trên cùng DB tạm + `check_g13` lần 2 ⇒ vẫn 0 (`g13-2.txt`); xoá DB tạm.
   - `npm run gate > gate.txt` → `GATE_OK`; `npm test > test.txt` → 752, 0 fail, 0 skip
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh, commit bằng `git commit <đường>…` · KHÔNG push · kiểm mã thoát trực tiếp · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · không nới kỳ vọng test.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🟢 | có mẫu chép theo (bước dọn sẵn có), lệnh đo tự biết đúng/sai |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H15_thi-cong_test-hygiene.md`; dòng 3 `Base:`; dòng 4 `Head:`; bảng lệnh → exit → evidence; danh sách file test đã sửa bước dọn; bảng phân công; việc KHÔNG làm. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
