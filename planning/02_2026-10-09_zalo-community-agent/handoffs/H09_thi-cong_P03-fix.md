1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (vòng sửa P03).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` mục **D35** (toàn bộ — đây là hợp đồng vòng sửa) → `reports/R08_tham-dinh_P03.md` (phát hiện + ca tái hiện) → `evidence/P03-review/*` (probe, đột biến) → `specs/01-CONTRACTS.md` §7.1, §12.2, §12.3, §12.5 → `specs/SPEC-P03-Runtime-Agent.md` §2, §5.3, §6.2, §6.4, §11 → `specs/SPEC-D31-Toc-Do-Giam-Sat.md` §5, §6.

## 1. BỐI CẢNH TỰ CHỨA
- P03 (runtime agent trên LangGraph + runtime D31) thi công ở `7273281..d8e744f`; thẩm định đối kháng R08 tìm 3 CHẶN + 8 NÊN SỬA + 8 GHI CHÚ, 6/16 đột biến LỌT. SO phán 🔁 và chốt cách sửa ở D35 (13 điểm). Gói này làm D35 điểm 1–12; điểm 13 HOÃN — KHÔNG làm. SPEC đã được SO sửa cho khớp D35 — đọc bản hiện tại.
- Số đo trước sửa: gate exit 0, `npm test` 499 (web 31 · worker 102 · core 366), `test:db` 182 (core 84 · web 25 · worker 73), 0 skip.
- DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu. Model thật KHÔNG có credit — chỉ dùng fetch giả.

## 2. PHẠM VI
- ĐƯỢC GHI: `packages/core/src/**` (trừ `adapters/alert.ts`), `scripts/check_adapter_boundary.mjs`, `apps/web/tests/**`, `apps/web/app/api/dev/sim/**`, `docs/core.md`, `docs/web.md`; hồ sơ: `reports/R09_thi-cong_P03-fix.md` + `evidence/P03-fix/*` (file mới).
- CẤM ĐỤNG: `apps/zalo-worker/**`, `db/migrations/**`, `package.json`/`package-lock.json`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `lenqclaw_presentation_transcript.pdf`. Thiếu cột/migration ⇒ dừng hỏi.

## 3. VIỆC PHẢI LÀM
a. Với MỖI điểm D35 1–11: viết test trước, chạy trên mã hiện tại ⇒ ĐỎ (ghi `evidence/P03-fix/red-<n>.txt`, n = số điểm D35) ⇒ sửa ⇒ XANH. Bắt buộc tái hiện ca R08: B3 + B4 (C1), B5 `stall_body` + `bad_json` cho cả Gemini và OpenAI-compat (C2), B1 + B1b (C3), A1 (N1), A2 (N2), C1 (N3), B2 (N4), E1 (N5).
b. Điểm 4: đo lại số lời gọi model (fetch giả): mention trả bằng `send_group_message` = 1, RAG = 2; ca vòng có tool `answers` LỖI (vd `GroupBudgetExceededError`) ⇒ VẪN gọi model; ca vòng trộn tool `answers` + tool thường ⇒ VẪN gọi model. Ghi `evidence/P03-fix/model-calls.txt`.
c. Điểm 12: chỉ sửa tên/ghi chú trong mã + test cho khớp SPEC đã sửa (không đổi hành vi).
d. Chạy lại đột biến LỌT của R08 (M5, M10, M11, M12, M14, M17 — script ở `evidence/P03-review/`, chép ra thư mục tạm NGOÀI repo để chạy) ⇒ mọi đột biến phải ĐỎ ⇒ `evidence/P03-fix/mutations-after.txt`. Đột biến nào thật sự không thể bắt bằng test có nghĩa ⇒ ghi lý do trong report (không bịa test). Trả mã nguyên trạng sau mỗi đột biến.
e. Docs module theo thực tế.
f. **Xong khi** (chạy lại cuối, ghi evidence):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 499 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip, 2 lần liên tiếp đều xanh
   - `npm run latency:slo -- --n 20 --fake-delay-ms 300 > latency-fake.txt` → exit 0; 3 ca đỏ G23 vẫn exit 1
   - `mutations-after.txt`: 0 đột biến LỌT (hoặc lý do từng ca)
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi test cũ ⇒ giải thích từng ca trong report; test P01 "12 processInbound" đổi theo D35.7) · không đổi node/cạnh đồ thị (BB-16) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · CẤM log nội dung tin/cookie/key · D35 mâu thuẫn mã/SPEC ⇒ ghi câu hỏi report, làm phần độc lập.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| D35 1–12 | 🟠 | hợp đồng D35 + ca tái hiện R08 có sẵn |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H09_thi-cong_P03-fix.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng D35 điểm → test mới → đỏ trước (evidence) → xanh sau; bảng số lời gọi model; bảng đột biến sau sửa; bảng phân công. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
