# web — `apps/web` (`@lenqclaw/web`)

Dashboard BQL (Next.js 15 App Router) + màn chat giả lập `/dev/sim`. Hợp đồng: [SPEC-P01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P01-Foundation.md) §6–§7 · [SPEC-P04](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P04-Vendor-Console.md). Trạng thái 2026-09-25: P01 xong — đăng nhập 3 vai, trang tạm `/tickets`, `/gate`, `/dev/sim`; P02 giai đoạn 1 thêm `/zalo`; dashboard thật là P04.

## Auth

| Thành phần | File | Hành vi |
| :-- | :-- | :-- |
| Phiên | `lib/auth/session.ts` | Cookie `lq_session` = `base64url(payload).base64url(HMAC-SHA256)`, payload `{uid, role, exp}`, hạn 12 h, `httpOnly`, `sameSite=lax`, `secure` khi production. Ký/kiểm bằng Web Crypto (chạy được ở Edge) |
| Phân quyền | `lib/auth/policy.ts` → `canAccess(role, path)` | Khớp theo đoạn đường dẫn. `/login`, `/api/auth/*` mở · `/` mọi vai · `/tickets/*` admin + staff · `/gate/*` admin + guard · `/admin/*`, `/dev/*`, `/api/dev/*`, `/zalo`, `/api/zalo/*` chỉ admin · còn lại từ chối |
| Chặn | `middleware.ts` | Chưa đăng nhập ⇒ 307 `/login`; đăng nhập mà không đủ quyền ⇒ 403 |
| Đăng nhập | `app/api/auth/login/route.ts` | Sai ⇒ audit `auth.login.fail`; đúng và tạo được cookie ⇒ audit `auth.login.ok`; thiếu `SESSION_SECRET` ⇒ `auth.login.fail` lý do `no_session_secret`. Input sai kiểu ⇒ 400 |

## Kênh giả lập `/dev/sim`

Chỉ tồn tại khi `DATA_MODE=sim` (khác ⇒ 404), chỉ `bql_admin`, render động. Hai khung cư dân (`bql`, thread user) và nhóm thợ (`market`, thread group, chọn `sender_uid`), tự làm mới; nút phát lại kịch bản trong `evals/scenarios/`. API: `/api/dev/sim/{send,thread,replay}` — `account` chỉ nhận `bql|market`, `thread_type` chỉ `user|group`; mọi thao tác audit `sim.*`.

## Kết nối Zalo `/zalo` (P02 giai đoạn 1)

Chỉ `bql_admin`. Hiện trạng thái từng tài khoản (banner đỏ khi `kicked`/`dead`/`logged_out`), ảnh QR còn hạn, tự làm mới 3 s. `POST /api/zalo/{account}/login` đặt `zalo_accounts.login_requested_at` để worker mở QR; `GET /api/zalo/status`. Trạng thái QR (SPEC-P02 §9.8, cột `qr_state`): chờ quét → "đã quét, chờ xác nhận trên điện thoại" → hết hạn/bị từ chối (không tự xin QR mới), kèm đồng hồ còn hạn; logic hiển thị thuần ở `app/zalo/display.ts`. Nút "Đăng xuất" có hộp xác nhận nói rõ G18; `POST /api/zalo/{account}/logout` (chỉ `bql_admin`) xoá `session_enc` + `qr_*`, đặt `logged_out` và `logout_requested_at` trong CÙNG câu lệnh (worker không chạy vẫn không để phiên mồ côi), audit `zalo.logout` ghi ở web. Test DB web chạy tuần tự (`fileParallelism: false`, G24).

## Chạy

`DATA_MODE=sim SESSION_SECRET=<chuỗi dài> DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lenqclaw npm run dev -w @lenqclaw/web` (cổng 3000; máy dev có container khác giữ cổng 3080).
