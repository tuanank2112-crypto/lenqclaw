# 📅 Nhật Ký Làm Việc Ngày 2026-10-14 (Session Memory Log)

> Cập nhật lúc: `2026-10-14` | Phiên bản: `v0.0.1` (hồ sơ 02 SPEC đã duyệt + D22–D25) · PHIÊN MỚI NHẤT Ở TRÊN CÙNG (script xoay giữ phần đầu file)

---

## 🏁 Phiên 2026-10-14 — Chuyển repo về workspace `vọc vạch`, D22–D25, lộ trình doanh nghiệp

### 🎯 Chỉ đạo
Bỏ `D:\lenqclaw`, chỉ dùng bản ở workspace. Người dùng góp ý đề xuất "agent chuẩn doanh nghiệp": không giữ hội thoại dài (đọc ~5 lượt gần nhất + ghi chú cũ); dùng zca-js cho cả cộng đồng và doanh nghiệp của mình; thiếu kế hoạch skill/voice/constraint; thiếu lộ trình chuẩn doanh nghiệp.

### ✅ Đã làm
- Bước 0 `--check` exit 0 (cờ `--preserve-symlinks-main`).
- So `D:\lenqclaw` với bản E: cùng HEAD `412f214`, 6 file chưa commit + `.env` giống từng byte ⇒ an toàn xoá; `rm -rf` bị cơ chế an toàn của Claude Code chặn ⇒ người tự xoá.
- Plan 02: D22 (ngữ cảnh DM có trần, không nén), D23 (tenant `default`, migration 009), D24 (`turn_traces`), D25 (chỉ zca-js) + bảng thay thế; SPEC 00 (BB-13, BB-14, vùng cấm), 01 (§1, §2.1, §4 DDL 009, §6, §7.1 bỏ `recall_member_profile`, §10, §11), P01, P03, P04, P06, P07, P08, OPERATIONS, TESTING (G21).
- Roadmap: lộ trình chuẩn doanh nghiệp 5 giai đoạn (0.1.0 → 1.0.0); kernel, changelog, -data-architecture đồng bộ.

- (tiếp) Người dùng đã dời `D:\lenqclaw` đi; workspace `CLAUDE.md` ghi bản ở đây là DUY NHẤT + luật "cập nhật não thường xuyên".
- Push `origin/main` `eada365..0c0a5c6` (6 commit) — exit 0.
- Sự cố xoay ký ức: `rotate_memory.js` giữ phiên ở ĐẦU file (quy ước mới nhất ở trên) nhưng `today.md` ghi nối cuối ⇒ lần xoay đầu giữ 3 phiên CŨ nhất, đẩy 10-09/10-14 vào archive. Hoàn tác (xoá 3 file archive do lần xoay sai sinh ra), đảo `today.md` thành mới nhất ở trên, xoay lại. Gotcha G30.

- (tiếp) Người dùng: voice = GIỌNG ĐIỆU; xác nhận gỡ 94 file sàn thợ "di chuyển an toàn" ⇒ **D26**: SO đánh tag `archive/plan-01-marketplace` = `d7f50eb`, push tag, kiểm 94/94 file trong tag (`evidence/P01/archive-tag.txt`); WIP `resident.ts` lưu `evidence/P01/resident-ts-wip-diff.txt` rồi trả về HEAD. Commit `b356f07` (pushed).
- Phóng song song: worker P01 (🟠, handoff `H01_thi-cong_P01.md`) và architect kế hoạch 03 Skill · Voice · Constraint (🔴, chỉ soạn `planning/03_2026-10-14_skill-voice-constraint/`, không commit). Docker Desktop bật lại; DB dev `lenqclaw-db-1` :55432.
### ⏭ Treo
- DDL 009 CHƯA áp thử (Docker tắt) ⇒ P01 áp thử, ghi `evidence/P01/migration-009-probe.txt`.
- Chờ R01 (P01) để SO đo lại + phán; chờ architect nộp bộ SPEC kế hoạch 03 để SO duyệt + commit.
- Các mục treo của phiên 2026-10-09 vẫn còn (trừ push — đã làm).

---

## 🏁 Phiên 2026-10-09 — Pivot sang agent cộng đồng Zalo

### 🎯 Chỉ đạo
Người dùng: "thôi. không cần nữa… xoay quanh toàn bộ về agent chat chăm sóc các cộng đồng trong zalo trước". Sàn việc thợ "bỏ đi"; cộng đồng = người quan tâm AI agent + người muốn setup AI CSKH; bot là phó nhóm; dựa OpenClaw + monas-team/zaloclaw nhưng tự customize.

### ✅ Đã làm
- Bước 0 `init_brain.js --check` exit 0 (khung 1.7.1).
- Nghiên cứu OpenClaw + zaloclaw (clone chỉ đọc, findings có file:line) — lỗi zaloclaw không lặp lại (xoá tin sai `uidFrom`, mega-tool 153 action, send-file, regex injection guard, đệm RAM) nằm ở vùng cấm 00-ARCHITECTURE §7.
- **Đ32** (kế hoạch 01): DỪNG, không nghiệm thu; mọi `[ ]` còn lại BỎ.
- Architect dựng bộ SPEC kế hoạch 02 (`7a58d6d`): 00, 01, P01–P08, OPERATIONS, TESTING + `evidence/ARCH/` (migration 007/008 áp từ rỗng 21/21, gate 28/28, ladder 14/14, budget 20 tin/giờ gap ≥ 9000 ms, db-checks 5/5).
- SO duyệt (`f6a4465`): D12–D21 giữ, Q1–Q12 giữ giá trị tạm. Đồng bộ não theo kế hoạch 02 (phiên này, skill `nao-dong-bo`): kernel, project-intro, -data-architecture, index, roadmap, changelog.

### ⏭ Treo
- 🖐 Người xác nhận GỠ 94 file sàn thợ (AGENTS §5.L.3) — mở khoá P01; code CHƯA đổi.
- 🖐 Q1–Q12 (đang giá trị tạm); tài khoản Zalo phụ cho bot + Zalo thành viên thử + nhóm thử; persona thật + tri thức ban đầu; quota/billing Gemini cho golden; thông báo xử lý dữ liệu cho nhóm thật.
- 🖐 5 file lạ chưa theo dõi: `lenqclaw_presentation_transcript.pdf` (root), `docs/presentation-transcript.html`, `docs/progress-dashboard.html`, `docs/lenqclaw_presentation_transcript.pdf`, `docs/images/11-tien-do-du-an.png`; `packages/core/src/agent/prompts/resident.ts` sửa dở (sàn thợ, BỎ — sẽ gỡ ở P01).
- Push chưa làm; thu hồi key OpenRouter + Vyce đã dán trong chat.

---

## 🏁 Phiên 2026-09-25 (khuya) — H08 vòng 4 bằng Gemini
- Bước 0 exit 0. SO probe Gemini `gemini-3.6-flash` 22:50 ⇒ HTTP 200 (quota đã hồi) ⇒ phụ lục H08 §9 (`c1f51c0`): chấm lại đủ 4 bộ một lần với prompt `resident.ts` đang treo; đạt ⇒ commit prompt; trượt ⇒ đúng 1 vòng sửa; 429 dồn dập ⇒ nộp `blocked`, không đổi provider. Phóng worker 🟠 chạy nền.

- Architect soạn Đ27 (SPEC-P05 §10 + SPEC-P04 §8, 01-CONTRACTS/TESTING/OPERATIONS): hiểu ý thợ bằng model, 9 tool thợ, `runTimers(now)` không pg-boss, migration 006, P04 tối thiểu; tự chạy thử SQL trên DB tách riêng (200 claim/50 cuốc ⇒ 0 hai người thắng; bản hỏng 20). Commit `7dd16e4` CHỜ DUYỆT, Q1–Q10 có giá trị tạm.
- R08 vòng 4 (`3be813e`): Docker tắt ⇒ worker tự bật lại; quota Gemini cạn giữa lượt ⇒ diagnosis/responsibility blocked, emergency 97/100 (nhiễu hạ tầng) ⇒ SO phán ⛔ DỪNG (G26). Phát hiện: model sập toàn phần ⇒ khẩn cấp gián tiếp chỉ còn lưới từ khoá.
- 3 file presentation lạ xuất hiện 23:50 (1 ở root) — không phải của agent, chờ người.

- **Đ28 (người dùng):** "dùng tạm deepseek trong vyce" ⇒ `.env` `MODEL_PROVIDER=vyce` (key dán lại trùng key cũ; probe 200, 1,4 s). Gate vẫn theo Đ26 — không chấm lại bằng DeepSeek.
- Người dùng hỏi "chỉ cần thay deepseek vào phần gemini chưa làm?" ⇒ không ghép số hai model, nhưng **Đ29** chấm bù theo route (triage không đổi ⇒ giữ số khẩn cấp/đồng ý real-run-1). H08 vòng 5: cờ `--set` (`0347210`, R08 ✅ sau SO đo lại DB rỗng riêng + gate 0).
- Người dùng: "toàn bộ quá trình tôi đều duyệt cho bạn làm" ⇒ Đ27 ĐÃ DUYỆT (Q1–Q10 giữ giá trị tạm), đồng bộ 00-ARCH §4/§7 + SPEC-P02 §3.5, H12 (P05-B) `a0f832a`, push `origin/main` = `a0f832a`, phóng worker 🟠.
- R12 (P05-B) ✅: SO đo lại DB rỗng riêng — gate 0, `npm test` 296, `test:db` 165, 0 skip, `sim_claims` 0/`--break` 1. Chấp nhận 2 file ngoài danh sách tên (`job-state.ts` = máy trạng thái, `job-code.ts` export ALPHABET). Phóng H13 (P05-C) ∥ H14 (P05-E). Push `daf5239`.

- Cả hai worker bị ngắt 3:10 vì giới hạn phiên Claude ⇒ chạy tiếp bằng SendMessage lúc 04:05 (chưa commit gì nên không mất việc).
- R14 vòng 1 🔁: route đình chỉ thợ nhả cuốc trước khi đặt `suspended` + bỏ sót `access_granted` (lộ PII) ⇒ Đ30 SPEC-P05 §10.17 (G27). R13 vòng 1 🔁: 11/67 ca golden nằm nguyên văn trong prompt thợ (G28). Hai vòng 2 xong ⇒ SO đo cả cây DB rỗng: gate 0, `npm test` 317, `test:db` 192, 0 skip; bằng chứng đỏ độc lập (tắt chốt chặn ⇒ 1/6 đỏ) ⇒ R13 ✅, R14 ✅.

- **Đ31** (SO): model sập ⇒ hotline + đẩy cho người (SPEC-P03 §11.12). H15 ⇒ R15 ✅ (SO đo lại DB rỗng: 317/196; worker quên commit ⇒ SO commit). Gotcha G29 hàng đợi `inbound_events` dùng chung.

### ⏭ Treo
- Lượt Gemini sau ~14h: H08 `--set diagnosis,responsibility` + golden thợ `vendor-intent.mjs`; review 🔴 prompt + golden thợ; lượt Gemini `--set diagnosis,responsibility` sau ~14h (quota ngày); duyệt Đ27 + Q1–Q10; quyết 3 file presentation; câu hỏi đường lùi khẩn cấp khi model sập.

---
