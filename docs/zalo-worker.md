# zalo-worker — `apps/zalo-worker` (`@lenqclaw/zalo-worker`)

Tiến trình dài hạn giữ phiên Zalo cá nhân qua `zca-js` cho hai tài khoản `bql` và `market`, chạy **đúng một bản sao**. Không chứa logic nghiệp vụ; nói với core chỉ qua bảng `inbound_events`, `outbox`, `zalo_accounts`.

Trạng thái 2026-09-24: **khung rỗng** (P01). Việc thật là P02 — [SPEC-P02](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P02-Zalo-Transport.md) — làm sau khi agent chạy trọn trên kênh giả lập (Đ13). Trong lúc đó `TRANSPORT=sim` (mặc định) và mọi tin đi qua `SimTransport` của [core](core.md).

Trước khi làm P02 đọc `brain4agent/-known-gotchas.md` mục G01–G07 (một phiên web, listener chết im lặng, UID theo tài khoản nhìn, giới hạn gửi, IP datacenter, lịch sử nhóm đã chết, pin phiên bản).
