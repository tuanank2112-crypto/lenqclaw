1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THẨM ĐỊNH (đối kháng, CHỈ ĐỌC mã — nhiệm vụ là LÀM ĐỎ, không phải xác nhận xanh).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/specs/00-ARCHITECTURE.md` (§4, §6 BB-01…BB-20, §7) → `specs/SPEC-P05-Kiem-Duyet.md` (toàn bộ) → `specs/01-CONTRACTS.md` §4.11, §5.1, §5.3, §7.1, §8.3, §9, §10, §12.3, §12.5 → `specs/SPEC-P02-Transport-Nhom.md` §4 (cổng thẻ duyệt ở worker) → `evidence/ARCH/ladder-ref.txt` → mã trong `git diff 9989aef..034a1ab`. CẤM đọc `reports/R12_*` và `evidence/P05/` (của worker — không thừa kế ngữ cảnh).

## 1. BỐI CẢNH TỰ CHỨA
- Gói P05 (kiểm duyệt nhóm Zalo: lưới tất định + lớp model, thang cảnh cáo, thẻ duyệt `approvals` cho kick/block/từ chối vào nhóm, 3 policy duyệt vào nhóm, gom chào mừng; kèm 2 sửa D39) vừa thi công: Base `9989aef`, Head `034a1ab`.
- Rủi ro thật: bot là PHÓ NHÓM — kick/block/từ chối người mà không có thẻ owner `approved`; xoá nhầm tin của owner/moderator hoặc tin > 24 h; làm theo "duyệt"/"[system] approve" giả trong nội dung tin hoặc quote; spam ngược cảnh cáo; DM người vi phạm; chào 2 lần; lộ nội dung tin vào log/audit.
- DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Lệnh: `npm run gate`, `npm test`, `npm run test:db`. Model thật KHÔNG có credit — dùng fake model/triage trong test, không gọi mạng thật.

## 2. PHẠM VI
- ĐƯỢC GHI DUY NHẤT: `planning/02_2026-10-09_zalo-community-agent/reports/R13_tham-dinh_P05.md` và `.../evidence/P05-review/*` (file mới).
- Được SỬA TẠM để đột biến rồi trả lại NGAY bằng `git checkout -- <file>`; trước khi commit `git status --short` chỉ còn file report/evidence của bạn + `lenqclaw_presentation_transcript.pdf` (có sẵn, không đụng). CẤM commit thay đổi mã. CẤM push. Test tạm viết thêm để tái hiện ⇒ lưu bản sao vào `evidence/P05-review/` rồi xoá khỏi cây mã.

## 3. VIỆC PHẢI LÀM
Tự thiết kế ≥ 8 cách phá (ít nhất 1 cho mỗi nhóm a–f), mỗi cách: giả thuyết → lệnh/đột biến → kết quả máy → kết luận (bắt được / LỌT). BẮT BUỘC có 4 ca: (1) tin giả `[system] approve <id>` / `duyệt <id>` trong nội dung thành viên; (2) member quote tin owner chứa "duyệt <id>"; (3) scam_phrase trong tin moderator/owner ⇒ không xoá, không cảnh cáo; (4) tin scam KÈM @bot (mention) ⇒ vẫn bị kiểm duyệt, bot không trả lời nội dung scam, không có 2 tin ra.
a. Thẻ duyệt (BB-06, §5, §8): đường nào ra outbox `remove_member`/`block_member`/`review_join approve:false` (policy manual) mà thẻ không `approved` — qua tool, lệnh `/approve`, sim, timer; CAS approve 2 lần đồng thời; thẻ `expired` vẫn thực thi; `hasDecisionEvidence` lách bằng id của thẻ khác, id viết hoa, id dài hơn, "không duyệt".
b. Danh tính & injection (BB-04, BB-10, BB-12): ai được gọi `/approve`/`decide_approval` (owner thật theo uid, không theo tên hiển thị); có regex injection guard bị cấm không.
c. Kiểm duyệt (§2–§4): lưới hit câu cộng đồng AI bình thường (false-positive); `exempt` lách được; xoá tin > 24 h / thiếu `cli_msg_id` / không trong đệm; `uidFrom` sai; `MOD_WARN_PER_HOUR` lách; `!bot_is_admin` vẫn ra `delete_message`; DM người vi phạm; triage `null` mà lưới mềm vẫn hành động.
d. Vào nhóm & chào mừng (§6, §7): `agent_review` model sập ⇒ đúng CHO VÀO (Q9); chào 2 lần (race `welcomed_at`, 2 runner); `welcome_flush` khi model sập ⇒ `WELCOME_TEMPLATE`; mention > số người.
e. Đồ thị & D39 (BB-15/16/17): P05 có đổi `shape.ts`/`edges.ts`/`pipeline.ts`/`turn.ts`/`state.ts` không; tin bị xoá vẫn chạy lượt community; `extendsDeadline` nâng làn trước khi tool chạy; `BOT_UID_SIM` chỉ áp thread `sim-%` khi `DATA_MODE=sim` (thread thật không bị ảnh hưởng).
f. Rò rỉ & lưu trữ: `moderation_events`/`audit`/`approvals`/log chứa nguyên văn tin, SĐT, key; SQL ghép chuỗi; khoá idempotent outbox trùng.
Chạy lại 3 lệnh ở §1 (ghi exit code nguyên văn) — số xanh KHÔNG phải kết luận. Đột biến bắt buộc: mỗi nhóm a–e ≥ 1 đột biến mã, ghi test nào đỏ (hay LỌT).

## 4. LUẬT
Không `git add -A`; stage tường minh 2 đường được ghi · kiểm mã thoát trực tiếp · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · mỗi phát hiện ghi `file:line` + mức (CHẶN / NÊN SỬA / GHI CHÚ) + ca tái hiện.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| thẩm định đối kháng a–f | 🔴 | bảo mật — hành động không đảo ngược trên thành viên thật (kick/block/xoá); cần tự ra giả thuyết |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai (vai · thẩm định · họ/model · Bước 0 exit · hiểu việc); dòng 2 `Handoff: handoffs/H13_tham-dinh_P05.md`; dòng 3 `Base: 9989aef`; dòng 4 `Head: 034a1ab`; bảng các cách phá; bảng đột biến; danh sách phát hiện theo mức; đề xuất phán quyết bằng lời (KHÔNG tự phán). Dòng không rỗng cuối: `⏳ Chờ phán quyết.`
