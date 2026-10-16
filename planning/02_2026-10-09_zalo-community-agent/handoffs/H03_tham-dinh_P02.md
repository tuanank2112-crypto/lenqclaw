1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THẨM ĐỊNH (đối kháng, CHỈ ĐỌC mã — nhiệm vụ là LÀM ĐỎ, không phải xác nhận xanh).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/specs/00-ARCHITECTURE.md` (§6, §7) → `specs/01-CONTRACTS.md` (§4 bảng nhóm/outbox/approvals, §8, §9, §10) → `specs/SPEC-P02-Transport-Nhom.md` (toàn bộ) → mã trong `git diff 5f233d8..d2b385b`. CẤM đọc `reports/R02_*` và `evidence/P02/` (của worker — không thừa kế ngữ cảnh).

## 1. BỐI CẢNH TỰ CHỨA
- Gói P02 (worker Zalo nhận tin/sự kiện nhóm, thi hành action quản trị, pacer + ngân sách theo nhóm, kênh giả lập nhóm) vừa thi công xong: Base `5f233d8`, Head `d2b385b`. Bot là PHÓ NHÓM bằng tài khoản Zalo cá nhân (zca-js 2.2.0) — rủi ro thật: bị Zalo KHOÁ tài khoản vì gửi dày, XOÁ NHẦM tin người khác, hành động quản trị ngoài thẻ duyệt, lộ nội dung tin/cookie ra log.
- DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Lệnh: `npm run gate`, `npm test`, `npm run test:db`, `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group`.

## 2. PHẠM VI
- ĐƯỢC GHI DUY NHẤT: `planning/02_2026-10-09_zalo-community-agent/reports/R03_tham-dinh_P02.md` và `.../evidence/P02-review/*` (file mới).
- Được SỬA TẠM để đột biến (mutation) rồi trả lại NGAY bằng `git checkout -- <file>`; trước khi commit report `git status --short` chỉ được còn file report/evidence của bạn + `lenqclaw_presentation_transcript.pdf` (có sẵn, không đụng). CẤM commit thay đổi mã. CẤM push.

## 3. VIỆC PHẢI LÀM
Tự thiết kế ≥ 6 cách phá (ít nhất 1 cho mỗi nhóm a–f), mỗi cách: giả thuyết → lệnh/đột biến → kết quả máy → kết luận (bắt được / LỌT).
a. Xoá nhầm: `delete_message` có đường nào gửi `uidFrom` = uid bot, hoặc đoán `cliMsgId` từ `msgId`, hoặc xoá khi thiếu dữ liệu (SPEC-P02 §4.2, §8, §9)?
b. Khoá tài khoản: pacer/ngân sách có đường lọt (nhóm không có dòng `zalo_groups`, budget 0, nhiều chunk một tin, action chen text, nhiều tick liền, đồng hồ lùi)? Đột biến bỏ kiểm ngân sách/gap ⇒ test có ĐỎ không?
c. Hành động nguy hiểm: có action ngoài bảng §4.2 thi hành được không (`disperse_group`, `leave_group`, `send_file`, tên lạ)? `remove_member`/`block_member` có chạy mà không qua `approvals`? `check_agent_tools` có bắt biến thể (nháy kép, template string) không?
d. Nhóm: có gửi `seen`/`react` cho nhóm, gọi `getGroupChatHistory`, tự QR lại không?
e. Rò rỉ: log/audit có ghi nội dung tin, cookie, số điện thoại? `/api/dev/sim/*` có chạy khi `DATA_MODE` ≠ `sim` hoặc vai `operator`/chưa đăng nhập? Có SQL ghép chuỗi từ input?
f. Đúng hợp đồng: `sync_group_info` có HẠ vai moderator? `review_join` 166/170/178; `linkSentGroupMessage`; `group_event` loại không ghi. Đối chiếu chữ ký 01-CONTRACTS §8.1 và payload §8.2 từng trường.
Cũng chạy lại 4 lệnh ở §1 (ghi exit code nguyên văn) — nhưng số xanh KHÔNG phải kết luận.

## 4. LUẬT
Không `git add -A`; stage tường minh 2 đường được ghi · kiểm mã thoát trực tiếp · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · mỗi phát hiện ghi `file:line` + mức (CHẶN / NÊN SỬA / GHI CHÚ) + ca tái hiện.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| thẩm định đối kháng a–f | 🔴 | bảo mật + rủi ro khoá tài khoản; cần tự ra giả thuyết |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai (vai · thẩm định · họ/model · Bước 0 exit · hiểu việc); dòng 2 `Handoff: handoffs/H03_tham-dinh_P02.md`; dòng 3 `Base: 5f233d8`; dòng 4 `Head: d2b385b`; bảng các cách phá; danh sách phát hiện theo mức; đề xuất phán quyết bằng lời (KHÔNG tự phán). Dòng không rỗng cuối: `⏳ Chờ phán quyết.`
