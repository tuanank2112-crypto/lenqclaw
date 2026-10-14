# zalo-worker — `apps/zalo-worker` (`@lenqclaw/zalo-worker`)

Tiến trình dài hạn giữ phiên Zalo cá nhân qua `zca-js` (pin đúng `2.2.0`), chạy **đúng một bản sao**. Không chứa logic nghiệp vụ; nói với core chỉ qua bảng `inbound_events`, `outbox`, `zalo_accounts`. Hợp đồng: [SPEC-P02 (kế hoạch 02)](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P02-Transport-Nhom.md) · nền transport ở [kế hoạch 01](../planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P02-Zalo-Transport.md).

Trạng thái: **P01 kế hoạch 02 xong** — tài khoản duy nhất là `community` (`ZALO_ACCOUNTS=community`; giá trị khác ⇒ exit 1), chỉ text, chỉ thread `user` (tin nhóm chưa lưu, outbox nhóm bị huỷ `group_forbidden_phase1` cho tới P02). `isIdentified` = owner (`account_owners`) ∪ thành viên nhóm còn hiệu lực (`group_members.left_at is null`); `staff_takeover` huỷ mọi tin bot (không còn ngoại lệ khẩn cấp); `markSent` ghi `sent_at`; `OutboxRow` không còn `job_id`. Đăng xuất + trạng thái QR (H09 kế hoạch 01): web đặt `logout_requested_at` ⇒ worker ở nhịp quét 2 s dừng listener/pacer tài khoản đó; zca-js vẫn không có API đăng xuất phía máy chủ (G18). Worker ghi `qr_state` theo sự kiện QR (`waiting_scan`/`scanned`/`expired`/`declined`, đăng nhập xong ⇒ null). Thi hành `action`/`react`, tin nhóm, `group_event`, ngân sách theo nhóm: SPEC-P02.

## Cấu trúc

| File | Vai trò |
| :-- | :-- |
| `src/main.ts` | Khởi động: kiểm `ZALO_SESSION_KEY` (32 byte, thiếu/sai ⇒ exit 1), dựng phiên cho từng tài khoản, pacer, watchdog, dừng êm khi SIGINT |
| `src/client.ts` · `src/zca-client.ts` | `ZaloClientLike` (login cookie, `loginQR`, listener, gửi, đang gõ, đã xem, API đọc nhẹ) + bản thật bọc zca-js; bản giả ở `src/testing/` |
| `src/account-session.ts` | Đăng nhập QR khi `zalo_accounts.login_requested_at` được đặt (quét 2 s); chỉ lưu `session_enc` sau khi gọi thử API đọc thành công; đồng bộ cookie 10 phút, ghi theo compare-and-set `updated_at` |
| `src/crypto.ts` | AES-256-GCM, IV ngẫu nhiên mỗi lần; bản rõ `{cookie, imei, userAgent}` không bao giờ ra log |
| `src/inbound.ts` | Chuẩn hoá tin ⇒ `inbound_events` (chống trùng); `is_self` không khớp outbox ⇒ `human_takeover_until` +30 phút; tin không phải text ⇒ nội dung thay thế; tin nhóm chưa lưu (P02) |
| `src/pacer.ts` · `src/pacer-policy.ts` | Gửi outbox theo bảng SPEC-P02 §5 (env `PACER_*`); huỷ tin bot chỉ khi nhân viên gửi tay (§9.7) |
| `src/watchdog.ts` | 3000/3003 ⇒ `kicked`, không tự đăng nhập lại; 1006 ⇒ `reconnecting` lùi 5 s→5 phút, >10 lần ⇒ `dead`; im 20 phút (7–22h) ⇒ gọi API đọc |
| `src/log.ts` | Log một dòng JSON, chỉ trường không bí mật |
| `src/tools/pacer-sim.ts` | Giả lập 50 tin/20 người, in vi phạm bảng §5 |

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
- CẤM log cookie/imei/userAgent; CẤM mở Zalo Web/PC bằng tài khoản bot (G01); CẤM chạy hai bản worker.
- Đổi số pacer ⇒ ghi `brain4agent/-known-gotchas.md` kèm lý do (SPEC-P02 §5).
