# SPEC-P04 — Thợ & Console BQL

> Tầng 🟠. Đọc `01-CONTRACTS.md` §3, §4, §7.

## §1. Auth console

- Đăng nhập email + mật khẩu (scrypt), cookie phiên HMAC, hết hạn 12 giờ. Vai: `bql_admin` (mọi thứ), `bql_staff` (cuốc, ticket, duyệt cư dân), `guard` (chỉ xem thẻ vào tòa hôm nay).
- Mọi Server Action ghi `audit_log`.

## §2. Đăng ký cư dân (qua tài khoản `bql`)

Người lạ nhắn ⇒ agent hỏi: tòa, căn, họ tên, SĐT, vai (chủ/thuê/thành viên), đồng ý điều khoản dữ liệu (một câu, có link) ⇒ `residents(status='pending', consent_at)` + `zalo_identities`. Nhân viên duyệt trên console ⇒ `active`.

## §3. Đăng ký thợ (qua tài khoản `market`)

1. Thợ nhắn tài khoản `market` hoặc được thêm vào nhóm ⇒ agent thợ hỏi: họ tên, SĐT, loại việc (chọn từ `job_categories`), tòa phục vụ, ảnh CCCD mặt trước.
2. Ảnh CCCD lưu mã hoá (`id_doc_ref`), chỉ `bql_admin` xem được; CẤM OCR số CCCD vào DB.
3. `vendors(status='pending')` ⇒ console hàng chờ duyệt ⇒ `active` (ghi `approved_by/at`) hoặc từ chối kèm lý do.
4. Thợ `active` **có slot còn hạn (trả phí hoặc dùng thử)** mới được vào nhóm "Thợ Tòa X · <nhóm nghề>" (nhân viên thêm tay; hệ thống không tự thêm) (Đ14).

## §3b. Dữ liệu mô phỏng (Đ11)

`scripts/seed_sim.mjs`: 1 tổ chức, 1 tòa ("B"), 300 căn, 40 cư dân, 12 thợ (4 nhóm nghề; có slot trả phí, slot dùng thử, danh sách chờ), 30 ngày ticket/case phân bố theo giờ trong ngày, đủ mọi trạng thái của 01-CONTRACTS §5, dòng thời gian `job_events` đầy đủ. Mọi dòng có cờ `is_sim=true`; dashboard hiện nhãn "DỮ LIỆU MÔ PHỎNG" khi `DATA_MODE=sim`. CẤM trộn dữ liệu mô phỏng với dữ liệu thật trong cùng DB production. Mockup tham chiếu: `docs/images/09-dashboard-bql-mockup.png` (UI sẽ tinh gọn sau — Đ11).

## §4. Trang console (vòng 0.1 — TỐI THIỂU, Đ13)

Chỉ những trang agent cần để chạy pipeline v0.2: 2 điểm duyệt (`/tickets`), xem case + dòng thời gian agent (`/jobs`), quy chế (`/regulations`), duyệt cư dân/thợ, trạng thái kênh (`/zalo`), thẻ vào tòa cho bảo vệ (`/passes`). `/pricing` chỉ để nhập giá seed. Thêm `/vendors` (thợ & slot) và `/ledger` cho phí vào nhóm (Đ14).

| Trang | Vai | Chức năng |
| :-- | :-- | :-- |
| `/zalo` | admin | trạng thái 2 tài khoản, nút đăng nhập QR, lịch sử kick/reconnect |
| `/residents` | staff | hàng chờ duyệt, tìm theo căn |
| `/vendors` ("Thợ & slot") | admin | duyệt thợ, kỹ năng, tòa, điểm, số bùng, đình chỉ · **slot (Đ14)**: trần theo (tòa × nhóm nghề), thành viên (dùng thử / trả phí), ngày hết hạn, danh sách chờ, nút "Đã thu phí", nhắc "cần thêm/gỡ khỏi nhóm Zalo" |
| `/ledger` | admin | sổ phí slot theo thợ và kỳ; phần BQL; đánh dấu đã thu/miễn |
| `/jobs` | staff | bảng case/cuốc theo trạng thái + dòng thời gian việc agent đã làm (`job_events`) |
| `/tickets` | staff | **dashboard chính**: ticket `bql_responsibility`/`unclear` (BQL xử lý) · `service_case` (theo dõi việc trong căn) · **`access_request` với nút Duyệt / Từ chối** (Đ10, một bấm; từ chối bắt buộc lý do) · `dispute`/`emergency`/`no_vendor`; gán người, đổi trạng thái; ticket quá hạn đổi màu |
| `/regulations` | admin | tải quy chế (docx/pdf/md) ⇒ tách mục ⇒ `kb_sections`; đặt `status`, `effective_from/to`; loại mục khỏi trả lời |
| `/pricing` | admin | seed `job_categories` + `price_book` (p25/p50/p75); xem giá quan sát được |
| `/passes` | guard | thẻ vào tòa sinh ra từ ticket `access_request` đã duyệt, còn hiệu lực hôm nay: mã, tên thợ, căn, khung giờ; nút "đã vào" |

## §5. Seed `job_categories` ban đầu

`thong_tac_bon_rua`, `thong_tac_bon_cau`, `thong_tac_thoat_san`, `thay_ruot_khoa`, `mo_khoa`, `sua_voi_nuoc`, `ro_ri_ong_nhanh`, `ve_sinh_may_lanh`, `sua_may_lanh`, `thay_o_cam_cong_tac`, `sua_den`, `chong_tham` (mặc định `quote`), `khac` (`quote`). Mỗi dòng có `default_mode`; giá seed do BQL nhập từ số đo P00.

## §6. Vùng cấm

- CẤM console hiển thị số CCCD dạng chữ; CẤM xuất danh sách cư dân kèm SĐT ra file.
- CẤM tạo cuốc từ console bỏ qua bước 3 (trách nhiệm) — trừ khi admin ghi lý do (lưu `audit_log`).

## §7. Nghiệm thu (G07)

- Thợ `pending` gửi "nhận C-xxxx" ⇒ bị từ chối (BB-10).
- `guard` truy cập `/vendors` ⇒ 403.
- Tải quy chế mẫu 10 mục ⇒ 10 dòng `kb_sections`, `search_regulations` trả đúng mục trong 5 truy vấn thử.

## §8. Chốt thi công tối thiểu cho P05 (Đ27 — architect soạn 2026-09-25 23:17 — CHỜ DUYỆT)

> Phần P04 mà P05 (SPEC-P05 §10) BẮT BUỘC có để agent chạy trọn bước 4–7 trên kênh giả lập. §8 THẮNG §4 ở chỗ mâu thuẫn; phần còn lại của §4 (quy chế, `/pricing`, `/residents`, `/ledger` đầy đủ, đăng ký thợ) là P04 đầy đủ — gói sau. WP: P05-E (🟠; trang `/jobs` 🟢), phụ thuộc P05-B (dịch vụ trong core).

### §8.0 Đối chiếu code thật (2026-09-25)
- Auth đã có: cookie HMAC `lq_session` (`lib/auth/session.ts`), `canAccess(role, pathname)` (`lib/auth/policy.ts`), `middleware.ts` (chưa đăng nhập ⇒ 307 `/login`; thiếu quyền ⇒ 403), `getSessionFromRequest` (`lib/auth/guard.ts`). Mẫu route handler có kiểm vai + audit: `app/api/zalo/[account]/logout/route.ts` (`requireZaloAdmin` trong `app/api/zalo/_shared.ts`).
- Trang tạm: `app/tickets/page.tsx`, `app/gate/page.tsx` (P01). SPEC §4 gọi trang bảo vệ là `/passes` — code và SPEC-P01 §7 là `/gate` ⇒ **giữ `/gate`**.
- `/dev/sim`: `SimBoard.tsx` ghi cứng 1 thread nhóm `sim-market-group` và 1 thread cư dân `sim-resident-1`; API `/api/dev/sim/{send,thread,replay}`. Phát lại kịch bản đang dùng `echoHandler` (SPEC-P05 §10.0 L8).
- Test DB web: `apps/web/tests/*.db.test.ts`, `vitest.db.config.ts` `fileParallelism:false` (G24); mẫu gọi route handler trực tiếp với `NextRequest` + cookie tạo bằng `createSessionCookie` — `tests/zalo-logout.db.test.ts`.

### §8.1 Phân quyền — `lib/auth/policy.ts` (thêm; giữ `matchesSegment`)

| Đường dẫn | bql_admin | bql_staff | guard |
| :-- | :-- | :-- | :-- |
| `/tickets/*`, `/api/tickets/*` | ✅ | ✅ | ❌ |
| `/gate/*` | ✅ | ❌ | ✅ |
| `/vendors/*`, `/api/vendors/*` | ✅ | ❌ | ❌ |
| `/jobs/*` | ✅ | ✅ | ❌ |
| `/dev/*`, `/api/dev/*` (đã có) | ✅ | ❌ | ❌ |

Tách `requireRole(req: NextRequest, roles: StaffRole[]): Promise<AdminCheck>` vào `app/api/_auth.ts` (mẫu `requireZaloAdmin`; 401 chưa đăng nhập, 403 sai vai); `_shared.ts` của zalo giữ nguyên. Unit test `policy.test.ts` thêm đủ ô bảng trên (mỗi ô một `it`).

### §8.2 API (Route Handler, `export const dynamic = 'force-dynamic'`; body JSON; sai kiểu ⇒ 400 `{error:'invalid_body'}`; mọi thành công đều có audit — do dịch vụ core ghi với `actorType:'staff'`, `actorId = session.uid`)

| Route | Vai | Body → Kết quả | Lỗi |
| :-- | :-- | :-- | :-- |
| `POST /api/tickets/{id}/decision` | admin, staff | `{decision:'approve'\|'reject', note?: string}` ⇒ core `decideAccessRequest({ticketId, decision, note, staffId, now: new Date()})` ⇒ 200 `{ok:true, job_code, status:'access_granted'\|'published'}` | `reject` mà `note` rỗng/thiếu ⇒ 400 `{error:'note_required'}` (kiểm TRƯỚC khi gọi core); ticket không tồn tại ⇒ 404 `{error:'ticket_not_found'}`; không `open` hoặc không `access_request` ⇒ 409 `{error:'ticket_not_open'}` (`ConflictError`) |
| `POST /api/vendors/{id}/slots/paid` | admin | `{building_id: uuid, trade_group: TradeGroup}` ⇒ core `grantPaidSlot` ⇒ 200 `{result:'granted', period_start, period_end}` hoặc 200 `{result:'waitlisted', position}` | thợ không tồn tại ⇒ 404; thợ không `active` ⇒ 409 `{error:'vendor_not_active'}`; `SlotUnavailableError` ⇒ 409 `{error:'capacity_missing'}` |
| `POST /api/vendors/{id}/status` | admin | `{status:'active'}` ⇒ `update vendors set status='active', approved_by=$staff, approved_at=now() where id=$1 and status='pending' returning id` (0 dòng ⇒ 409) · `{status:'suspended', note: string}` ⇒ core `suspendVendor({vendorId, staffId, note, now})`: `update vendors set status='suspended'`; mọi cuốc `assigned_vendor_id=$v` ở `held` ⇒ `releaseHold(reason:'vendor_suspended')`, ở `confirmed`/`access_pending` ⇒ `withdrawConfirmed(reason:'vendor_suspended')`; `update vendor_slots set status='cancelled' where vendor_id=$v and status='active'` (SPEC-P05 §8); audit `vendor.suspended` data `{note}` | 404; 409 |
| `POST /api/vendors/capacity` | admin | `{building_id: uuid, trade_group: TradeGroup, capacity: number ≥ 1}` ⇒ `insert into slot_capacity (building_id, trade_group, capacity, reviewed_at) values (…, now()) on conflict (building_id, trade_group) do update set capacity = excluded.capacity, reviewed_at = now()`; audit `slot.capacity_set` data `{building_id, trade_group, capacity}` ⇒ 200 `{ok:true}`. Giảm trần dưới số slot `active` hiện có: CHO PHÉP (slot đang có giữ nguyên tới hạn; chỉ không cấp mới) | 400 `capacity` không phải số nguyên ≥ 1 |
| `POST /api/dev/sim/tick` | admin, chỉ `DATA_MODE=sim` (khác ⇒ 404 như các route dev) | `{now?: string}` ISO ⇒ core `runTimers(new Date(now ?? Date.now()))` rồi `sim.simDeliver()` ⇒ 200 `TimerReport` + `{delivered}`; audit `sim.tick` data `{now}` | `now` không parse được ⇒ 400 |
| `POST /api/dev/sim/send` (sửa) | như cũ | thêm: `senderUid === 'system'` ⇒ 400 `{error:'reserved_sender'}` | — |
| `POST /api/dev/sim/replay` (sửa) | như cũ | `sim.runScenario(filePath, agent.routeInboundEvent)` | — |

CẤM: gọi SQL đổi trạng thái cuốc/ticket trực tiếp trong route (đi qua core để test DB core và web dùng chung một đường); Server Action (dùng Route Handler để test bằng `NextRequest` như mẫu hiện có); route duyệt/từ chối ticket loại khác `access_request` (P04 đầy đủ).

### §8.3 Trang (Server Component, `dynamic='force-dynamic'` — G09; style inline như trang hiện có; khi `DATA_MODE=sim` hiện nhãn "DỮ LIỆU MÔ PHỎNG" trên đầu trang; bảng HTML thuần, KHÔNG thêm thư viện UI/state)

| Trang | Vai | Nội dung tối thiểu |
| :-- | :-- | :-- |
| `/tickets` (thay trang tạm) | admin, staff | Ba khối: (1) **Cần bạn làm ngay** = ticket `access_request` `status='open'`, mỗi dòng: `summary` (nhiều dòng, giữ xuống dòng), mã cuốc, tạo lúc, nhãn "QUÁ HẠN" nếu `created_at < now − ACCESS_REMIND_MIN`, form (client component nhỏ) với nút **Duyệt** và **Từ chối** + ô lý do (bắt buộc khi từ chối; nút Từ chối disabled khi rỗng) gọi `POST /api/tickets/{id}/decision`, sau đó `router.refresh()`; (2) ticket `bql_responsibility`/`unclear`/`emergency`/`no_vendor`/`dispute` đang `open` (chỉ xem: kind, summary, trích dẫn nếu có, tạo lúc); (3) `service_case` đang `open` (chỉ xem: mã cuốc, trạng thái cuốc hiện tại). Sắp xếp `created_at desc`, giới hạn 100 mỗi khối |
| `/gate` (thay trang tạm) | admin, guard | Bảng thẻ vào tòa còn hiệu lực hôm nay: `select p.code, v.full_name, a.code as apartment, j.code as job_code, p.valid_from, p.valid_to, p.used_at from access_passes p join jobs j on j.id=p.job_id join vendors v on v.id=p.vendor_id join apartments a on a.id=j.apartment_id where p.revoked_at is null and p.valid_to >= now() and p.valid_from < now() + interval '1 day' order by p.valid_from`; cột: mã, tên thợ, căn, khung giờ (giờ VN), mã cuốc, "đã vào lúc" (`used_at`); nút "Đã vào" = P06 (KHÔNG làm) |
| `/vendors` ("Thợ & slot") | admin | (1) Bảng thợ: tên, SĐT, trạng thái, nhóm nghề (từ `vendor_skills`→`job_categories.trade_group`, gộp), tòa, `jobs_done`/`rating_avg`/`no_show_count`; nút **Duyệt** (khi `pending`) và **Đình chỉ** (+ lý do) ⇒ `/api/vendors/{id}/status`. (2) Bảng slot theo (tòa × nhóm nghề): `capacity` (`slot_capacity`), gợi ý (`suggestedCapacity`, nhãn "gợi ý"), số slot `active` còn hạn, danh sách thành viên (thợ, dùng thử/trả phí, `period_end`, còn N ngày), slot `expired` trong 7 ngày gần nhất với nhãn **"cần gỡ khỏi nhóm Zalo"**, danh sách chờ theo `joined_at` (kèm `invited_at`). Mỗi thành viên/thợ có nút **Đã thu phí** ⇒ `/api/vendors/{id}/slots/paid` (xác nhận bằng `confirm()` ghi rõ số tiền `SLOT_FEE_MONTHLY`). Đặt trần: form nhỏ `POST /api/vendors/capacity` `{building_id, trade_group, capacity}` (admin; `upsert slot_capacity … reviewed_at=now()`; audit `slot.capacity_set`) — thêm route này vào §8.2 |
| `/jobs` (🟢, tuỳ chọn nhưng nên có để nhìn cuốc kẹt) | admin, staff | Bảng cuốc 7 ngày gần nhất: mã, trạng thái, danh mục, căn, thợ được gán, `hold_expires_at`/`publish_expires_at`, tô màu `access_granted` quá 15 phút và `unassigned`; bấm vào mã ⇒ `/jobs/{code}`: dòng thời gian `job_events` (from→to, actor, `data`, thời điểm) + audit `tool.*`/`timer.*`/`system.*` có `target` = job id |

Nhãn tiếng Việt có dấu. `/tickets` là trang chủ dashboard của P04 tối thiểu; trang `/` giữ nguyên.

### §8.4 Nghiệm thu G07 (đo được — TESTING-ACCEPTANCE §4)
- `npm test`: `policy.test.ts` thêm ≥ 12 ca (4 đường dẫn × 3 vai), xanh.
- `npm run test:db` (web, `tests/`): `tickets-decision.db.test.ts` — dựng cuốc `access_pending` + ticket `open` bằng dịch vụ core (không SQL tay cho trạng thái): (a) `guard` ⇒ 403, không đổi gì; (b) `bql_staff` reject không note ⇒ 400, ticket vẫn `open`; (c) reject có note ⇒ 200, ticket `rejected` + `decision_note`, cuốc `published`, `assigned_vendor_id` null, có tin nhóm "ĐĂNG LẠI"; (d) approve ⇒ 200, ticket `approved`, cuốc `access_granted`, đúng 1 `access_passes` còn hiệu lực với `valid_from = window_start − 30'`, `valid_to = window_end + 120'`, đúng 1 `inbound_events` `zalo_msg_id like 'sys-%'` cho cuốc; (e) approve lần 2 ⇒ 409. `vendors-paid.db.test.ts`: (f) thợ dùng thử còn hạn ⇒ "Đã thu phí" ⇒ 200 `granted`, slot cũ `expired`, slot mới `active` `period_start = old.period_end + 1`, 2 `ledger_entries` (`slot_fee` 300000 `paid`, `bql_share` 30000 `due`); (g) đầy trần ⇒ 200 `waitlisted`; (h) `bql_staff` ⇒ 403. `vendors-status.db.test.ts`: (i) đình chỉ thợ đang `held` ⇒ cuốc `published`, slot `cancelled`, audit `vendor.suspended`. `sim-tick.db.test.ts`: (j) `POST /api/dev/sim/tick` với `now` = +11 phút sau khi có cuốc `held` ⇒ `holds_released: 1`; `DATA_MODE≠sim` ⇒ 404.
- Kỳ vọng số: web `test:db` tăng ≥ 10 ca; 0 skip; chạy 3 lần liên tiếp đều xanh (G24).

### §8.5 Vùng cấm P04 tối thiểu
- CẤM thêm thư viện UI/state/form (giữ React + style inline như P01; tinh gọn UI là việc sau — Đ11).
- CẤM sửa trạng thái ticket loại khác `access_request`, tải quy chế, nhập giá, duyệt cư dân, đăng ký thợ — P04 đầy đủ.
- CẤM nút "Đã vào" ở `/gate` (P06 chuyển `dispatched→in_progress`).
- CẤM hiện SĐT cư dân ở `/gate` (bảo vệ chỉ cần mã + tên thợ + căn); CẤM hiện số CCCD ở đâu cả (§6).
- CẤM route web tự tạo `access_passes`/đổi `jobs.status` bằng SQL — mọi đường đi qua `services/access.ts`, `services/slots.ts`.

### §8.6 Lỗi → HTTP

| Lỗi core | HTTP | Body |
| :-- | :-- | :-- |
| `InvalidToolInputError` (note rỗng, body sai) | 400 | `{error:'note_required'}` / `{error:'invalid_body'}` |
| chưa đăng nhập / sai vai | 401 / 403 | `{error:'unauthorized'}` / `{error:'forbidden'}` |
| không tìm thấy ticket/thợ | 404 | `{error:'ticket_not_found'}` / `{error:'vendor_not_found'}` |
| `ConflictError` | 409 | `{error:'ticket_not_open'}` / `{error:'vendor_not_pending'}` |
| `SlotUnavailableError` | 409 | `{error:'capacity_missing'}` |
| lỗi khác | 500 | `{error:'internal'}` + audit `web.error` (không lộ stack) |
