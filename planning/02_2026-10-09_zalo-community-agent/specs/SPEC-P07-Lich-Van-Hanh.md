# SPEC-P07 — Lịch (`automations`), vận hành nhóm, tóm tắt tuần, báo cáo ngày, đồng hồ hệ thống (D05f, D08)

> Tầng 🟠. Đọc 01-CONTRACTS §4 `automations`, §5.4, §7.1 (poll/reminder/note/announce/schedule_*), §8.3, §8.5 và SPEC-P03 §4.2, §4.3. Phụ thuộc: P02, P03.
> Mẫu port: `services/timers.ts` cũ (`runTimers(now)` tham số, mỗi bước idempotent, lỗi ⇒ `timer.error` không dừng vòng); OpenClaw automations `at|every` + heartbeat chỉ DM owner (`docs/gateway/heartbeat.md:43`); condition watcher không gọi model khi im (`docs/automation/cron-jobs/schedules.md:93-120`) ⇒ các watcher của ta là SQL thuần.

> D28: `runTimers` KHÔNG nằm trong đồ thị LangGraph — mọi bước là SQL thuần, 0 model; bước nào cần agent thì ghi `inbound_events sender='system'` ⇒ runner ⇒ `pipelineGraph` node `system_event` ⇒ `turn` (SPEC-P03 §2). Lượt `automation`/`weekly_summary` chạy trong `turnGraph` như mọi lượt (`mustReply=false`, tool theo SPEC-P03 §8).

## §1. `schedule.ts` (THUẦN)
```ts
export type ScheduleSpec = { kind: 'at'; at: Date } | { kind: 'every'; everySeconds: number; anchor: Date } | { kind: 'daily'; timeOfDay: 'HH:MM' } | { kind: 'weekly'; dayOfWeek: 0|1|2|3|4|5|6; timeOfDay: 'HH:MM' };
export function computeNextRun(spec: ScheduleSpec, after: Date, tz = 'Asia/Ho_Chi_Minh'): Date | null;   // null ⇒ 'at' đã qua
```
Giờ VN cố định UTC+7 (không DST) — dùng `vn-time.ts` (giữ) để đổi; `daily` ⇒ lần kế tiếp ≥ `after + 1 s`; `weekly` ⇒ `dayOfWeek` 0 = Chủ nhật (khớp `Date.getUTCDay` sau khi cộng 7 giờ). Test: 12 ca gồm biên nửa đêm, cuối tuần, `after` đúng mốc (⇒ mốc tiếp theo, không phải mốc hiện tại).

## §2. `services/timers.ts::runTimers(now, cfg)` — thứ tự bước, mỗi bước độc lập, idempotent với cùng `now`
| # | Bước | Làm | Số đo trong `TimerReport.steps.<tên>` |
| :-- | :-- | :-- | :-- |
| 1 | `syncUndone` | P03 §4.4 | n dòng đánh dấu |
| 2 | `flushAmbient` | P03 §4.2 — `pending_since <= now - AMBIENT_DEBOUNCE_SEC` (đo `db-checks (d)`), ngân sách lượt/giờ ⇒ `sys ambient_flush` hoặc `ambient.budget_skip` | n sự kiện, n skip |
| 3 | `flushWelcomes` | P05 §7.1 | n |
| 4 | `pickUnanswered` | P04 §5 | n |
| 5 | `runAutomations` | §3 | n chạy, n lỗi |
| 6 | `expireApprovals` + `expireJoinRequests` | P05 §5.5, §6 | n |
| 7 | `reconcileDeletes` | P05 §9 | n |
| 8 | `pruneBuffers` | `delete from group_messages where received_at < now - GROUP_BUFFER_RETENTION_DAYS` (mỗi tick, giới hạn 5000 dòng) + prune theo số (BB-11) + (D22, BB-13) `delete from messages where created_at < now - MESSAGES_RETENTION_DAYS` (giới hạn 5000 dòng/tick; KHÔNG chạm `member_profiles`, `leads`) + (D32, SPEC-D31 §11) `turn_traces`/`agent_runs` cũ hơn `TRACE_RETENTION_DAYS` (180), `audit_log` cũ hơn `AUDIT_RETENTION_DAYS` (365), mỗi bảng ≤ 5000 dòng/tick | n xoá đệm, n xoá messages |
| 9 | `embedPending` | P04 §1 (≤ 50 mục/tick; bỏ qua khi `EMBED_PROVIDER=none`) | n nhúng |
| 10 | `syncGroups` | nhóm `enabled` có `last_synced_at` null hoặc `< now - GROUP_SYNC_HOURS` ⇒ `enqueueAction sync_group_info` (1 hàng/nhóm/chu kỳ, kiểm chưa có hàng `queued` cùng action) | n |
| 11 | `dailyOwnerReport` | §5 (mỗi ngày một lần sau `DAILY_REPORT_HOUR` giờ VN — ghi mốc vào `automations` hệ thống `name='__daily_owner_report'` tạo tự động nếu thiếu, `kind='daily'`) | 0/1 |
| 12 | `weeklySummaries` | §4 — tạo tự động `automations name='__weekly_summary:<thread>' kind='weekly'` cho mỗi nhóm `enabled` (nếu thiếu); thi hành ở bước 5 | n tạo |
| 13 | `opsWatch` | (D32) `ops-watch.ts::checkOps(now, 'runner')` — tự giới hạn mỗi `OPS_WATCH_INTERVAL_MS` (60 s); SQL thuần, 0 model; báo động Telegram qua `adapters/alert.ts` (SPEC-D31 §10.2) | n kiểm, n gửi, n chặn lặp |
Mọi bước nhận `now` tham số (CẤM `now()` Postgres trong so sánh — giữ luật cũ); lỗi ⇒ `audit timer.error {step}` + tiếp bước sau. Runner gọi mỗi `TIMER_INTERVAL_MS` (10 s) như cũ — D31: trên vòng RIÊNG, không chờ lượt agent nào (SPEC-D31 §6); bước 2/3 bỏ qua thread đang có sự kiện `sys-%` cùng loại chưa xử lý hoặc đang chạy (`TimerContext.busyThreads`).

## §3. `runAutomations(now)` — `services/automations.ts`
- Chọn: `select … from automations where enabled and next_run_at <= $now and (lock_until is null or lock_until < $now) order by next_run_at limit 10 for update skip locked`; đặt `lock_until = now + 5 phút` trong cùng tx; chạy từng hàng ngoài tx.
- Thi hành theo `action`:
  | action | Làm | Model? |
  | :-- | :-- | :-- |
  | `send_text` | `payload.text` ⇒ outbox text tới `thread_id` (nhóm — ngân sách áp) hoặc DM owner | ✗ |
  | `poll` | `payload: {question, options, expires_hours?}` ⇒ `enqueueAction create_poll` | ✗ |
  | `agent_turn` | `enqueueSystemEvent({event:'automation', automationId, threadId})` ⇒ (D28: `system_event` ⇒ `turn`) lượt `automation` với chỉ dẫn `payload.instruction` (≤ 1000 ký tự), tool: `send_group_message`, `search_knowledge`, `recall_group_history`, `create_poll` | ✓ (ngân sách ambient nhóm áp) |
  | `weekly_summary` | như `agent_turn` với chỉ dẫn cố định `WEEKLY_SUMMARY_INSTRUCTION` (tóm tắt 7 ngày: chủ đề chính, câu hỏi hay, thành viên mới, việc còn mở; ≤ 1200 ký tự; đăng vào nhóm bằng `send_group_message`) — `recall_group_history` được mở `limit ≤ 200` cho lượt này | ✓ |
  | `daily_owner_report` | §5 | ✗ |
  | `watch_unanswered` | không dùng ở 0.1 (đã là bước 4) — bị từ chối khi tạo (`AutomationInvalidError`) | |
- Kết thúc: `automation_runs (status ok|error, detail)`, `last_run_at=now`, `last_status`, `next_run_at = computeNextRun(spec, now)` (`at` ⇒ `enabled=false`), `lock_until=null`. Lỗi ⇒ `status='error'`, vẫn tính `next_run_at` (không lặp vô hạn).
- Tool `schedule_automation` (O): kiểm `computeNextRun` ≠ null; `every_minutes ≥ 1` ⇒ `every_seconds`; `thread_id` phải là nhóm `enabled` khi action nhóm; trả `{id, next_run_at}`. `list_automations` ⇒ 20 dòng gần nhất; `cancel_automation` ⇒ `enabled=false` (không xoá). Dashboard `/automations` (P08) CRUD tương tự.
- Lời hứa "lặp lại" trong chat (OpenClaw: agent offers to promote repeated requests): prompt `rules` cho owner DM: khi chủ yêu cầu "mỗi sáng…", agent đề nghị tạo automation và CHỈ tạo sau khi chủ xác nhận bằng lời (tool `schedule_automation` yêu cầu `confirmed: true` trong input và `latestText` của owner chứa "ok"/"đồng ý"/"tạo" — lưới tất định như `decide_approval`).

## §4. Công cụ vận hành nhóm (G: owner/moderator; O)
`create_poll` ⇒ `enqueueAction create_poll {question, options, expiredTime = expires_hours*3600e3 | 0, allowMultiChoices, isAnonymous}`; `create_reminder` ⇒ `startTime = Date.parse(start_at)` (ms), `repeat` map none/daily/weekly/monthly ⇒ 0/1/2/3 (`ReminderRepeatMode`), `type='group'`; `create_note` ⇒ `create_note {title, pinAct}`; `announce` (O) ⇒ outbox text nhóm + audit `announce` (owner tự chịu nội dung; không qua thẻ duyệt — thẻ `announce` chỉ dành cho agent TỰ đề xuất thông báo trong lượt nhóm: tool `send_group_message` với `text` bắt đầu bằng `[THÔNG BÁO]` và `ctx.requester.role` không phải owner/moderator ⇒ chuyển thành `createApproval(kind:'announce')` thay vì gửi — luật trong tool). Kết quả action ⇒ `audit zalo.action`; tool trả `{queued: true, outbox_id}` (agent nói "mình đã tạo bình chọn" chỉ SAU khi tool trả về — pacer gửi sau vài giây).

## §5. Báo cáo ngày cho owner (`services/reports.ts::buildDailyReport(account, now)`) — 0 model
Nội dung (text ≤ 1800 ký tự, DM mọi owner): theo nhóm `enabled`: tin trong 24 giờ (`group_messages`), tin bot đã gửi (`outbox sent`), câu hỏi bỏ trống đã nhặt / đã trả lời, kiểm duyệt (warn/delete/thẻ), thành viên mới/rời, thẻ duyệt đang chờ (id ngắn), lead mới/chuyển, `agent_runs` tokens 24 giờ (`sum(input_tokens+output_tokens)`), cảnh báo (`bot_is_admin=false`, phiên không `connected`, `kb.embed_unavailable`). Ghi cùng nội dung vào `daily_notes (thread_id null)`. Chỉ gửi khi `zalo_accounts.session_state='connected'` hoặc `DATA_MODE=sim`; không gửi ⇒ vẫn ghi note + audit `report.skipped`.
Heartbeat GỬI CHO NGƯỜI = CHÍNH báo cáo này (OpenClaw: heartbeat chỉ DM owner, không nhóm) — không có tin heartbeat khác. (D32) Dấu sống tiến trình `process_heartbeats` (SPEC-D31 §9) là bản ghi DB cho giám sát chéo, KHÔNG gửi tin cho ai; báo động sự cố đi Telegram (BB-20), không đi Zalo.

## §6. Vùng cấm P07
- CẤM `cron` expression (D16) — người cần cron ⇒ Idea Vault.
- CẤM automation nào đăng vào nhóm mà không qua ngân sách nhóm; CẤM `agent_turn` tạo automation khác (tool `schedule_automation` không có trong lượt `automation`).
- CẤM chạy automation trong transaction khoá dòng (chọn + lock trong tx ngắn, chạy ngoài — G10).
- CẤM heartbeat/báo cáo vào nhóm.
- CẤM `every_seconds < 60`.

## §7. Lỗi
| Lỗi | Khi | Caller |
| :-- | :-- | :-- |
| `AutomationInvalidError` | `computeNextRun` null / `at` quá khứ / action `watch_unanswered` / thread không `enabled` | tool `is_error` (agent sửa tham số); web 400 |
| `timer.error` (audit) | bước lỗi | tiếp bước sau; dashboard `/agent` hiện 24 giờ gần nhất |
| `lock_until` kẹt (tiến trình chết giữa chừng) | `lock_until < now` ⇒ chọn lại sau 5 phút | chấp nhận trễ 5 phút |

## §8. Nghiệm thu P07
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/core` — `schedule.test.ts` | 12 ca `computeNextRun` (daily 19:00 với `after` 18:59/19:00/19:01 VN; weekly CN; every anchor; at quá khứ ⇒ null) |
| 2 | `npm run test:db -w @lenqclaw/core` — `p07-timers.db.test.ts` | `runTimers(now)` chạy 2 lần cùng `now` ⇒ mọi số đo lần 2 = 0 (idempotent); mỗi bước có 1 ca có việc + 1 ca không; lỗi giả ở bước 3 (DB constraint) ⇒ `timer.error` + bước 4 vẫn chạy |
| 3 | `p07-automations.db.test.ts` | `every 60 s` ⇒ sau `runTimers(t+61 s)` 1 run ok + `next_run_at = t+120`; 2 runner song song (`Promise.all` 2 `runAutomations`) ⇒ đúng 1 run (skip locked); `at` ⇒ `enabled=false`; `send_text` ⇒ outbox nhóm; `weekly_summary` với fake model ⇒ 1 outbox text ≤ 1800 ký tự; `agent_turn` 13/giờ ⇒ `ambient.budget_skip` |
| 4 | `p07-report.db.test.ts` | DB có 2 nhóm, 5 tin, 1 thẻ chờ, 1 lead chuyển ⇒ `buildDailyReport` chứa đủ 4 số; `session_state='logged_out'` + `DATA_MODE=real` ⇒ 0 outbox, 1 `daily_notes`, audit `report.skipped` |
| 5 | `/api/dev/sim/tick` | trả `TimerReport.steps` 12 khoá |
