# web — `apps/web` (`@lenqclaw/web`)

Dashboard (Next.js 15 App Router) + màn chat giả lập `/dev/sim` + `/zalo` (QR). Hợp đồng: [SPEC-P01 §3, §3.1](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P01-Go-San-Tho.md) · [SPEC-P08](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P08-Dashboard.md). Trạng thái: **P01 kế hoạch 02 xong** — mọi trang/route sàn thợ (`/tickets`, `/gate`, `/vendors`, `/jobs`, các API tương ứng) đã gỡ (còn trong tag `archive/plan-01-marketplace`); trang chủ tạm, `/zalo`, `/dev/sim` còn lại; dashboard cộng đồng (nhóm, persona, thẻ duyệt, lead, kiểm duyệt, tri thức, lịch, dòng thời gian agent) là P08.

## Auth

| Thành phần | File | Hành vi |
| :-- | :-- | :-- |
| Phiên | `lib/auth/session.ts` | Cookie `lq_session` = `base64url(payload).base64url(HMAC-SHA256)`, payload `{uid, role, exp}`, hạn 12 h, `httpOnly`, `sameSite=lax`, `secure` khi production. Ký/kiểm bằng Web Crypto (chạy được ở Edge) |
| Phân quyền | `lib/auth/policy.ts` → `canAccess(role, path, method='GET')` | 2 vai `admin`/`operator`; khớp theo đoạn đường dẫn. `/login`, `/api/auth/*` mở · `/` mọi vai · `/groups`, `/persona`, `/knowledge`, `/automations` (+ `/api/…`): admin đủ quyền, operator chỉ đọc (GET/HEAD; ghi ⇒ từ chối) · `/approvals`, `/leads`, `/moderation` (+ `/api/…`), `/agent`: cả hai vai · `/zalo`, `/api/zalo/*`, `/dev/*`, `/api/dev/*`, `/admin/*`: chỉ admin · còn lại từ chối. `middleware.ts` truyền `req.method` |
| Chặn | `middleware.ts` | Chưa đăng nhập ⇒ 307 `/login`; đăng nhập mà không đủ quyền ⇒ 403 |
| Đăng nhập | `app/api/auth/login/route.ts` | Sai ⇒ audit `auth.login.fail`; đúng và tạo được cookie ⇒ audit `auth.login.ok`; thiếu `SESSION_SECRET` ⇒ `auth.login.fail` lý do `no_session_secret`. Input sai kiểu ⇒ 400 |
| Route handler dùng chung | `app/api/_auth.ts` → `requireRole(req, roles)` | Mẫu `app/api/zalo/_shared.ts::requireZaloAdmin`; 401 chưa đăng nhập, 403 sai vai. Dùng bởi `/api/dev/sim/tick` |

## Kênh giả lập `/dev/sim`

Chỉ tồn tại khi `DATA_MODE=sim` (khác ⇒ 404), chỉ `admin`, render động. P01: hai khung — DM (`community`, thread `sim-dm-1`, người gửi `sim-mem-1`) và nhóm `sim-group-1` (nhập `sender_uid` người đang gõ); tự làm mới; nút phát lại kịch bản (qua `agent.routeInboundEvent`, hiện là khung router) và nút "Tick đồng hồ" (`POST /api/dev/sim/tick` ⇒ `runTimers(now)` khung, trả `{steps: {}, delivered}`). Giao diện nhóm đầy đủ là P02. API: `/api/dev/sim/{send,thread,replay,tick}` — `account` chỉ nhận `community`, `thread_type` chỉ `user|group`, `senderUid='system'` bị từ chối (400 `reserved_sender`); mọi thao tác audit `sim.*`.

## Kết nối Zalo `/zalo`

Chỉ `admin`. Hiện trạng thái tài khoản `community` (banner đỏ khi `kicked`/`dead`/`logged_out`), ảnh QR còn hạn, tự làm mới 3 s. `POST /api/zalo/{account}/login` đặt `zalo_accounts.login_requested_at` để worker mở QR; `GET /api/zalo/status`. Trạng thái QR (SPEC-P02 §9.8, cột `qr_state`): chờ quét → "đã quét, chờ xác nhận trên điện thoại" → hết hạn/bị từ chối (không tự xin QR mới), kèm đồng hồ còn hạn; logic hiển thị thuần ở `app/zalo/display.ts`. Nút "Đăng xuất" có hộp xác nhận nói rõ G18; `POST /api/zalo/{account}/logout` (chỉ `admin`) xoá `session_enc` + `qr_*`, đặt `logged_out` và `logout_requested_at` trong CÙNG câu lệnh (worker không chạy vẫn không để phiên mồ côi), audit `zalo.logout` ghi ở web. Test DB web chạy tuần tự (`fileParallelism: false`, G24).

## Chạy

`DATA_MODE=sim SESSION_SECRET=<chuỗi dài> DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:15432/lenqclaw npm run dev -w @lenqclaw/web` (cổng 3000; máy dev có container khác giữ cổng 3080).
