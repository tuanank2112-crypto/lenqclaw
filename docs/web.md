# web — `apps/web` (`@lenqclaw/web`)

Dashboard BQL (Next.js 15 App Router) + màn chat giả lập `/dev/sim`. Hợp đồng: [SPEC-P01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P01-Foundation.md) §6–§7 · [SPEC-P04](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P04-Vendor-Console.md). Trạng thái: P01 xong — đăng nhập 3 vai, trang tạm `/tickets`, `/gate`, và `/dev/sim`; dashboard thật là P04.

## Auth

| Thành phần | File | Hành vi |
| :-- | :-- | :-- |
| Phiên | `lib/auth/session.ts` | Cookie `lq_session` = `base64url(payload).base64url(HMAC-SHA256)`, payload `{uid, role, exp}`, hạn 12 h, `httpOnly`, `sameSite=lax`, `secure` khi production. Ký/kiểm bằng Web Crypto (chạy được ở Edge) |
| Phân quyền | `lib/auth/policy.ts` → `canAccess(role, path)` | Khớp theo đoạn đường dẫn. `/login`, `/api/auth/*` mở · `/` mọi vai · `/tickets/*` admin + staff · `/gate/*` admin + guard · `/admin/*`, `/dev/*`, `/api/dev/*` chỉ admin · còn lại từ chối |
| Chặn | `middleware.ts` | Chưa đăng nhập ⇒ 307 `/login`; đăng nhập mà không đủ quyền ⇒ 403 |
| Đăng nhập | `app/api/auth/login/route.ts` | Sai ⇒ audit `auth.login.fail`; đúng và tạo được cookie ⇒ audit `auth.login.ok`; thiếu `SESSION_SECRET` ⇒ `auth.login.fail` lý do `no_session_secret`. Input sai kiểu ⇒ 400 |

## Kênh giả lập `/dev/sim`

Chỉ tồn tại khi `DATA_MODE=sim` (khác ⇒ 404), chỉ `bql_admin`, render động. Hai khung cư dân (`bql`, thread user) và nhóm thợ (`market`, thread group, chọn `sender_uid`), tự làm mới; nút phát lại kịch bản trong `evals/scenarios/`. API: `/api/dev/sim/{send,thread,replay}` — `account` chỉ nhận `bql|market`, `thread_type` chỉ `user|group`; mọi thao tác audit `sim.*`.

## Chạy

`DATA_MODE=sim SESSION_SECRET=<chuỗi dài> DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lenqclaw npm run dev -w @lenqclaw/web` (cổng 3000; máy dev có container khác giữ cổng 3080).
