Vai: worker (vai-thi-cong) · loại: thi công (vòng sửa P05) · họ/model: Anthropic / Claude Sonnet 5.5 · Bước 0: exit 0 · hiểu việc: phạm vi = 14 mục SPEC-P05 §11 (M2, F1–F8, F10, F11, F13, F16, G35) trong danh sách ĐƯỢC GHI của H14 §2, test ĐỎ-trước rồi mới sửa; xong khi = gate `GATE_OK` exit 0, `npm test` ≥ 721 + ca mới 0 fail 0 skip, `test:db` ×2 exit 0 ≥ 295 + ca mới, `own_uid` null, G35 xanh, f10 0 dòng, `diff --stat` ⊆ phạm vi; cấm = F9/F12/F14/F15, `graph/{shape,edges,pipeline,turn,state}.ts`, migrations, package*.json, push, nới kỳ vọng test cũ
Handoff: handoffs/H14_thi-cong_P05-fix.md
Base: 128acac
Head: 1e1f469

## 1. Lệnh + exit code (nguyên văn)
| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| Bước 0 | `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 (stdout "NÃO ĐÃ OK"; cảnh báo BRN-028 `today.md` 152 dòng — ngoài phạm vi, không phải việc của worker) | — |
| gate | `npm run gate > gate.txt` | 0 (`GATE_OK`, `pivot_hits: 0`) | [gate](../evidence/P05-fix/gate.txt) |
| test | `npm test > test.txt` | 0 · **752** = 32 + 114 + 606 · 0 fail · 0 skip (trước 721 = 32/114/575: +31) | [test](../evidence/P05-fix/test.txt) |
| test:db lần 1 | `set -a; . ./.env; set +a; npm run test:db > test-db.txt` | 0 · **315** = core 203 + web 30 + worker 82 · 0 fail · 0 skip (trước 295 = 187/30/78: +20) | [test-db](../evidence/P05-fix/test-db.txt) |
| test:db lần 2 | `npm run test:db > test-db-2.txt` | 0 · 315 (203/30/82) · 0 skip | [test-db-2](../evidence/P05-fix/test-db-2.txt) |
| own_uid | `select id, own_uid from zalo_accounts` | `[{"id":"community","own_uid":null}]` | [own-uid](../evidence/P05-fix/own-uid.txt) |
| G35 | `own_uid='rac-g35'` ⇒ `npx vitest run --config vitest.db.config.ts src/dbtests/p05-` (packages/core) | 0 · 52/52 xanh · đã trả null | [g35](../evidence/P05-fix/g35.txt) |
| f10 | `grep -rn "slice(0, 6)" packages/core/src/agent/community/prompts packages/core/src/services/approvals.ts` | grep exit 1 · 0 dòng | [f10](../evidence/P05-fix/f10.txt) |
| diff-stat | `git diff --stat 128acac..1e1f469` | 27 file, +831/−58, ⊆ ĐƯỢC GHI (xem §6) | [diff-stat](../evidence/P05-fix/diff-stat.txt) |
Mã thoát từng lệnh: [exit-codes](../evidence/P05-fix/exit-codes.txt). Commit công việc: `04d16cb` (an toàn thẻ & bot) · `e8b724c` (kiểm duyệt) · `1e1f469` (chào mừng + docs).

## 2. 14 mục SPEC-P05 §11
| Mã | Sửa ở đâu | Test | Kết quả | Evidence đỏ |
| :-- | :-- | :-- | :-- | :-- |
| M2 | (mã đã đúng; lỗ hổng là bộ đo) | `p05-fix.db` "M2": tin `received_at` 25 giờ trước, qua pipeline ⇒ 0 `delete_message`, audit `moderation.cannot_delete {reason:too_old}`, event `warn` | ✅ | [red-M2](../evidence/P05-fix/red-M2.txt) (đột biến bỏ `ageMs > DELETE_MAX_AGE_MS` ⇒ ĐỎ) |
| F1 | `approvals.ts::hasDecisionEvidence` (thứ tự §5.4) | `approvals.test` +14 ca; `p05-fix.db` "đừng/chưa/khoan duyệt <mã>" ⇒ `IntentNotConfirmedError` cả hai hướng, thẻ `pending`, 0 outbox | ✅ | [red-F1-unit](../evidence/P05-fix/red-F1-unit.txt) (8 đỏ) · [red-F1](../evidence/P05-fix/red-F1.txt) (3 đỏ: thẻ bị `approved` + có outbox) |
| F2 | `bot.ts::resolveBotUid(env, account, threadId)`; 4 node chỉ sửa dòng gọi | `bot.test` +3 ca (2 lượt xen kẽ thread thật/`sim-*` trên cache đã nạp, hai thứ tự) | ✅ | [red-F2-unit](../evidence/P05-fix/red-F2-unit.txt) (2 đỏ) |
| F3 | `moderate.ts` (thân): `stop='deleted'` khi `!exempt && action != 'none'` | `p05-fix.db` F3: `!bot_is_admin` + scam kèm @bot ⇒ đúng 1 tin text (cảnh cáo), 0 `agent_runs`, 0 trace | ✅ | [red-F3](../evidence/P05-fix/red-F3.txt) |
| F4 | `apps/zalo-worker/src/store.ts::completeApproval` gọi `enqueueSystemEvent` của core | `p05-approval-event.db` (worker, 4 ca): thắng CAS ⇒ 1 `approval_executed`; gọi lại ⇒ `false`, không thêm; `ok=false` cũng 1; 2 lời gọi song song ⇒ 1 | ✅ | [red-F4](../evidence/P05-fix/red-F4.txt) (3 đỏ) |
| F5 | `moderation.ts::decideVerdict` (+`overruled`), audit `moderation.grid_overruled {hit}` | `moderation.test` (7 ca thuần) + `p05-fix.db` F5: scam + triage `ok` ⇒ 0 outbox, 0 event, 1 audit; triage sập (HTTP 500 ⇒ null) ⇒ vẫn xoá | ✅ | [red-F5-unit](../evidence/P05-fix/red-F5-unit.txt) (3 đỏ) · [red-F5](../evidence/P05-fix/red-F5.txt) |
| F6 | (cùng mã F3) | `p05-fix.db` F6: bot là phó nhóm + scam kèm @bot ⇒ 1 `delete_message`, 0 text, 0 `agent_runs`, 0 trace | ✅ | [red-F6](../evidence/P05-fix/red-F6.txt) (đột biến bỏ `stop:'deleted'` ⇒ F3 và F6 ĐỎ) |
| F7 | `outbox-actions.ts::assertRejectJoinAllowed`; `approvals.ts` truyền `approvalId` khi từ chối `approve_join` | `p05-fix.db` F7 (4 ca): thiếu `approvalId` / thẻ `pending` / sai uid / thẻ nhóm khác ⇒ `ApprovalRequiredError`; `reject_join` approved và `approve_join` rejected ⇒ qua; nhóm `agent_review` ⇒ qua; `approve:true` tự do | ✅ | [red-F7](../evidence/P05-fix/red-F7.txt) (3 đỏ) |
| F8 | `moderation.ts::gridContext` loại tin đang xét (`id <> row.id`); `moderation-grid.ts` chú thích | `p05-fix.db` F8: 4 tin trước + tin đang xét (thứ 5) ⇒ không hit; 5 trước + đang xét (thứ 6) ⇒ `repeat_burst` | ✅ | [red-F8](../evidence/P05-fix/red-F8.txt) |
| F10 | `prompts/system.ts::APPROVAL_RESULT_DM` → 8 ký tự | `welcome.test` "APPROVAL_RESULT_DM"; f10 grep 0 dòng | ✅ | [red-F13-F10-unit](../evidence/P05-fix/red-F13-F10-unit.txt) |
| F11 | `moderate.ts` (thân, nhánh `catch`): có hàng `outbox` `delete_message` của chính tin ⇒ vẫn `stop='deleted'` | `p05-fix-f11.db` (vi.mock `createApproval` ném, điểm 2,5 + scam ⇒ `block_requested`): 1 `delete_message`, audit `moderation.error`, 0 `agent_runs`, 0 trace, 0 text | ✅ | [red-F11](../evidence/P05-fix/red-F11.txt) |
| F13 | `prompts/system.ts::WELCOME_TEMPLATE` | `welcome.test` (7 ca thuần: SĐT che, một dòng, ≤ 40 ký tự, > 5 ⇒ 5 tên + "và N bạn khác") | ✅ | [red-F13-F10-unit](../evidence/P05-fix/red-F13-F10-unit.txt) (6 đỏ) |
| F16 | `welcome.ts::flushWelcomes`: xoá `welcome_pending_since` bằng CAS theo giá trị đã đọc VÀ không còn thành viên chưa chào trong cửa sổ | `p05-fix-f16.db` (vi.mock `enqueueSystemEvent` chèn `join` giữa chừng): flush 1 chào u1, phiên còn chờ; flush 2 chào u2 | ✅ | [red-F16](../evidence/P05-fix/red-F16.txt) |
| G35 | `dbtests/p03-helpers.ts::pinBotUidForTest` (đặt `own_uid=BOT_UID_SIM` cả file, khôi phục ở `afterAll`) dùng trong `p05-moderation` / `p05-join-welcome` / các file `p05-fix*` | `own_uid='rac-g35'` ⇒ p05-* 52/52 xanh | ✅ | [red-G35](../evidence/P05-fix/red-G35.txt) (test P05 cũ + `rac-g35` ⇒ 7 đỏ) · [g35](../evidence/P05-fix/g35.txt) |

## 3. Chạy lại 2 bản test phá của H13
Chép `h13-review.test.ts.txt` và `h13-review.db.test.ts.txt` vào cây, chạy, xoá (cây sạch sau đó): [h13-rerun](../evidence/P05-fix/h13-rerun.txt). Kết quả: unit 14/25 xanh, DB 13/14 xanh. Các ca đỏ KHÔNG phải hồi quy, giải thích từng nhóm:
| Ca đỏ | Vì sao |
| :-- | :-- |
| 6 ca `benign` + `repeat_burst "ok" ×5` (unit, H13 c) | Là phép thăm dò hành vi ĐÃ GHI NHẬN (câu cảnh báo chứa cụm scam, lưới `hard` ở tầng thuần). F5 bác ở tầng hợp nhất (`decideVerdict` khi có triage `ok`), không ở `classifyGrid`; Q13 (tin gọi bot không triage) giữ như cũ. Cũng đỏ ở R13. |
| 3 ca `hasDecisionEvidence` "đừng/chưa/khoan duyệt" kỳ vọng `reject` (unit, H13 a) | Nhãn kỳ vọng của H13 là `reject`; hợp đồng §5.4 chốt là `null` (hỏi lại, không đoán). Trên mã cũ các câu này trả `approve` (đã chứng minh ở `red-F1*`). Ca DB A3 cùng nội dung ở H13 XANH. |
| H13 e (race D39), unit | Gọi `resolveBotUid(env)` chữ ký cũ và import `BOT_UID_SIM` từ `bot.js` (không export). Bản chỉnh đúng 3 dòng (truyền `threadId`, import đúng nơi): [h13-rerun-e-adapted](../evidence/P05-fix/h13-rerun-e-adapted.txt) ⇒ XANH, in `luot that thay = uid-that-123 ; luot sim thay = sim-bot`. |
| C2 (DB, H13 c) | Fixture triage mặc định của H13 trả `ok` cho câu scam ⇒ theo F5 model bác lưới ⇒ 0 cảnh cáo thay vì 10. Đúng hành vi mới. |
Ca DB đã từng đỏ ở R13 và nay xanh: B4b (F3: bot không phó nhóm + scam kèm @bot).

## 4. Ca test cũ đổi kỳ vọng (không nới)
| File · ca | Đổi gì | Lý do |
| :-- | :-- | :-- |
| `bot.test.ts` D39 (3 ca) | `resolveBotUid({DATA_MODE:'sim'})` ⇒ `resolveBotUid(env, 'community', <threadId>)` | F2: không còn cờ `sim` dùng chung trong cache; sim tính theo `threadId` của chính lượt |
| `p05-d39.db.test.ts` D39(b) | tương tự, thêm một lần kiểm thread sim sau khi nạp thread thật | F2 |
| `p05-moderation.db.test.ts` | triage giả: cụm trong `SCAM_PHRASES` ⇒ trả `scam` 0.9 (trước: luôn `ok`); `id.slice(0, 6)` ⇒ `idShortOf(id)`; ghim `own_uid` ở `beforeAll`/`afterAll` | F5 (model `ok` bác lưới nên ca "scam bị xoá" cần model đồng ý); F10; G35 |
| `p05-join-welcome.db.test.ts` | ghim `own_uid` | G35 |
Ca `hasDecisionEvidence` có "không" lẫn trong câu và ca `repeat_burst` biên 5/6 mà H14 §4 dự kiến đổi: KHÔNG có ca cũ nào mang kỳ vọng đó (ca cũ `không duyệt <id>` ⇒ `reject` vẫn đúng; `classifyGrid` với `identicalRecentCount` 4/5/6/12 giữ nguyên). Biên 5/6 được kiểm ở ca DB MỚI (F8).

## 5. Quyết định ngoài chữ SPEC (chỗ người có thể đổi)
- F16: SPEC nêu "CAS theo giá trị đã đọc", nhưng `recordMemberJoin` dùng `coalesce(pending, now)` nên giá trị cột KHÔNG đổi khi join mới đến giữa chừng ⇒ CAS thuần không bắt được. Đã thêm điều kiện "không còn thành viên chưa chào trong cửa sổ" vào cùng câu `update` (chỉ nhánh nhóm bật chào; nhánh nhóm tắt dùng CAS thuần để không treo phiên). Không đổi `recordMemberJoin`.
- F5: audit `moderation.grid_overruled` ghi MỘT dòng cho MỖI hit bị bác (`data: {hit}`); chỉ bác hit `hard` (`HARD_HITS` export từ `moderation-grid.ts`); hit mềm giữ lại cho các dòng dưới của bảng §3.
- F11: nhận biết "đã xếp lệnh xoá" bằng truy vấn `outbox` (`kind='action'`, `body.action='delete_message'`, `body.msgId`) trong nhánh `catch`, không đổi chữ ký `moderateGroupMessage`.
- F7: kiểm trong `enqueueAction` đọc `join_policy` từ DB (không tin tham số của caller); `decideApproval` từ chối thẻ `approve_join` nay truyền `approvalId` của thẻ (cần để qua lớp chặn mới).
- F4: worker import sâu `@lenqclaw/core/services/system-events` (đường dẫn `./*` đã có trong `exports`; `index.ts` không sửa vì ngoài phạm vi).
- `inbound-runner.ts` KHÔNG đổi: `botUid(..., e.threadId)` vẫn làm mới cache `own_uid`; cờ sim bỏ khỏi cache nên không còn gì phải đổi ở runner.
- G35 được cài vào `pinBotUidForTest` (một hàm trong `p03-helpers.ts`) nên commit `e8b724c` (kiểm duyệt) chứa helper này vì các file `p05-fix*` dùng nó.

## 6. Phạm vi `git diff --stat 128acac..1e1f469` (27 file)
Tất cả trong ĐƯỢC GHI của H14 §2: `services/{moderation,moderation-grid,approvals,welcome,outbox-actions}.ts` + test; `agent/community/bot.ts` + test; `nodes/moderate.ts` (thân) và `nodes/{gate,group-event,prepare,triage}.ts` (mỗi file 1 dòng gọi `resolveBotUid`); `prompts/system.ts`; `apps/zalo-worker/src/store.ts` + `dbtests/p05-approval-event.db.test.ts`; `packages/core/src/dbtests/**`; `docs/core.md`, `docs/zalo-worker.md`. KHÔNG đụng: `graph/{shape,edges,pipeline,turn,state}.ts`, migrations, `package*.json`, `planning/**` ngoài 2 đường hồ sơ (R14 + `evidence/P05-fix`), `brain4agent/`, F9/F12/F14/F15, `join-requests.ts`, `inbound-runner.ts`, `approval-tools.ts`, `moderation-tools.ts`.

## 7. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a — an toàn thẻ & bot (F1, F7, F10, F2, F4) | 🟠 | Anthropic / Claude Sonnet 5.5 |
| b — kiểm duyệt (M2, F3, F5, F6, F8, F11) | 🟠 | Anthropic / Claude Sonnet 5.5 |
| c — chào mừng & cô lập test (F13, F16, G35) | 🟠 | Anthropic / Claude Sonnet 5.5 |
| docs (core.md, zalo-worker.md) | 🟢 | Anthropic / Claude Sonnet 5.5 — LỆCH luật K.3 ("không tự làm việc dưới tầng mình"): không có model 🟢 trong phiên này, làm tại chỗ; nội dung chỉ chép lại hành vi đã đo |

## 8. Việc KHÔNG làm + lý do
- F9, F12, F14, F15: CHẤP NHẬN theo SPEC-P05 §11, không đụng.
- Q13 (tin gọi bot không triage bị lưới xoá khi là câu cảnh báo): giá trị TẠM giữ nguyên; chờ người quyết.
- Không sửa test `p02-worker` (ngoài phạm vi), xem §9.
- Không cập nhật `brain4agent/` (cấm theo H14 §2; SO đồng bộ não).

## 9. Sự cố môi trường (đã đo, không phải lỗi mã)
- Ca `p02-worker` "giả lập 50 tin / 20 người" (đồng hồ ảo, giới hạn 120 s, baseline R13 chạy 99 s) hết giờ ở 2 lần `test:db` đầu và khi chạy đơn lẻ, kể cả trên MÃ NGUYÊN TRẠNG `128acac` (tôi `git checkout 128acac -- packages apps`, build, chạy đơn ca ấy ⇒ vẫn hết 120 s, rồi trả mã `HEAD`). Lúc đó CPU máy ~90–100% do tiến trình ngoài repo (`agy` ×5, `python`). Hai lần `test:db` cuối (số liệu §1) chạy khi tải giảm ⇒ xanh cả hai. Ghi nhận: ca này nhạy với tải máy, trần 120 s quá sát.
- Một lần tôi chạy nhầm `vitest run` của worker KHÔNG kèm `--config vitest.db.config.ts` (gồm cả file DB chạy song song) ⇒ 26 ca đỏ giả; không để lại dữ liệu (`outbox queued` ngoài sim = 0, `own_uid` null — đã đo).

## 10. Câu hỏi cần người
- Q13 vẫn mở (xem §8).
- Có muốn nâng trần 120 s của ca "giả lập 50 tin" (hoặc giảm số tick) ở `apps/zalo-worker/src/dbtests/p02-worker.db.test.ts` để bớt nhạy tải máy? (file ngoài phạm vi H14.)

## Tiếp theo
🖐 Cần tay người: duyệt hoặc trả báo cáo này; trả lời Q13 và câu về trần 120 s nếu muốn.
🤖 Agent làm được ngay: thẩm định đối kháng lại các mục F1–F8 bằng agent khác họ model; đồng bộ `brain4agent/` (Ma Trận 6 Điểm) sau phán quyết.
⭐ Nên làm trước: đo lại độc lập (gate + `npm test` + `test:db` ×2) trong lúc máy rảnh, vì ca 50-tin nhạy tải.
⏸ Chưa làm: F9/F12/F14/F15 (chấp nhận theo SPEC), Q13, đồng bộ não bộ, push.

⏳ Chờ phán quyết.
