Vai: worker (vai-thi-cong) · loại: thẩm định đối kháng · họ/model: Claude / claude-opus-5-5 · Bước 0: exit 0 · hiểu việc: chỉ đọc mã P02 (`5f233d8..d2b385b`), tự thiết kế ≥6 cách phá nhóm a–f bằng đột biến tạm + ca dò trên DB thật với zca-js giả; chỉ ghi R03 + `evidence/P02-review/*`; cấm commit mã, cấm push, cấm đọc R02/evidence P02.
Handoff: handoffs/H03_tham-dinh_P02.md
Base: 5f233d8
Head: d2b385b

## 1. Lệnh bắt buộc (§1) — exit nguyên văn

| Lệnh | Exit | Số đo | Evidence |
| :-- | :-- | :-- | :-- |
| `npm run gate` | 0 | `GATE_OK`; forbidden_tools 0 / forbidden_actions 0 / unlisted_tools 0 | `evidence/P02-review/gate.txt` |
| `npm test` | 0 | web 31 + worker 93 + core 85 = 209 pass / 0 fail / 0 skip | `evidence/P02-review/npm-test.txt` |
| `npm run test:db` | 0 | core 29 + web 21 + worker 44 = 94 pass / 0 fail / 0 skip | `evidence/P02-review/test-db.txt` |
| `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group` | 0 | `first_hour: 20`, `min_gap_ms: 9000`, `violations: 0` | `evidence/P02-review/pacer-sim-group.txt` |

`git diff --stat 5f233d8..d2b385b`: 34 file, +4016/−326 — mọi file nằm trong phạm vi SPEC-P02 §1–§7 (worker, `packages/core/src/sim`, `apps/web` /dev/sim, docs). Số xanh KHÔNG phải kết luận — xem §2–§3.

## 2. Các cách phá (22 đột biến + 8 ca dò)

Đột biến: `evidence/P02-review/mutations.txt` (script `mutate.mjs.txt`; mỗi đột biến trả lại bằng `git checkout -- <file>`). Ca dò DB: `evidence/P02-review/probes.txt` (script `probe.mts.txt`, chạy ngoài repo, không sửa mã).

| # | Nhóm | Giả thuyết phá | Cách | Kết quả máy | Kết luận |
| :-- | :-- | :-- | :-- | :-- | :-- |
| M1 | a | gửi `uidFrom` = uid bot | `actions.ts` uidFrom := `session.ownUid` | unit 2 fail, db 1 fail | bắt được |
| M2 | a | đoán `cliMsgId ?? msgId` | `actions.ts:79` | unit 2 fail, db 1 fail | bắt được |
| P3 | a | core gửi `cliMsgId = msgId` (lỗi zaloclaw `tool.ts:743`) | ca dò: worker + `applySimOutbox` | worker gọi `deleteMessage{msgId:"777",cliMsgId:"777"}` ⇒ sent; sim: cli thật `real-cli`, gửi `888` ⇒ sent, `deleted=true` | **LỌT** (sim không bắt) |
| M3 | b | bỏ kiểm ngân sách giờ | `pacer.ts:176` `if (true)` | unit 1 fail, db 2 fail | bắt được |
| M4 | b | bỏ gap nhóm trong `PacerPolicy` | `pacer-policy.ts:89` | unit 5 fail | bắt được |
| M21 | b | pacer THẬT ghi tin nhóm như DM (`record(…, false)`) ⇒ gap 3 s thay 8 s | `pacer.ts:285` | unit 93/93, db 44/44 xanh | **LỌT** |
| P8 | b | đối chứng M21 trên mã gốc: 2 text cùng nhóm, tick +4 s | ca dò | +4 s: 1 tin, `note=blocked`; +12 s: 2 tin | mã gốc đúng; chỉ thiếu bộ đo |
| M5 | b | nhóm không có dòng `zalo_groups` vẫn gửi | `pacer.ts:165` | unit 1 fail, db 2 fail | bắt được |
| M6 | b | action bỏ `maxPerMinute` | `pacer-policy.ts:82` | unit 2 fail | bắt được |
| M7 | b | cửa sổ ngân sách 1 h ⇒ 10 phút (20 tin/10′ = 120/h) | `store.ts:335` | db 44/44 xanh | **LỌT** |
| M22 | b | bỏ đếm hàng `sending` | `store.ts:334` | db 44/44 xanh | **LỌT** |
| M14 | b | bỏ TTL `budget_expired` | `pacer.ts:180` | unit 1 fail, db 1 fail | bắt được |
| P4 | b | đồng hồ worker lệch DB +61′ | ca dò: budget 3, 3 tin sent 5′ trước | `groupTextSentLastHour` 3 ⇒ 0; text mới ⇒ `sent` | **LỌT** (vượt ngân sách) |
| M13 | b | quote ở mọi chunk | `pacer.ts:380` | unit 1 fail | bắt được |
| M8 | c | thêm nhánh `case 'leave_group'` | `actions.ts:191` | unit 1 fail; `check_agent_tools` exit 0 (`forbidden_actions: 0`) | bắt được ở runtime test; quét tĩnh LỌT |
| P1 | c | kick/block không qua `approvals` | ca dò: `remove_member` không `approvalId`; với approval `pending`; `block_member` với approval `rejected` | 3 lần gọi Zalo (`removeMember,removeMember,blockMember`), cả 3 outbox `sent`; approvals vẫn `pending`/`rejected` | **LỌT — CHẶN** |
| P2 | c/§9 | action vào nhóm không có dòng `zalo_groups` | ca dò: `delete_message`, `create_poll` | gọi `deleteMessage,createPoll`, cả 2 `sent` | **LỌT** |
| P5 | c | action không idempotent bị thử lại sau lỗi mạng | ca dò: `create_poll`, lỗi `ECONNRESET` lần 1 | `createPoll` gọi 2 lần | LỌT (ghi chú) |
| M9 | d | gửi `seen` cho nhóm | `pacer.ts:75` | unit 1 fail | bắt được |
| — | d | `getGroupChatHistory`/`requestOldMessages`/tự QR | grep toàn `apps packages scripts` | 0 lời gọi; `account-session.ts` chỉ thêm handler `groupEvent` | không có đường |
| M15 | e | log `pacer.sent` kèm nội dung tin | `pacer.ts:286` | unit 93/93, db 44/44 xanh | **LỌT** (mã gốc sạch, không có bộ đo) |
| M16 | e | audit `zalo.action` kèm body | `pacer.ts:326` | unit 2 fail, db 2 fail | bắt được |
| M18 | e | `/api/dev/sim/thread` bỏ kiểm vai | `thread/route.ts:38` | web db 7/7 xanh | **LỌT** |
| M19 | e | `/api/dev/sim/thread` bỏ kiểm `DATA_MODE` | `thread/route.ts:34` | web db 7/7 xanh | **LỌT** |
| — | e | SQL ghép chuỗi từ input | đọc `store.ts`, `sim-actions.ts`, 2 route | mọi giá trị qua `$n`; chỉ hằng số ghép | không có đường |
| M10 | f | `sync_group_info` hạ vai moderator | `store.ts:430` `role = excluded.role` | db 1 fail | bắt được |
| M11 | f | 178 không coi là xong | `actions.ts:52` | unit 2 fail, db 1 fail | bắt được |
| M12 | f | ghi `new_link` | `inbound.ts:137` | unit 1 fail | bắt được |
| M17 | f | bỏ `linkSentGroupMessage` | `pacer.ts:284` | unit 1 fail, db 1 fail | bắt được |
| M20 | f | sim bỏ kiểm `uidFrom_mismatch` | `sim-actions.ts:58` | core db 2 fail | bắt được |
| P6 | f | `sync_group_info` trên nhóm chưa khai | ca dò | tự TẠO `zalo_groups {enabled:false, budget_per_hour:20}`; text sau đó ⇒ `sent` (hết `group_unknown`) | LỌT (ghi chú) |
| P7 | f | `review_join` Zalo trả `{}` | ca dò | outbox `sent`, `result={}` | LỌT (ghi chú) |

Tổng: 22 đột biến — 16 bị test bắt (M8 chỉ bị test runtime bắt, quét tĩnh lọt), 6 LỌT (M7, M15, M18, M19, M21, M22). 8 ca dò — 1 đối chứng đúng (P8), 7 lộ hành vi sai/hở (P1–P7).

## 3. Phát hiện theo mức

### CHẶN
1. **Worker thi hành kick/block KHÔNG cần approval hợp lệ** — `apps/zalo-worker/src/actions.ts:86-96`, `apps/zalo-worker/src/pacer.ts:312,330`, `apps/zalo-worker/src/store.ts:375-391`. 01-CONTRACTS §6 khai `remove_member`/`block_member` có `approvalId: string` BẮT BUỘC; BB-06 "thi hành chỉ sau khi duyệt"; §9 `ApprovalRequiredError` cho trạng thái ≠ `approved`. Worker không kiểm `approvalId` (trong khi các trường khác thiếu đều ném `InvalidActionError`), và chỉ kiểm `status='approved'` SAU khi đã kick (`completeApproval` trả `false` im lặng, không audit). Tái hiện (P1, `probes.txt`): enqueue `{action:'remove_member', uid}` không approvalId; với approvalId đang `pending`; `block_member` với approval `rejected` ⇒ 3 lần gọi Zalo, cả 3 `sent`, approvals vẫn `pending`/`rejected` ⇒ người duyệt sau đó có thể "duyệt" lần nữa (kick lặp) hoặc "từ chối" một việc đã xảy ra. Sim (`packages/core/src/sim/sim-actions.ts:66-83`) cùng lỗi nên test sim không bắt được.

### NÊN SỬA
2. **Bộ đo không giữ được gap nhóm trên đường gửi thật** — `apps/zalo-worker/src/pacer.ts:285`. Đột biến M21 (`record(now, thread, false)` ⇒ gap 3 s + jitter 2 s thay 8 s + 3 s) xanh toàn bộ unit + db; chỉ `PacerPolicy`/`simulatePacer` được đo, `AccountPacer.sendText` thì không. Mã hiện tại đúng (P8: +4 s bị chặn, +12 s gửi). Cần 1 ca pacer thật: 2 text cùng nhóm, tick +4 s ⇒ 0 tin.
3. **Bộ đo ngân sách giờ không phân biệt cửa sổ** — `apps/zalo-worker/src/store.ts:331-339`, test `apps/zalo-worker/src/dbtests/p02-group.db.test.ts:261`. M7 (cửa sổ 10′ ⇒ 120 tin/h) và M22 (bỏ đếm `sending`) đều xanh: 20 hàng mẫu nằm cùng trong 10′ gần nhất. Cần hàng mẫu ở ~45′ trước và một hàng `sending`.
4. **Ngân sách phụ thuộc đồng hồ worker, không phải đồng hồ DB** — `apps/zalo-worker/src/store.ts:335` (`$3::timestamptz - interval '1 hour'`, `$3` = `Date.now()` của worker) trong khi `sent_at` ghi bằng `now()` của DB (`store.ts:272`). P4: worker lệch +61′ ⇒ đếm 3 ⇒ 0, tin thứ 4 vào nhóm ngân sách 3 ⇒ `sent`. Lệch +30′ ⇒ ngân sách thực tế gấp đôi. Đề xuất dùng `now()` của DB như câu SQL 01-CONTRACTS §8.4.
5. **Action vào nhóm chưa khai không bị huỷ** — `apps/zalo-worker/src/pacer.ts:85-88`. SPEC-P02 §9 "nhóm chưa có trong `zalo_groups` mà vẫn có hàng outbox ⇒ `cancelled('group_unknown')` + audit" không giới hạn ở text. P2: `delete_message` + `create_poll` vào nhóm lạ ⇒ gọi Zalo, `sent`.
6. **Sim không bắt được lỗi đoán `cliMsgId`** — `packages/core/src/sim/sim-actions.ts:49-58` chỉ so `uidFrom`, không so `cliMsgId` với `group_messages.cli_msg_id`. P3: gửi `cliMsgId='888'` (= msgId) cho tin có cli thật `real-cli` ⇒ `sent`, tin bị xoá. SPEC-P02 §7.2 đặt sim là nơi "tái hiện lỗi zaloclaw để test bắt"; lỗi `tool.ts:743` (§8) vì vậy lọt mọi test core P03/P05 sau này.
7. **`/api/dev/sim/thread` không có test chặn** — `apps/web/app/api/dev/sim/thread/route.ts:34,38`. Mã có kiểm `DATA_MODE` + vai `admin`, nhưng M18/M19 (bỏ từng kiểm) đều xanh `sim-send.db.test.ts` 7/7. Route này trả nội dung tin nhóm.

### GHI CHÚ
8. Action không idempotent (`create_poll`/`create_note`/`create_reminder`) thử lại tới 5 lần sau lỗi mạng mơ hồ — `apps/zalo-worker/src/pacer.ts:359-365`. P5: 2 lần `createPoll`. Trên Zalo thật có thể ra bình chọn trùng trong nhóm (hiển thị công khai).
9. `sync_group_info` tự tạo dòng `zalo_groups` cho nhóm chưa khai — `apps/zalo-worker/src/store.ts:412-418` (đúng chữ "upsert" của SPEC §4.2). P6: sau sync, text vào nhóm đó không còn `group_unknown` ⇒ `sent` (worker không xét `enabled`; cổng là core). Lưới allowlist ở worker mất tác dụng với nhóm đã từng sync.
10. `review_join` coi kết quả rỗng `{}` là xong — `apps/zalo-worker/src/actions.ts:104-112`. P7: `sent`, `result={}`. Nên đòi mỗi uid yêu cầu có mã.
11. Worker nhận `cliMsgId === msgId` — `apps/zalo-worker/src/actions.ts:79` (P3). Không đoán được ở worker một cách chắc chắn; cách bắt nằm ở sim (mục 6).
12. Không test nào giữ "log không có nội dung tin" — M15 xanh. Mã hiện tại sạch (`log.ts`, `pacer.ts:286`).
13. `check_agent_tools` không bắt `case 'leave_group':` / `body.action === '…'` (regex chỉ `action:`) — `scripts/check_agent_tools.mjs:87`. Hiện được test runtime `actions.test.ts:175` bù (M8). Thuộc P01.
14. Tin của bot không bao giờ có `cli_msg_id` — `apps/zalo-worker/src/store.ts:352-363` chỉ cập nhật `zalo_msg_id`; SPEC-P02 §2.1 viết "zalo_msg_id/cli_msg_id", §4.3 chỉ `zalo_msg_id`, `sendText` chỉ trả `msgId`. Hệ quả: "tin của bot: cho phép" xoá (01-CONTRACTS §7.1 `delete_message`) luôn rơi vào `cli_msg_id_missing`. Mâu thuẫn spec, cần architect chốt.
15. `applySimOutbox` nhận MỌI hàng `queued` của mọi thread, bỏ qua `not_before` — `packages/core/src/sim/sim-actions.ts:171-176`. Khi `DATA_MODE=sim` + worker thật (`dev:link-zalo`), bấm `/dev/sim` send/tick sẽ đánh `sent`/`executed` cả hàng thật và approval thật mà Zalo không làm gì. Text đã có từ trước (simDeliver P01); action/approval là MỚI.
16. `inbound.ts:43` ghi `msg_type: m.msgType` cho tin text, §8.2 khai literal `'webchat'` — chỉ lệch khi Zalo gửi `content` chuỗi với loại khác.

Đối chiếu 01-CONTRACTS §8.1: 22/22 hàm có trong `client.ts`, đúng tham số + kiểu trả (`deleteMessage.type` dùng `ThreadKind` ≡ `'group'|'user'`). §8.2: đủ trường cho `text`/`unsupported`/`group_event`; `sender_uid` group_event = `sourceId || 'zalo'` (đúng, đã test).

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| thẩm định đối kháng a–f (đột biến, ca dò, phân loại) | 🔴 | Claude / claude-opus-5-5 |

## 5. Việc KHÔNG làm + lý do
- Không chạy Zalo thật (SPEC-P02 §10 hàng 6 là việc người, sau P03).
- Không sửa mã/test — phạm vi chỉ đọc; mọi đột biến đã trả (`git status --short` chỉ còn file report/evidence + PDF có sẵn).
- Không đọc `reports/R02_*`, `evidence/P02/`.

## 6. Câu hỏi cần người
- Mục 1: worker có phải tự chặn kick/block thiếu/sai approval (đọc `approvals.status` trước khi gọi Zalo) hay đó chỉ là việc của dịch vụ core P05? Contract §6 bắt buộc `approvalId`, nên tôi xếp CHẶN.
- Mục 14: tin của bot xoá được hay không — cần architect sửa SPEC-P02 §2.1/§4.3.

## 7. Đề xuất phán quyết (bằng lời, không tự phán)
Đề xuất **🔁 SỬA**: mục 1 (CHẶN) + mục 2–7 (bổ sung bộ đo để M7/M21/M22/M18/M19 đỏ, dùng đồng hồ DB cho ngân sách, huỷ action ở nhóm lạ, sim so `cliMsgId`). Phần còn lại (đường xoá tin, vùng cấm action, seen nhóm, đồng bộ nhóm không hạ vai, 166/170/178, ghi group_event) đứng vững trước 16 đột biến bị bắt.

## Tiếp theo
🖐 Cần tay người: phán quyết R03; chốt câu hỏi mục 1 và mục 14.
🤖 Agent làm được ngay: viết handoff sửa P02 (H04) trỏ đúng mục 1–7 khi có phán quyết.
⭐ Nên làm trước: mục 1 — đây là đường duy nhất tìm được để bot kick/chặn thành viên khi owner chưa duyệt.
⏸ Chưa làm: kiểm Zalo thật (§10 hàng 6), vì cần người và P03.

⏳ Chờ phán quyết.
