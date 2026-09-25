# SPEC-P05 — Job ẩn danh → nhóm thợ → chốt → cấp quyền → giao việc (bước 4–7, pipeline v0.2)

> Tầng 🔴. Thi công ngay sau P03 trên kênh giả lập (Đ13). Đọc `01-CONTRACTS.md` §4–§7, §9 và BB-02, BB-05, BB-10, BB-11.
> Agent điều phối thực hiện mọi bước qua tool (Đ10). Luật nằm trong tool; agent không chọn người thắng, không duyệt quyền vào tòa.

## §1. Bước 4 — Job ẩn danh, đăng thẳng nhóm thợ

1. Từ `case_open`, agent gọi `publish_job_to_group(job_code)`.
2. Tool dựng `JobCard` (kiểu không có trường PII — BB-02) và đưa **một tin** vào outbox nhóm "Thợ Tòa X · <nhóm nghề>" (tài khoản `market`) — nhóm chỉ gồm thợ đang giữ slot, kể cả dùng thử (Đ14):

```text
CUỐC C-24A7
Thông tắc ống nhánh bồn rửa chén — nước rút chậm, có mùi
Tòa B · 14h–17h hôm nay
Giá tham khảo: 250–350k        (hoặc: THỢ BÁO GIÁ KHI NHẬN)
Trả lời "nhận C-24A7" để giữ cuốc 10 phút
```

3. Ảnh: chỉ ảnh `intake`, đã xoá EXIF; nghi ngờ ảnh lộ số căn/giấy tờ ⇒ không gửi ảnh (agent tư vấn, tool quyết không gửi khi cờ nghi ngờ bật).
4. Không nhắn riêng thợ ở vòng 0.1 (Đ10; nhắn riêng top thợ nằm ở Idea Vault).

## §2. Bước 5 — Chốt thợ

1. Worker parse tất định tin nhóm: `nhận C-XXXX` (có/không dấu, không phân biệt hoa thường) ⇒ sự kiện `claim`.
2. Kiểm `IneligibleVendorError` (BB-10: `active`, **slot còn hạn — trả phí hoặc dùng thử — đúng (tòa × nhóm nghề)**, đúng kỹ năng, đúng tòa, không bị khoá do bùng ≥3 lần/30 ngày, không trùng khung giờ với cuốc đang giữ).
3. Một câu: `UPDATE jobs SET status='held', assigned_vendor_id=$v, hold_expires_at=now()+interval '10 min' WHERE id=$j AND status='published' RETURNING id`. `rowCount=1` ⇒ thắng; `0` ⇒ agent trả lời nhóm "C-24A7 đã có người nhận".
4. Agent nhắn riêng thợ thắng: "Bạn đang giữ C-24A7 tới HH:MM. Trả lời OK để xác nhận." (`mode='quote'` ⇒ kèm câu xin giá).
5. Thợ "OK" (kèm giá nếu `quote`) ⇒ agent gọi `confirm_assignment` ⇒ `confirmed`. Hết hạn giữ ⇒ `published` lại, `no_show_count+1`, agent đăng lại nhóm (tối đa 2 lần).
6. `mode='quote'` và giá thợ báo vượt `price_high` > 30% (nếu có khung) ⇒ agent hỏi cư dân đồng ý trước khi sang bước 6.

## §3. Bước 6 — Ticket cấp quyền vào tòa

1. Ngay sau `confirmed`, agent gọi `request_access(job_code, note)` ⇒ ticket `access_request` trên dashboard: tên thợ, SĐT thợ, điểm, số cuốc đã làm, căn, khung giờ, loại việc.
2. BQL bấm **Duyệt** ⇒ `access_granted` + tạo `access_passes` (mã 6 ký tự, hiệu lực `window_start − 30 phút` tới `window_end + 2 giờ`, hiện ở `/passes`).
3. BQL bấm **Từ chối** (bắt buộc lý do) ⇒ agent báo thợ "cuốc được chuyển người khác", gỡ gán, `published` lại, đăng lại nhóm.
4. Chưa duyệt sau 30 phút trong giờ hành chính ⇒ agent nhắc trên dashboard + báo cư dân "đang chờ BQL xác nhận thợ".

## §4. Bước 7 — Giao việc

- Agent gọi `dispatch_to_vendor(job_code)`. Tool kiểm `status='access_granted'` ∧ ticket `approved` ∧ đúng thợ được gán; sai ⇒ `AccessNotApprovedError` / `PiiGateError` (log mức cao).
- Đúng ⇒ `JobReveal` nhắn riêng thợ (số căn, tầng, SĐT cư dân, mã vào tòa) ⇒ `dispatched`.
- Agent nhắn cư dân: tên thợ, điểm, giờ đến, mã để đối chiếu với bảo vệ.

## §5. Hết giờ không ai nhận

`published` quá `DISPATCH_TIMEOUT` (mặc định 45 phút trong 7–21h; ngoài giờ giữ tới 8h sáng) ⇒ agent đăng lại một lần với "THỢ BÁO GIÁ KHI NHẬN"; vẫn không ai ⇒ `unassigned` + ticket `no_vendor` (BQL gọi thợ quen) + báo cư dân.

## §6. Vùng cấm

- CẤM agent chọn người thắng hoặc "ưu tiên" thợ quen: người thắng là câu UPDATE có điều kiện.
- CẤM agent tự duyệt / giả lập duyệt ticket cấp quyền; chỉ `staff_users` bấm trên dashboard.
- CẤM gửi số căn, SĐT, tên cư dân vào nhóm thợ hay cho thợ trước `access_granted` (BB-02, BB-11).
- CẤM đấu giá hạ giá; CẤM cho thợ này xem giá thợ khác.

## §7. Lỗi

| Tình huống | Hành vi |
| :-- | :-- |
| Hai "nhận" cùng mili-giây | câu UPDATE quyết; người thua được báo "đã có người nhận" |
| Thợ bị `suspended` khi đang `held`/`access_pending` | về `published`, huỷ ticket cấp quyền, báo cư dân "đang tìm thợ khác" |
| Gửi tin nhóm thất bại (`TransportDeadError`) | giữ `case_open`, đăng khi phiên sống lại; quá 30 phút ⇒ ticket `no_vendor` |
| BQL không duyệt trước giờ hẹn | agent đề xuất cư dân dời giờ; không bao giờ tự giao việc |

## §8. Phí vào nhóm: slot tháng đồng giá + dùng thử miễn phí (Đ14)

- **Một mức phí** `SLOT_FEE_MONTHLY` cho mọi thợ, mọi (tòa × nhóm nghề). Không hạng, không ưu tiên thời gian: trong nhóm, "nhận" hợp lệ đầu tiên thắng (BB-05); "đầu tiên" = `inbound_events.received_at` theo server, hoà ⇒ câu UPDATE có điều kiện quyết.
- **Dùng thử:** thợ `active` lần đầu xin slot tại (tòa × nhóm nghề) ⇒ nếu còn chỗ, cấp `vendor_slots(is_trial=true, fee=0)` dài `FREE_TRIAL_DAYS`; mỗi thợ chỉ dùng thử một lần mỗi (tòa × nhóm nghề) (index `one_trial_ever`). Dùng thử **chiếm chỗ** trong trần như slot trả phí.
- **Trần slot:** `capacity = max(2, ceil(cuốc_dự_kiến_tháng / SLOT_MIN_JOBS_PER_VENDOR))`, BQL admin xem lại hằng tháng trên dashboard. CẤM cấp vượt trần. Đầy ⇒ `slot_waitlist` theo thứ tự đăng ký; có chỗ trống ⇒ agent mời người đầu danh sách, giữ lời mời 48 giờ.
- **Chuyển sang trả phí / gia hạn:** agent nhắc thợ 3 ngày trước `period_end` (cả dùng thử lẫn trả phí). BQL bấm "Đã thu phí" trên dashboard ⇒ slot mới `is_trial=false` kỳ kế tiếp + `ledger_entries(slot_fee)` + `ledger_entries(bql_share = round(SLOT_FEE_MONTHLY × BQL_SHARE_PCT))`. Không thu ⇒ `expired`, dashboard nhắc "cần gỡ khỏi nhóm" (gỡ tay), mời người chờ.
- **Chất lượng** (đã có §2): bùng ≥3 lần/30 ngày ⇒ khoá nhận cuốc 7 ngày, slot vẫn tính; BQL đình chỉ ⇒ `cancelled`.
- **Agent thợ** thêm lệnh: "giữ slot <nhóm nghề>" (xin slot / vào danh sách chờ), "slot của tôi" (còn bao nhiêu ngày, dùng thử hay trả phí).
- **Ngoài phạm vi (Đ13):** bảng tin tuần, FOMO, chiến dịch kéo thợ, ưu đãi khác ngoài dùng thử.

## §9. Nghiệm thu (G11, G12, G12b, G15)

- `scripts/sim_claims.mjs`: 200 claim đồng thời trên 50 cuốc ⇒ mỗi cuốc đúng 1 người thắng.
- `pii_probe` + quét outbox: 0 tin tới thợ chứa mã căn/SĐT trước `access_granted`.
- Truy vấn kiểm: 0 cuốc `dispatched` mà ticket `access_request` không `approved`.
- Từ chối cấp quyền ⇒ cuốc về `published` và được đăng lại (test đồng hồ giả).
- G15: 50 yêu cầu slot đồng thời khi còn 1 chỗ ⇒ đúng 1 slot mới, 49 vào danh sách chờ; thợ xin dùng thử lần 2 ⇒ bị từ chối; hết dùng thử không trả phí ⇒ `expired` và "nhận" bị từ chối (đồng hồ giả).

## §10. Chốt thi công (Đ27 — Super Orchestrator giao, architect soạn 2026-09-25 23:17 — ĐÃ DUYỆT 2026-09-26)

> Mục này THẮNG §1–§9 ở chỗ mâu thuẫn; chỗ §10 không nói thì §1–§9 giữ nguyên. Thi công TRÊN KÊNH GIẢ LẬP (`SimTransport`, `DATA_MODE=sim`, `TRANSPORT=sim`); tài khoản Zalo `market` thật = P02 giai đoạn 2, ngoài gói này. Mọi số đo trong §10 do architect tự chạy 2026-09-25 (lệnh ghi kèm; DB thử `lq_spec_check` tách riêng, đã xoá). Worker không có lịch sử chat: đọc `01-CONTRACTS.md` §4–§9 (bản đã bổ sung Đ27), `SPEC-P03 §10–§11` (mẫu tool), rồi §10 này, rồi `SPEC-P04 §8`, `TESTING-ACCEPTANCE §4`.

### §10.0 Đối chiếu code thật (2026-09-25, head `7fbb503`) — lệch đã phát hiện, code thắng

| # | Tài liệu nói | Code thật | Chốt Đ27 |
| :-- | :-- | :-- | :-- |
| L1 | §2.1, 01-CONTRACTS §7, 00-ARCH §4/§7: worker parse tất định `nhận C-XXXX` thành sự kiện | `apps/zalo-worker/src/inbound.ts` bỏ toàn bộ tin nhóm (`ignored_group`, P02 g1); core chưa có gì cho `market` (`routeInboundEvent` ⇒ `echoHandler`) | Hiểu ý bằng model (§10.4, Đ21); code chỉ trích mã cuốc/giá + danh sách cụm an toàn; luật trong tool. Luật bắt tin nhóm ở §10.4.3 thay SPEC-P02 §3.5 (SO đồng bộ SPEC-P02/00-ARCH — ngoài phạm vi architect) |
| L2 | SPEC-P04 §4: trang bảo vệ `/passes` | `apps/web/lib/auth/policy.ts` + `app/gate/page.tsx`: đường dẫn `/gate/*` (admin + guard), SPEC-P01 §7 | Giữ `/gate`; mọi chỗ ghi `/passes` đọc là `/gate` |
| L3 | §5: `DISPATCH_TIMEOUT` mặc định 45 phút; OPERATIONS §3: `DISPATCH_TIMEOUT_MIN`; `.env.example`: `DISPATCH_TIMEOUT_MIN=30` | chưa có mã đọc biến này | Tên `DISPATCH_TIMEOUT_MIN`, mặc định **45**; sửa `.env.example` cùng đợt (WP-B) |
| L4 | 01-CONTRACTS §8, OPERATIONS §2: pg-boss cho timer cuốc | Không có pg-boss; runner `packages/core/src/runner/inbound-runner.ts` (`core:run`) vòng 1 s (Đ22) | Đồng hồ chạy trong runner đó (§10.8); CẤM pg-boss ở P05 |
| L5 | 01-CONTRACTS §7: `open_service_case(window_options, note)`; Đ19-3: `jobs.window_start/end` NULL | `open_service_case.ts` input `window_options: string[]`, không ghi `window_*`; `open_service_case` chỉ xét `ctx.latestText` để tìm đồng ý | Đ27: `open_service_case(window_start, window_end, note)` ISO 8601 ghi `jobs.window_*` (§10.7); đồng ý xét chuỗi tin sau mốc (§10.7.2) |
| L6 | SPEC-P03 §10.2: tool `run(ctx: ToolContext, …)` | `tool-kit.ts`: `AgentTool<TInput, TOutput>` với `ctx: ToolContext` (chỉ cư dân) | Thêm tham số kiểu `TCtx = ToolContext` (§10.1.3), P03 không đổi |
| L7 | 01-CONTRACTS §5: `confirmed` chỉ đi tới `access_pending`/`cancelled` | `services/job-state.ts` `TRANSITIONS` đúng như §5 | Thêm cặp `confirmed → published` (thợ rút / BQL đình chỉ) — sửa 01-CONTRACTS §5 + `TRANSITIONS` + test đếm cặp |
| L8 | SPEC-P01 §6: `runScenario` ⇒ `processInbound(echoHandler)`; `/dev/sim` nút phát lại chạy kịch bản | `sim-transport.ts` `runScenario` ghi cứng `echoHandler`; `app/api/dev/sim/replay/route.ts` gọi nó ⇒ phát lại KHÔNG qua agent | `runScenario(path, handler = echoHandler)`; route replay truyền `agent.routeInboundEvent`; test P01 `echo.jsonl` giữ nguyên (mặc định echo) |
| L9 | §3.1: ticket cấp quyền ghi "SĐT thợ, điểm, số cuốc" | `tickets.summary text` là cột duy nhất tự do | Ghi dạng văn bản nhiều dòng trong `summary` (§10.6 `request_access`), không thêm cột |
| L10 | SPEC-P03 §5 "phần biến đổi (ngày giờ…)" | `runResidentTurn` KHÔNG nạp ngày giờ vào ngữ cảnh | Đ27 §10.7.4: nạp `[Ngữ cảnh hệ thống] Bây giờ: <ISO +07:00>` — cần để đổi "2h chiều mai" ra ISO |

Số test hiện tại (đo `npm test` 2026-09-25 23:20, exit 0): web 24 · zalo-worker 37 · core 190 = **251 test / 21 file, 0 skip**. `test:db` không đo lại (DB dev đang phục vụ H08 vòng 4) — lấy mốc R11: 122.

### §10.1 Kiến trúc thi công

#### §10.1.1 Ai làm gì (tác nhân — BB-01 giữ nguyên: mọi BƯỚC pipeline do agent gọi tool; timer/BQL chỉ là tác nhân ở các dòng 01-CONTRACTS §5 đã ghi rõ)

| Bước | Tác nhân chính | Cơ chế | Lưới an toàn (code, chỉ khi tác nhân chính không làm) |
| :-- | :-- | :-- | :-- |
| 4 đăng nhóm | **Agent cư dân** (`bql`), cùng lượt ngay sau `open_service_case` | tool `publish_job_to_group` | timer `publishFallback`: `case_open` quá `PUBLISH_FALLBACK_MIN` (2) có `window_start` ⇒ dịch vụ đăng, audit `timer.publish_fallback` |
| 5 chốt thợ | **Agent thợ** (`market`) | tool `claim_job` (UPDATE có điều kiện — BB-05), `confirm_assignment`, `decline_hold` | model chết (`ModelUnavailableError`) trong lượt nhóm có bằng chứng tất định "nhận + mã" ⇒ server gọi thẳng `claimJob`, audit `claim.fallback_no_model` |
| 5b giá vượt khung | **Agent cư dân** | tool `respond_to_quote` | timer: cư dân im `QUOTE_CONSENT_MIN` (30) ⇒ nhả cuốc, không tính bùng |
| 6 ticket cấp quyền | **Agent thợ**, cùng lượt ngay sau `confirm_assignment` | tool `request_access` | timer `requestAccessFallback`: `confirmed` quá `REQUEST_ACCESS_FALLBACK_MIN` (2) ⇒ dịch vụ tạo ticket, audit `timer.request_access_fallback` |
| duyệt | **BQL** trên web (SPEC-P04 §8) | `POST /api/tickets/{id}/decision` ⇒ `decideAccessRequest` | — |
| 7 giao việc | **Agent thợ**, lượt do **sự kiện hệ thống** `access_approved` kích hoạt | tool `dispatch_to_vendor` | timer `reemitStuckGranted`: `access_granted` quá `DISPATCH_REEMIT_MIN` (5) ⇒ phát lại sự kiện (≤3 lần), rồi audit `dispatch.stuck` |
| hết hạn giữ / hết giờ đăng / nhắc BQL / slot | **Timer** (01-CONTRACTS §5 ghi actor `timer`) | `services/timers.ts` trong runner | — |

Nguyên tắc: tool là nơi DUY NHẤT thực thi luật (BB-02/05/10/11); dịch vụ (`services/*.ts`) chứa SQL và được CẢ tool lẫn timer/web gọi — tool = lớp vỏ mỏng (kiểm ý định + gọi dịch vụ + audit `tool.<tên>`). Lưới an toàn ở cột cuối KHÔNG phải đường chính; mỗi lần lưới chạy phải có audit riêng để đo tần suất (TESTING §6).

#### §10.1.2 File mới / sửa (packages/core/src trừ khi ghi khác)

| File | Việc |
| :-- | :-- |
| `domain/errors.ts` (sửa) | thêm `JobNotFoundError`, `HoldExpiredError`, `QuoteRequiredError`, `SlotUnavailableError`, `IntentNotConfirmedError` (mỗi lớp `code` = tên lớp, mẫu như lớp có sẵn) |
| `domain/types.ts` (sửa) | thêm `type TradeGroup = 'dien_nuoc' \| 'khoa' \| 'dien_lanh' \| 'xay_sua'`; `JobCard`/`JobReveal` GIỮ NGUYÊN |
| `agent/tools/tool-kit.ts` (sửa) | `AgentTool<TInput, TOutput, TCtx = ToolContext>` — `run(ctx: TCtx, input)`; `validateToolInput`/`assertValidToolInput` giữ nguyên |
| `agent/vendor-tool-context.ts` (mới) | `VendorToolContext` (§10.5.2) |
| `agent/conversation.ts` (mới, tách từ `resident-agent.ts`) | `resolveParty`, `getOrCreateConversation`, `saveMessage`, `loadHistory` dùng chung hai agent — hành vi giữ nguyên, test P03 không được đỏ |
| `agent/vendor-intent.ts` (mới, thuần) | `extractJobCodes`, `parsePriceVnd`, `matchesClaimPhrase`, `matchesConfirmPhrase`, `matchesDeclinePhrase` (§10.4.2) |
| `agent/vendor-triage.ts` + `agent/prompts/vendor-triage.ts` (mới) | lớp hiểu ý thợ (§10.4.1) |
| `agent/vendor-agent.ts` + `agent/prompts/vendor.ts` (mới) | `vendorHandler`, `runVendorTurn` (§10.5) |
| `agent/resident-agent.ts` (sửa) | `routeInboundEvent`: `market` ⇒ `vendorHandler`; dùng `conversation.ts`; nạp mốc thời gian (§10.7.4) |
| `agent/tools/{publish_job_to_group,respond_to_quote}.ts` (mới, ctx `ToolContext`) | tool phía cư dân (§10.7) |
| `agent/tools/{claim_job,confirm_assignment,decline_hold,request_access,dispatch_to_vendor,get_my_assignments,request_slot,get_my_slot,vendor_handoff_to_staff}.ts` (mới, ctx `VendorToolContext`) | tool phía thợ (§10.6) |
| `agent/tools/open_service_case.ts` (sửa, WP-D) + `agent/consent.ts` (mới, WP-D) | §10.7.1–§10.7.2 |
| `agent/tools/index.ts` (sửa) | `RESIDENT_TOOLS` += 2; `VENDOR_TOOLS` (9) |
| `services/dispatch.ts`, `services/access.ts`, `services/slots.ts`, `services/timers.ts`, `services/system-events.ts`, `services/vendor-messages.ts`, `services/pii-gate.ts`, `services/vn-time.ts`, `services/dispatch-config.ts` (mới) | §10.2–§10.3, §10.8–§10.10 |
| `sim/sim-transport.ts` (sửa) | `simInbound` từ chối `senderUid === 'system'` (ném `Error`), `runScenario(path, handler = echoHandler)` |
| `runner/inbound-runner.ts` (sửa) | gọi `runTimers(new Date())` mỗi `TIMER_INTERVAL_MS` (§10.8.3) |
| `db/seed-sim.ts` (sửa) | thợ/slot/nhóm/trần mô phỏng (§10.11) |
| `db/migrations/006_dispatch_slots.sql` (mới) | §10.2.1 |
| `scripts/sim_claims.mjs`, `scripts/eval/vendor-intent.mjs`, `scripts/check_agent_tools.mjs` (sửa) | TESTING §4 G11, G12, §3 |
| `evals/golden/vendor_intent.jsonl`, `evals/golden/pii_probe.jsonl` (mới) | TESTING §3 |
| `apps/web/**` | SPEC-P04 §8 |
| `.env.example` (sửa) | khối P05 (§10.2.3), `DISPATCH_TIMEOUT_MIN=45` |

#### §10.1.3 Bất biến bổ sung cho P05
- Mọi UPDATE đổi `jobs.status` đi qua `transitionJob` trong `tx` (docs/core.md); cột đi kèm (`assigned_vendor_id`, `hold_expires_at`, `publish_expires_at`…) cập nhật bằng câu UPDATE thứ hai TRONG CÙNG `tx`, có điều kiện `status = <trạng thái vừa chuyển>`.
- Mọi tin ra tài khoản `market` đi qua `sendVendorMessage` (§10.10) ⇒ `PiiGate` chạy trước `enqueue` (BB-02). Kiểu `JobReveal` chỉ được xuất hiện ở `domain/types.ts` và `services/access.ts` (máy đo `check_agent_tools.mjs` mở rộng: `jobreveal_outside_allowed: 0`).
- Mọi đồng hồ nhận `now: Date` tham số; SQL của timer so với `$now`, KHÔNG dùng `now()` của Postgres ⇒ test bằng đồng hồ giả (§10.8.4).
- Danh tính thợ chỉ từ `zalo_identities(zalo_account_id='market', zalo_uid)` (BB-08). `sender_uid = 'system'` là giá trị DÀNH RIÊNG cho sự kiện hệ thống (§10.8.2); `simInbound` và `/api/dev/sim/send` từ chối giá trị này.
- CẤM pg-boss; CẤM sửa `apps/zalo-worker/**` (P02 g2); CẤM sửa `agent/prompts/resident.ts` trước khi H08 nhả file (WP-D chờ).

### §10.2 Hợp đồng dữ liệu

#### §10.2.1 Migration `db/migrations/006_dispatch_slots.sql` (chỉ THÊM — đã áp thử trên `lq_spec_check` sau 001–005, không lỗi)

```sql
create table vendor_groups (
  building_id uuid not null references buildings,
  trade_group text not null check (trade_group in ('dien_nuoc','khoa','dien_lanh','xay_sua')),
  zalo_account_id text not null default 'market' references zalo_accounts,
  thread_id text not null,                      -- id nhóm Zalo thật (P02 g2) hoặc 'sim-market-<trade_group>'
  created_at timestamptz default now(),
  primary key (building_id, trade_group),
  unique (zalo_account_id, thread_id)
);
alter table jobs add column publish_expires_at timestamptz;          -- §10.8.1 (2)
alter table jobs add column republish_count int not null default 0;  -- số lần đăng lại vì hết hạn giữ
alter table jobs add column timeout_republished_at timestamptz;      -- đăng lại vì DISPATCH_TIMEOUT (1 lần)
alter table job_offers add column over_band boolean not null default false;  -- báo giá vượt khung chờ cư dân
alter table vendor_slots add column reminded_at timestamptz;         -- nhắc 3 ngày trước hạn (1 lần)
alter table tickets add column reminded_at timestamptz;              -- nhắc BQL duyệt sau 30 phút (1 lần)
create index if not exists jobs_status_publish_expires_idx on jobs(status, publish_expires_at);
create index if not exists jobs_status_hold_expires_idx on jobs(status, hold_expires_at);
create index if not exists vendor_slots_active_idx on vendor_slots(building_id, trade_group, period_end) where status = 'active';
create index if not exists access_passes_job_idx on access_passes(job_id);
create index if not exists job_events_job_to_status_idx on job_events(job_id, to_status, created_at);
```

CẤM: sửa 001–005; thêm cột `jobs.vendor_price` (giá thợ báo nằm ở `job_offers.price`); bảng mới cho sự kiện hệ thống (dùng `inbound_events`); trigger DB. Test đếm migration lấy `applied` = số file `db/migrations/*.sql` (SPEC-P02 §9.7).

#### §10.2.2 Quy ước `jobs.window_start / window_end` (chốt Đ19-3)
- Kiểu `timestamptz`; nghĩa: **khung giờ thợ đến** do cư dân chọn ở bước 3. Ghi bởi `open_service_case` (§10.7.1) từ input ISO 8601 có múi giờ (vd `2026-09-26T14:00:00+07:00`). NULL trước `case_open`; từ `case_open` trở đi BẮT BUỘC khác NULL (`publish_job_to_group` từ chối nếu NULL: `InvalidToolInput` "thiếu khung giờ — gọi open_service_case với window_start/window_end").
- Hợp lệ: `window_end − window_start ∈ [30 phút, 12 giờ]`; `window_start ≥ now − 15 phút`; `window_start ≤ now + 14 ngày`. Sai ⇒ `InvalidToolInputError` (model tự sửa vòng sau).
- Dùng ở: `JobCard.window = [fmt(window_start), fmt(window_end)]` với `fmt` = `HH:mm dd/MM` giờ `Asia/Ho_Chi_Minh`; `access_passes.valid_from = window_start − ACCESS_PASS_BEFORE_MIN`, `valid_to = window_end + ACCESS_PASS_AFTER_MIN`; kiểm trùng giờ thợ (§10.3.2 bước 6); P06 nhắc giờ. KHÔNG dùng cho `DISPATCH_TIMEOUT` (đồng hồ đăng độc lập với khung giờ).
- Đổi khung giờ sau `case_open`: ngoài phạm vi (vùng cấm §10.14) — cư dân huỷ và mở lại.

#### §10.2.3 Cấu hình — `services/dispatch-config.ts` `readDispatchConfig(env = process.env): DispatchConfig` (thuần, mẫu `apps/zalo-worker/src/config.ts`; số không hợp lệ ⇒ ném `ConfigError`)

| Env | Mặc định | Trạng thái | Ý nghĩa |
| :-- | :-- | :-- | :-- |
| `HOLD_MINUTES` | 10 | chốt (Đ04) | hạn giữ cuốc sau `claim_job` |
| `DISPATCH_TIMEOUT_MIN` | 45 | chốt (§5, L3) | hết giờ đăng trong 07–21h |
| `ACCESS_REMIND_MIN` | 30 | chốt (§3.4) | nhắc BQL duyệt |
| `QUOTE_OVER_BAND_PCT` | 30 | chốt (Đ15) | báo giá vượt `price_high` bao nhiêu % thì hỏi cư dân |
| `QUOTE_CONSENT_MIN` | 30 | tạm | cư dân im bao lâu thì nhả cuốc |
| `MAX_HOLD_REPUBLISH` | 2 | chốt (§2.5) | số lần đăng lại vì hết hạn giữ |
| `NO_SHOW_BLOCK_THRESHOLD` / `NO_SHOW_WINDOW_DAYS` / `NO_SHOW_BLOCK_DAYS` | 3 / 30 / 7 | chốt (§8) | bùng ≥3 lần/30 ngày ⇒ khoá 7 ngày kể từ lần cuối |
| `ACCESS_PASS_BEFORE_MIN` / `ACCESS_PASS_AFTER_MIN` | 30 / 120 | chốt (§3.2) | hiệu lực mã vào |
| `PUBLISH_FALLBACK_MIN` / `REQUEST_ACCESS_FALLBACK_MIN` / `DISPATCH_REEMIT_MIN` | 2 / 2 / 5 | tạm | lưới an toàn §10.1.1 |
| `TIMER_INTERVAL_MS` | 10000 | tạm | chu kỳ `runTimers` trong runner |
| `VENDOR_INTENT_MIN` | 0.6 | tạm | ngưỡng `intent_confidence` của lớp hiểu ý thợ |
| `FREE_TRIAL_DAYS` · `SLOT_FEE_MONTHLY` · `SLOT_MIN_JOBS_PER_VENDOR` · `BQL_SHARE_PCT` | 30 · 300000 · 8 · 10 | **GIẢ — 🖐 người chốt** (đã có trong `.env.example`) | Đ14 |
| `SLOT_PERIOD_DAYS` · `SLOT_REMIND_DAYS` · `WAITLIST_INVITE_HOURS` | 30 · 3 · 48 | tạm (30 = "tháng" của slot trả phí; người có thể đổi) | §10.9 |
| `MODEL_VENDOR_PARSE` | rỗng ⇒ `MODEL_DEFAULT` | có sẵn trong adapter | model vòng chính agent thợ (route `vendor_parse`) |

Giá trị "GIẢ" phải ghi rõ trong `.env.example` là giả (dòng chú thích) — đổi qua env, không sửa mã.

### §10.3 Dịch vụ lõi (SQL có điều kiện — chạy thử 2026-09-25 trên `lq_spec_check`)

Quy ước chung: mỗi hàm nhận `now: Date`; `q` là `TxSqlFn` của `tx()` khi ghi; đọc ngoài tx bằng `sql`. Mọi hàm ghi `audit_log` với `actorType ∈ {agent, vendor, resident, staff, timer, system}` và `action` ghi trong bảng.

#### §10.3.1 `services/dispatch.ts`

```ts
export interface PublishResult { jobId: string; jobCode: string; groupThreadId: string; publishExpiresAt: Date; card: JobCard; republish: boolean }
export async function publishJobToGroup(args: { jobId: string; actor: { type: 'agent' | 'timer' | 'staff'; id: string | null }; now: Date; reason?: 'initial' | 'hold_expired' | 'timeout_quote' | 'access_rejected' }): Promise<PublishResult>;
export async function claimJob(args: { jobCode: string; vendorId: string; now: Date; source: 'agent' | 'fallback_no_model' }): Promise<{ won: true; jobId: string; holdExpiresAt: Date; mode: 'fixed' | 'quote'; card: JobCard } | { won: false; status: JobStatus }>;
export async function confirmAssignment(args: { jobCode: string; vendorId: string; priceVnd: number | null; now: Date }): Promise<{ status: 'confirmed' } | { status: 'held'; awaitingResidentPriceConsent: true; priceBand: [number, number] }>;
export async function releaseHold(args: { jobId: string; now: Date; reason: 'hold_expired' | 'quote_consent_timeout' | 'vendor_declined' | 'quote_declined' | 'vendor_suspended'; actor: { type: string; id: string | null } }): Promise<{ republished: boolean; unassigned: boolean }>;
export async function withdrawConfirmed(args: { jobId: string; now: Date; reason: 'vendor_declined' | 'vendor_suspended'; actor: {...} }): Promise<void>;   // confirmed/access_pending → published
export function buildJobCard(job: JobRow, category: { name_vi: string }, building: { code: string }, band: [number, number] | null, redact: (s: string) => string): JobCard;
export function renderJobCardText(card: JobCard, holdMinutes: number, prefix?: string): string;    // §1.2
export async function resolveVendorGroup(buildingId: string, tradeGroup: TradeGroup): Promise<{ threadId: string; zaloAccountId: 'market' }>;  // thiếu ⇒ SlotUnavailableError('chưa cấu hình nhóm thợ')
```

`publishJobToGroup` (tx): (1) `select … from jobs where id=$1 for update`; status phải là `case_open` (lần đầu) hoặc `published` (đăng lại, `reason ≠ 'initial'`); `window_start` NULL ⇒ `InvalidToolInputError`; `category_code` NULL ⇒ `update jobs set category_code='khac'` (nhóm `xay_sua`, `mode='quote'`) — không để cuốc kẹt. (2) `mode` = `jobs.mode` (đã có từ case open); `band` = `price_book(p25,p75)` của (category, building) nếu `mode='fixed'`, ngược lại `null`. (3) `summary_vi` = `redactPii(redactKnownApartmentCodes(symptoms.join(', ') + ' — ' + location_in_unit, mã căn của tòa))` rồi qua `PiiGate` (§10.10) — tin nhóm KHÔNG BAO GIỜ chứa tên/SĐT/mã căn. (4) lần đầu: `transitionJob(case_open→published, actor, {reason:'initial'})`; `update jobs set publish_expires_at=$exp, updated_at=now() where id=$1 and status='published'` với `$exp = computePublishExpiry(now, DISPATCH_TIMEOUT_MIN)` (§10.8.1). (5) sau commit: `sendVendorMessage({ threadId: group.threadId, threadType:'group', text: renderJobCardText(card, HOLD_MINUTES, prefix), jobId, guard: job })`; audit `dispatch.published` data `{reason, republish_count}`.

`claimJob` (BB-05, BB-10) — thứ tự BẮT BUỘC, tất cả trong MỘT `tx`:
1. `select id, status, building_id, category_code, window_start, window_end, mode from jobs where code=$1` — không có ⇒ `JobNotFoundError`; `status ≠ 'published'` ⇒ trả `{won:false, status}` (không ném).
2. Điều kiện thợ (mỗi câu một lỗi `IneligibleVendorError` với `message` bắt đầu bằng mã lý do):
   - `select status from vendors where id=$v` ≠ `'active'` ⇒ `not_active`;
   - `select 1 from vendor_buildings where vendor_id=$v and building_id=$b` rỗng ⇒ `no_building`;
   - `select 1 from vendor_skills s join job_categories c on c.code=s.category_code where s.vendor_id=$v and c.trade_group=$tg` rỗng ⇒ `no_skill` (`$tg` = `trade_group` của `jobs.category_code`; khớp theo NHÓM NGHỀ, không đòi đúng mã danh mục);
   - `select 1 from vendor_slots where vendor_id=$v and building_id=$b and trade_group=$tg and status='active' and period_end >= $today::date` rỗng ⇒ `no_slot` (`$today` = `vnDateString(now)`);
   - `select count(*)::int c, max(created_at) last from job_events where from_status='held' and to_status='published' and data->>'reason'='hold_expired' and data->>'vendor_id'=$v and created_at > $now - (NO_SHOW_WINDOW_DAYS||' days')::interval` ⇒ `c ≥ NO_SHOW_BLOCK_THRESHOLD` và `last > $now − NO_SHOW_BLOCK_DAYS` ⇒ `blocked_no_show`;
   - `select 1 from job_offers where job_id=$j and vendor_id=$v and note='access_rejected'` ⇒ `rejected_by_bql` (BQL đã từ chối chính thợ này cho chính cuốc này — §10.3.2);
   - `select 1 from jobs where assigned_vendor_id=$v and id<>$j and status in ('held','confirmed','access_pending','access_granted','dispatched','in_progress') and window_start is not null and $ws < window_end and $we > window_start` ⇒ `window_overlap`.
3. `transitionJob(q, {jobId, from:'published', to:'held', actorType:'vendor', actorId: vendorId, data:{tool:'claim_job', source}})` — `ConflictError` ⇒ bắt lại, ROLLBACK, ghi ngoài tx `insert into job_offers (job_id, vendor_id, kind, status) values ($j,$v,'claim','lost') on conflict (job_id, vendor_id) do update set status='lost', created_at=now()`, trả `{won:false, status:'held'}` (đọc lại).
4. `update jobs set assigned_vendor_id=$v, hold_expires_at=$now::timestamptz + (HOLD_MINUTES||' minutes')::interval, updated_at=now() where id=$j and status='held' and assigned_vendor_id is null returning id` — 0 dòng ⇒ ném `Error` (lỗi lập trình, không thể xảy ra vì dòng đã khoá).
5. `insert into job_offers (job_id, vendor_id, kind, status) values ($j,$v,'claim','won') on conflict (job_id, vendor_id) do update set kind='claim', status='won', created_at=now()`.
6. Sau commit: tin nhóm `"{code}: đã có thợ nhận lúc HH:mm."` (MỘT tin cho mỗi lần thắng; người thua KHÔNG được trả lời trong nhóm — audit `claim.lost`); DM thợ thắng mẫu `HOLD_DM` (§10.10); audit `dispatch.claimed`.
Số đo đã chạy (kịch bản 200 claim đồng thời / 50 cuốc, 4 thợ mỗi cuốc, pool 24 kết nối, đúng câu lệnh bước 3–5): `won=50 lost=150 jobs_with_two_winners=0 job_events_held=50` trong 303 ms. Bản cố ý hỏng (SELECT status rồi UPDATE không điều kiện): 20/20 "thắng" trên một cuốc ⇒ máy đo `sim_claims` biết đỏ.

`confirmAssignment` (tx): `select … from jobs where code=$1 for update`; không có ⇒ `JobNotFoundError`; `assigned_vendor_id ≠ $v` ⇒ `IneligibleVendorError('not_assigned')`; `status ≠ 'held'` ⇒ `ConflictError`; `hold_expires_at ≤ $now` ⇒ gọi `releaseHold(reason:'hold_expired')` trong cùng tx rồi ném `HoldExpiredError`; `mode='quote'` và `priceVnd` NULL ⇒ `QuoteRequiredError`; `priceVnd` ngoài `[20 000, 50 000 000]` ⇒ `InvalidToolInputError`. `mode='quote'`: `insert into job_offers … on conflict (job_id, vendor_id) do update set kind='quote', price=$p, status='won'`; nếu có khung (`price_book` của (category, building) có `p75`) và `$p > p75 × (1 + QUOTE_OVER_BAND_PCT/100)` ⇒ `update job_offers set over_band=true, status='open'`, `update jobs set hold_expires_at=$now + QUOTE_CONSENT_MIN` (vẫn `held`), sau commit nhắn cư dân mẫu `QUOTE_ASK_RESIDENT`, trả `{status:'held', awaitingResidentPriceConsent:true, priceBand:[p25,p75]}` — KHÔNG chuyển trạng thái. Ngược lại: `transitionJob(held→confirmed, actor vendor, data:{price})`; `update jobs set hold_expires_at=null where id and status='confirmed'`; sau commit DM thợ `CONFIRMED_DM`, audit `dispatch.confirmed`.

`releaseHold` (tx, dùng bởi timer, `decline_hold`, `respond_to_quote(accept=false)`, đình chỉ): `transitionJob(held→published, actorType, actorId, data:{reason, vendor_id})`; `update jobs set assigned_vendor_id=null, hold_expires_at=null where id and status='published'`; `update job_offers set status='expired' where job_id and vendor_id and status in ('won','open')`; `reason='hold_expired'` ⇒ `insert into vendor_scores (vendor_id, no_show_count) values ($v,1) on conflict (vendor_id) do update set no_show_count = vendor_scores.no_show_count + 1, updated_at = now()`; nếu `republish_count < MAX_HOLD_REPUBLISH` ⇒ `republish_count+1` + `publishJobToGroup(reason:'hold_expired')` (tiền tố "ĐĂNG LẠI — "), ngược lại chỉ đặt `publish_expires_at = computePublishExpiry(now)` (để đồng hồ đăng xử lý tiếp, không `unassigned` ngay). Sau commit DM thợ mẫu theo `reason`; audit `dispatch.hold_released`.

`withdrawConfirmed` (tx): `confirmed → published` (cặp MỚI, L7) hoặc `access_pending → published` (đã có); với `access_pending`: `update tickets set status='rejected', decided_at=$now, decision_note=$reason where id=jobs.access_ticket_id and status='open'`; gỡ gán như trên; `publishJobToGroup(reason:'access_rejected')` (không tăng `republish_count`); nhắn cư dân `SEARCHING_AGAIN_RESIDENT`.

#### §10.3.2 `services/access.ts`

```ts
export async function requestAccess(args: { jobId: string; vendorId: string; note: string; actor: {...}; now: Date }): Promise<{ ticketId: string }>;
export async function decideAccessRequest(args: { ticketId: string; decision: 'approve' | 'reject'; note: string | null; staffId: string; now: Date }): Promise<{ jobId: string; jobCode: string; status: 'access_granted' | 'published' }>;
export async function dispatchToVendor(args: { jobCode: string; vendorId: string; now: Date }): Promise<{ jobId: string; passCode: string }>;
export function generatePassCode(): string;   // 6 ký tự từ ALPHABET của agent/job-code.ts (xuất hằng), trùng ⇒ sinh lại ≤5 lần
```

`requestAccess` (tx): job `for update`; `status='confirmed'` ∧ `assigned_vendor_id=$v` (actor `timer` bỏ qua điều kiện thợ); `insert into tickets (building_id, apartment_id, resident_id, source_job_id, kind, summary, status) values (…,'access_request',$summary,'open')` với `$summary` nhiều dòng: `Cuốc <code> · <category_name>\nThợ: <full_name> · <phone> · <rating_avg ?? 'chưa có'>★ · <jobs_done> cuốc · bùng <no_show_count>\nCăn: <apartment_code> (tầng <floor>)\nKhung giờ: <fmt window>\nGhi chú: <note>`; `update jobs set access_ticket_id=$t where id and status='confirmed'`; `transitionJob(confirmed→access_pending, actor, {ticket_id})`. Sau commit: DM thợ `ACCESS_PENDING_DM`, nhắn cư dân `ACCESS_PENDING_RESIDENT`; audit `dispatch.access_requested`.

`decideAccessRequest` (tx): `update tickets set status=$s, decided_by=$staff, decided_at=$now, decision_note=$note where id=$t and kind='access_request' and status='open' returning source_job_id` — 0 dòng ⇒ `ConflictError` (web trả 409); `reject` với `note` rỗng ⇒ `InvalidToolInputError` (web trả 400 TRƯỚC khi vào tx). `approve`: `transitionJob(access_pending→access_granted, actorType:'staff', actorId: staffId, {ticket_id})`; `update access_passes set revoked_at=$now where job_id and revoked_at is null`; `insert into access_passes (job_id, vendor_id, code, valid_from, valid_to) values ($j, jobs.assigned_vendor_id, generatePassCode(), window_start − ACCESS_PASS_BEFORE_MIN, window_end + ACCESS_PASS_AFTER_MIN)`; sau commit `enqueueSystemEvent({ event:'access_approved', jobId })` (§10.8.2); audit `ticket.access_request.approve`. `reject`: `transitionJob(access_pending→published, staff, {reason:'access_rejected', vendor_id, note})`; `update job_offers set status='lost', note='access_rejected' where job_id and vendor_id`; gỡ gán; `publishJobToGroup(reason:'access_rejected')`; sau commit DM thợ `ACCESS_REJECTED_DM` (không kèm lý do của BQL), cư dân `SEARCHING_AGAIN_RESIDENT`; audit `ticket.access_request.reject` data `{note}`.

`dispatchToVendor` (BB-11, tx): job `for update` theo code; không có ⇒ `JobNotFoundError`; `assigned_vendor_id ≠ $v` ⇒ `IneligibleVendorError('not_assigned')`; `status ≠ 'access_granted'` ⇒ `ConflictError`; `select status from tickets where id=jobs.access_ticket_id and kind='access_request'` ≠ `'approved'` ⇒ `AccessNotApprovedError`; `select code from access_passes where job_id and revoked_at is null and valid_to > $now order by id desc limit 1` rỗng ⇒ `AccessNotApprovedError('chưa có mã vào')`; dựng `JobReveal` (`apartments.code`, `floor`, `residents.phone`, `access_pass_code`) — NƠI DUY NHẤT; `transitionJob(access_granted→dispatched, actorType:'agent', actorId: vendorId)`. Sau commit: `sendVendorMessage({ threadId: vendorUid, threadType:'user', text: renderReveal(reveal), jobId, allowReveal: true })`; nhắn cư dân `DISPATCHED_RESIDENT` (tên thợ, điểm, khung giờ, mã đối chiếu); audit `dispatch.dispatched`.
Truy vấn kiểm G12b (đã chạy thử: 2 dòng xấu cài vào ⇒ `violations=2`; sửa ⇒ `0`):
```sql
select count(*)::int as violations from jobs j left join tickets t on t.id = j.access_ticket_id
 where j.status in ('dispatched','in_progress','awaiting_acceptance','accepted','disputed','closed')
   and (t.id is null or t.kind <> 'access_request' or t.status <> 'approved');
```

#### §10.3.3 `services/slots.ts` — §10.9.

### §10.4 Hiểu ý thợ (Đ21 — luật người dùng: model hiểu ý, code là lưới an toàn tất định)

#### §10.4.1 `agent/vendor-triage.ts`
```ts
export type VendorIntent = 'claim' | 'confirm' | 'quote' | 'decline' | 'slot_request' | 'my_slot' | 'my_jobs' | 'question' | 'other';
export interface VendorTriageResult { intent: VendorIntent; intent_confidence: number; job_code: string | null; price_vnd: number | null; trade_group: TradeGroup | null }
export function parseVendorTriage(raw: string): VendorTriageResult | null;      // parse + kiểm schema, hỏng ⇒ null (mẫu parseTriageResult)
export async function triageVendorMessage(text: string, recent: string[], conversationId?: string | null): Promise<VendorTriageResult | null>;
```
- Gọi `callTriageModel({ system: VENDOR_TRIAGE_SYSTEM_PROMPT, messages:[{role:'user', content: buildVendorTriageUserMessage(text, recent)}], conversationId })` — route `triage`, model `MODEL_TRIAGE`, quá hạn `TRIAGE_TIMEOUT_MS` ⇒ `null`, không retry (đúng §11.10 P03). `text`/`recent` đã che PII (`redactPii`).
- Prompt `agent/prompts/vendor-triage.ts` (tiếng Việt): định nghĩa từng nhãn + ví dụ gần giống ("C-24A7 giá bao nhiêu?" = `question`, không phải `claim`; "350k" khi đang giữ cuốc = `quote`; "thôi em bận" = `decline`; "slot em còn bao lâu" = `my_slot`); dặn trích `job_code` đúng dạng `C-XXXX` nếu có, `price_vnd` là số nguyên đồng.
- Kết quả lưu `messages.content.triage` của tin vào; agent chính KHÔNG đọc qua tool (giữ luật §11.9 P03); tool đọc từ `ctx.triage`.

#### §10.4.2 Lưới an toàn tất định — `agent/vendor-intent.ts` (thuần, test `npm test`)
```ts
export const JOB_CODE_RE = /(?<![\p{L}\p{N}])[Cc]\s?[-–]?\s?([ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz]{4})(?![\p{L}\p{N}])/gu;
export function extractJobCodes(text: string): string[];       // chuẩn hoá 'C-' + 4 ký tự HOA, bỏ trùng, giữ thứ tự
export function parsePriceVnd(text: string): number | null;    // '350k' 350000 · '350.000'/'350,000' 350000 · '1tr2'/'1,2 triệu' 1200000 · '2 triệu' 2000000 · số trần 50–999 ⇒ ×1000 · ≥10 000 ⇒ nguyên; ngoài [20 000, 50 000 000] hoặc >1 số khác nhau ⇒ null
export function matchesClaimPhrase(text: string, code: string | null): boolean;   // chuẩn hoá như §11.5 P03 (bỏ dấu, chữ thường, bỏ dấu câu cuối, bỏ tiểu từ a|nhe|nha|luon|di|em|anh|chi|minh|a); BẰNG một trong: `nhan`, `nhan <code>`, `<code> nhan`, `em nhan <code>`, `e nhan <code>`, `toi nhan <code>`, `minh nhan <code>`, `lay <code>`, `em lay <code>`, `nhan cuoc <code>`
export function matchesConfirmPhrase(text: string, code: string | null): boolean; // BẰNG: `ok`, `oke`, `okay`, `xac nhan`, `dong y`, `chot`, `duoc`, `ok <code>`, `xac nhan <code>`
export function matchesDeclinePhrase(text: string, code: string | null): boolean; // BẰNG hoặc BẮT ĐẦU bằng: `thoi`, `huy`, `bo`, `khong`, `ko`, `k`, `khong nhan`, `khong lam`, `em khong nhan`, `huy <code>`, `bo <code>`
```
Mã cuốc do model trả (`triage.job_code`) chỉ được dùng khi NẰM TRONG `extractJobCodes(text)` — ngược lại bỏ. Giá: tool `confirm_assignment` chỉ nhận `price_vnd` do agent gửi khi `price_vnd === parsePriceVnd(ctx.latestText)` HOẶC `price_vnd === ctx.triage?.price_vnd` (một trong hai lưới xác nhận) — khác ⇒ `QuoteRequiredError('giá không khớp tin nhắn của thợ')`.

#### §10.4.3 Luật bắt tin NHÓM (thay SPEC-P02 §3.5; áp cho `vendorHandler` trên kênh giả lập và cho worker P02 g2 khi lưu tin nhóm)
Tin trong nhóm thợ được XỬ LÝ (sim) / được LƯU (Zalo thật) khi thoả MỘT trong: (a) `extractJobCodes(text)` khác rỗng; (b) người gửi đang có cuốc `held` (`jobs.assigned_vendor_id = vendor`); (c) nhóm đang có ≥1 cuốc `published` (`jobs j join job_categories c on c.code=j.category_code join vendor_groups g on g.building_id=j.building_id and g.trade_group=c.trade_group where g.thread_id=$thread and j.status='published'`). Không thoả ⇒ không triage, không agent, không `messages`; audit `vendor.group_noise` (KHÔNG ghi nội dung; chỉ đếm) — lý do: 00-ARCH §7 (không lưu lịch sử nhóm) + chi phí model.

#### §10.4.4 Bằng chứng ý định TRONG tool (luật, không ở prompt)
| Tool | Cần | Không có ⇒ |
| :-- | :-- | :-- |
| `claim_job` | `ctx.triage.intent='claim'` ∧ `intent_confidence ≥ VENDOR_INTENT_MIN` HOẶC `matchesClaimPhrase(ctx.latestText, code)`; mã cuốc trong input phải ∈ `ctx.jobCodesInText` HOẶC (`ctx.jobCodesInText` rỗng ∧ đúng MỘT cuốc `published` trong nhóm/tòa của thợ ⇒ mã đó) | `IntentNotConfirmedError` ⇒ agent nhắn DM: "Anh/chị trả lời «nhận C-XXXX» để giữ cuốc" |
| `confirm_assignment` | triage `confirm`/`quote` ≥ ngưỡng HOẶC `matchesConfirmPhrase` HOẶC (`mode='quote'` ∧ `parsePriceVnd(latestText) ≠ null`) | `IntentNotConfirmedError` |
| `decline_hold` | triage `decline` ≥ ngưỡng HOẶC `matchesDeclinePhrase` | `IntentNotConfirmedError` |
| `request_access`, `dispatch_to_vendor`, `get_*`, `request_slot`, `get_my_slot` | không cần bằng chứng ý định (trạng thái quyết định) | — |
Lượt do sự kiện hệ thống (§10.8.2): `ctx.triage=null`, `ctx.latestText=''`, chỉ `dispatch_to_vendor`/`get_my_assignments` có nghĩa.

### §10.5 Agent thợ — `agent/vendor-agent.ts`

#### §10.5.1 `vendorHandler(e: InboundEvent)` (chỉ `e.zaloAccountId === 'market'`; thread `user` = DM, `group` = nhóm)
1. Sự kiện hệ thống: `e.senderUid === 'system'` ∧ `e.zaloMsgId` bắt đầu `sys-` ∧ `payload.kind === 'system'` ⇒ §10.5.4. Ngược lại `senderUid === 'system'` ⇒ audit `vendor.forged_system_event`, dừng.
2. `party = resolveParty('market', e.senderUid)` (BB-08). `party.type ≠ 'vendor'`: DM ⇒ gửi `VENDOR_REGISTER_REPLY` (0 model), dừng; nhóm ⇒ audit `vendor.unknown_in_group`, im lặng, dừng.
3. `vendors.status`: `pending` ⇒ DM `VENDOR_PENDING_REPLY`; `suspended` ⇒ DM `VENDOR_SUSPENDED_REPLY` (kể cả khi tin đến từ nhóm — trả lời vào DM = `e.senderUid`); 0 model; dừng.
4. Nhóm: kiểm luật bắt tin §10.4.3; không thoả ⇒ dừng.
5. Conversation: DM ⇒ `getOrCreateConversation('market', e.threadId, party)` (N11 mismatch như P03 ⇒ `BUSY_REPLY` DM); nhóm ⇒ conversation của thread nhóm với `party_type/party_id = NULL` (KHÔNG gán người; không áp N11). Đang `human_takeover_until > now` (DM) ⇒ lưu tin, 0 model, im.
6. `text` rỗng (payload `unsupported`) ⇒ DM `VENDOR_TEXT_ONLY_REPLY`, dừng.
7. `codes = extractJobCodes(text)`; `triage = await triageVendorMessage(redactPii(text), recentDm(3))`; `saveMessage(conv, 'in', 'user', text, { triage, codes, vendor_id, group: threadType==='group' })`.
8. Dựng `VendorToolContext` (§10.5.2) ⇒ `runVendorTurn`.
9. Lưới khi model chết: `runVendorTurn` ném `ModelUnavailableError` (sau `MODEL_FALLBACKS`) ∧ thread nhóm ∧ `matchesClaimPhrase(text, codes[0] ?? null)` ∧ có mã xác định ⇒ `claimJob({ source:'fallback_no_model' })`, audit `claim.fallback_no_model`; DM thợ theo kết quả. Trường hợp khác ⇒ DM `BUSY_REPLY` (DM) / im (nhóm) + audit `agent.model_error` (như P03 G10).

#### §10.5.2 `agent/vendor-tool-context.ts`
```ts
export interface VendorToolContext {
  readonly vendorId: string;
  readonly vendorUid: string;              // zalo_uid trên 'market' — thread DM của thợ (quy ước: thread_type 'user' ⇒ thread_id = uid; sim phải theo)
  readonly buildingIds: readonly string[]; // vendor_buildings
  readonly conversationId: string;         // của thread kích hoạt
  readonly threadId: string; readonly threadType: 'user' | 'group';
  readonly groupTradeGroup: TradeGroup | null;   // khi threadType='group': từ vendor_groups
  readonly latestText: string; readonly latestMessageCreatedAt: string;
  readonly triage: VendorTriageResult | null;
  readonly jobCodesInText: readonly string[];
  readonly systemEvent: { event: 'access_approved'; jobId: string } | null;
  readonly now: Date;
}
```

#### §10.5.3 `runVendorTurn(ctx, text, currentMessageId): Promise<void>` — mẫu `runResidentTurn` (vòng ≤6 tool, `assertValidToolInput` trước `run`, lỗi có kiểu ⇒ `tool_result is_error {code, message}`, nối nguyên `content`, mọi `tool_result` một message `user`, `refusal` kiểm trước)
- `callModel({ route:'vendor_parse', system: buildVendorSystemPrompt(), messages, tools: VENDOR_TOOLS defs, conversationId })`. Model: `MODEL_VENDOR_PARSE` ?? `MODEL_DEFAULT` (adapter đã có `ROUTE_ENV.vendor_parse`).
- Phần cố định (cache): vai + luật (§10.5.5) + danh sách tool. Phần biến đổi (sau breakpoint, một cặp user/assistant như N7 P03): `Bây giờ: <ISO +07:00>` · thợ: tên, nhóm nghề (từ `vendor_skills`), tòa, slot (`getSlotSummary`) · cuốc thợ đang giữ/đã xác nhận (mã, trạng thái, `hold_expires_at`) · cuốc `published` trong nhóm kích hoạt (mã, danh mục, khung giờ, `mode`) · `Mã cuốc trong tin: [...]` · `Giá đọc được trong tin: <n hoặc không>` (chỉ lưới tất định — KHÔNG đưa `triage.intent` cho model).
- Lịch sử: DM ⇒ 20 tin của conversation DM (đã che PII); nhóm ⇒ KHÔNG lịch sử (nhóm là kênh phát — 00-ARCH §7).
- Text cuối: LUÔN gửi vào DM thợ (`threadId = ctx.vendorUid`, `threadType 'user'`) qua `sendVendorMessage` (PiiGate), kể cả lượt kích hoạt từ nhóm; CẤM agent phát text tự do vào nhóm (nhóm chỉ nhận mẫu do tool sinh). Lượt nhóm không có text ⇒ im (không `BUSY_REPLY`); lượt DM không có text ⇒ `BUSY_REPLY` + `vendor_handoff_to_staff('agent_empty')` (N2 P03).
- `messages` ghi cả chiều ra (`saveMessage(conv DM, 'out','assistant', text)`).

#### §10.5.4 Lượt sự kiện hệ thống (`access_approved`)
`payload = { kind:'system', event:'access_approved', job_id }` ⇒ `job = select … from jobs where id=$1`; `vendorId = job.assigned_vendor_id` (NULL ⇒ audit `system.no_vendor`, dừng); `vendorUid` = `zalo_identities` ngược (`party_type='vendor' and party_id=$v and zalo_account_id='market'`; thiếu ⇒ audit `system.vendor_no_identity`, dừng — dashboard `/jobs` hiện cuốc kẹt `access_granted`); conversation = DM của thợ; `ctx.systemEvent = {event, jobId}`, `latestText=''`, `triage=null`; tin user đưa model: `"[Hệ thống] BQL đã duyệt cho thợ vào tòa cho cuốc <code>. Hãy giao việc bằng dispatch_to_vendor."`. Agent gọi `dispatch_to_vendor`. Không gọi ⇒ timer §10.8.1 (5) phát lại.

#### §10.5.5 Prompt `agent/prompts/vendor.ts` — `buildVendorSystemPrompt(): string` (tiếng Việt, hằng TS như `resident.ts`). Nội dung BẮT BUỘC có:
vai "trợ lý sàn thợ của BQL"; "mọi hành động qua tool, tool sẽ từ chối nếu sai luật — đọc kết quả trả về, không tự khẳng định"; bước: (1) thợ muốn nhận cuốc ⇒ `claim_job` với mã trong tin; không có mã mà chỉ MỘT cuốc đang đăng ⇒ dùng mã đó; nhiều cuốc ⇒ hỏi lại mã (DM); (2) thợ xác nhận (OK/giá) ⇒ `confirm_assignment` (`mode='quote'` ⇒ `price_vnd` = giá đọc được trong tin; không có ⇒ hỏi giá); NGAY sau khi `confirm_assignment` trả `status:'confirmed'` ⇒ gọi `request_access` cùng lượt; trả `awaitingResidentPriceConsent` ⇒ báo thợ "chờ cư dân đồng ý giá"; (3) thợ rút ⇒ `decline_hold`; (4) "việc của tôi" ⇒ `get_my_assignments`; "slot của tôi" ⇒ `get_my_slot`; "giữ slot <nhóm nghề>" ⇒ `request_slot`; (5) tin `[Hệ thống] BQL đã duyệt…` ⇒ `dispatch_to_vendor`; luật: KHÔNG bao giờ nhắc số căn/tên/SĐT cư dân trong câu trả lời (tool giao việc tự gửi); KHÔNG hứa cuốc cho ai; KHÔNG bàn giá của thợ khác; trả lời ≤3 câu, có dấu, không markdown. Tầng review prompt: 🔴 (SO đọc trước khi cho chạy model thật).

### §10.6 Tool bước 4–7 phía thợ — mỗi tool một file `agent/tools/<tên>.ts` export `{ definition, run(ctx: VendorToolContext, input) }`, `definition.strict = true`, `input_schema` có `additionalProperties:false` + `required` đủ, `description` nói rõ luật tool tự kiểm (mẫu `open_service_case.ts`). Mọi tool ghi `audit_log action='tool.<tên>'` actorType `vendor`, actorId `ctx.vendorId`, `target` = job id/ticket id.

| Tool | Input → Output | Luật tự kiểm (theo thứ tự) | Lỗi ném |
| :-- | :-- | :-- | :-- |
| `claim_job` | `{job_code: string}` → `{won: true, job_code, hold_expires_at: ISO, mode, need_price: boolean}` \| `{won: false, status}` | (1) `job_code` chuẩn hoá HOA, đúng `^C-[A-HJ-NP-Z2-9]{4}$`; (2) bằng chứng ý định §10.4.4; (3) `claimJob(...)` (§10.3.1) | `InvalidToolInput`, `IntentNotConfirmedError`, `JobNotFoundError`, `IneligibleVendorError(reason)` |
| `confirm_assignment` | `{job_code: string, price_vnd: number \| null}` → `{status:'confirmed', job_code}` \| `{status:'held', awaiting_resident_price_consent: true, price_band:[low,high]}` | ý định §10.4.4; giá khớp lưới §10.4.2; `confirmAssignment` | `IntentNotConfirmedError`, `QuoteRequiredError`, `HoldExpiredError`, `JobNotFoundError`, `IneligibleVendorError('not_assigned')`, `ConflictError` |
| `decline_hold` | `{job_code: string}` → `{status:'published', job_code}` | ý định; job `held`/`confirmed`/`access_pending` ∧ `assigned_vendor_id = ctx.vendorId`; `held` ⇒ `releaseHold(reason:'vendor_declined')`, còn lại ⇒ `withdrawConfirmed(reason:'vendor_declined')` | `IntentNotConfirmedError`, `JobNotFoundError`, `IneligibleVendorError('not_assigned')`, `ConflictError` |
| `request_access` | `{job_code: string, note: string}` → `{ticket_id, status:'access_pending'}` | `requestAccess` (`confirmed` ∧ đúng thợ) | `JobNotFoundError`, `IneligibleVendorError('not_assigned')`, `ConflictError` |
| `dispatch_to_vendor` | `{job_code: string}` → `{status:'dispatched', job_code}` | `dispatchToVendor` (BB-11) — KHÔNG trả `JobReveal` cho model; reveal chỉ đi thẳng DM thợ | `JobNotFoundError`, `IneligibleVendorError('not_assigned')`, `AccessNotApprovedError`, `ConflictError`, `PiiGateError` |
| `get_my_assignments` | `{}` → `{jobs: Array<{code, status, category_name, window:[string,string], hold_expires_at: ISO \| null, mode}>}` | chỉ cuốc `assigned_vendor_id = ctx.vendorId` và `status ∉ {closed, cancelled}`; KHÔNG có trường PII (dùng `JobCard` fields) | — |
| `request_slot` | `{trade_group: TradeGroup, building_code: string \| null}` → `{result:'trial_granted' \| 'already_active' \| 'waitlisted' \| 'pending_payment', building_code, trade_group, period_end?: 'YYYY-MM-DD', position?: number, fee_vnd?: number}` | §10.9.2 | `IneligibleVendorError(not_active \| no_building \| no_skill)`, `SlotUnavailableError`, `InvalidToolInput` |
| `get_my_slot` | `{}` → `{slots: Array<{building_code, trade_group, is_trial, period_end, days_left, status}>, waitlist: Array<{building_code, trade_group, position, invited_at: ISO \| null}>}` | §10.9 `getSlotSummary` | — |
| `handoff_to_staff` (file `vendor_handoff_to_staff.ts`) | `{reason: string}` → `{ok: true}` | `update conversations set human_takeover_until = now() + HUMAN_TAKEOVER_MIN` cho conversation DM của thợ; audit; KHÔNG tạo ticket (chưa có `kind` phù hợp — Idea Vault: `kind='vendor_support'`) | — |

`agent/tools/index.ts`: `export const VENDOR_TOOLS: ReadonlyArray<AgentTool<any, unknown, VendorToolContext>> = [claimJobTool, confirmAssignmentTool, declineHoldTool, requestAccessTool, dispatchToVendorTool, getMyAssignmentsTool, requestSlotTool, getMySlotTool, vendorHandoffToStaffTool]` (9). `check_agent_tools.mjs` quét tên cấm như cũ (không có `approve_ticket`).

### §10.7 Phía cư dân (WP-D — chờ H08 nhả `agent/prompts/resident.ts`)

#### §10.7.1 `open_service_case` — input MỚI `{ window_start: string, window_end: string, note: string }` (ISO 8601 có múi giờ; bỏ `window_options`)
Thêm vào luật hiện có: kiểm khung §10.2.2 ⇒ `InvalidToolInputError` kèm thông báo tiếng Việt; câu `update jobs set mode=$1, case_ticket_id=$2, window_start=$3, window_end=$4, updated_at=now() where id=$5`; `job_events.data = {ticket_id, window_start, window_end}`; output thêm `window: [string, string]` (định dạng `HH:mm dd/MM`). Cập nhật MỌI test/kịch bản đang gửi `window_options` (`p03.db.test.ts`, `p03-regression.db.test.ts`, `p03-category-code.db.test.ts`, `evidence/P03-audit/attack-source.txt` chỉ là bằng chứng — không sửa); `scripts/eval/score.mjs` không gọi tool này ⇒ không đổi.

#### §10.7.2 Bằng chứng đồng ý = chuỗi tin sau mốc (thay "chỉ `ctx.latestText`") — `agent/consent.ts` (mới, tách từ `open_service_case.ts`; `open_service_case.ts` re-export `hasExplicitConsent` để `scripts/eval/*` không gãy)
```ts
export function hasExplicitConsent(text: string): boolean;                       // giữ nguyên hành vi
export function hasExplicitDecline(text: string): boolean;                       // token bỏ dấu khớp theo ranh giới từ: khong|ko|k|hong|hok|chua|dung|thoi|huy|suy nghi|hoi
export type ConsentEvidence = 'consent' | 'decline' | 'none';
export async function findConsentEvidence(q: SqlFn, args: { conversationId: string; afterIso: string; minIntent?: number }): Promise<ConsentEvidence>;
```
`findConsentEvidence`: `select content from messages where conversation_id=$1 and direction='in' and created_at > $2::timestamptz order by id desc limit 10`; với từng tin (mới nhất trước): (1) `hasExplicitConsent` ⇒ `consent`; (2) `content.triage.intent='consent' ∧ intent_confidence ≥ 0.8` ⇒ `consent`; (3) `triage.intent ∈ {decline, defer} ∧ intent_confidence ≥ 0.5` ⇒ `decline`; (4) `hasExplicitDecline` ⇒ `decline`; (5) không kết luận ⇒ xét tin cũ hơn. Hết ⇒ `none`. `open_service_case`: `afterIso` = `job_events.created_at` của `→awaiting_consent` (đã có); `none`/`decline` ⇒ `ConsentMissingError`. Bộ phá R05 (ca 3c/3d, phủ định) phải vẫn đỏ đúng chỗ — hồi quy bắt buộc. Lý do đổi: cư dân trả "đồng ý" rồi lượt sau chọn giờ "2h chiều mai" — tin mới nhất không phải câu đồng ý nhưng đồng ý đã có và chưa bị rút.

#### §10.7.3 Hai tool mới vào `RESIDENT_TOOLS` (ctx `ToolContext`)
| Tool | Input → Output | Luật | Lỗi |
| :-- | :-- | :-- | :-- |
| `publish_job_to_group` | `{job_code: string}` → `{status:'published', job_code, group: string, publish_expires_at: ISO}` | cuốc thuộc `ctx.residentId` (`select … where code=$1 and resident_id=$2` — không thì `JobNotFoundError`, không lộ cuốc người khác); `status='case_open'`; `publishJobToGroup(actor agent, reason 'initial')` | `JobNotFoundError`, `ConflictError`, `InvalidToolInput` (thiếu khung giờ) |
| `respond_to_quote` | `{job_code: string, accept: boolean}` → `{status:'confirmed' \| 'published', job_code}` | cuốc của cư dân, `status='held'`, tồn tại `job_offers` `over_band=true and status='open'`; `accept=true` ⇒ `findConsentEvidence(afterIso = job_offers.created_at)` phải là `consent` (else `ConsentMissingError`) ⇒ `transitionJob(held→confirmed, actor resident)`, offer `won`, `hold_expires_at=null`, DM thợ `QUOTE_ACCEPTED_DM`, sau đó agent thợ vẫn phải `request_access` — lưới §10.1.1 (timer 2 phút) đảm bảo; `accept=false` ⇒ `releaseHold(reason:'quote_declined')` (không tính bùng) | `JobNotFoundError`, `ConflictError`, `ConsentMissingError` |

#### §10.7.4 `runResidentTurn` — nạp mốc thời gian vào PHẦN BIẾN ĐỔI (sau breakpoint cache, cùng khối với `JobDraft`): `"[Ngữ cảnh hệ thống] Bây giờ: 2026-09-25T23:17:00+07:00 (thứ năm)."` để model đổi "2h chiều mai" thành ISO. Prompt `resident.ts` thêm: bước 5 dùng `open_service_case(window_start, window_end, note)` với ISO tính từ mốc trên; bước 5b "ngay sau khi open_service_case thành công, gọi `publish_job_to_group(job_code)` trong cùng lượt"; bước 6 "khi cư dân trả lời câu hỏi giá thợ báo (tin có `[Ngữ cảnh] đang chờ đồng ý giá…`), gọi `respond_to_quote`". Sau khi đổi prompt: chạy lại MỘT lượt máy chấm 4 bộ (`npm run eval:golden`) — G08–G10 gắn với cặp model+prompt (Đ26).

### §10.8 Đồng hồ

#### §10.8.1 `services/timers.ts` — `export async function runTimers(now: Date, cfg = readDispatchConfig()): Promise<TimerReport>`; `TimerReport = { holds_released, published_expired, access_reminded, publish_fallback, request_access_fallback, granted_reemitted, slots_expired, slots_reminded, waitlist_invites_expired }` (số nguyên; runner log JSON). Mỗi bước độc lập, idempotent, lỗi một bước ⇒ audit `timer.error` + tiếp bước sau. Mọi so sánh thời gian dùng `$now` tham số.
1. `expireHolds`: `select id from jobs where status='held' and hold_expires_at <= $now for update skip locked` ⇒ từng cuốc trong `tx` riêng: có `job_offers over_band=true and status='open'` ⇒ `releaseHold(reason:'quote_consent_timeout')` (không tăng bùng; nhắn cư dân `QUOTE_TIMEOUT_RESIDENT`), ngược lại `reason:'hold_expired'`.
2. `expirePublished`: `… where status='published' and publish_expires_at <= $now for update skip locked` ⇒ `timeout_republished_at is null` ⇒ `update jobs set mode='quote', timeout_republished_at=$now, publish_expires_at=computePublishExpiry($now)` + `publishJobToGroup(reason:'timeout_quote')` (thẻ ghi "THỢ BÁO GIÁ KHI NHẬN"); ngược lại `transitionJob(published→unassigned, timer)` + `insert into tickets (…, kind='no_vendor', summary='Cuốc <code> · <category> · <khung giờ> — không có thợ nhận sau <n> phút')` + nhắn cư dân `NO_VENDOR_RESIDENT`. `computePublishExpiry(at, timeoutMin)` (`services/vn-time.ts`, thuần): giờ VN của `at` ∈ [07:00, 21:00) ⇒ `at + timeoutMin`; ngược lại ⇒ 08:00 VN kế tiếp (trước 07:00 ⇒ cùng ngày; từ 21:00 ⇒ ngày sau). Đã chạy thử: 10:00 ⇒ 10:45 · 20:30 ⇒ 21:15 · 21:30 ⇒ 08:00 hôm sau · 05:00 ⇒ 08:00 cùng ngày · 00:00 ngày 1/10 ⇒ 08:00 1/10.
3. `remindAccessRequests`: `tickets` `kind='access_request' and status='open' and reminded_at is null and created_at <= $now − ACCESS_REMIND_MIN` ∧ `isOfficeHours($now)` (08:00–18:00 VN, mọi ngày) ⇒ `update … set reminded_at=$now`, audit `ticket.access_request.reminder` (dashboard tô màu theo `created_at`, không cần cột), nhắn cư dân `WAITING_BQL_RESIDENT` (một lần).
4. `publishFallback` / `requestAccessFallback`: `case_open`/`confirmed` với `updated_at <= $now − 2 phút` (và `window_start is not null` / `access_ticket_id is null`) ⇒ dịch vụ tương ứng với actor `timer`, audit `timer.publish_fallback` / `timer.request_access_fallback` (đếm để đo tần suất agent quên — TESTING §6).
5. `reemitStuckGranted`: `access_granted` với `updated_at <= $now − DISPATCH_REEMIT_MIN`; số audit `system.access_approved_reemit` của cuốc < 3 và không có dòng nào trong 5 phút gần nhất ⇒ `enqueueSystemEvent` + audit; đủ 3 ⇒ audit `dispatch.stuck` (một lần) — người xem `/jobs`.
6. `expireSlots`, `remindSlotExpiry`, `expireWaitlistInvites` — §10.9.3.

#### §10.8.2 `services/system-events.ts`
```ts
export async function enqueueSystemEvent(args: { event: 'access_approved'; jobId: string }): Promise<number>;
```
`insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload) values ('market', 'sys-'||gen_random_uuid(), $threadId, 'user', 'system', false, $payload)` với `$threadId` = uid Zalo của thợ được gán trên `market` (thiếu ⇒ audit `system.vendor_no_identity`, không ghi), `$payload = {kind:'system', event, job_id}`. Được runner/`processInbound` nhặt như tin thường ⇒ `routeInboundEvent` ⇒ `vendorHandler` §10.5.4. Đây KHÔNG phải tin Zalo — chỉ là bus DB có sẵn (không thêm bảng, không pg-boss).

#### §10.8.3 Chạy bằng gì
- `runner/inbound-runner.ts`: `runInboundLoop` thêm `lastTimerAt`; sau `drainInbound` nếu `now − lastTimerAt ≥ TIMER_INTERVAL_MS` ⇒ `runTimers(new Date())`, log `{event:'runner.timers', ...report}`; lỗi ⇒ `onError`, không dừng vòng. Vẫn MỘT bản `core:run` (SPEC-P02 §9.6).
- Web `/dev/sim`: nút "Tick đồng hồ" ⇒ `POST /api/dev/sim/tick` body `{now?: ISO}` (chỉ `bql_admin`, chỉ `DATA_MODE=sim`) ⇒ `runTimers(new Date(now ?? Date.now()))` rồi `simDeliver()`; trả `TimerReport`; audit `sim.tick`. `/api/dev/sim/send` giữ nguyên (không chạy timer).
- Demo tay: chạy `npm run core:run` song song `next dev`, hoặc bấm Tick.

#### §10.8.4 Test bằng đồng hồ giả (test:db, mẫu bắt buộc)
Tạo cuốc `held` bằng `claimJob({now: T})`; gọi `runTimers(new Date(T + 11 phút))` ⇒ `holds_released=1`, cuốc `published`, `vendor_scores.no_show_count = 1`, `republish_count = 1`, có tin nhóm tiền tố "ĐĂNG LẠI"; gọi lại cùng `now` ⇒ `holds_released=0` (idempotent). Tương tự: `publish_expires_at` ⇒ `runTimers(T + 46')` ⇒ đăng lại quote; lần 2 ⇒ `unassigned` + ticket `no_vendor`. Slot: `period_end = today − 1` ⇒ `expireSlots` ⇒ `expired` + DM + mời danh sách chờ. CẤM `vi.useFakeTimers` cho các test này (đồng hồ là tham số, không phải thời gian tiến trình).

### §10.9 Slot / dùng thử / danh sách chờ / sổ phí (Đ14) — `services/slots.ts`

#### §10.9.1 Đối chiếu: bảng `slot_capacity`, `vendor_slots` (index `one_active_slot`, `one_trial_ever`), `slot_waitlist`, `ledger_entries` ĐÃ có từ `001_init.sql` (01-CONTRACTS §4). Migration 006 chỉ thêm `vendor_slots.reminded_at`. Env đã có trong `.env.example` với giá trị GIẢ (§10.2.3).

Định nghĩa "slot còn hạn": `status='active' and period_end >= $today` (`period_start` không xét — chỉ có tối đa 1 dòng `active` mỗi (thợ, tòa, nhóm nghề) nhờ `one_active_slot`, và gia hạn tạo dòng mới bắt đầu SAU dòng cũ — §10.9.2).

#### §10.9.2 Hàm
```ts
export async function requestSlot(args: { vendorId: string; buildingId: string; tradeGroup: TradeGroup; now: Date }): Promise<{ result: 'trial_granted' | 'already_active' | 'waitlisted' | 'pending_payment'; periodEnd?: string; position?: number; feeVnd?: number }>;
export async function grantPaidSlot(args: { vendorId: string; buildingId: string; tradeGroup: TradeGroup; staffId: string; now: Date }): Promise<{ result: 'granted' | 'waitlisted'; slotId?: string; periodStart?: string; periodEnd?: string; position?: number }>;
export async function suggestedCapacity(buildingId: string, tradeGroup: TradeGroup, now: Date): Promise<number>;   // max(2, ceil(số cuốc closed/dispatched 30 ngày của nhóm nghề / SLOT_MIN_JOBS_PER_VENDOR)) — chỉ HIỂN THỊ gợi ý; admin đặt `slot_capacity.capacity` tay
export async function getSlotSummary(vendorId: string, now: Date): Promise<{ slots: [...]; waitlist: [...] }>;
export async function hasActiveSlot(q: SqlFn, vendorId: string, buildingId: string, tradeGroup: TradeGroup, today: string): Promise<boolean>;
```
`requestSlot` (tx): thợ `active` (else `IneligibleVendorError('not_active')`); `vendor_buildings` có tòa (`no_building`; `building_code` NULL ⇒ nếu thợ đúng 1 tòa lấy tòa đó, nhiều tòa ⇒ `SlotUnavailableError('cần building_code: A, B')`); có `vendor_skills` thuộc `tradeGroup` (`no_skill`); `select capacity from slot_capacity where building_id and trade_group for update` (rỗng ⇒ `SlotUnavailableError('BQL chưa đặt trần slot')`); đã có slot còn hạn ⇒ `already_active`; `count(*) active and period_end >= today < capacity`: chưa từng có dòng `is_trial=true` (mọi status) ⇒ `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status) values ($v,$b,$tg,true,$today,$today + FREE_TRIAL_DAYS − 1,0,'active')` ⇒ `trial_granted` (+ xoá dòng `slot_waitlist` của thợ nếu có); đã dùng thử ⇒ `pending_payment` với `feeVnd = SLOT_FEE_MONTHLY` (KHÔNG tạo dòng; BQL bấm "Đã thu phí" mới cấp — Đ05 thu tiền ngoài hệ thống); đầy ⇒ `insert into slot_waitlist (building_id, trade_group, vendor_id) values (…) on conflict do nothing` ⇒ `waitlisted` với `position` = thứ tự `joined_at`. Số đo đã chạy (50 giao dịch đồng thời, trần 3, 2 slot active, đúng khoá `FOR UPDATE` + đếm): `granted=1 waitlisted=49 active_slots=3`.

`grantPaidSlot` (tx, nút "Đã thu phí" — SPEC-P04 §8): khoá `slot_capacity`; slot còn hạn hiện có (dùng thử hoặc trả phí) ⇒ **gia hạn**: `update vendor_slots set status='expired' where id=$old` (cột `is_trial` GIỮ NGUYÊN để `one_trial_ever` vẫn tính là đã dùng thử) + `insert … (is_trial=false, period_start = greatest($today, old.period_end + 1), period_end = period_start + SLOT_PERIOD_DAYS − 1, fee=SLOT_FEE_MONTHLY, status='active')` (đã chạy thử: sau gia hạn `active_slots_for_vendor=1`; chèn dùng thử lần 2 ⇒ lỗi unique `one_trial_ever`); không có slot còn hạn ⇒ đếm trần: còn chỗ ⇒ insert như trên với `period_start=$today`; đầy ⇒ `waitlisted` (không thu — web báo BQL). Mỗi lần cấp trả phí: `insert into ledger_entries (slot_id, vendor_id, kind, amount, status) values ($s,$v,'slot_fee',SLOT_FEE_MONTHLY,'paid'), ($s,$v,'bql_share', round(SLOT_FEE_MONTHLY × BQL_SHARE_PCT / 100),'due')`; audit `slot.paid` actor staff. Xoá thợ khỏi `slot_waitlist` (tòa, nhóm) nếu có.

#### §10.9.3 Timer slot (trong `runTimers`)
- `expireSlots`: `update vendor_slots set status='expired' where status='active' and period_end < $today returning id, vendor_id, building_id, trade_group, is_trial` ⇒ mỗi dòng: DM thợ `SLOT_EXPIRED_DM` (dùng thử: "hết dùng thử, liên hệ BQL đóng phí <SLOT_FEE_MONTHLY>"), audit `slot.expired`, rồi `inviteWaitlistHead(building, trade, $now)`. Dashboard `/vendors` liệt kê slot `expired` trong 7 ngày gần nhất với nhãn "cần gỡ khỏi nhóm Zalo" (gỡ tay).
- `remindSlotExpiry`: `active and reminded_at is null and period_end − $today <= SLOT_REMIND_DAYS` ⇒ DM `SLOT_REMIND_DM` + `reminded_at=$now`.
- `inviteWaitlistHead`: còn chỗ (`count active < capacity`) ∧ có dòng `invited_at is null` ⇒ dòng `joined_at` nhỏ nhất: `update slot_waitlist set invited_at=$now` + DM `WAITLIST_INVITE_DM` ("trả lời «giữ slot <nhóm nghề>» trong 48 giờ"). Lời mời KHÔNG giữ chỗ (câu hỏi mở Q3).
- `expireWaitlistInvites`: `delete from slot_waitlist where invited_at is not null and invited_at <= $now − WAITLIST_INVITE_HOURS returning …` ⇒ audit `slot.invite_expired` + mời người kế.
- Luật cân bằng `MIN_EARNINGS_TO_FEE` (Đ15) = SPEC-P08, KHÔNG làm ở đây.

### §10.10 Tin nhắn mẫu + PiiGate — `services/vendor-messages.ts`, `services/pii-gate.ts`
```ts
export function assertNoResidentPii(text: string, guard: { phone: string | null; fullName: string | null; apartmentCode: string; apartmentCodes: readonly string[]; keepJobCodes: readonly string[] }): void; // ném PiiGateError
export async function sendVendorMessage(args: { threadId: string; threadType: 'user' | 'group'; text: string; jobId: string | null; guard?: ResidentGuard | null; allowReveal?: boolean }): Promise<number>;
export async function sendResidentOfJob(jobId: string, text: string): Promise<void>;   // thread = conversations(zalo_account_id='bql', party_type='resident', party_id = jobs.resident_id); thiếu ⇒ audit `resident.no_conversation`, không gửi
```
`assertNoResidentPii`: thay mã cuốc (`keepJobCodes`) bằng khoá tạm; chuỗi số của `phone` (bỏ mọi ký tự không phải số, so trên text đã bỏ ký tự phân cách) xuất hiện ⇒ lỗi; `fullName` (NFC, không phân biệt hoa thường, ≥5 ký tự) xuất hiện ⇒ lỗi; mọi `apartmentCodes` của tòa theo so khớp lỏng (như `redactKnownApartmentCodes`) ⇒ lỗi; mẫu chung `PHONE_RE`/`APT_GENERIC_RE` của `agent/pii.ts` khớp ⇒ lỗi. `sendVendorMessage`: `allowReveal !== true` ∧ `guard` ⇒ `assertNoResidentPii`; ném ⇒ audit `pii.gate_blocked` (`data:{job_id, thread_type, kind}` — KHÔNG ghi text) rồi ném tiếp; qua ⇒ `enqueue({zaloAccountId:'market', threadId, threadType, kind:'text', body:{text}, jobId})`. `allowReveal:true` CHỈ được truyền từ `services/access.ts::dispatchToVendor` (review + máy đo: chuỗi `allowReveal: true` chỉ xuất hiện trong file đó — thêm vào `check_agent_tools.mjs`: `allow_reveal_outside_access: 0`).

Mẫu (tiếng Việt có dấu, hằng trong `vendor-messages.ts`, mỗi mẫu một hàm nhận tham số đã định kiểu, unit test khẳng định KHÔNG có tham số PII nào trong chữ ký trừ `renderReveal`):
`renderJobCardText` (§1.2, thêm dòng cuối `Trả lời "nhận <code>" để giữ cuốc <HOLD_MINUTES> phút`) · `CLAIM_WON_GROUP(code, hhmm)` · `HOLD_DM(code, hhmm, needPrice)` = `Bạn đang giữ <code> tới <hhmm>. Trả lời OK để xác nhận.` + (`needPrice` ⇒ ` Cuốc này thợ báo giá — trả lời giá của bạn (vd 350k) để xác nhận.`) · `CONFIRMED_DM(code)` · `HOLD_RELEASED_DM(code, reason)` · `ACCESS_PENDING_DM(code)` · `ACCESS_REJECTED_DM(code)` = `<code> được chuyển cho thợ khác.` · `renderReveal(reveal: JobReveal)` = `<code> — Căn <apartment_code> (tầng <floor>), tòa <building_code>. SĐT cư dân: <resident_phone>. Mã vào tòa: <access_pass_code> (hiệu lực <from>–<to>). Đến nơi nhắn "đến <code>".` · `SLOT_*` · `WAITLIST_INVITE_DM` · phía cư dân: `ACCESS_PENDING_RESIDENT(code)` = `Đã có thợ nhận việc <code>, đang chờ BQL xác nhận thợ.` · `WAITING_BQL_RESIDENT` · `SEARCHING_AGAIN_RESIDENT` · `QUOTE_ASK_RESIDENT(code, price, band)` = `Thợ báo giá <price>đ cho <code>, cao hơn khung tham khảo <low>–<high>đ. Anh/chị ĐỒNG Ý giá này không?` · `QUOTE_TIMEOUT_RESIDENT` · `DISPATCHED_RESIDENT(code, vendorName, rating, window, pass)` · `NO_VENDOR_RESIDENT(code)`.

### §10.11 Dữ liệu mô phỏng, SimBoard, kịch bản
- `db/seed-sim.ts` (idempotent theo `zalo_identities('market', uid)`; slot đặt lại `period_*` theo `current_date` mỗi lần chạy; đếm dòng không đổi khi chạy 2 lần): `vendor_groups` 4 dòng `sim-market-{dien_nuoc,khoa,dien_lanh,xay_sua}` cho `TOA-A`; `slot_capacity` = 2 cho cả 4 nhóm nghề; thợ: `sim-ven-1` (điện nước, `active`, DÙNG THỬ còn hạn +20 ngày) · `sim-ven-2` (điện nước, `active`, TRẢ PHÍ +25 ngày) · `sim-ven-3` (điện nước, `active`, dùng thử `expired` hôm qua — không slot) · `sim-ven-4` (khoá, `active`, dùng thử +20) · `sim-ven-5` (điện nước, `pending`) · `sim-ven-6` (điện lạnh, `active`, trả phí +25) · `sim-ven-7` (xây sửa, `active`, dùng thử +20); mỗi thợ `vendor_buildings(TOA-A)`, `vendor_skills` theo nhóm nghề (danh mục seed nền), `vendor_scores` (0). Điện nước đầy trần (ven-1, ven-2) ⇒ `sim-ven-3` xin ⇒ `waitlisted`; `sim-ven-5` "nhận" ⇒ `VENDOR_PENDING_REPLY`; `sim-ven-3` "nhận" ⇒ `IneligibleVendorError('no_slot')`.
- `apps/web/app/dev/sim/SimBoard.tsx`: khung nhóm thợ chọn thread trong 4 giá trị trên (mặc định `sim-market-dien_nuoc`, người gửi mặc định `sim-ven-1`); thêm khung "Thợ (DM, tài khoản market)" với `threadType 'user'`, `threadId = senderUid` (mặc định `sim-ven-1`); nút "Tick đồng hồ"; `/api/dev/sim/send` từ chối `senderUid==='system'` (400).
- `evals/scenarios/dispatch_smoke.jsonl` (tuỳ chọn, chạy bằng nút phát lại với `routeInboundEvent`): 3 dòng nhóm `sim-ven-3 "nhận C-XXXX"` (từ chối no_slot), `sim-ven-5` (pending), `sim-ven-1 "chào"` (nhiễu, không xử lý) — mã cuốc giả `C-ZZZZ` ⇒ `JobNotFoundError`; chỉ để nhìn tay.
- Đầu-cuối máy (G16a): `dbtests/p05-e2e.db.test.ts` với client kịch bản (mẫu `p03.db.test.ts`) — lượt cư dân 1 (draft → search → classify resident → text), lượt 2 ("đồng ý, 2h–5h chiều mai" → `open_service_case` ISO → `publish_job_to_group`), nhóm `sim-ven-1` "nhận <code>" (client thợ: `claim_job`), DM "OK" (`confirm_assignment` → `request_access`), test gọi `decideAccessRequest(approve, staff)`, `processInbound` nhặt sự kiện hệ thống (client: `dispatch_to_vendor`) ⇒ khẳng định: `jobs.status='dispatched'`; outbox DM thợ chứa `A-0101` + mã 6 ký tự; MỌI outbox thread nhóm KHÔNG chứa `A-0101`/`0901000001`/`Nguyễn Văn A`; outbox cư dân có tin `ACCESS_PENDING_RESIDENT` và `DISPATCHED_RESIDENT`; `job_events` đủ 6 chuyển (`case_open→published→held→confirmed→access_pending→access_granted→dispatched`); `agent_runs` có route `vendor_parse`.

### §10.12 Work Packages P05 (tầng theo AGENTS.md §3; KHÔNG ghi tên model)

| WP | Nội dung | Tầng | Phụ thuộc | Xong khi (lệnh + số) |
| :-- | :-- | :-- | :-- | :-- |
| P05-A | Hợp đồng §10 + 01-CONTRACTS/TESTING/OPERATIONS/P04 §8 (bản này) | 🔴 | — | SO duyệt Đ27 |
| P05-B | Nền: migration 006, errors/types, `tool-kit` TCtx, `conversation.ts`, `dispatch-config`, `vn-time`, `vendor-intent` (thuần), `pii-gate`, `vendor-messages`, `system-events`, `dispatch.ts`, `access.ts`, `slots.ts`, `timers.ts`, runner tick, seed-sim, `sim_claims.mjs`, `check_agent_tools` mở rộng, `.env.example`, `TRANSITIONS` + cặp mới, `runScenario(handler)` | 🟠 | P05-A | `npm run gate` exit 0; `npm run test:db` exit 0, số test ≥ 122 + ≥40 ca mới, 0 skip; `node --import tsx scripts/sim_claims.mjs` ⇒ `jobs_with_two_winners: 0`, `--break` ⇒ exit 1; đồng hồ giả §10.8.4 xanh; G15 xanh; bằng chứng đỏ `evidence/P05/red-*.txt` cho 3 máy đo mới |
| P05-C | Agent thợ: `vendor-triage` + prompt, `vendor-agent` + prompt, 9 tool, `routeInboundEvent`, golden `vendor_intent.jsonl` (≥60 ca) + `scripts/eval/vendor-intent.mjs`, test DB client kịch bản (claim thắng/thua, pending, no_slot, quote vượt khung, OK sau hạn ⇒ HoldExpired, sự kiện hệ thống ⇒ dispatch, nhóm nhiễu 0 model, text tự do không vào nhóm) | 🟠 thi công · 🔴 review prompt + golden | P05-B | `npm test`/`test:db` xanh không giảm; `npx tsx --env-file=.env scripts/eval/vendor-intent.mjs` ⇒ `claim_recall ≥ 0.95`, `false_claim = 0`, `price_exact ≥ 0.90` (hoặc exit 3 `blocked` khi thiếu key — KHÔNG tính đạt) |
| P05-D | Phía cư dân: `open_service_case` ISO + `consent.ts`, `publish_job_to_group`, `respond_to_quote`, mốc thời gian, prompt `resident.ts` (5, 5b, 6), sửa test P03 dùng `window_options`, `p05-e2e.db.test.ts` | 🟠 | P05-B, P05-C, **H08 nhả `prompts/resident.ts`** | test P03 hồi quy xanh (bộ phá R05 vẫn đúng); G16a xanh; `npm run eval:golden` chạy lại 1 lượt (số ghi report; gate G08–G10 giữ theo Đ26) |
| P05-E | P04 tối thiểu (SPEC-P04 §8): `/tickets` duyệt/từ chối, `/gate`, `/vendors` + "Đã thu phí"/duyệt/đình chỉ, `/jobs` (🟢), policy, SimBoard, `/api/dev/sim/tick` | 🟠 (trang `/jobs` 🟢) | P05-B (dịch vụ) | G07 (TESTING §4) |
| P05-F | Thẩm định đối kháng (agent khác, chỉ đọc, ≥3 cách phá: đua claim với `suspended` giữa chừng, PII qua `summary_vi`/tên thợ, `dispatch_to_vendor` với ticket `rejected` rồi `approved` lại, `respond_to_quote` giả đồng ý, `system` giả từ `/dev/sim`, trần slot khi `capacity` giảm) | 🔴 | P05-B..E | report R với ≥3 ca ĐỎ được thử; mọi ca đỏ ⇒ test hồi quy |
Thứ tự: B → (C ∥ E) → D → F. Handoff mỗi WP chỉ trỏ số mục §10.x.

### §10.13 Bảng lỗi P05 & hành vi caller (bổ sung 01-CONTRACTS §9)

| Lỗi | Khi nào | Caller (agent) BẮT BUỘC |
| :-- | :-- | :-- |
| `JobNotFoundError` | mã cuốc không tồn tại / không thuộc người đang nói | "Không tìm thấy mã cuốc <code>"; không lộ cuốc khác |
| `IneligibleVendorError` (`message` bắt đầu bằng `not_active` \| `no_building` \| `no_skill` \| `no_slot` \| `blocked_no_show` \| `rejected_by_bql` \| `window_overlap` \| `not_assigned`) | §10.3.1 bước 2 | trả lời DM ngắn theo lý do (no_slot ⇒ "cần giữ slot <nhóm nghề> — nhắn «giữ slot …»"); không nêu chi tiết cuốc; KHÔNG trả lời trong nhóm |
| `IntentNotConfirmedError` | §10.4.4 | hỏi thợ trả lời đúng mẫu; không gọi lại tool trong cùng lượt |
| `HoldExpiredError` | OK/giá sau `hold_expires_at` | "Hết hạn giữ, cuốc đã đăng lại — nhắn «nhận <code>» nếu còn muốn" |
| `QuoteRequiredError` | quote thiếu giá / giá không khớp tin | hỏi giá ("Anh báo giá bao nhiêu? vd 350k") |
| `SlotUnavailableError` | chưa đặt trần / tòa mơ hồ / chưa cấu hình nhóm | báo thợ liên hệ BQL; audit đã ghi để admin thấy trên `/vendors` |
| `ConflictError` | trạng thái đã đổi (thua đua, hết giữ, đã xử lý) | đọc lại trạng thái (`get_my_assignments`) và báo thợ; không retry |
| `AccessNotApprovedError` | `dispatch_to_vendor` khi ticket chưa `approved` | chờ; timer §10.8.1 (3) nhắc BQL; không nhắn thợ số căn |
| `PiiGateError` | tin cho thợ chứa PII trước reveal | KHÔNG gửi; audit mức cao đã ghi; agent trả lời DM không nêu chi tiết |
| `ConsentMissingError` | `respond_to_quote(accept=true)` thiếu bằng chứng | hỏi cư dân "trả lời ĐỒNG Ý giá <x> để em chốt" |
| `ModelUnavailableError` | vòng agent thợ | DM `BUSY_REPLY`; lượt nhóm có bằng chứng tất định ⇒ lưới `claim.fallback_no_model` |

### §10.14 Vùng cấm P05 (đã cân nhắc, quyết KHÔNG làm)
- **CẤM claim tất định không qua agent làm đường chính** — lý do: Đ10/Đ21 (agent điều phối; ý định do model); code chỉ là lưới khi model chết hoặc agent quên (có audit riêng để đo).
- **CẤM cho agent đọc `triage.intent`** (chỉ tool đọc) và **CẤM agent phát text tự do vào nhóm** — nhóm là kênh phát, chống rò PII và nhiễu.
- **CẤM regex "nhận" làm cơ chế hiểu chính** (Đ21) — danh sách cụm ở §10.4.2 chỉ là lưới BẰNG NHAU (equality), không "chứa".
- **CẤM pg-boss / hàng đợi mới** — runner tuần tự đủ cho 1–2 tòa (Đ22); timer là tham số `now` để test.
- **CẤM tạo slot trả phí từ chat** ("Đã thu phí" chỉ trên web, actor staff — Đ05 thu tiền ngoài hệ thống).
- **CẤM cấp vượt `slot_capacity`, CẤM slot "ưu tiên"** (Đ12/Đ14).
- **CẤM đổi khung giờ sau `case_open`** (cư dân huỷ + mở lại; tránh vòng đổi giờ giữa ba bên khi chưa có P06).
- **CẤM nhắn riêng top thợ, CẤM đấu giá, CẤM cho thợ thấy giá thợ khác** (§6, Idea Vault).
- **CẤM ảnh trong thẻ cuốc ở P05** (`photo_urls_redacted = []`) — tải/xoá EXIF/che ảnh thuộc P02 g2 + P06; tránh rò số căn qua ảnh.
- **CẤM đăng ký thợ qua chat (`register_vendor`, `set_availability`)** — SPEC-P04 §3, gói sau; sim seed thợ sẵn.
- **CẤM lớp khẩn cấp trên tài khoản `market`** — thợ là người tại chỗ, gọi 114/hotline; đường khẩn cấp của sản phẩm là kênh cư dân (Đ09).
- **CẤM `vi.useFakeTimers` / `now()` Postgres trong timer** — đồng hồ là tham số.
- **CẤM sửa `apps/zalo-worker/**`** (P02 g2) và **CẤM sửa `prompts/resident.ts` trước khi H08 nhả** (WP-D chờ).
- **CẤM cột `jobs.vendor_price`** — giá thợ ở `job_offers.price` (một nguồn chân lý, G21).
- **CẤM lời mời danh sách chờ giữ chỗ** (Q3) — tránh trần bị "khoá ảo" 48 giờ khi thợ không phản hồi.

### §10.15 Nghiệm thu — TESTING-ACCEPTANCE §4 (G07, G11, G12, G12b, G15, G16a) + §6 số đo lưới an toàn. Số đo architect đã chạy 2026-09-25 (bằng chứng: `evidence/` KHÔNG ghi bởi architect — worker phải chạy lại và nộp output): `sim_claims` 200/50 ⇒ 0 hai người thắng (303 ms); bản hỏng ⇒ 20; G12b 2 ⇒ 0; G15 1/49; `one_trial_ever` chặn; giờ VN 5 ca đúng.

### §10.17 Đình chỉ thợ — `services/vendors.ts` `suspendVendor` (Đ30 — Super Orchestrator 🔴, 2026-09-26; vá lỗ phát hiện khi duyệt R14)
Lỗ tìm thấy: (1) R12 không làm `suspendVendor` dù SPEC-P04 §8.2 gọi nó ⇒ route web tự ghép, nhả cuốc TRƯỚC rồi mới đặt `suspended` ⇒ giữa hai bước cuốc đã đăng lại mà thợ vẫn `active` ⇒ chính thợ đó "nhận" lại được; (2) cuốc `access_granted` (BQL đã duyệt, chưa giao) không được xử lý và `dispatchToVendor` không kiểm `vendors.status` ⇒ sự kiện hệ thống vẫn gửi `JobReveal` (số căn, SĐT cư dân) cho thợ bị đình chỉ (BB-02, BB-10).
- `export async function suspendVendor(args: { vendorId: string; staffId: string; note: string; now: Date }): Promise<{ alreadySuspended: boolean; released: number; withdrawn: number; revokedGranted: number; dispatchedLeft: number }>` — thứ tự BẮT BUỘC:
  1. `update vendors set status='suspended' where id=$1 and status <> 'suspended' returning id` — CHẠY VÀ COMMIT ĐẦU TIÊN (claim kiểm `vendors.status='active'` ⇒ từ đây thợ không nhận được cuốc nào). 0 dòng: không tồn tại ⇒ `VendorNotFoundError` (lớp mới trong `domain/errors.ts`, mẫu lớp có sẵn); đã `suspended` ⇒ `alreadySuspended=true` và VẪN quét bước 2–4 (idempotent — gọi lại để hoàn tất nếu lần trước chết giữa chừng).
  2. `held` ⇒ `releaseHold(reason:'vendor_suspended')`; `confirmed`/`access_pending` ⇒ `withdrawConfirmed(reason:'vendor_suspended')` (hàm có sẵn, huỷ ticket cấp quyền `open`).
  3. `access_granted` ⇒ hàm mới `withdrawGranted({jobId, now, reason:'vendor_suspended', actor})` trong `services/access.ts`, một `tx`: `transitionJob access_granted → published` (cặp MỚI trong `TRANSITIONS` + 01-CONTRACTS §5), `update access_passes set revoked_at=$now where job_id=$j and revoked_at is null`, gỡ gán (`assigned_vendor_id=null`, `hold_expires_at=null`), ticket `access_request` của cuốc ⇒ `cancelled`; sau commit đăng lại nhóm (cùng khuôn "sau commit" của `decideAccessRequest` nhánh từ chối) + báo cư dân "đang tìm thợ khác".
  4. `update vendor_slots set status='cancelled' where vendor_id=$v and status='active'`; audit `vendor.suspended` `{note, released, withdrawn, revokedGranted, dispatchedLeft}`. Cuốc `dispatched` KHÔNG tự động đổi (thợ có thể đang ở căn) — chỉ đếm vào `dispatchedLeft` để BQL xử lý tay.
- Chốt chặn thứ hai: `dispatchToVendor` kiểm `vendors.status = 'active'` của thợ được gán TRƯỚC khi dựng `JobReveal`; khác ⇒ `IneligibleVendorError('vendor_suspended')`, không gửi gì. Timer `reemitStuckGranted` gặp cuốc có thợ không `active` ⇒ gọi `withdrawGranted` thay vì phát lại.
- Web `POST /api/vendors/{id}/status` `{status:'suspended'}` CHỈ gọi `suspendVendor`; `alreadySuspended` ⇒ 409; `VendorNotFoundError` ⇒ 404. CẤM SQL đổi `vendors.status`/`vendor_slots.status` trong route.
- Test DB bắt buộc (core): (a) thợ giữ cuốc ⇒ suspend ⇒ cuốc `published`, và `claimJob` của CHÍNH thợ đó ngay sau ⇒ `IneligibleVendorError`; (b) cuốc `access_granted` + mã vào ⇒ suspend ⇒ `published`, `revoked_at` có giá trị, ticket `cancelled`, `dispatchToVendor` ⇒ `IneligibleVendorError`, outbox 0 tin `JobReveal`; (c) gọi suspend lần 2 ⇒ `alreadySuspended=true`, không lỗi, không đổi gì thêm; (d) cuốc `dispatched` giữ nguyên, `dispatchedLeft=1`. Bằng chứng ĐỎ: đảo thứ tự bước 1 ra sau bước 2 ⇒ ca (a) đỏ; bỏ chốt chặn `dispatchToVendor` ⇒ ca (b) đỏ.

### §10.16 Câu hỏi mở cần người (🖐 — không tự bịa; giá trị TẠM ghi kèm để thi công không kẹt)
| # | Câu hỏi | Tạm dùng |
| :-- | :-- | :-- |
| Q1 | Tham số phí: `FREE_TRIAL_DAYS`, `SLOT_FEE_MONTHLY`, `SLOT_MIN_JOBS_PER_VENDOR`, `BQL_SHARE_PCT`, thêm `SLOT_PERIOD_DAYS` | 30 / 300 000 / 8 / 10 / 30 (giả, đã có trong `.env.example`) |
| Q2 | Thợ bị BQL từ chối vào tòa cho cuốc X có được "nhận" lại chính cuốc X? | KHÔNG (`rejected_by_bql`), vẫn nhận cuốc khác |
| Q3 | Lời mời danh sách chờ 48 giờ có giữ chỗ không? | KHÔNG giữ chỗ |
| Q4 | Cư dân im với báo giá vượt khung sau bao lâu thì nhả cuốc, có tính bùng cho thợ? | 30 phút, KHÔNG tính bùng |
| Q5 | Trần báo giá chặn nhập sai | 50 000 000đ; sàn 20 000đ |
| Q6 | Nhóm Zalo thật: mỗi (tòa × nhóm nghề) một nhóm (4 nhóm/tòa) hay một nhóm chung? | 4 nhóm; đổi chỉ sửa `vendor_groups` |
| Q7 | Dùng thử 1 lần MỖI (tòa × nhóm nghề) — thợ 2 nghề được 2 lần dùng thử? | Giữ theo Đ14 (theo index `one_trial_ever`) |
| Q8 | Thợ đang giữ cuốc A có được nhận cuốc B không trùng giờ? | CÓ |
| Q9 | Giờ hành chính để nhắc BQL | 08:00–18:00 mọi ngày |
| Q10 | Sau khi prompt `resident.ts` đổi (WP-D), chấm lại đủ 4 bộ hay 1 lượt khói? | 1 lượt đủ 4 bộ (Đ26) — cần quota Gemini |
