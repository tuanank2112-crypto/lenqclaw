# SPEC-P02 — Transport nhóm: worker Zalo + hành động quản trị + kênh giả lập nhóm

> Tầng 🔴 hợp đồng (file này) · 🟠 thi công · thẩm định 🔴 (bảo mật + rủi ro khoá tài khoản). Đọc `01-CONTRACTS.md` §2.3, §8, §9, §10 và `00-ARCHITECTURE.md` §6 (BB-02, BB-08, BB-11), §7 trước.
> Nền giữ nguyên từ kế hoạch 01 (R07/R09 ✅): `account-session.ts` (QR, cookie CAS, watchdog), `crypto.ts`, `pacer-policy.ts`, `watchdog.ts`. Gói này MỞ RỘNG, không viết lại.

## §1. Phạm vi
- Worker nhận tin NHÓM + sự kiện nhóm, ghi `inbound_events` theo 01-CONTRACTS §8.2.
- Worker thi hành `outbox.kind='action'` (xoá tin, kick/block, duyệt vào nhóm, bình chọn, nhắc, ghi chú, cài đặt nhóm, đồng bộ nhóm) và `text` có quote/mention (§8.3).
- Pacer theo nhóm + ngân sách giờ (BB-08).
- Kênh giả lập nhóm: `/dev/sim` nhiều người gửi, mention, quote, sự kiện vào nhóm; `sim-actions.ts` thi hành action trên DB giả lập.

## §2. Luồng vào (apps/zalo-worker/src/inbound.ts)

### §2.1 Tin nhắn (`listener.on('message')`)
`handleInbound(account, m, cfg, deps)` — bỏ nhánh `if (m.threadType === 'group') return 'ignored_group'`. Payload theo 01-CONTRACTS §8.2:
- text (`typeof m.content === 'string'`): `{kind:'text', text, msg_type:'webchat', ts, cli_msg_id: m.cliMsgId, d_name: m.dName ?? null, mentions: m.mentions ?? [], quote: m.quote ? {owner_id: String(m.quote.ownerId), global_msg_id: String(m.quote.globalMsgId), msg: m.quote.msg} : null, raw}` — `ZaloInboundMessage` thêm trường `dName: string | null`, `mentions: Array<{uid,pos,len}> | null`, `quote: {ownerId, globalMsgId, msg} | null` (chuẩn hoá trong `zca-client.ts::normalizeMessage` từ `TMessage.dName`, `TGroupMessage.mentions`, `TMessage.quote`).
- khác: `{kind:'unsupported', text:"[<ai> gửi <loại> — chưa hỗ trợ]", …}` — nhãn loại giữ `TYPE_LABELS`; chữ `<ai>` = "thành viên" (không còn "cư dân").
- `is_self`: giữ `isBotEcho` + `markProcessed`; **thêm** `store.recordSelfGroupMessage(account, m)` ⇒ `update outbox set zalo_msg_id = $msgId where …` không cần — đã có; nhưng core cần `group_messages` có tin bot: worker KHÔNG ghi `group_messages` (ranh giới: worker không biết nghiệp vụ). Thay vào đó core (P03 §4.2) chèn tin bot vào đệm NGAY khi `enqueue` text nhóm (với `zalo_msg_id = 'out-<outbox_id>'`) và pacer cập nhật `group_messages.zalo_msg_id/cli_msg_id` thật qua `store.linkSentGroupMessage(outboxId, msgId)` sau khi gửi (một UPDATE theo `zalo_msg_id='out-<id>'`). Lý do: xoá/quote tin của chính bot cần msgId thật.
- "Đã xem": chỉ thread `user` và `isIdentified` (owner ∪ member) — giữ; nhóm KHÔNG gửi seen.
- Outcome mới: `'inserted' | 'duplicate' | 'self_bot_echo' | 'self_staff_takeover' | 'group_inserted'` (bỏ `ignored_group`). `self_staff_takeover` chỉ cho DM (nhóm: chủ gõ tay trong nhóm không làm bot im — nhóm là không gian chung; 🖐 Q4 giá trị tạm).

### §2.2 Sự kiện nhóm (`listener.on('group_event')`) — MỚI
`ZaloListenerHandlers.groupEvent(ev: ZaloGroupEvent)`; `zca-client.ts` chuẩn hoá từ `GroupEvent` (`models/GroupEvent.d.ts`):
| `GroupEventType` | `payload.event` | `uids` | `names` | ghi? |
| :-- | :-- | :-- | :-- | :-- |
| `JOIN` | `join` | `data.updateMembers[].id` | `.dName` | ✓ |
| `JOIN_REQUEST` | `join_request` | `data.uids` | `[]` | ✓ |
| `LEAVE` / `REMOVE_MEMBER` | `leave` / `remove_member` | `updateMembers[].id` | `.dName` | ✓ |
| `ADD_ADMIN` / `REMOVE_ADMIN` | `add_admin` / `remove_admin` | `updateMembers[].id` | | ✓ |
| `UPDATE_SETTING` / `UPDATE` | `update_setting` / `update` | `[]` | | ✓ (core dùng để lên lịch `sync_group_info`) |
| còn lại (`NEW_LINK`, `*_PIN_TOPIC`, `*_BOARD`, `*_REMIND*`, `UPDATE_AVATAR`, `BLOCK_MEMBER`, `UNKNOWN`) | — | | | ✗ không ghi |
`zalo_msg_id = 'gev-' + groupId + '-' + event + '-' + String(data.time ?? Date.now())`; `sender_uid = data.sourceId || 'zalo'`; `thread_type='group'`; `is_self = ev.isSelf`. `ON CONFLICT DO NOTHING` (giữ).

### §2.3 `undo` — giữ `markUndone`; thêm: core khi xử lý đánh dấu `group_messages.deleted_at` (P03 §4.4) — worker chỉ ghi `payload.undone`.

## §3. `ZaloClientLike` mở rộng (apps/zalo-worker/src/client.ts, zca-client.ts, testing/fake-client.ts)
Cài ĐÚNG chữ ký 01-CONTRACTS §8.1. Mỗi hàm bọc một API zca-js 2.2.0 (tên ở cột ghi chú §8.1), `classify(err)` giữ (221 ⇒ `ZaloRateLimitError`; `ZaloApiError` khác ⇒ `ZaloActionError` MỚI với `code` số — KHÔNG còn coi mọi `ZaloApiError` là `ZaloAuthError` ở đường action; đường login giữ nguyên). `sendText` nhận `OutboundText` ⇒ `api.sendMessage({ msg, quote, mentions }, threadId, ThreadType)`; chuỗi thuần ⇒ `{ msg }`. CẤM log nội dung tin/cookie (giữ §7 cũ).
Fake: `FakeSession.actions: Array<{kind, args, at}>`, `nextActionError: Error | null`, `reviewResult: Record<string, 0|166|170|178>`, `groupInfo` cấu hình được (`adminIds` có/không chứa `ownUid`).

## §4. Thi hành action trong pacer (apps/zalo-worker/src/pacer.ts + store.ts)

### §4.1 Chọn hàng
`fetchDue(account)` giữ thứ tự; thêm cột `kind`, `thread_type` (đã có), `result`. Trong một tick: (1) mọi hàng `action` đến hạn (tối đa `PACER_ACTIONS_PER_TICK` = 3) ⇒ thi hành tuần tự; (2) tối đa MỘT `text` theo pacer; (3) sự kiện. Hàng `group` + `text` KHÔNG còn bị `cancelRow('group_forbidden_phase1')`.

### §4.2 Bảng action ⇒ API (01-CONTRACTS §8.3)
| `body.action` | Gọi | Kết quả ghi `result` | Hậu xử lý |
| :-- | :-- | :-- | :-- |
| `delete_message` | `deleteMessage({data:{msgId, cliMsgId, uidFrom}, threadId, type:'group'}, false)` | `{status}` | `uidFrom` PHẢI là người gửi gốc (core lấy từ `group_messages.sender_uid`) — sửa lỗi zaloclaw `tool.ts:741`; `status != 0` ⇒ `failed` |
| `remove_member` | `removeMember(uid, groupId)` | `{errorMembers}` | `errorMembers` chứa uid ⇒ `failed`; `approvalId` ⇒ `store.completeApproval(approvalId, ok, result)` |
| `block_member` / `unblock_member` | `blockMember` / `unblockMember` | `{}` | như trên |
| `review_join` | `reviewJoin(uids, approve, groupId)` | `{<uid>: code}` | uid có code `166` ⇒ `bot_is_admin=false` + `failed`; `170`/`178` ⇒ coi là xong (không còn trong danh sách / đã vào) |
| `create_poll` | `createPoll({question, options, expiredTime, allowMultiChoices, isAnonymous}, groupId)` | `{poll_id}` | |
| `lock_poll` | `lockPoll(pollId)` | `{}` | |
| `create_reminder` | `createReminder({title, startTime, repeat, emoji}, threadId, type)` | `{id}` | |
| `remove_reminder` | `removeReminder(reminderId, threadId, type)` | `{}` | |
| `create_note` | `createNote({title, pinAct}, groupId)` | `{id}` | |
| `update_group_settings` | `updateGroupSettings(settings, groupId)` | `{}` | |
| `sync_group_info` | `getGroupInfo(groupId)` + `getMembersInfo(ids)` (ids = `memberIds` rỗng ⇒ `memVerList.map(s => s.split('_')[0])` — zca-js ≥2.1 hay trả `memberIds` rỗng, mẫu zaloclaw `tool.ts:127-132`) | `{name, adminIds, creatorId, members:[{uid, displayName}], total}` | `store.applyGroupSync(account, groupId, result)`: upsert `zalo_groups.name`, `bot_is_admin = adminIds.includes(ownUid) || creatorId === ownUid`, `last_synced_at`; upsert `group_members` (tồn tại ⇒ `left_at=null`, `display_name`), `role='moderator'` cho `adminIds` (KHÔNG hạ vai); thành viên trong DB không còn trong danh sách ⇒ `left_at=now()` |

Mọi action: `markSending` (CAS) → gọi → `markSent(id, null)` + `result` (hoặc `markFailed` + `result.error = {name, code}`) → `audit zalo.action` (`data: {action, thread, ok, code}`; KHÔNG ghi nội dung). Lỗi `ZaloRateLimitError` ⇒ `requeue` + backoff (giữ). `ZaloActionError` code 166 ⇒ `update zalo_groups set bot_is_admin=false where thread_id=$1` + `audit zalo.alert kind='deputy_missing'`.

### §4.3 Text nhóm
Trước `sendText` nhóm: `typing` (giữ `typingDelayMs`); `OutboundText.quote` chỉ ở `part=0`; `mentions` dịch `pos/len` theo text đã tách (chỉ giữ mention nằm trọn trong chunk đầu; mention rơi vào chunk sau ⇒ bỏ `mentions` chunk đó, không bịa). Sau khi gửi thành công: `store.markSent(id, msgId)` ghi `sent_at=now()`; `store.linkSentGroupMessage(outboxId, msgId)` ⇒ `update group_messages set zalo_msg_id=$2 where zalo_msg_id='out-'||$1` (core đã chèn trước — §2.1). msgId `null` ⇒ lùi backoff (giữ G04).

### §4.4 Đồng bộ nhóm định kỳ
Worker KHÔNG tự lên lịch; core (SPEC-P07 §2) enqueue `sync_group_info` cho mỗi nhóm `enabled` mỗi `GROUP_SYNC_HOURS` (6) và ngay sau sự kiện `add_admin`/`remove_admin`/`update_setting`/`join`/`leave`. Worker chỉ thi hành.

## §5. Pacer theo nhóm (pacer-policy.ts + pacer.ts)
- `PacerConfig` thêm `groupGapMs`, `groupJitterMs` (env 01-CONTRACTS §10). `PacerPolicy.record(now, threadId, isGroup)` dùng `groupGapMs/groupJitterMs` khi `isGroup`.
- Ngân sách: trước khi gửi `text` nhóm, `store.groupTextSentLastHour(account, threadId, now)` (câu SQL 01-CONTRACTS §8.4, đã đo) so với `store.groupBudget(threadId)` (`zalo_groups.budget_per_hour`, cache 60 s; nhóm không có dòng ⇒ 0 ⇒ KHÔNG gửi, `cancelled('group_unknown')` + audit). Hết ngân sách ⇒ giữ `queued`, `note:'group_budget'`; quá `GROUP_TEXT_TTL_MIN` kể từ `created_at` ⇒ `cancelled('budget_expired')` + audit `pacer.budget_expired`.
- `verifySendLog` thêm luật `group_gap` (cùng thread nhóm cách ≥ `groupGapMs`) và `group_budget` (≤ budget trong mọi cửa sổ 1 giờ trượt); `simulatePacer` nhận `isGroup` theo threadId (`sim-group-*`). Số đo architect: 100 tin/1 nhóm ⇒ 20/giờ đầu, khoảng cách tối thiểu 9000 ms (`evidence/ARCH/budget-ref.txt`).
- `maxRecipients` (15/10 phút) vẫn áp cho DM; nhóm không tính vào `recipients`.

## §6. Worker config/main
- `readAccounts`: chỉ `community` (P01). `main.ts`: giữ 5 vòng lặp; thêm `every('actions:<acc>')`? KHÔNG — action đi trong `pacer.tick` (§4.1), không vòng mới.
- Thêm vòng `every('buffer-link:<acc>', 5000)`? KHÔNG — link ngay sau gửi (§4.3).

## §7. Kênh giả lập nhóm (packages/core/src/sim + apps/web /dev/sim)

### §7.1 `simInbound(args)` mở rộng
```ts
export interface SimInboundArgs { account: AccountId; threadId: string; threadType: 'user'|'group'; senderUid: string; text: string; msgId?: string;
  senderName?: string; mentionBot?: boolean; mentionUids?: string[]; quoteMsgId?: string | null; msgType?: 'webchat' | 'chat.sticker' | 'chat.photo';
  event?: 'join' | 'join_request' | 'leave' | 'remove_member' | 'add_admin' | 'remove_admin'; eventUids?: string[]; eventNames?: string[] }
```
Dựng payload ĐÚNG 01-CONTRACTS §8.2 (`mentions` có `pos/len` tính từ vị trí `@bot`/`@uid` trong text; `quote` tra `group_messages` theo `quoteMsgId` để lấy `owner_id`); `event` ⇒ `kind:'group_event'` với `zalo_msg_id = 'gev-sim-<uuid>'`. `senderUid==='system'` vẫn bị từ chối. `BOT_UID_SIM = 'sim-bot'` (hằng xuất từ `sim-transport.ts`; `zalo_accounts.display_name` không dùng làm uid). 

### §7.2 `simDeliver()` ⇒ `sim/sim-actions.ts::applySimOutbox()`
Thay vì chỉ `queued → sent`: với mỗi hàng `queued` theo thứ tự id: `text` nhóm ⇒ `sent` + `zalo_msg_id='sim-out-<id>'` + `update group_messages set zalo_msg_id='sim-out-<id>' where zalo_msg_id='out-<id>'`; `action` ⇒ thi hành trên DB giả lập: `delete_message` ⇒ `group_messages.deleted_at=now()` (nếu `uidFrom` khớp `sender_uid`, ngược lại `failed` + `result.error='uidFrom_mismatch'` — tái hiện lỗi zaloclaw để test bắt); `remove_member`/`block_member` ⇒ `group_members.left_at=now()` (+ `deny_users` khi block); `review_join` ⇒ `join_requests` + `group_members` (approve) ; `sync_group_info` ⇒ `result` từ DB hiện có, `bot_is_admin` giữ; `create_poll/…` ⇒ `result:{poll_id: <id>}` giả; `approvalId` ⇒ `completeApproval`. Ngân sách/pacer KHÔNG mô phỏng ở `simDeliver` (đo riêng bằng `simulatePacer`), nhưng `applySimOutbox` ghi `sent_at=now()` để câu đếm ngân sách (§8.4) chạy được trên DB sim.

### §7.3 `/dev/sim` (apps/web) — SimBoard nhóm
- Khung "Nhóm": chọn `sim-group-1|2|off`; danh sách người gửi (`sim-mod-1`, `sim-mem-1..5`, `sim-owner`, tự nhập); ô text; nút "Gửi", "Gửi @bot", "Trả lời tin bot gần nhất" (quote), "Sticker"; nút sự kiện: "Thành viên mới vào (uid)", "Xin vào nhóm (uid)", "Rời nhóm".
- Khung "DM thành viên" (`senderUid` nhập) và "DM chủ" (`sim-owner`).
- Nút "Tick đồng hồ" (`/api/dev/sim/tick` — giữ) và "Phát lại kịch bản".
- Hiển thị tin nhóm từ `group_messages` (kể cả `deleted_at` ⇒ gạch ngang) + `outbox` action (`[hành động] delete_message …`).
- API: `POST /api/dev/sim/send` nhận đủ trường §7.1 (kiểm kiểu như R02 D10); `GET /api/dev/sim/thread?account&threadId` trả `{messages, actions}`; `POST /api/dev/sim/replay {file}` giữ; `POST /api/dev/sim/tick {now?}` giữ.

## §8. Vùng cấm P02
- CẤM `seen` cho nhóm; CẤM `react` tự động (chỉ khi persona bật và owner cho phép — 🖐 Q5, tạm TẮT: không enqueue `react`).
- CẤM gọi `getGroupChatHistory` (404 từ 06/2026 — G06); CẤM dựa vào `requestOldMessages`.
- CẤM worker tự quyết nhóm nào được trả lời (đó là cổng ở core).
- CẤM action `disperse_group`, `change_group_owner`, `add/remove_group_deputy`, `leave_group`, `send_file`; `check_agent_tools` (SPEC-P01 §6.1 `forbidden_actions`) canh.
- CẤM tự xin QR mới / tự đăng nhập lại sau 3000/3003 (giữ G01); CẤM hai bản worker.
- CẤM dùng `msgId` làm `cliMsgId` khi thiếu (zaloclaw `tool.ts:743` `cliMsgId ?? msgId`): thiếu `cli_msg_id` ⇒ `failed('cli_msg_id_missing')`, không đoán.

## §9. Lỗi & hành vi (bổ sung 01-CONTRACTS §9)
| Tình huống | Hành vi |
| :-- | :-- |
| `ZaloActionError` 166 (không đủ quyền) | `failed`, `bot_is_admin=false`, audit `zalo.alert deputy_missing`, DM owner `NEED_DEPUTY_DM` (core, khi thấy audit — P05 §5.5) |
| `review_join` trả 170/178 | coi là xong (`sent`), `result` ghi mã |
| `sendText` nhóm trả `msgId=null` | backoff 30 phút (giữ G04), hàng `requeue` |
| nhóm chưa có trong `zalo_groups` mà vẫn có hàng outbox | `cancelled('group_unknown')` + audit — là bug ở core |
| `delete_message` thiếu `uidFrom`/`cliMsgId` | `failed('cli_msg_id_missing')`; không thử với uid bot |

## §10. Nghiệm thu P02
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/zalo-worker` | ≥ 37 + ≥ 14 ca mới (fake-client): tin nhóm text ⇒ `group_inserted` với `mentions`/`quote` đúng; sticker nhóm ⇒ `unsupported`; `group_event` JOIN/JOIN_REQUEST/LEAVE/ADD_ADMIN ⇒ đúng `payload.event`, `zalo_msg_id` dạng `gev-`; `NEW_LINK` ⇒ không ghi; action `delete_message` gọi `deleteMessage` với `uidFrom` = người gửi gốc (ca đối chứng: uid bot ⇒ test đỏ); `review_join` 166 ⇒ `bot_is_admin=false`; `sync_group_info` với `memberIds=[]` ⇒ lấy từ `memVerList`; chunk 2 phần chỉ part 0 có quote; `typing` trước text nhóm; `simulatePacer` 100 tin/1 nhóm ⇒ `first_hour=20`, `min_gap ≥ 8000`, 0 vi phạm `verifySendLog` |
| 2 | `npm run test:db -w @lenqclaw/zalo-worker` | ca mới: `markSent` ghi `sent_at`; `linkSentGroupMessage` đổi `out-<id>` ⇒ msgId; `groupTextSentLastHour` = 20 với 20 hàng sent trong giờ + 1 hàng 2 giờ trước (số đo architect `db-checks (c)`) |
| 3 | `npm run test:db -w @lenqclaw/core` (`sim-actions.db.test.ts`) | `applySimOutbox`: delete đúng uid ⇒ `deleted_at`; sai uid ⇒ `failed uidFrom_mismatch`; `review_join approve` ⇒ `group_members` có dòng; `remove_member` ⇒ `left_at` |
| 4 | `npm run test:db -w @lenqclaw/web` (`sim-send.db.test.ts`) | `POST /api/dev/sim/send` với `mentionBot:true` ⇒ `inbound_events.payload.mentions[0].uid='sim-bot'`; `event:'join_request'` ⇒ `payload.kind='group_event'`; `senderUid:'system'` ⇒ 400 |
| 5 | `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group` | in `violations: 0`, `first_hour: 20` |
| 6 | Người (sau P03, Zalo thật — OPERATIONS §4): bot được đặt phó nhóm trong nhóm thử; `sync_group_info` ⇒ `bot_is_admin=true`; `/dev/sim` không dùng | ghi `evidence/P02/live.txt` |

## §11. Chốt sau thi công (D29, D30 — 2026-10-16; thắng mọi câu mâu thuẫn ở trên)
- Kick/block: worker kiểm `approvals` (`approved`, đúng kind/thread/uid) + nhận thẻ CAS (`executed_at`) TRƯỚC khi gọi Zalo; sai ⇒ `failed('approval_invalid')` + audit `zalo.action_blocked` (D29.1).
- Nhóm lạ hoặc `enabled=false`: mọi text/action (trừ `sync_group_info`) ⇒ `cancelled('group_unknown'|'group_disabled')` (D29.2). `sync_group_info` cho nhóm lạ tạo dòng `enabled=false`.
- Ngân sách đếm theo `now()` của DB, tính cả hàng `sending` (D29.3, 8). Action không idempotent lỗi không rõ kết quả ⇒ `failed('outcome_unknown')`, không thử lại (D29.4).
- `delete_message` `cliMsgId === msgId` ⇒ `failed('cli_msg_id_suspect')`; sim so `cliMsgId` thật (D29.5). `applySimOutbox` chỉ `sim-%` + `not_before` (ngoại lệ `extraThreadIds` cho `runScenario`) (D29.6, D30).
- Audit: `zalo.action` (ok) · `zalo.action_failed` · `zalo.action_blocked`. `ZaloActionError.code = 'ZaloActionError'`, mã Zalo ở `apiCode` (theo 01-CONTRACTS §9).
- Hoãn P09: xoá tin của chính bot; `review_join` trả `{}`.

