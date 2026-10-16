Vai: worker (vai-thi-cong) · loại: thi công (vòng sửa P02, D29 điểm 1–8) · họ/model: Claude / claude-sonnet-5-5 · Bước 0: exit 0 · hiểu việc: phạm vi = `apps/zalo-worker/src/**`, `packages/core/src/sim/**` + `dbtests/sim-actions.db.test.ts`, `apps/web/tests/sim-*.db.test.ts`, `scripts/check_agent_tools.mjs`, `docs/zalo-worker.md`+`docs/web.md`, hồ sơ R05 + `evidence/P02-fix/*`; xong khi gate `GATE_OK`, `npm test` ≥209 + ca mới 0 fail, `test:db` ×2 xanh, `pacer-sim --group` violations 0 / first_hour 20, đột biến sau sửa 0 lọt, diff ⊆ phạm vi; cấm migration, `agent/**`, specs, brain4agent, `package.json`, điểm 9 (hoãn), push.
Handoff: handoffs/H05_thi-cong_P02-fix.md
Base: 831dca9
Head: 2723955

## 1. Lệnh bắt buộc (§3.d) — exit nguyên văn

| Lệnh | Exit | Số đo | Evidence |
| :-- | :-- | :-- | :-- |
| `npm run gate` (không nạp `.env`) | 0 | `GATE_OK`; forbidden_tools 0 / forbidden_actions 0 / unlisted_tools 0 | `evidence/P02-fix/gate.txt` |
| `npm test` | 0 | web 31 + worker 102 + core 85 = **218** pass / 0 fail / 0 skip (trước sửa 209; +9 ca: actions 2, check-agent-tools 4, pacer 3) | `evidence/P02-fix/test.txt` |
| `npm run test:db` (lần 1) | 0 | core 33 + web 24 + worker 73 = **130** pass / 0 fail / 0 skip (trước 94; +36) | `evidence/P02-fix/test-db.txt` |
| `npm run test:db` (lần 2 liên tiếp) | 0 | 33 + 24 + 73 = 130 pass / 0 fail / 0 skip | `evidence/P02-fix/test-db-2.txt` |
| `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group` | 0 | `first_hour: 20`, `min_gap_ms: 9000`, `violations: 0` | `evidence/P02-fix/pacer-group.txt` |
| `git diff --stat 831dca9..2723955 -- . ':!planning'` | — | 16 file, +781/−53, mọi file ⊆ ĐƯỢC GHI (loại `planning/` vì architect commit song song vào `specs/`, ngoài tay worker) | `evidence/P02-fix/diff-stat.txt` |

## 2. Bảng D29 điểm → test mới → đỏ trước → xanh sau

"Đỏ trước" = test cuối cùng chạy trên mã gốc Base (stash riêng các file nguồn, giữ test) — file `evidence/P02-fix/red-<n>.*.txt`. "Xanh sau" = cùng test trên Head (lệnh §1).

| D29 | Test mới | Đỏ trước (evidence) | Xanh sau |
| :-- | :-- | :-- | :-- |
| 1 | `p02-fix.db.test.ts` "D29.1": 9 ca chặn (không approvalId · không uuid · không tồn tại · `pending` · `rejected` · đã `executed` · uid đích lệch · thẻ khác thread · thẻ `kick_member` dùng cho `block_member`) ⇒ `failed(approval_invalid)` + audit `zalo.action_blocked`, 0 lần gọi Zalo, thẻ không đổi; thẻ hợp lệ ⇒ 1 lần gọi + `executed`; **hai hàng cùng approval (2 tick)** ⇒ 1 lần gọi; **hai pacer đồng thời** ⇒ 1 lần gọi; `claimApproval` CAS gọi 2 lần (lần 2 `false`) + `release`; `ZaloActionError` ⇒ thẻ `failed` không dùng lại; `ZaloRateLimitError` ⇒ requeue + trả thẻ. Unit `pacer.test.ts` "D29.1" (claim từ chối ⇒ không gọi Zalo) | `red-1.worker-db.txt` 12 fail / 2 pass (ca hợp lệ + ca rate-limit giữ nguyên hành vi) · `red-1.worker-unit.txt` 1 fail | xanh (worker db 73) |
| 2 | "D29.2": nhóm chưa khai (`delete_message`, `create_poll`) ⇒ `cancelled(group_unknown)` + audit; `enabled=false` (text + action) ⇒ `cancelled(group_disabled)` + audit; `sync_group_info` ở nhóm lạ vẫn chạy (tạo dòng `enabled=false`) rồi text sau đó ⇒ `group_disabled` | `red-2.worker-db.txt` 3 fail | 3 xanh |
| 3 | "D29.3": đồng hồ worker lệch +20′ (< TTL 30′), 3 tin gửi 50′ trước, ngân sách 3 ⇒ tin 4 giữ `queued` `group_budget`; `groupTextSentLastHour.length === 2` (không còn tham số đồng hồ) | `red-3.worker-db.txt` 2 fail | 2 xanh |
| 4 | "D29.4": `create_poll`/`create_reminder`/`create_note`/`update_group_settings` + `ECONNRESET` ⇒ `failed(outcome_unknown)`, đúng 1 lần gọi dù tick lại; `ZaloRateLimitError` vẫn `requeue`; `delete_message` (idempotent) vẫn retry | `red-4.worker-db.txt` 4 fail / 2 pass (ca đối chứng giữ hành vi cũ) | 6 xanh |
| 5 | `actions.test.ts` "D29.5" (`cliMsgId===msgId` ⇒ `cli_msg_id_suspect`, 0 gọi Zalo); `sim-actions.db.test.ts` "D29.5": `cliMsgId=msgId` ⇒ `cli_msg_id_suspect`; `cliMsgId` ≠ `group_messages.cli_msg_id` ⇒ `cli_msg_id_mismatch`; tin không bị xoá | `red-5.worker-unit.txt` 1 fail / 1 pass (đối chứng) · `red-5.core-db.txt` 2 fail | xanh |
| 6 | `sim-actions.db.test.ts` "D29.6": hàng thread không `sim-` và hàng `not_before` tương lai ⇒ vẫn `queued`; hàng `sim-` đến hạn ⇒ giao; approval của thread thật không bị đụng | `red-6.core-db.txt` 2 fail | xanh |
| 7 | `check-agent-tools.test.ts` (4 ca: `action:`, `case '…':`, `action ===/!==`, không báo nhầm) — `findForbiddenActionHits` xuất khẩu từ script | `red-7.worker-unit.txt` 4 fail (script gốc chưa có hàm) | 4 xanh; `check_agent_tools` exit 0 |
| 8 | gap nhóm trên đường gửi thật (`pacer.test.ts`, tick +4 s ⇒ 0 tin, +12 s ⇒ gửi) · cửa sổ ngân sách 30′/59′ tính, 61′ không · hàng `sending` tính, `queued` không · pacer: 1 sent + 1 sending ⇒ `group_budget` · log không chứa nội dung (spy stdout) · `sim-thread.db.test.ts` (`DATA_MODE≠sim` ⇒ 404; operator/chưa đăng nhập ⇒ 403; admin ⇒ 200) | `red-8.worker-db.txt` 2 fail (cửa sổ — đỏ do chữ ký cũ 3 tham số) · các bộ đo còn lại **xanh trên mã đúng** (mã gốc không sai) — bằng chứng đỏ là đột biến §3 | xanh |

## 3. Đột biến sau sửa — `evidence/P02-fix/mutations-after.txt` (script `mutate.mjs.txt`, chạy ngoài repo; trả lại bằng GHI LẠI NỘI DUNG GỐC, không dùng `git checkout` vì file chưa commit)

| Đột biến | Bộ đo bắt | Kết quả |
| :-- | :-- | :-- |
| M1 (uidFrom = uid bot) | unit 2 fail, db 1 fail | BẮT |
| M2 (`cliMsgId ?? msgId`) | unit 2 fail, db 1 fail | BẮT |
| M3 (bỏ kiểm ngân sách) | unit 1 fail, db 4 fail | BẮT |
| **M7** (cửa sổ 10′) | db 4 fail | BẮT (trước: lọt) |
| M8 (thêm nhánh `case` hành động cấm) | unit 1 fail + `check_agent_tools` exit 1 (`forbidden_actions: 4`) | BẮT (quét tĩnh trước đây lọt) |
| **M15** (log kèm nội dung) | unit 1 fail (db xanh) | BẮT (trước: lọt) |
| **M18** (bỏ kiểm vai thread) | `sim-thread.db` 1 fail | BẮT (trước: lọt) |
| **M19** (bỏ kiểm `DATA_MODE`) | `sim-thread.db` 1 fail | BẮT (trước: lọt) |
| **M21** (pacer thật ghi nhóm như DM) | unit 1 fail (db xanh) | BẮT (trước: lọt) |
| **M22** (bỏ đếm `sending`) | db 2 fail | BẮT (trước: lọt) |
| N1 bỏ cổng approval ở pacer | unit 1 + db fail | BẮT |
| N2 bỏ `status='approved'` ở claim | db 3 fail | BẮT |
| N3 bỏ `executed_at is null` ở claim | **lần 1 LỌT** (db 72/72) ⇒ thêm ca CAS trực tiếp `claimApproval` ×2 ⇒ chạy lại | BẮT (db 1 fail) |
| N4 bỏ so `target_uid` · N5 bỏ so `kind` | db 1 fail mỗi cái | BẮT |
| N6 bỏ huỷ nhóm lạ/tắt · N7 bỏ `outcome_unknown` | db 5 / 4 fail | BẮT |
| N8 bỏ `cli_msg_id_suspect` sim · N9 bỏ lọc `sim-` · N10 bỏ `not_before` · N11 bỏ so `cli_msg_id` | core db 2 / 11 / 6 / 5 fail | BẮT |
| N12 bỏ `cli_msg_id_suspect` worker | unit 1 fail | BẮT |
| N13 bỏ nhánh `case` của quét tĩnh | unit 1 fail (lần 1 anchor sai ⇒ `APPLY_FAILED`, sửa anchor, chạy lại) | BẮT |

Tổng: 23 đột biến (M1–M3, M7, M8, M15, M18, M19, M21, M22 + N1–N13) — **0 LỌT sau khi chạy lại N3/N13**. Mã được ghi lại nguyên văn sau mỗi đột biến (commit chứa đúng mã đã đo).

## 4. Đổi test cũ / lệch — giải thích từng ca

1. `dbtests/p02-group.db.test.ts:269-270` — bỏ tham số `Date.now()` ở 2 lời gọi `groupTextSentLastHour` (chữ ký đổi theo D29.3). Kỳ vọng (20 / 0) giữ nguyên.
2. `pacer.test.ts` — mock `store`: thay `groupBudget` bằng `groupGate` (`{budget, enabled}`), thêm `claimApproval`/`releaseApproval` (mặc định cho qua). Mọi kỳ vọng cũ giữ nguyên.
3. **Lệch D29.6**: `echo.jsonl` (`evals/`, ngoài phạm vi) có thread DM `u-101…` không bắt đầu `sim-`, test `p01.db.test.ts` (ngoài phạm vi, không đổi) đòi `runScenario` giao đủ. Giải: `applySimOutbox`/`simDeliver` nhận `extraThreadIds`; chỉ `runScenario` truyền đúng `thread_id` của dòng kịch bản đang phát. Mặc định (web `send`/`tick`) vẫn chỉ `sim-%`. Nếu SO muốn bỏ ngoại lệ này ⇒ phải đổi dữ liệu `evals/scenarios/echo.jsonl` sang `sim-dm-*` (ngoài phạm vi H05).
4. `sim-actions.db.test.ts` thêm `beforeEach` dọn `group_messages` của thread `sim-act-%` (tự chữa G29: file dùng msg_id cố định `m-1`…, một lần chạy đỏ/đột biến để lại dòng ⇒ mọi lần sau `duplicate key`).
5. Kiểm approval đặt ở `pacer.runActionRow` (không ở `executeAction`, vẫn thuần) và dùng `executed_at` làm dấu "đã nhận" vì không có migration (cấm) và `approvals.status` không có trạng thái `executing`. Hệ quả cần SO biết: thẻ `approved` mà `executed_at` ≠ null (đã nhận, Zalo chưa trả lời) không nhận lại cho tới khi `completeApproval` hoặc `releaseApproval`; worker chết đúng giữa lúc đó ⇒ thẻ treo (an toàn: không kick lặp; cần người xử). Core P05 không được dùng `executed_at` cho ý khác.
6. Sim (`applyAction`) KHÔNG kiểm approval cho kick/block — D29 điểm 1 chỉ yêu cầu worker; chưa làm vì ngoài chữ D29.
7. Docs: `docs/core.md` mô tả sim nhưng không nằm trong ĐƯỢC GHI của H05 ⇒ chưa cập nhật (`sim-actions` đổi: lọc `sim-`, `not_before`, so `cli_msg_id`, `extraThreadIds`).

## 5. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| D29 1–8 (test đỏ trước · sửa · đột biến) | 🟠 | Claude / claude-sonnet-5-5 |
| docs module | 🟢 | Claude / claude-sonnet-5-5 (không có model 🟢 riêng ⇒ tự làm; ghi nhận lệch tầng) |

## 6. Việc KHÔNG làm + lý do
- D29 điểm 9 (xoá tin của chính bot, `review_join` `{}`, `msg_type`): HOÃN theo H05.
- Không đồng bộ `brain4agent/` (cấm đụng); không sửa specs (architect); không push.
- `docs/core.md`, sim kiểm approval: xem §4.6–§4.7.

## 7. Câu hỏi cần người
- §4.3: chấp nhận `extraThreadIds` cho `runScenario` hay đổi `evals/scenarios/echo.jsonl` sang `sim-`?
- §4.5: thẻ treo khi worker chết giữa `claimApproval` và `completeApproval` — chấp nhận (an toàn, người xử) hay cần job nhả thẻ quá hạn (core P05/P07)?

## Tiếp theo
🖐 Cần tay người: phán quyết R05 (✅ DUYỆT / 🔁 SỬA / ⛔ DỪNG); trả lời 2 câu hỏi §7.
🤖 Agent làm được ngay: đồng bộ `docs/core.md` + Idea Vault (điểm 9) khi SO cho phép; thẩm định đối kháng cô lập trên `831dca9..2723955`.
⭐ Nên làm trước: thẩm định R05 bằng agent khác họ model — điểm 1 chạm BB-06.
⏸ Chưa làm: điểm 9 D29 (hoãn tới P09), kiểm Zalo thật, `docs/core.md`.

⏳ Chờ phán quyết.
