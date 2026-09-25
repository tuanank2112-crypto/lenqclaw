# web — `apps/web` (`@lenqclaw/web`)

Dashboard BQL (Next.js 15 App Router) + màn chat giả lập `/dev/sim`. Hợp đồng: [SPEC-P01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P01-Foundation.md) §6–§7 · [SPEC-P04](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P04-Vendor-Console.md) §8 (P05-E). Trạng thái 2026-09-26: P01 xong; P02 giai đoạn 1 thêm `/zalo`; P05-E (H14) đã thi công dashboard tối thiểu cho P05: `/tickets` (duyệt/từ chối `access_request`), `/gate`, `/vendors` (thợ & slot), `/jobs` + `/jobs/{code}`, SimBoard mở rộng, `/api/dev/sim/tick`. Phần P04 đầy đủ (quy chế, bảng giá, đăng ký thợ, `/ledger`) là gói sau.

## Auth

| Thành phần | File | Hành vi |
| :-- | :-- | :-- |
| Phiên | `lib/auth/session.ts` | Cookie `lq_session` = `base64url(payload).base64url(HMAC-SHA256)`, payload `{uid, role, exp}`, hạn 12 h, `httpOnly`, `sameSite=lax`, `secure` khi production. Ký/kiểm bằng Web Crypto (chạy được ở Edge) |
| Phân quyền | `lib/auth/policy.ts` → `canAccess(role, path)` | Khớp theo đoạn đường dẫn. `/login`, `/api/auth/*` mở · `/` mọi vai · `/tickets/*`, `/api/tickets/*` admin + staff · `/gate/*` admin + guard · `/vendors/*`, `/api/vendors/*` chỉ admin (SPEC-P04 §8.1) · `/jobs/*` admin + staff · `/admin/*`, `/dev/*`, `/api/dev/*`, `/zalo`, `/api/zalo/*` chỉ admin · còn lại từ chối |
| Chặn | `middleware.ts` | Chưa đăng nhập ⇒ 307 `/login`; đăng nhập mà không đủ quyền ⇒ 403 |
| Đăng nhập | `app/api/auth/login/route.ts` | Sai ⇒ audit `auth.login.fail`; đúng và tạo được cookie ⇒ audit `auth.login.ok`; thiếu `SESSION_SECRET` ⇒ `auth.login.fail` lý do `no_session_secret`. Input sai kiểu ⇒ 400 |
| Route handler dùng chung | `app/api/_auth.ts` → `requireRole(req, roles)` | Mẫu `app/api/zalo/_shared.ts::requireZaloAdmin`; 401 chưa đăng nhập, 403 sai vai. Dùng bởi mọi route P05-E |

## Dashboard P05-E (SPEC-P04 §8, H14)

Mọi route/trang gọi dịch vụ `@lenqclaw/core/services/{access,slots,dispatch,timers}` qua subpath export (`"./*": "./dist/*.js"` trong `packages/core/package.json` — import KHÔNG có đuôi `.js`, ví dụ `@lenqclaw/core/services/access`); CẤM route tự SQL đổi trạng thái `jobs`/`tickets`.

| Route/trang | Vai | Việc |
| :-- | :-- | :-- |
| `POST /api/tickets/{id}/decision` | admin, staff | `decideAccessRequest`; reject thiếu `note` ⇒ 400 `note_required` TRƯỚC khi vào core; ticket không tồn tại/không phải `access_request` ⇒ 404 (đọc trước, không đổi trạng thái); `ConflictError` ⇒ 409 `ticket_not_open` |
| `POST /api/vendors/{id}/slots/paid` | admin | `grantPaidSlot`; route tự kiểm thợ tồn tại/`active` trước (hàm core không kiểm) ⇒ 404/409 `vendor_not_active`; `SlotUnavailableError` ⇒ 409 `capacity_missing` |
| `POST /api/vendors/{id}/status` | admin | `{status:'active'}`: SQL trực tiếp (không phải trạng thái cuốc/ticket) `vendors.status='pending'→'active'`, 0 dòng ⇒ 409 `vendor_not_pending`. `{status:'suspended', note}`: **Câu hỏi mở** — SPEC-P05 §8.2 gọi core `suspendVendor(...)` nhưng hàm này KHÔNG tồn tại trong `packages/core` (đã rà soát); ghép lại đúng logic bằng các hàm core đã xuất (`releaseHold`/`withdrawConfirmed` cho mọi cuốc `held`/`confirmed`/`access_pending` của thợ), rồi SQL trực tiếp cho `vendors.status`/`vendor_slots.status` (không phải trạng thái cuốc/ticket nên không phạm §8.2) |
| `POST /api/vendors/capacity` | admin | `upsert slot_capacity`, audit `slot.capacity_set` |
| `POST /api/dev/sim/tick` | admin, `DATA_MODE=sim` | `runTimers(now)` rồi `sim.simDeliver()`; `now` không parse được ⇒ 400 |
| `/tickets` | admin, staff | 3 khối: `access_request` `open` (form Duyệt/Từ chối, lý do bắt buộc khi từ chối), ticket khác `open` (chỉ xem), `service_case` `open` (chỉ xem) |
| `/vendors` | admin | Bảng thợ (Duyệt/Đình chỉ) + bảng slot theo (tòa×nhóm nghề): thành viên, slot hết hạn 7 ngày ("cần gỡ khỏi nhóm Zalo"), danh sách chờ, nút "Đã thu phí", form đặt trần |
| `/jobs`, `/jobs/{code}` | admin, staff | Bảng cuốc 7 ngày + dòng thời gian `job_events`/audit `tool.*`/`timer.*`/`system.*` |

## Kênh giả lập `/dev/sim`

Chỉ tồn tại khi `DATA_MODE=sim` (khác ⇒ 404), chỉ `bql_admin`, render động. Ba khung: cư dân (`bql`, thread user), nhóm thợ (`market`, thread group, chọn 1 trong 4 nhóm nghề `sim-market-<trade_group>`), DM thợ (`market`, thread user, nhập `sender_uid`); tự làm mới; nút phát lại kịch bản (qua `agent.routeInboundEvent`) và nút "Tick đồng hồ" (`POST /api/dev/sim/tick`). API: `/api/dev/sim/{send,thread,replay,tick}` — `account` chỉ nhận `bql|market`, `thread_type` chỉ `user|group`, `senderUid='system'` bị từ chối (400 `reserved_sender`, dành riêng cho `enqueueSystemEvent`); mọi thao tác audit `sim.*`.

## Kết nối Zalo `/zalo` (P02 giai đoạn 1)

Chỉ `bql_admin`. Hiện trạng thái từng tài khoản (banner đỏ khi `kicked`/`dead`/`logged_out`), ảnh QR còn hạn, tự làm mới 3 s. `POST /api/zalo/{account}/login` đặt `zalo_accounts.login_requested_at` để worker mở QR; `GET /api/zalo/status`. Trạng thái QR (SPEC-P02 §9.8, cột `qr_state`): chờ quét → "đã quét, chờ xác nhận trên điện thoại" → hết hạn/bị từ chối (không tự xin QR mới), kèm đồng hồ còn hạn; logic hiển thị thuần ở `app/zalo/display.ts`. Nút "Đăng xuất" có hộp xác nhận nói rõ G18; `POST /api/zalo/{account}/logout` (chỉ `bql_admin`) xoá `session_enc` + `qr_*`, đặt `logged_out` và `logout_requested_at` trong CÙNG câu lệnh (worker không chạy vẫn không để phiên mồ côi), audit `zalo.logout` ghi ở web. Test DB web chạy tuần tự (`fileParallelism: false`, G24).

## Chạy

`DATA_MODE=sim SESSION_SECRET=<chuỗi dài> DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lenqclaw npm run dev -w @lenqclaw/web` (cổng 3000; máy dev có container khác giữ cổng 3080).
