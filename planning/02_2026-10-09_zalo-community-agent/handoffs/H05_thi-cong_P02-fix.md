1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (vòng sửa P02).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` mục **D29** (toàn bộ — đây là hợp đồng vòng sửa) → `reports/R03_tham-dinh_P02.md` (phát hiện + ca tái hiện) → `evidence/P02-review/mutations.txt`, `probes.txt`, `mutate.mjs.txt`, `probe.mts.txt` → `specs/SPEC-P02-Transport-Nhom.md` §4, §8, §9 → `specs/01-CONTRACTS.md` §5.1, §6 (`OutboxAction`), §8.3, §8.4.

## 1. BỐI CẢNH TỰ CHỨA
- P02 (worker nhóm, action quản trị, pacer/ngân sách, sim nhóm) thi công ở `c1177bd..d2b385b`; thẩm định đối kháng R03 tìm 1 CHẶN (kick/block không cần thẻ duyệt hợp lệ) + 6 NÊN SỬA; SO phán 🔁 và chốt cách sửa ở D29 (9 điểm). Gói này chỉ làm đúng D29 điểm 1–8; điểm 9 là HOÃN — KHÔNG làm.
- Số đo trước sửa: `npm test` 209 (core 85 · web 31 · worker 93), `test:db` 94 (core 29 · web 21 · worker 44), gate exit 0, `pacer-sim --group` `first_hour: 20`, `violations: 0`.
- DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu.
- Song song có agent architect đang sửa `planning/02_*/specs/*.md` (không đụng mã). Bạn KHÔNG sửa specs.

## 2. PHẠM VI
- ĐƯỢC GHI: `apps/zalo-worker/src/**`, `packages/core/src/sim/**`, `packages/core/src/dbtests/sim-actions.db.test.ts`, `apps/web/app/api/dev/sim/**`, `apps/web/tests/sim-*.db.test.ts`, `scripts/check_agent_tools.mjs`, `docs/zalo-worker.md`, `docs/web.md`; hồ sơ: `reports/R05_thi-cong_P02-fix.md` + `evidence/P02-fix/*` (file mới).
- CẤM ĐỤNG: `db/migrations/**` (không cần migration; thiếu cột ⇒ dừng hỏi), `packages/core/src/agent/**`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `package.json`, `lenqclaw_presentation_transcript.pdf`.

## 3. VIỆC PHẢI LÀM
a. Với MỖI điểm D29 1–8: viết test trước, chạy trên mã hiện tại ⇒ ĐỎ (ghi `evidence/P02-fix/red-<n>.txt`, n = số điểm D29) ⇒ sửa ⇒ XANH. Điểm 1 phải tái hiện đủ 3 ca P1 của R03 (không approvalId · approval `pending` · approval `rejected`) + ca uid đích lệch + ca hai tick cùng approval (chỉ 1 lần gọi Zalo).
b. Điểm 8: chạy lại script đột biến của thẩm định (`evidence/P02-review/mutate.mjs.txt`, chép ra thư mục tạm NGOÀI repo để chạy) cho M7, M15, M18, M19, M21, M22 + M1–M3 ⇒ mọi đột biến phải ĐỎ ⇒ `evidence/P02-fix/mutations-after.txt`. Mã trả lại nguyên trạng sau mỗi đột biến (`git status --short` sạch phần mã).
c. Docs module theo thực tế.
d. Xong khi (chạy lại cuối, ghi evidence):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 209 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip, chạy 2 lần liên tiếp đều xanh
   - `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group > pacer-group.txt` → `violations: 0`, `first_hour: 20`
   - `mutations-after.txt`: 0 đột biến LỌT
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh · không push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi test cũ ⇒ giải thích từng ca trong report) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · CẤM log nội dung tin/cookie · D29 mâu thuẫn mã/SPEC ⇒ ghi câu hỏi report, làm phần độc lập.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| D29 1–8 | 🟠 | hợp đồng D29 + ca tái hiện có sẵn |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H05_thi-cong_P02-fix.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng D29 điểm → test mới → đỏ trước (evidence) → xanh sau; bảng đột biến sau sửa; bảng phân công. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
