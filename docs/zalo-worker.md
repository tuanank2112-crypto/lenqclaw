# zalo-worker — `apps/zalo-worker` (`@lenqclaw/zalo-worker`)

Tiến trình dài hạn giữ phiên Zalo cá nhân qua `zca-js` (pin đúng `2.2.0`), chạy **đúng một bản sao**. Không chứa logic nghiệp vụ; nói với core chỉ qua bảng `inbound_events`, `outbox`, `zalo_accounts`. Hợp đồng: [SPEC-P02 (kế hoạch 02)](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P02-Transport-Nhom.md) · nền transport ở [kế hoạch 01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P02-Zalo-Transport.md).

Trạng thái: **P02 kế hoạch 02 xong (local; Zalo thật hoãn tới P09)** — tài khoản duy nhất là `community` (`ZALO_ACCOUNTS=community`; giá trị khác ⇒ exit 1). Worker nhận tin NHÓM + sự kiện nhóm (ghi `inbound_events` theo 01-CONTRACTS §8.2, KHÔNG quyết nhóm nào được trả lời — cổng ở core), thi hành `outbox` `action`/`react`, gửi text nhóm có quote/mention qua pacer có ngân sách theo nhóm (BB-08). `isIdentified` = owner (`account_owners`) ∪ thành viên nhóm còn hiệu lực (`group_members.left_at is null`); `staff_takeover` huỷ mọi tin bot (không còn ngoại lệ khẩn cấp); `markSent` ghi `sent_at`; `OutboxRow` không còn `job_id`. Đăng xuất + trạng thái QR (H09 kế hoạch 01): web đặt `logout_requested_at` ⇒ worker ở nhịp quét 2 s dừng listener/pacer tài khoản đó; zca-js vẫn không có API đăng xuất phía máy chủ (G18). Worker ghi `qr_state` theo sự kiện QR (`waiting_scan`/`scanned`/`expired`/`declined`, đăng nhập xong ⇒ null). Hợp đồng chi tiết: mục "P02 — nhóm" bên dưới.

## Cấu trúc

| File | Vai trò |
| :-- | :-- |
| `src/main.ts` | Khởi động: kiểm `ZALO_SESSION_KEY` (32 byte, thiếu/sai ⇒ exit 1) → cấu hình (`PACER_*`, `HEARTBEAT_*`, `OPS_WATCH_INTERVAL_MS`) → `DATABASE_URL` → **advisory lock `lenqclaw:worker:community` (D31 T6; đã có bản khác ⇒ in `WORKER_ALREADY_RUNNING`, exit 1, KHÔNG mở phiên zca-js; mất kết nối giữ khoá ⇒ `worker.lock_lost`, exit 1)** → dựng phiên, pacer, watchdog; vòng `every('heartbeat')` ghi `process_heartbeats('worker')` và `every('ops')` gọi `checkOps(now,'worker')`; dừng êm khi SIGINT/SIGTERM (nhả khoá) |
| `src/client.ts` · `src/zca-client.ts` | `ZaloClientLike` (login cookie, `loginQR`, listener `message`/`group_event`/`undo`/`closed`/`error`, `sendText(OutboundText)`, đang gõ, đã xem, API đọc nhẹ + 15 hàm hành động nhóm, mỗi hàm bọc ĐÚNG một API zca-js 2.2.0) + bản thật bọc zca-js; bản giả ở `src/testing/` (`FakeSession.actions[]`, `nextActionError`, `reviewResult`, `groupInfo`, `fakeGroupEvent`). Lỗi `ZaloApiError` ở đường action ⇒ `ZaloActionError` (`apiCode` số Zalo); 221 ⇒ `ZaloRateLimitError`; đường đăng nhập vẫn `ZaloAuthError` |
| `src/zca-normalize.ts` | `GroupEvent` (zca-js) ⇒ `ZaloGroupEvent` (`uids`/`names`/`sourceUid`/`groupName`/`time`); chỉ `import type` ⇒ test không nạp zca-js |
| `src/actions.ts` | `executeAction(account, session, row)`: bảng `body.action` ⇒ API (SPEC-P02 §4.2) trả `{ok, result, failReason?, code?, botNotAdmin?}`; body sai ⇒ `InvalidActionError(reason)`; hành động lạ/cấm ⇒ `unknown_action` (KHÔNG có nhánh cho giải tán nhóm, đổi chủ, phó nhóm, rời nhóm, gửi tệp); xoá tin thiếu `cliMsgId`/`uidFrom` ⇒ `cli_msg_id_missing`, `cliMsgId === msgId` ⇒ `cli_msg_id_suspect` (KHÔNG đoán bằng `msgId`, KHÔNG thử với uid bot); `sync_group_info` ⇒ `store.applyGroupSync` |
| `src/account-session.ts` | Đăng nhập QR khi `zalo_accounts.login_requested_at` được đặt (quét 2 s); chỉ lưu `session_enc` sau khi gọi thử API đọc thành công; đồng bộ cookie 10 phút, ghi theo compare-and-set `updated_at` |
| `src/crypto.ts` | AES-256-GCM, IV ngẫu nhiên mỗi lần; bản rõ `{cookie, imei, userAgent}` không bao giờ ra log |
| `src/inbound.ts` | Chuẩn hoá tin ⇒ `inbound_events` (chống trùng); payload §8.2 (`kind:'text'` có `cli_msg_id`/`d_name`/`mentions`/`quote`; `kind:'unsupported'` nhãn "thành viên gửi <loại> — chưa hỗ trợ"); `is_self` không khớp outbox ⇒ `human_takeover_until` +30 phút CHỈ DM (chủ gõ tay trong nhóm KHÔNG làm bot im); nhóm ⇒ `group_inserted`, KHÔNG hẹn "đã xem"; `handleGroupEvent` ghi 8 loại sự kiện (`join`, `join_request`, `leave`, `remove_member`, `add_admin`, `remove_admin`, `update_setting`, `update`; loại khác bỏ), `zalo_msg_id='gev-<nhóm>-<loại>-<time>'`, `sender_uid=sourceId\|\|'zalo'`; outcome `inserted\|duplicate\|self_bot_echo\|self_staff_takeover\|group_inserted` |
| `src/pacer.ts` · `src/pacer-policy.ts` | Một tick: (1) tối đa `PACER_ACTIONS_PER_TICK`=3 hàng `action`/`react` (tuần tự, tính `maxPerMinute`, không tính ngân sách text), (2) tối đa MỘT `text` (DM: pacer bảng kế hoạch 01; nhóm: `typing` trước, giãn cách `PACER_GROUP_GAP_MS`+jitter, ngân sách `zalo_groups.budget_per_hour`/giờ trượt tính bằng `now()` của DB (`groupTextSentLastHour(account, thread)` — đếm cả hàng `sending`; không dùng đồng hồ worker), cache `groupGate` 60 s; mọi `text`/`action`/`react` vào nhóm CHƯA khai ⇒ `cancelled('group_unknown')`, nhóm `enabled=false` ⇒ `cancelled('group_disabled')` (audit `pacer.group_unknown`/`pacer.group_disabled`; chỉ `sync_group_info` được qua để dashboard thấy nhóm lạ); hết ngân sách ⇒ giữ `queued` note `group_budget`, quá `GROUP_TEXT_TTL_MIN` ⇒ `cancelled('budget_expired')` + audit `pacer.budget_expired`), (3) sự kiện seen/typing (seen nhóm bị huỷ). Tin dài tách ≤`PACER_MAX_CHARS`: `quote` chỉ part 0, mention chỉ ở đoạn chứa nó. Sau gửi nhóm: `linkSentGroupMessage(outboxId, msgId)` đổi dòng đệm `out-<id>` ⇒ msgId thật. Action: `markSending`(CAS) ⇒ gọi ⇒ `sent`+`result` \| `failed`+`result.error{name,code}`; audit `zalo.action` (ok) \| `zalo.action_failed` (không ghi nội dung); mã 166 ⇒ `zalo_groups.bot_is_admin=false` + audit `zalo.alert kind='deputy_missing'`; **`remove_member`/`block_member` là lớp chặn cuối BB-06**: sau `markSending` phải `store.claimApproval(approvalId, account, thread, action, uid)` — một câu `UPDATE … WHERE status='approved' AND executed_at IS NULL AND kind/thread/target_uid khớp` (CAS, đặt `executed_at` TRƯỚC khi gọi Zalo); không `approvalId` / thẻ sai-đã dùng ⇒ `failed('approval_invalid')` + audit `zalo.action_blocked`, KHÔNG gọi Zalo, KHÔNG đụng thẻ; Zalo chưa thi hành (221 / lỗi mạng sẽ retry) ⇒ `releaseApproval` trả thẻ; có `approvalId` ⇒ `completeApproval` (approved→executed|failed). Action không idempotent (`create_poll`, `create_reminder`, `create_note`, `update_group_settings`): lỗi mạng/không rõ ⇒ `failed('outcome_unknown')`, KHÔNG thử lại (chỉ `ZaloRateLimitError` mới `requeue`); 221 ⇒ requeue + lùi `PACER_BACKOFF_MS`. `PacerPolicy.record(now, thread, isGroup)`, `recordAction`, `checkAction`; `verifySendLog` có thêm luật `group_gap`, `group_budget`; `simulatePacer` coi thread `sim-group-*` là nhóm |
| `src/store.ts` (P03b) | Mọi câu SQL của worker. D31/D32 thêm: `markSending(id, holdReason?)` (ghi `picked_at = now()` + `hold_reason` lý do ĐẦU TIÊN pacer giữ hàng), `fetchDue` trả `inbound_event_id`, `setOwnUid` (D37), `writeWorkerHeartbeat`/`countQueuedDue`; `completeApproval(approvalId, ok, result)` (D41/F4): CAS `approved → executed|failed`, thắng CAS ⇒ audit + ĐÚNG MỘT sự kiện `approval_executed` qua `enqueueSystemEvent` của core (`@lenqclaw/core/services/system-events`; thua CAS ⇒ `false`, 0 sự kiện) ⇒ router DM owner; `alert(kind)` vẫn audit `zalo.alert` và với `kicked`/`dead`/`cookie_expired` gửi Telegram `zalo_session` NGAY qua `adapters/alert` |
| `src/watchdog.ts` | 3000/3003 ⇒ `kicked`, không tự đăng nhập lại; 1006 ⇒ `reconnecting` lùi 5 s→5 phút, >10 lần ⇒ `dead`; im 20 phút (7–22h) ⇒ gọi API đọc |
| `src/log.ts` | Log một dòng JSON, chỉ trường không bí mật |
| `src/tools/pacer-sim.ts` | Giả lập 50 tin/20 người (DM, bảng §5); `--group`: 100 tin vào `sim-group-1`, ngân sách 20/giờ ⇒ in `first_hour: 20`, `min_gap_ms`, `violations: 0` (đối chiếu `evidence/ARCH/budget-ref.txt`) |

## P03b — tốc độ, giám sát, báo động (D31/D32/D37)

Pacer (SPEC-D31 §7.1, KHÔNG nới giới hạn D09): `PACER_TICK_MS` 250; `pickNext` xét trước thread có hàng ĐẦU là tin trả lời (`outbox.inbound_event_id` not null) — chỉ đổi thứ tự, `policy.check` giữ nguyên; thread có "đang gõ" trong `PACER_TYPING_FRESH_MS` (8000, gồm typing sớm của `prepare`) ⇒ tin text KHÔNG gửi typing lại và KHÔNG trễ thêm; `markSending` ghi `picked_at`; `hold_reason` = lý do ĐẦU TIÊN (`group_gap|thread_gap|per_minute|group_budget|backoff|recipients`) pacer giữ hàng đầu thread (bộ nhớ, ghi DB một lần) — view `reply_latency` trừ khoảng giữ khỏi `core_ms`.

`own_uid` (D37): mỗi lần phiên `connected`, worker ghi `zalo_accounts.own_uid = session.ownUid` (migration 011; đăng xuất KHÔNG xoá). Core `botUid(account)` đọc cột (cache 60 s) → `BOT_ZALO_UID` → (chỉ `DATA_MODE=sim`) `BOT_UID_SIM`.

| Env (đọc ở worker) | Mặc định | Ghi chú |
| :-- | :-- | :-- |
| `PACER_TICK_MS` | 250 | trước là 1000 |
| `PACER_TYPING_FRESH_MS` | 8000 | typing tươi ⇒ bỏ typing lặp + bỏ trễ |
| `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_STALE_MS` | 5000 / 60000 | dấu sống `process_heartbeats('worker')` (`info`: `session_state`, `last_pacer_tick_at`, `queued_due`) |
| `OPS_WATCH_INTERVAL_MS` | 60000 | worker canh runner (`runner_stale`, `inbound_backlog`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | (trống) | thiếu ⇒ báo động TẮT (`disabled`), không lỗi; chỉ `adapters/alert.ts` đọc token |
| `ALERT_REPEAT_MIN` / `ALERT_MAX_PER_HOUR` / `ALERT_TIMEOUT_MS` | 30 / 20 / 5000 | chống lặp theo (loại, khoá) · trần giờ · timeout |

Vận hành: chạy ĐÚNG MỘT worker (bản thứ hai thoát 1). Kiểm tra sống: `GET /api/healthz` (xem [web.md](web.md)). Báo động lúc phiên chết: worker gửi ngay khi `store.alert` ghi `kicked`/`dead`/`cookie_expired`; runner `opsWatch` là lưới dự phòng; CAS `alert_state` bảo đảm đúng một tin. Telegram thật CHƯA có bot/token — mọi test dùng `setAlertFetchForTest`.

## P02 — nhóm: bảng `action` ⇒ API zca-js 2.2.0

| `body.action` | API | `result` |
| :-- | :-- | :-- |
| `delete_message` | `deleteMessage({data:{msgId,cliMsgId,uidFrom},threadId,type:'group'}, false)` — `uidFrom` PHẢI là người gửi gốc (core lấy từ `group_messages.sender_uid`) | `{status}` (≠0 ⇒ failed) |
| `remove_member` / `block_member` / `unblock_member` | `removeUserFromGroup` / `addGroupBlockedMember` / `removeGroupBlockedMember` | `{errorMembers}` / `{}` |
| `review_join` | `reviewPendingMemberRequest({members,isApprove})` | `{<uid>: code}` — 166 ⇒ failed + `bot_is_admin=false`; 170/178 ⇒ xong |
| `create_poll` / `lock_poll` | `createPoll` / `lockPoll` | `{poll_id}` / `{}` |
| `create_reminder` / `remove_reminder` | `createReminder` / `removeReminder` | `{id}` / `{}` |
| `create_note` / `update_group_settings` | `createNote` / `updateGroupSettings` | `{id}` / `{}` |
| `sync_group_info` | `getGroupInfo` + `getGroupMembersInfo` (`memberIds` rỗng ⇒ `memVerList` cắt `_`) | `{name, adminIds, creatorId, members[{uid,displayName}], total}`; `applyGroupSync`: upsert `zalo_groups` (nhóm mới ⇒ `enabled=false`), `bot_is_admin = adminIds∋ownUid ∨ creatorId=ownUid`, `group_members` (admin ⇒ `moderator`, không hạ vai; vắng mặt ⇒ `left_at`) |
| `react` (kind `react`) | `addReaction` | `{}` (lỗi ⇒ failed im lặng; core hiện KHÔNG enqueue — Q5 tạm tắt) |

Vùng cấm P02: kick/block không thẻ duyệt hợp lệ (D29 điểm 1); không `seen` nhóm; không `getGroupChatHistory`; không giải tán nhóm/đổi chủ/phó nhóm/rời nhóm/gửi tệp; không đoán `cliMsgId`; không tự xin QR lại. Worker KHÔNG ghi `group_messages` (ranh giới nghiệp vụ): core chèn dòng đệm tin bot `out-<outbox_id>` lúc enqueue, worker chỉ đổi sang msgId thật.

Ghi chú lệch SPEC: `ZaloActionError.code` giữ quy ước "tên lớp" (01-CONTRACTS §9) và mang mã số Zalo ở `apiCode`; hàng `action` thất bại audit `zalo.action_failed` (01-CONTRACTS §8.3), thành công `zalo.action` (SPEC-P02 §4.2).

## Chạy (máy dev, PowerShell từ root)

Các script npm KHÔNG tự nạp `.env` ⇒ dùng `node --env-file=.env` (G20).

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm run db:migrate; npm run db:seed; npm run db:seed:sim     # cần DATABASE_URL + DATA_MODE=sim trong môi trường
npm run dev -w @lenqclaw/web                                  # cửa sổ 1 (cần SESSION_SECRET, DATABASE_URL)
node --env-file=.env --import tsx packages/core/src/runner/inbound-runner.ts   # cửa sổ 2 — runner (= core:run)
node --env-file=.env --import tsx apps/zalo-worker/src/main.ts                 # cửa sổ 3 — worker, ĐÚNG MỘT bản
```

Trình duyệt `http://localhost:3000/zalo` (admin) → "Đăng nhập bằng QR" → quét bằng **Zalo phụ** và **bấm xác nhận trên điện thoại** trong 3 phút (quét mà không xác nhận ⇒ hết hạn — G19). Người lạ nhắn DM ⇒ router khung trả `STUB_DM_REPLY`; gắn uid thật làm owner: `node --env-file=.env --import tsx packages/core/src/dev/link-zalo.ts --owner [--uid <uid>]` (cần `DATA_MODE=sim`).

Đăng xuất (tạm, chưa có nút): dừng worker + `update zalo_accounts set session_enc=null, session_state='logged_out' where id='community'`, rồi gỡ phiên web trên điện thoại.

## Luật khi sửa

- `zca-js` chỉ import trong app này (máy đo biên canh). Đổi phiên bản ⇒ pin chính xác, đối chiếu `.d.ts` (index gốc không phân giải dưới NodeNext ⇒ `paths` trong `tsconfig.json`).
- CẤM log cookie/imei/userAgent; CẤM mở Zalo Web/PC bằng tài khoản bot (G01); CẤM chạy hai bản worker (D31 T6: advisory lock chặn bản thứ hai).
- Đổi số pacer ⇒ ghi `brain4agent/-known-gotchas.md` kèm lý do (SPEC-P02 §5).
