1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (gói P05 — kiểm duyệt, thang cảnh cáo, thẻ duyệt, duyệt vào nhóm, chào mừng; kèm 2 sửa D39).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` D06, D17, D19, D29, D30, D35, **D39** + §6 Q9, Q12 → `specs/SPEC-P05-Kiem-Duyet.md` (toàn bộ — hợp đồng gói này) → `specs/01-CONTRACTS.md` §4.11, §5.1, §5.3, §7.1, §8.3, §9, §10, §12.3, §12.5 → `specs/SPEC-P03-Runtime-Agent.md` §2, §4.3, §6.1, §6.4 → `specs/SPEC-D31-Toc-Do-Giam-Sat.md` §4 T3, §5.2 → `evidence/ARCH/ladder-ref.txt` → `docs/core.md`.

## 1. BỐI CẢNH TỰ CHỨA
- P01–P04 đã nghiệm thu. P03 dựng KHUNG node `moderate` (trả `{}`), `group_event` (audit stub), nhánh `welcome_flush`/`join_request` của `system_event` (`system_no_turn`); `decideDelivery` đã có `join_default` (Q9: model im/sập ⇒ CHO VÀO) và `hostText` nhánh `group_welcome`. Gói này điền thân, KHÔNG đổi node/cạnh (BB-16).
- Worker P02 đã là lớp chặn cuối BB-06 (kick/block chỉ khi `approvals.status='approved'`, CAS). D30(3): sim CHƯA kiểm thẻ cho kick/block ⇒ gói này thêm để test core thấy cổng như worker.
- Hai sửa D39 làm TRƯỚC (mục 3.0): nâng làn trước tool `extendsDeadline`; `botUid` sim + dọn `own_uid` test.
- KHÔNG có credit model thật: triage/model đều fetch giả. SPEC-P05 §10 hàng 6 (golden thật `moderation`) thuộc P09a; hàng 7 (thẩm định đối kháng) là H RIÊNG do agent khác làm — KHÔNG làm ở đây.
- Số đo trước: gate exit 0, `npm test` 602 (web 32 · worker 114 · core 456), `test:db` 258 (core 150 · web 30 · worker 78), 0 skip. DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu. Test dọn dữ liệu chỉ đụng dòng do chính test tạo (G34).

## 2. PHẠM VI
- ĐƯỢC GHI: `packages/core/src/services/{moderation,moderation-grid,moderation-ladder,approvals,join-requests,welcome}.ts` (mới) + test, `packages/core/src/agent/community/tools/**` (tool §1), `packages/core/src/agent/community/policy.ts`, `packages/core/src/agent/community/prompts/**`, `packages/core/src/agent/community/bot.ts`, `packages/core/src/agent/community/graph/nodes/{moderate,group_event,system_event,tools}.ts` (CHỈ thân node — cấm `shape.ts`, `edges.ts`, `pipeline.ts`, `turn.ts`, `state.ts`), `packages/core/src/sim/**` (kiểm thẻ kick/block), file chứa `runTimers` (bước `flushWelcomes`, `expireApprovals`, `reconcileDeletes`, hết hạn `join_requests` — vị trí SPEC-P07 §2), `packages/core/src/services/community-config.ts`, `packages/core/src/domain/errors.ts`, `packages/core/src/db/seed.ts` (chỉ câu `rules` §3 về `flag_message`), `packages/core/src/dbtests/**`, `apps/zalo-worker/src/dbtests/p03b-worker.db.test.ts` (chỉ dọn `own_uid` ở `afterAll`), `apps/web/tests/sim-*.db.test.ts` (khi tập `steps`/hành vi sim đổi), `docs/core.md`; hồ sơ: `reports/R12_thi-cong_P05.md` + `evidence/P05/*` (file mới).
- CẤM ĐỤNG: file đồ thị nêu trên, `db/migrations/**` (DDL `moderation_*`/`approvals`/`join_requests` đã có ở 008; thiếu cột ⇒ dừng hỏi), `apps/zalo-worker/src/**` ngoài 1 file test trên, trang `/approvals` (P08), `package.json`/`package-lock.json`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `lenqclaw_presentation_transcript.pdf`.

## 3. VIỆC PHẢI LÀM (commit theo gói)
0. **Sửa D39 (commit riêng, test đỏ-trước):** (a) node `tools`: tool `extendsDeadline` ⇒ `escalateLane` NGAY TRƯỚC khi chạy, `ctx.deadlineAt` truyền vào tool là hạn `rag` (test: lượt fast gọi `search_knowledge` khi còn < 3500 ms nhưng > 300 ms ⇒ embed nhận hạn rag, không rơi về lexical); (b) `botUid`: `DATA_MODE=sim` + thread `sim-%` ⇒ `BOT_UID_SIM` bất kể cột (test: cột có uid thật ⇒ sim mention vẫn khớp); `p03b-worker.db.test.ts` dọn `own_uid` ở `afterAll` (test:db xong ⇒ `select own_uid from zalo_accounts` = null).
a. **P05-A thuần:** `moderation-grid.ts` §2, `moderation-ladder.ts` §4, `hasDecisionEvidence` §5.4 ⇒ SPEC-P05 §10 hàng 1–3 (14 ca ladder NGUYÊN VĂN `ladder-ref.txt`; 40 câu cộng đồng AI ⇒ 0 hit).
b. **P05-B kiểm duyệt + thẻ:** `moderation.ts` §3/§4.1 (điền node `moderate`; tin bị xoá ⇒ cạnh `afterModerate` ⇒ END), tool §4.2, `approvals.ts` §5, lệnh `/approve`/`/reject`, sim kiểm thẻ kick/block (D30.3), prompt `rules` thêm câu `flag_message` (§3 D31) ⇒ hàng 4 (a)–(i…).
c. **P05-C vào nhóm + chào mừng:** `join-requests.ts` §6 (3 policy), `welcome.ts` §7, node `group_event` + nhánh `system_event` ⇒ hàng 5.
d. Mỗi bộ đo MỚI phải từng ĐỎ ít nhất một lần trên mã cố tình hỏng (`evidence/P05/red-*.txt`), tối thiểu: bỏ làm tròn 1 chữ số ⇒ ladder đỏ; bỏ `exempt` ⇒ ca moderator đỏ; `hasDecisionEvidence` chấp nhận chỉ id ⇒ đỏ; sim bỏ kiểm thẻ kick ⇒ đỏ; bỏ `welcomed_at` trước lượt ⇒ ca "chào 2 lần" đỏ. Trả mã nguyên trạng sau mỗi lần.
e. Docs module theo thực tế.
f. **Xong khi** (chạy lại cuối, ghi `evidence/P05/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0 (`check_agent_tools` vẫn 0 tool cấm)
   - `npm test > test.txt` → tổng ≥ 602 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip, 2 lần liên tiếp đều xanh; sau đó `own_uid` = null
   - `npm run latency:slo -- --n 20 --fake-delay-ms 300 > latency-fake.txt` → exit 0 (không treo)
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh, commit bằng `git commit <đường>…` · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi ⇒ giải thích từng ca) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · vùng cấm SPEC-P05 §8 tuyệt đối (kick/block/từ chối `manual` không có thẻ `approved` là BUG; không DM người vi phạm; không xoá tin > 24 h / thiếu `cli_msg_id`) · CẤM regex injection guard (BB-12) · CẤM log nội dung tin · SPEC mâu thuẫn mã ⇒ ghi câu hỏi report, làm phần độc lập; quyết định chưa có trong SPEC ⇒ dừng phần đó, hỏi.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| 3.0, P05-A, B, C | 🟠 | hợp đồng SPEC-P05 + D39 + bảng nghiệm thu, test tự biết đúng/sai |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H12_thi-cong_P05.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng SPEC-P05 §10 hàng 1–5 + D39 (a)(b) → lệnh → kết quả → evidence; bảng bằng chứng đỏ; bảng phân công; việc KHÔNG làm + lý do; câu hỏi cần người. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
