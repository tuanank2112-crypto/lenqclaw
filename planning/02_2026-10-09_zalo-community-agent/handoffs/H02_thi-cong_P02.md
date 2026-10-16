1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0 (từ root repo `E:\vọc vạch\lenqclaw`; hub là junction ⇒ BẮT BUỘC cờ): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/specs/00-ARCHITECTURE.md` (§6 BB-02, BB-08, BB-11; §7) → `specs/01-CONTRACTS.md` (§2.3, §4 DDL bảng `zalo_groups`/`group_members`/`group_messages`/`join_requests`/`approvals`/`outbox`, §8, §9, §10) → `specs/SPEC-P02-Transport-Nhom.md` (toàn bộ) → `docs/zalo-worker.md`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
- Repo lenqclaw (TypeScript Node 22, npm workspaces `apps/web`, `apps/zalo-worker`, `packages/core`), nhánh `main`. Sản phẩm: agent chăm sóc cộng đồng Zalo; bot là phó nhóm. P01 đã xong (R01 ✅): schema 001–009, tài khoản duy nhất `community`, router core là KHUNG (nhóm ⇒ chỉ audit, chưa trả lời — P03 làm).
- Gói P02 = đường ống NHÓM: worker nhận tin + sự kiện nhóm, thi hành `outbox` action, pacer + ngân sách theo nhóm, kênh giả lập nhóm (`sim-actions.ts`, `/dev/sim`). KHÔNG viết logic agent (cổng nhận tin, trả lời, kiểm duyệt = P03/P05).
- zca-js 2.2.0 pin; tra tên/kiểu API thật trong `node_modules/zca-js/dist/**/*.d.ts` (vd `models/GroupEvent.d.ts`, `apis/*.d.ts`). CẤM nâng phiên bản.
- Số đo nền (2026-10-16, sau P01): `npm test` core 82 · web 31 · worker 37; `test:db` core 16 · web 14 · worker 27; `npm run gate` exit 0.
- DB dev: container `lenqclaw-db-1` ở `127.0.0.1:15432`. Repo KHÔNG tự nạp `.env` ⇒ trước mọi lệnh DB: `set -a; . ./.env; set +a`. CẤM in/ghi giá trị `.env`.
- Base: tự đo `git rev-parse HEAD` ngay trước lần sửa đầu tiên, ghi report dòng 3.

## 2. PHẠM VI
- ĐƯỢC GHI: `apps/zalo-worker/src/**` (gồm `testing/fake-client.ts`, `tools/pacer-sim.ts`, `dbtests/**`); `packages/core/src/sim/**` (thêm `sim-actions.ts`), `packages/core/src/dbtests/sim-actions.db.test.ts`, `packages/core/src/index.ts` (chỉ thêm export sim cần cho web); `apps/web/app/dev/sim/**`, `apps/web/app/api/dev/sim/**`, `apps/web/tests/sim-send.db.test.ts` (+ sửa `sim-tick.db.test.ts` nếu hợp đồng đổi); `packages/core/src/services/community-config.ts` CHỈ khi thiếu khoá env §10 cần cho pacer; `.env.example` (chỉ khoá pacer/nhóm §10 nếu thiếu); `docs/zalo-worker.md`, `docs/web.md`, `docs/core.md` (mục sim); hồ sơ: `planning/02_2026-10-09_zalo-community-agent/reports/R02_thi-cong_P02.md` + `evidence/P02/*` (file mới).
- CẤM ĐỤNG: `db/migrations/**` (P02 KHÔNG cần migration mới — thiếu cột ⇒ dừng, ghi câu hỏi); `packages/core/src/agent/**` (P03); `planning/**` ngoài 2 đường hồ sơ trên; `brain4agent/`; `package.json` `version`; 2 file chưa theo dõi ở root (`lenqclaw_presentation_transcript.pdf`, `repomix-output.xml`).
- VÙNG CẤM + LÝ DO: SPEC-P02 §8 (đọc kỹ: không seen nhóm, không react, không `getGroupChatHistory`, không action nguy hiểm, không đoán `cliMsgId`, không QR lại tự động).

## 3. VIỆC PHẢI LÀM (thứ tự gợi ý; evidence ghi bằng redirect, Git Bash, LF)
a. Bằng chứng ĐỎ trước khi sửa: viết ca test `delete_message` khẳng định `uidFrom` = người gửi gốc, chạy trên cây cũ ⇒ đỏ ⇒ `evidence/P02/red-delete-uid.txt`. Tương tự cho đối chứng §10 hàng 1 "uid bot ⇒ test đỏ" (test phải ĐỎ khi cố tình đưa uid bot).
b. Luồng vào §2 (tin nhóm, sự kiện nhóm, undo) + `ZaloClientLike` §3 (chữ ký ĐÚNG 01-CONTRACTS §8.1, fake-client đủ trường).
c. Action trong pacer §4 + pacer nhóm/ngân sách §5 + `pacer-sim.ts --group`.
d. Kênh giả lập §7: `simInbound` mở rộng, `applySimOutbox`, `/dev/sim` khung nhóm + API.
e. Docs module (Ma Trận 6 Điểm, mục kỹ thuật) theo thực tế.
f. Xong khi (chạy lại tất cả ở cuối, ghi evidence `evidence/P02/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0 (mọi bước, gồm `check_agent_tools` `forbidden_actions: 0`, `check_pivot_cleanup` 0)
   - `npm test > test.txt` → worker ≥ 51 (37 + ≥ 14 ca mới SPEC-P02 §10 hàng 1, liệt kê tên từng ca mới trong report), core ≥ 82, web ≥ 31; 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip; có đủ ca §10 hàng 2, 3, 4; chạy 2 lần liên tiếp đều xanh (dữ liệu tự cô lập — gotcha G29 trong `brain4agent/-known-gotchas.md`, được đọc)
   - `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group > pacer-group.txt` → `violations: 0`, `first_hour: 20`
   - `git diff --stat <Base>..HEAD > diff-stat.txt` → mọi đường ⊆ ĐƯỢC GHI
   - §10 hàng 6 (Zalo thật) KHÔNG làm — ghi "hoãn tới P09" trong report.

## 4. LUẬT
Không `git add -A`/`git add .` (stage TƯỜNG MINH) · không push · mã thoát 2 = dừng hỏi · không "sửa cho tốt hơn" ngoài SPEC · SPEC mâu thuẫn/thiếu ⇒ ghi mục câu hỏi report, làm phần độc lập, KHÔNG tự đổi SPEC · kiểm mã thoát trực tiếp (`$?`), không qua `| tail`/`| head` · commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của model bạn · CẤM log nội dung tin/cookie.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| b, c (worker inbound/action/pacer) | 🟠 | hợp đồng §8 + test fake-client tự biết đúng/sai |
| d (sim + /dev/sim) | 🟠 | hợp đồng §7 + test DB |
| e docs | 🟢 | chép theo thực tế |

## 6. REPORT PHẢI CÓ
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai (vai · thi công · họ/model · Bước 0 exit · hiểu việc), dòng 2 `Handoff: handoffs/H02_thi-cong_P02.md`, dòng 3 `Base:`, dòng 4 `Head:` (commit CÔNG VIỆC cuối); 7 mục; khối mã ≤ 30 dòng, trỏ evidence bằng link `../evidence/P02/<ten>.txt`; bảng phân công thực tế (gói → tầng → họ/model). Report commit RIÊNG sau commit công việc. Dòng không rỗng cuối: `⏳ Chờ phán quyết.` — CẤM tự phán.

Report: `planning/02_2026-10-09_zalo-community-agent/reports/R02_thi-cong_P02.md` · Evidence: `planning/02_2026-10-09_zalo-community-agent/evidence/P02/`
