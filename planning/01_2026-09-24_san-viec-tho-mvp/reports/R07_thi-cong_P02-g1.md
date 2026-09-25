Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude Opus 5.5 (1M) · Bước 0: exit 0 · hiểu việc: cắm Zalo cá nhân thật cho tài khoản `bql` (zca-js pin, fake trong test) + runner `core:run` + web `/zalo` + `dev:link-zalo` + migration 004 / xong khi ci·typecheck·build·test·test:db(DB rỗng)·gate exit 0, 0 skip, số test > nền / cấm chạm specs·docs·brain·scripts·evals·agent·sim·.env*, cấm mạng Zalo thật, cấm in bí mật
Handoff: handoffs/H07_thi-cong_P02-g1.md
Base: 31a5f3e764aaecd1b58076eb6e577390bf4843e8
Head: 09730bf

## 1. Lệnh + exit code (nguyên văn)
| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| nền | `npm test` · `DATABASE_URL=…/lq_h07 npm run test:db` @Base | 0 · 0 | [baseline](../evidence/P02/baseline.txt) |
| ci | `npm ci` | 0 | [ci](../evidence/P02/ci.txt) |
| a | DB rỗng `npm run db:migrate` ⇒ `applied: 4` | 0 | [migrate](../evidence/P02/migrate.txt) |
| — | `npm run typecheck` | 0 | [typecheck](../evidence/P02/typecheck.txt) |
| — | `npm run build` (không có `DATABASE_URL`) | 0 | [build](../evidence/P02/build.txt) |
| — | `npm test` | 0 | [test](../evidence/P02/test.txt) |
| — | DB rỗng `DATABASE_URL=…/lq_h07 npm run test:db` | **1** | [test-db](../evidence/P02/test-db.txt) |
| — | phần còn lại của chuỗi (bị `&&` chặn): `test:db -w web` · `test:db -w zalo-worker` | 0 · 0 | [test-db-rest](../evidence/P02/test-db-rest.txt) |
| — | `npm run gate` | 0 | [gate](../evidence/P02/gate.txt) |
| b | `npm run zalo:worker` khi không có `ZALO_SESSION_KEY` | 1 (đúng yêu cầu) | [red-no-session-key](../evidence/P02/red-no-session-key.txt) |
| b | `npx tsx apps/zalo-worker/src/tools/pacer-sim.ts 2026` (50 tin/20 người) ⇒ `violations: 0` | 0 | [pacer-sim](../evidence/P02/pacer-sim.txt) |
| — | `git grep -nE "cookie\|imei" -- apps/zalo-worker/src \| grep -i log` | 13 dòng khớp, 0 dòng log bí mật (xem §5) | — |
| — | `grep -cP '[\x08\x0c\x0b]'` trên mọi file đã sửa | 0 | — |

`test:db` đỏ vì đúng MỘT ca: `packages/core/src/dbtests/p01.db.test.ts` đặt cứng `expect(result.applied).toBe(3)`, mà migration 004 do handoff yêu cầu làm con số này thành 4. File nằm ngoài phạm vi ⇒ KHÔNG sửa, xem §6 câu 1.

## 2. Test tổng/pass/fail/skip
| Lệnh | Nền (Base) | Sau | Fail | Skip |
| :-- | :-- | :-- | :-- | :-- |
| `npm test` (web/zalo-worker/core) | 17/0/173 = 190 | 19/37/173 = **229** | 0 | 0 |
| `test:db` core (DB rỗng) | 74 | **81** (80 pass) | 1 (p01 `applied=3`) | 0 |
| `test:db` web | 2 | **7** | 0 | 0 |
| `test:db` zalo-worker | 0 (echo) | **22** | 0 | 0 |

Bảng mục SPEC-P02 → test:
| Mục | Test |
| :-- | :-- |
| §8 tin trùng 3 lần ⇒ 1 dòng | `p02-worker.db` "tin trung 3 lan" |
| §8 50 tin/20 người không vi phạm §5 | `pacer-policy.test` (5 seed + bộ đo ĐỎ trên pacer không giới hạn, cả 3 luật) · `p02-worker.db` "50 tin / 20 nguoi qua outbox that" · pacer-sim |
| §8 đóng 3003 ⇒ kicked, không tự đăng nhập lại, có báo động | `p02-worker.db` "dong 3003", "dong 3000" |
| §8 nhân viên gửi tay ⇒ tin bot kế tiếp `cancelled` (khẩn cấp vẫn gửi) | `p02-worker.db` "is_self KHONG khop outbox" |
| §9.3 mã hoá (sai khoá/sai tài khoản/bị sửa ⇒ lỗi, không lộ bản rõ) | `crypto.test` (9) |
| §9.3 thiếu/sai khoá ⇒ exit 1 | `main.test` (3) · red-no-session-key |
| §2.4 CAS `session_enc` + đồng bộ cookie | `p02-worker.db` "CAS session_enc" |
| §2.3/§9.2 QR ⇒ lưu SAU khi gọi thử API đọc; QR TTL 3 phút; probe lỗi ⇒ không lưu | `p02-worker.db` "login_requested_at ⇒ QR…", "API doc thu THAT BAI" |
| §3.2 `is_self` khớp outbox ⇒ không tiếp quản | `p02-worker.db` "is_self KHOP outbox" |
| §9.1 ảnh ⇒ nội dung thay thế | `inbound.test` · `p02-worker.db` "tin anh" |
| §3.6/§5 "đã xem" chỉ khi đã nhận diện, trễ 2–6 s | `p02-worker.db` "da xem" |
| §5 tách ≤1.800 ký tự, đúng thứ tự · không trả msgId/mã 221 ⇒ giữ queued, lùi 30 phút · nhóm ⇒ cancelled | `p02-worker.db` pacer (4 ca) · `pacer-policy.test` |
| §6 1006 ⇒ lùi 5 s→5 phút; >10 lần ⇒ dead; cookie hết hạn ⇒ logged_out; im 20 phút trong 7–22h ⇒ probe | `watchdog.test` · `p02-worker.db` (5 ca) |
| §9.2 runner: inbound ⇒ outbox, xử lý tối đa một lần, dừng êm | `p02-runner.db` (3) |
| §9.4 dev:link-zalo: uid mới nhất chưa có danh tính; `DATA_MODE≠sim` ⇒ exit 1 | `p02-link-zalo.db` (4) |
| §9.2 web 401/403/200, market ⇒ 404, QR hết hạn không trả, không lộ `session_enc` | `zalo-login.db` (5) · `app/api/zalo/policy.test` (2) |

## 3. `git diff --stat 31a5f3e..09730bf` + SHA
[diff-stat](../evidence/P02/diff-stat.txt) — 43 file, +3956/−17 · `a60731e` feat(zalo-worker): real Zalo transport for bql via zca-js 2.2.0 · `15f1dc4` feat(core): core:run inbound runner and dev:link-zalo · `09730bf` feat(web): /zalo page and POST /api/zalo/{account}/login.
Ngoài `app/zalo` + `app/api/zalo/**`: `apps/web/lib/auth/policy.ts` (+4 dòng: `/zalo`, `/api/zalo` chỉ cho `bql_admin` — không có dòng này thì middleware trả 403 cho mọi vai) và `apps/web/app/page.tsx` (+1 liên kết). Cả hai thuộc "liên kết tới chúng".

**zca-js pin: `2.2.0`** (`npm view zca-js version` = 2.2.0 lúc thi công; `apps/zalo-worker/package.json` ghi `"zca-js": "2.2.0"`, không `^`). Đã đối chiếu `.d.ts` của bản đã cài: `Zalo.login/loginQR`, `LoginQRCallbackEventType`, `listener.on(message|undo|closed|error)` + `start({retryOnClose})`, `sendMessage ⇒ {message:{msgId}|null}`, `sendTypingEvent`, `sendSeenEvent(params, type)`, `fetchAccountInfo`, `getContext().cookie.toJSON()`. Lệch: `index.d.ts` gốc viết `export * from "./dist"`, dạng này không phân giải được dưới NodeNext ⇒ đã thêm `paths` trong `apps/zalo-worker/tsconfig.json` (chỉ ảnh hưởng kiểu, runtime dùng `exports`).

**Biến env mới (SO thêm vào `.env.example`)**: `ZALO_ACCOUNTS` (mặc định `bql`; có `market` ⇒ exit 1) · `PACER_THREAD_GAP_MS=3000` · `PACER_THREAD_JITTER_MS=2000` · `PACER_MAX_PER_MINUTE=10` · `PACER_MAX_RECIPIENTS=15` · `PACER_RECIPIENT_WINDOW_MS=600000` · `PACER_MAX_CHARS=1800` · `PACER_TYPING_MIN_MS=1000` · `PACER_TYPING_MAX_MS=3000` · `PACER_SEEN_MIN_MS=2000` · `PACER_SEEN_MAX_MS=6000` · `PACER_BACKOFF_MS=1800000` · `PACER_TICK_MS=1000`. Dùng lại biến có sẵn: `ZALO_SESSION_KEY` (32 byte, hex 64 ký tự hoặc base64), `DATABASE_URL`, `DATA_MODE`, `BQL_HOTLINE`.

## 4. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| b: mã hoá phiên, lưu credentials, watchdog | 🔴 | Claude Opus 5.5 |
| a, c, d, e, b (pacer, luồng vào) | 🟠 | Claude Opus 5.5 (không tách agent con; tầng cao hơn yêu cầu) |
| f: hướng dẫn chạy thử | 🟢 | Claude Opus 5.5 |
| thẩm định nội bộ | — | chưa có. Thẩm định nghiệm thu cần một agent khác |

## 5. Việc KHÔNG làm + lý do
- Không sửa `packages/core/src/dbtests/p01.db.test.ts` (ngoài phạm vi) ⇒ `test:db` exit 1 (§6 câu 1).
- `git grep cookie|imei … | grep -i log`: 13 dòng khớp. Toàn bộ là comment "CẤM log", biến đếm `cookieLogins` của fake/test, chuỗi con "login" và "logging:false". Không có lệnh log nào in cookie/imei. `log.ts` chỉ nhận trường vô hại; lỗi của zca-js được phân loại lại thành thông điệp ngắn tự viết.
- Không kết nối Zalo thật; phần "Người" của §9.5 (`evidence/P02/live.txt`) chờ SO + người dùng.
- Không chặn cứng việc chạy 2 bản worker/runner (advisory lock). §9.6 chỉ là luật vận hành.
- Không bật `market`, không gom tin 2,5 s, không tải ảnh (§9.1/§9.2).
- DB `lq_h07` bị drop sau khi xong. Không để lại server/worker nào đang chạy.

## 6. Câu hỏi mở (cần người)
1. **Chặn `test:db`:** `p01.db.test.ts` dòng `expect(result.applied).toBe(3)` (và tiêu đề ca) cần đổi thành 4 vì có migration 004. SO sửa hoặc cấp quyền cho sửa.
2. **§5 vs SPEC-P03 handoff:** §5 nói "thread đang `human_takeover_until` ⇒ hủy tin bot". Nhưng `handoff_to_staff` của agent cũng đặt takeover rồi gửi câu trả lời, nên làm đúng chữ thì câu "em đã chuyển BQL" sẽ bị hủy. Đã làm: chỉ hủy khi takeover còn hạn **và** có tin nhân viên gửi tay (`payload.staff_manual=true`) trong 30 phút. Ca này có test: "takeover do agent ⇒ tin bot KHÔNG bị hủy". Cần chốt; nếu lật thì bỏ điều kiện `exists … staff_manual` trong `store.fetchDue`.
3. `.env.example` đang có `PACER_MAX_PER_MINUTE=20` (trái §5 = 10) và `PACER_MIN_INTERVAL_MS=1500` (không có trong spec, worker bỏ qua). Nếu chép nguyên sang `.env` thì pacer cho 20 tin/phút.
4. `outbox` không có cột `sent_at` ⇒ khi khởi động lại, pacer nạp lịch sử theo `created_at` (xấp xỉ). Cần cột mới thì phải có Đ + migration.
5. Hành vi chưa có trong spec, đã chọn phương án an toàn: lỗi gửi không phải giới hạn ⇒ thử lại sau 30 s, quá 5 lần ⇒ `failed`. Đồng bộ cookie mỗi 10 phút. `ZaloApiError` khi đăng nhập lại ⇒ coi là cookie hết hạn (`logged_out`), lỗi khác ⇒ lỗi mạng. Tin `image` trong outbox ⇒ `failed`.
6. `createTransport()` trong `adapters/transport.ts` (ngoài phạm vi) vẫn ném lỗi với `TRANSPORT=zalo`. Hiện không tiến trình nào gọi nó, nên cứ để `TRANSPORT=sim` cho web.

## 7. Hướng dẫn chạy thử người (PowerShell, từ root; KHÔNG in `.env`)
```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d db
$env:DATABASE_URL="postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lenqclaw"; $env:DATA_MODE="sim"
npm ci; npm run build                      # core dist cần cho worker/runner
npm run db:migrate                         # ⇒ applied: 1 (004) trên DB dev đã có 001–003
npm run db:seed; npm run db:seed:sim
npm run create-admin -- --email admin@local --role bql_admin   # gõ mật khẩu qua stdin
# ZALO_SESSION_KEY trong .env phải là 32 byte thật; tạo mới (chỉ ghi vào .env, không dán vào chat):
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Cửa sổ 1 — web:
$env:SESSION_SECRET="<>=32 ký tự>"; npm run dev -w @lenqclaw/web
# Cửa sổ 2 — runner (cần key model trong .env):
node --env-file=.env --import tsx packages/core/src/runner/inbound-runner.ts     # = npm run core:run + nạp .env
# Cửa sổ 3 — worker (đúng MỘT bản):
node --env-file=.env --import tsx apps/zalo-worker/src/main.ts                  # = npm run zalo:worker + nạp .env
# Trình duyệt: http://localhost:3000/login (admin) → /zalo → "Đăng nhập bằng QR" → quét bằng Zalo PHỤ trong ≤3 phút ⇒ "Đã kết nối"
# Từ Zalo cá nhân nhắn tài khoản bql ⇒ REGISTER_REPLY; rồi:
npm run dev:link-zalo -- --account bql --resident sim-res-1
# Nhắn "vòi bồn rửa nhà em bị rỉ nước" ⇒ agent trả lời ≤30 s; "nhà em bốc khói" ⇒ EMERGENCY_REPLY. Ghi evidence/P02/live.txt
# Dừng: Ctrl+C từng cửa sổ (worker/runner dừng êm, exit 0).
```
Lưu ý: `npm run zalo:worker`/`core:run` KHÔNG tự nạp `.env` (giống các script cũ) — hoặc đặt `$env:` từng biến, hoặc dùng lệnh `node --env-file=.env` như trên. Không mở Zalo Web/PC bằng tài khoản bql (G01 ⇒ `kicked`, banner đỏ, phải QR lại).

Tiếp theo
🖐 Cần tay người: chốt §6 câu 1 (p01 `applied` 3→4) và câu 2 (luật hủy khi takeover); quét QR bằng Zalo phụ theo §7.
🤖 Agent làm được ngay: sửa 1 dòng p01 khi được cấp quyền, chạy lại `test:db` trên DB rỗng.
⭐ Nên làm trước: câu 1 — đây là thứ duy nhất đang làm `test:db` đỏ.
⏸ Chưa làm: chạy thật với Zalo (live.txt), advisory lock chống chạy 2 bản, cột `sent_at` — lý do ở §5/§6.

⏳ Chờ người duyệt.

🔁 SỬA: test:db đỏ — p01.db.test.ts ghi cứng applied=3 (SO cấp quyền sửa, đổi thành đếm số file migration); Q2/Q4/Q5/Q6 chốt ở SPEC-P02 §9.7 · SO · 2026-09-25 12:05:23
