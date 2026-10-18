1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (gói P06 — kéo sang 1-1, thẻ lead, hồ sơ thành viên, ghi chú ngày, tìm trí nhớ).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` D06, D07, D22, D28 → `specs/SPEC-P06-Lead-Tri-Nho.md` (toàn bộ — hợp đồng gói này) → `specs/01-CONTRACTS.md` §4 (`leads`, `member_profiles`, `daily_notes`), §5.2, §7.1 (dòng 5 tool P06), §11 → `specs/SPEC-P03-Runtime-Agent.md` §5, §7.3 (mục "Ghi nhớ"), §8 → `specs/SPEC-P04-Tri-Thuc.md` §2 (RRF) → `db/migrations/008_community.sql` (DDL 3 bảng) → `brain4agent/-known-gotchas.md` G29, G34, G35, G36 → `docs/core.md`.

## 1. BỐI CẢNH TỰ CHỨA
- P01–P05 đã nghiệm thu. Đã có sẵn: `services/memory.ts` (`rememberMemberNote`, `loadMemberContext`), tool `remember-member-note.ts`, dòng policy cho 6 tool P06 (`policy.ts:39-57`), `LeadIncompleteError`/`UnknownMemberError` (`domain/errors.ts`), cấu hình `memoryHalfLifeDays`/`leadScoreHandoff` (`community-config.ts`), DDL 3 bảng (migration 008), `embedPending` + RRF của P04. Gói này đối chiếu phần có sẵn với SPEC-P06 rồi làm phần còn thiếu — KHÔNG đổi hình đồ thị (BB-16), KHÔNG checkpointer/Store (BB-17).
- KHÔNG có credit model thật: dùng fetch giả. SPEC-P06 §7 hàng 5 (golden `lead_intent`) thuộc P09a — KHÔNG làm ở đây.
- Số đo trước: gate exit 0, `npm test` 752 (32/114/606), `test:db` 315 (203/30/82), 0 skip. DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu.

## 2. PHẠM VI
- ĐƯỢC GHI: `packages/core/src/services/{memory,leads}.ts` (+ test), `packages/core/src/retrieval/search-memory.ts` (+ test), `packages/core/src/services/knowledge.ts` (CHỈ để `embedPending` nhúng thêm `daily_notes.embedding` — §4), `packages/core/src/agent/community/tools/**` (tool `invite_to_private`, `save_lead`, `submit_lead`, `search_memory`, `write_daily_note`; sửa `remember_member_note` nếu lệch §2; đăng ký trong `tools/index.ts`), `packages/core/src/agent/community/prompts/**` (câu `rules` cho lead: hỏi ≤ 2 trường/lượt; gợi ý `[gợi ý: có thể là khách tiềm năng]` trong khối focus nhóm — §3), `packages/core/src/agent/community/graph/nodes/prepare.ts` (CHỈ thân, nếu khối gợi ý lead cần dựng ở đây), `packages/core/src/domain/errors.ts`, `packages/core/src/dbtests/**`, `docs/core.md`; hồ sơ: `reports/R16_thi-cong_P06.md` + `evidence/P06/*` (file mới).
- CẤM ĐỤNG: `graph/{shape,edges,pipeline,turn,state}.ts`, `db/migrations/**` (thiếu cột ⇒ dừng hỏi), `apps/**` (trang `/leads` là P08), `package.json`/`package-lock.json`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`.

## 3. VIỆC PHẢI LÀM (commit theo gói, test ĐỎ-trước)
a. **Lead:** `leads.ts` §3 (`scoreLead` thuần, `upsertLead`, `submitLead`) + tool `save_lead`/`submit_lead` ⇒ SPEC-P06 §7 hàng 1–2.
b. **Trí nhớ:** đối chiếu `memory.ts` với §2 (cắt 4000, định dạng dòng, `loadMemberContext` một truy vấn mỗi bảng, `missing` đúng thứ tự §3); `search-memory.ts` §4 (lai lexical + vector + RRF × suy giảm chỉ cho `daily_notes`); tool `search_memory`, `write_daily_note`; `embedPending` nhúng `daily_notes` ⇒ hàng 3.
c. **Mời riêng:** tool `invite_to_private` §1 (đi qua đường gửi nhóm nội bộ có ngân sách; DM chỉ khi uid đã từng nhắn VÀO bot) ⇒ hàng 4.
d. Bộ đo MỚI phải từng ĐỎ trên mã hỏng (`evidence/P06/red-*.txt`), tối thiểu: `invite_to_private` DM cả uid chưa nhắn ⇒ đỏ; `submitLead` bỏ kiểm `qualified` ⇒ đỏ; bỏ suy giảm ⇒ ca "note hôm qua trên note 60 ngày" đỏ; prompt/khối nhóm có `notes` ⇒ ca BB-07 đỏ; tin nhóm chứa `leads.contact` ⇒ đỏ (vùng cấm §5 — test: outbox nhóm KHÔNG chứa giá trị `contact`). Trả mã nguyên trạng sau mỗi lần.
e. Docs module theo thực tế.
f. **Xong khi** (chạy lại cuối, ghi `evidence/P06/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 752 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` và lần 2 `> test-db-2.txt` → exit 0 cả hai, 0 skip; sau đó `own_uid` = null
   - `node scripts/check_g13.mjs` trên DB tạm mới tinh sau test:db (cách làm ở `handoffs/H15_thi-cong_test-hygiene.md` §3.c — nếu file script chưa có trên `main` thì bỏ dòng này, ghi trong report) ⇒ `violations: 0` ⇒ `g13.txt`
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh, commit bằng `git commit <đường>…` · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi ⇒ giải thích từng ca) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · vùng cấm SPEC-P06 §5 tuyệt đối · BB-07 (lượt nhóm không chạm `member_profiles`) · CẤM log nội dung tin/`contact` · test dọn dữ liệu: chỉ dòng do chính test tạo, xoá thẻ/lead thì xoá outbox trỏ tới chúng (G36), không giả định `own_uid` (G35) · SPEC mâu thuẫn mã ⇒ ghi câu hỏi report, làm phần độc lập; quyết định chưa có trong SPEC ⇒ dừng phần đó, hỏi.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🟠 | hợp đồng SPEC-P06 + bảng nghiệm thu, test tự biết đúng/sai |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H16_thi-cong_P06.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng SPEC-P06 §7 hàng 1–4 → lệnh → kết quả → evidence; bảng bằng chứng đỏ; phần có sẵn đã đối chiếu (giữ/sửa gì); bảng phân công; việc KHÔNG làm + lý do; câu hỏi cần người. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
