1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (vòng sửa P05 sau thẩm định R13 + SO đo lại).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` D40, D41 → `specs/SPEC-P05-Kiem-Duyet.md` **§11 (hợp đồng gói này)** + §2, §3, §4.1, §5.4, §5.5, §7.3 → `specs/01-CONTRACTS.md` §4.11 (dòng `botUid`), §7.1 (`decide_approval`) → `reports/R13_tham-dinh_P05.md` §3–§4 (ca tái hiện) + `evidence/P05-review/h13-review*.ts.txt` (test phá có sẵn — dùng lại được) → `docs/core.md`.

## 1. BỐI CẢNH TỰ CHỨA
- P05 (kiểm duyệt, thẻ duyệt, vào nhóm, chào mừng) đã thi công `9989aef..034a1ab`. Thẩm định R13: 0 CHẶN, 6 NÊN SỬA; SO đo lại thấy thêm 1 bộ đo lọt (M2) và 1 lỗi cô lập test (G35). SPEC-P05 §11 liệt kê đúng 14 mục phải sửa + 4 mục CHẤP NHẬN không sửa (F9, F12, F14, F15 — CẤM đụng).
- Hình đồ thị chốt (BB-16): F3/F6/F11 sửa trong THÂN node `moderate.ts`, giữ giá trị `stop='deleted'`. F2 đổi chữ ký `resolveBotUid(env, account, threadId)`; 4 node gọi nó (`gate`, `group-event`, `prepare`, `triage`) chỉ sửa dòng gọi để truyền `threadId` của state.
- Số đo trước: gate exit 0, `npm test` 721 (32/114/575), `test:db` 295 (187/30/78), 0 skip. DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu. Test dọn dữ liệu chỉ đụng dòng do chính test tạo (G34).

## 2. PHẠM VI
- ĐƯỢC GHI: `packages/core/src/services/{moderation,moderation-grid,approvals,join-requests,welcome,outbox-actions}.ts` + test; `packages/core/src/agent/community/bot.ts` + test; `packages/core/src/agent/community/graph/nodes/moderate.ts` (thân); `nodes/{gate,group-event,prepare,triage}.ts` (CHỈ dòng gọi `resolveBotUid`); `packages/core/src/runner/inbound-runner.ts` (dòng làm mới cache); `packages/core/src/agent/community/prompts/system.ts` (`APPROVAL_RESULT_DM`, `WELCOME_TEMPLATE`); `packages/core/src/agent/community/tools/{approval-tools,moderation-tools}.ts`; `packages/core/src/dbtests/**`; `apps/zalo-worker/src/store.ts` (`completeApproval`) + `apps/zalo-worker/src/dbtests/**` (test mới/sửa cho F4); `docs/core.md`, `docs/zalo-worker.md` (nếu có); hồ sơ: `reports/R14_thi-cong_P05-fix.md` + `evidence/P05-fix/*` (file mới).
- CẤM ĐỤNG: `graph/{shape,edges,pipeline,turn,state}.ts`, `db/migrations/**` (thiếu cột ⇒ dừng hỏi), `package.json`/`package-lock.json`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `lenqclaw_presentation_transcript.pdf`, mọi mục F9/F12/F14/F15.

## 3. VIỆC PHẢI LÀM (commit theo nhóm, test ĐỎ-trước rồi mới sửa)
a. **An toàn thẻ & bot:** F1, F7, F10, F2 (theo §11). F4: worker phát sự kiện `approval_executed` cùng định dạng `enqueueSystemEvent` của core (worker đã import `@lenqclaw/core` — dùng lại hàm, KHÔNG tự chép SQL).
b. **Kiểm duyệt:** M2, F3, F5, F6, F8, F11.
c. **Chào mừng & cô lập test:** F13, F16, G35.
d. Mỗi mục ở §11 có cột "Đo bằng" ⇒ test mới phải từng ĐỎ trên mã hỏng tương ứng: lưu `evidence/P05-fix/red-<mã>.txt` cho ÍT NHẤT M2, F1, F2, F3, F4, F6, F7; trả mã nguyên trạng sau mỗi lần. Chạy lại 2 bản test phá của H13 (`h13-review*.ts.txt` — chép tạm vào cây, chạy, xoá) ⇒ ca F1/F2/F3/F5/F8 phải xanh; lưu `evidence/P05-fix/h13-rerun.txt`.
e. Docs module theo thực tế.
f. **Xong khi** (chạy lại cuối, ghi `evidence/P05-fix/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 721 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` và lần 2 `> test-db-2.txt` → exit 0 cả hai, 0 skip, tổng ≥ 295 + ca mới; sau đó `select id, own_uid from zalo_accounts` ⇒ `own-uid.txt` = null
   - G35: đặt `own_uid='rac-g35'` cho dòng `community`, chạy `npx vitest run --config vitest.db.config.ts src/dbtests/p05-` trong `packages/core` ⇒ xanh ⇒ `g35.txt`; đặt lại null
   - `grep -rn "slice(0, 6)" packages/core/src/agent/community/prompts packages/core/src/services/approvals.ts > f10.txt` → 0 dòng
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh, commit bằng `git commit <đường>…` · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi ⇒ giải thích từng ca trong report; dự kiến đổi: ca `hasDecisionEvidence` có "không" lẫn trong câu, ca `repeat_burst` biên 5/6) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · vùng cấm SPEC-P05 §8 tuyệt đối · CẤM regex injection guard (BB-12) · CẤM log nội dung tin · SPEC mâu thuẫn mã ⇒ ghi câu hỏi trong report, làm phần độc lập; quyết định chưa có trong SPEC ⇒ dừng phần đó, hỏi.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🟠 | hợp đồng SPEC-P05 §11 + cột "Đo bằng", test tự biết đúng/sai |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H14_thi-cong_P05-fix.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng 14 mục §11 → test → kết quả → evidence; bảng bằng chứng đỏ; ca test cũ đổi kỳ vọng + lý do; bảng phân công; việc KHÔNG làm + lý do; câu hỏi cần người. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
