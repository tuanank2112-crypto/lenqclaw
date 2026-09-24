# SPEC-P01 — Nền tảng + SimTransport

> Đọc sau `00-ARCHITECTURE.md` và `01-CONTRACTS.md` §1–§4, §8, §9. File này chốt các quyết định P01 mà 01-CONTRACTS chưa nói; mâu thuẫn ⇒ 01-CONTRACTS thắng, ghi "Câu hỏi mở" vào `plan.md`.
> Tầng: 🟠 thi công (quyết định đã chốt ở đây, 🔴, 2026-09-24).

## §1. Công cụ & workspace

| Hạng mục | Chốt | Lý do |
| :-- | :-- | :-- |
| Node | `engines.node >=22`; chạy được trên 22 và 24 | Đ06; máy dev có Node 24 |
| Workspaces | root `package.json` `workspaces: ["apps/*","packages/*"]`; tên gói `@lenqclaw/core`, `@lenqclaw/web`, `@lenqclaw/zalo-worker` | 01-CONTRACTS §1 |
| TS | `tsconfig.base.json` `strict: true`, `module/moduleResolution: NodeNext` cho core & worker; web dùng cấu hình Next | |
| Chạy TS trực tiếp | `tsx` (dev dependency) cho script CLI của core | không build trước khi chạy migrate/seed |
| Test | `vitest` ở mọi workspace. `npm test` = test KHÔNG cần DB/LLM/mạng. `npm run test:db` = test cần Postgres, đọc `DATABASE_URL`; thiếu biến ⇒ **exit 1 kèm thông báo**, CẤM skip | TESTING §1 đòi 0 skip |
| Phiên bản | mọi `package.json` = `0.0.1` (lên `0.1.0` khi đóng hồ sơ 01) | AGENTS.md §4 |
| Dòng kết thúc | `.gitattributes`: `* text=auto eol=lf` | cây đang báo LF→CRLF |

Script root BẮT BUỘC: `typecheck` · `build` · `test` · `test:db` · `db:migrate` · `db:seed` · `create-admin` · `gate` (= chạy tuần tự 5 lệnh TESTING §1, dừng ở lệnh đỏ đầu tiên, exit ≠0 nếu có đỏ).

## §2. Postgres dev & compose

- `compose.yaml` ở root: service `db` = `pgvector/pgvector:pg16`, volume `pgdata`, KHÔNG publish cổng (OPERATIONS §2).
- `compose.dev.yaml`: chỉ thêm `ports: ["127.0.0.1:55432:5432"]` cho `db` + user/pass/db `lenqclaw`. Lệnh dev: `docker compose -f compose.yaml -f compose.dev.yaml up -d db`.
- `.env.example` liệt kê đủ biến OPERATIONS §3 (giá trị giả). `.env` không commit.
- Service `web`/`worker`/`jobs`/`caddy` trong compose: CHƯA làm ở P01 (P07).

## §3. Migrations & seed

- `db/migrations/001_init.sql` = toàn bộ DDL 01-CONTRACTS §4, sắp lại thứ tự để FK hợp lệ (`job_categories` trước `vendor_skills`; `tickets` tạo sau `jobs`, rồi `ALTER TABLE jobs ADD CONSTRAINT … FOREIGN KEY (case_ticket_id|access_ticket_id) REFERENCES tickets`). Thêm `create extension if not exists pgcrypto` (cho `gen_random_uuid` an toàn mọi bản). Thêm `CHECK` cho `jobs.status` đúng tập trạng thái §5 của 01-CONTRACTS.
- Runner: `packages/core/src/db/migrate.ts` (gọi qua `adapters/db.ts`, BB-07). Bảng `schema_migrations(version text primary key, checksum text not null, applied_at timestamptz default now())`. Mỗi file một transaction. File đã áp mà checksum (sha256) đổi ⇒ **dừng, exit 1** (migration chỉ được thêm — OPERATIONS §7). Chạy lại ⇒ `applied: 0`.
- Seed `packages/core/src/db/seed.ts`, idempotent (`on conflict do nothing`), chỉ dữ liệu nền (OPERATIONS §6.1): 1 organization `Công ty Vận hành Demo`, 1 building `code='TOA-A'`, 20 apartments `A-0101…A-0504` (5 tầng × 4 căn, `floor` đúng), `zalo_accounts` `bql`,`market`, và danh mục `job_categories` dưới đây. Dữ liệu mô phỏng cư dân/thợ/ticket 30 ngày là việc P04, KHÔNG làm ở đây.

| code | name_vi | trade_group | default_mode | emergency |
| :-- | :-- | :-- | :-- | :-- |
| `ong_nuoc_ro` | Rò rỉ đường ống nước | dien_nuoc | fixed | false |
| `thiet_bi_ve_sinh` | Thiết bị vệ sinh hỏng | dien_nuoc | fixed | false |
| `tac_thoat_nuoc` | Tắc thoát nước | dien_nuoc | fixed | false |
| `dien_mat_cuc_bo` | Mất điện cục bộ / nhảy aptomat | dien_nuoc | fixed | false |
| `o_cam_cong_tac` | Ổ cắm, công tắc, đèn | dien_nuoc | fixed | false |
| `khoa_cua` | Khoá cửa, mở khoá | khoa | fixed | false |
| `dieu_hoa_khong_mat` | Điều hoà không mát | dien_lanh | quote | false |
| `dieu_hoa_ve_sinh` | Vệ sinh điều hoà | dien_lanh | fixed | false |
| `binh_nong_lanh` | Bình nóng lạnh | dien_lanh | quote | false |
| `tham_tuong_tran` | Thấm tường, trần | xay_sua | quote | false |
| `cua_ban_le` | Cửa, bản lề, tay nắm | xay_sua | fixed | false |
| `khac` | Việc khác (cần khảo sát) | xay_sua | quote | false |

## §4. Adapter (01-CONTRACTS §2 — chữ ký giữ nguyên)

- `adapters/db.ts`: Pool `pg` tạo **lười** ở lần gọi đầu (build không cần `DATABASE_URL`). `tx(fn)` truyền `q` cùng chữ ký `sql` nhưng chạy trên client của transaction; lỗi ⇒ `ROLLBACK` rồi ném lại. Thêm `closeDb()` cho test/CLI.
- `adapters/model.ts`: `callModel` dùng `@anthropic-ai/sdk`; model = `MODEL_<ROUTE viết hoa>` ?? `MODEL_DEFAULT` ?? `'claude-opus-5'`; `cache_control: {type:'ephemeral'}` trên khối system và tool cuối; 429/5xx sau retry của SDK ⇒ `ModelUnavailableError`; ghi 1 dòng `agent_runs` mỗi lần gọi (kể cả lỗi, `outcome='error'`). Cho test: `setModelClientForTest(fake)`; test unit KHÔNG gọi mạng. Người viết BẮT BUỘC đối chiếu tài liệu SDK hiện hành trước khi viết (tham số, kiểu `Usage`).
- `adapters/transport.ts`: interface `Transport` (01-CONTRACTS §8) + `createTransport()` chọn theo env `TRANSPORT` (`sim` mặc định; `zalo` ⇒ ném lỗi "P02 chưa làm"). **Hàm DUY NHẤT ghi bảng `outbox` là `enqueue` trong file này** (BB-04).

## §5. Lỗi có kiểu & máy trạng thái

- `packages/core/src/domain/errors.ts`: 8 lớp lỗi 01-CONTRACTS §9, mỗi lớp có `code` chuỗi cố định = tên lớp. Thêm `IllegalTransitionError` (cặp `from→to` không có dòng trong bảng §5) — lỗi lập trình, caller KHÔNG bắt để xử lý tiếp.
- `packages/core/src/domain/types.ts`: kiểu 01-CONTRACTS §6 + `JobStatus` (union đúng các trạng thái §5).
- `packages/core/src/services/job-state.ts`:
  - `export const TRANSITIONS: ReadonlyArray<{from: JobStatus; to: JobStatus}>` — chép đúng bảng §5; dòng "mọi trạng thái trước `in_progress` → `cancelled`" bung ra từng cặp.
  - `export async function transitionJob(q, {jobId, from, to, actorType, actorId, data}): Promise<void>` — cặp không có trong `TRANSITIONS` ⇒ `IllegalTransitionError` (không chạm DB); ngược lại `UPDATE jobs SET status=$to, updated_at=now() WHERE id=$id AND status=$from RETURNING id`; 0 dòng ⇒ `ConflictError`; có dòng ⇒ `INSERT job_events` **trong cùng `q`** (caller truyền `q` của `tx`).
- `packages/core/src/services/audit.ts`: `audit(q, {actorType, actorId, action, target, data})` ⇒ `INSERT audit_log`.

## §6. SimTransport (Đ13) — mức P01: vòng vọng lại, CHƯA có agent

- Vào: `simInbound({account, threadId, threadType, senderUid, text, msgId?})` ⇒ `INSERT inbound_events … ON CONFLICT (zalo_account_id, zalo_msg_id) DO NOTHING`; `msgId` mặc định `sim-<uuid>`; `is_self=false`. Trả `{id, duplicate}`.
- Xử lý: `processInbound(handler, {limit})` lấy `inbound_events` chưa `processed_at` bằng `FOR UPDATE SKIP LOCKED`, gọi `handler`, đặt `processed_at`. Handler P01 = `echoHandler`: `enqueue` tin text `"[sim] đã nhận: <text>"` về đúng thread. P03 thay handler bằng agent — KHÔNG sửa SimTransport.
- Ra: `simDeliver()` chuyển `outbox` `queued → sent` (không pacer; pacer thật là P02), đặt `zalo_msg_id='sim-out-<id>'`.
- Kịch bản: `evals/scenarios/*.jsonl`, mỗi dòng `{"account":"bql"|"market","thread_id":string,"thread_type":"user"|"group","sender_uid":string,"text":string,"msg_id"?:string}`. `runScenario(path)` = với mỗi dòng: `simInbound` → `processInbound(echoHandler)` → `simDeliver`; trả `{inbound, duplicates, outbound}`. Tạo `evals/scenarios/echo.jsonl` (≥5 dòng, cả hai account, có 1 dòng trùng `msg_id`).
- Web `/dev/sim`: chỉ tồn tại khi `DATA_MODE=sim` (khác ⇒ 404) và chỉ cho `bql_admin`. Ba khung: cư dân (account `bql`, thread user), nhóm thợ (account `market`, thread group, ô chọn `sender_uid` đang gõ), link sang dashboard. Mỗi khung hiện `inbound`+`outbox` theo thread, tự làm mới ≤2 s. Nút "Phát lại kịch bản" chạy `runScenario` với file chọn trong `evals/scenarios/`. Mọi thao tác ghi `audit_log` `action='sim.*'`.

## §7. Auth web 3 vai (G03)

- Mật khẩu: `node:crypto` `scrypt`, định dạng `scrypt$<N>$<saltB64>$<hashB64>`, so sánh `timingSafeEqual`. CẤM thư viện native (bcrypt).
- Phiên: cookie `lq_session` = `base64url(payload).base64url(HMAC-SHA256(SESSION_SECRET))`, payload `{uid, role, exp}` hạn 12 h; `httpOnly`, `sameSite=lax`, `secure` khi `NODE_ENV=production`, `path=/`. Thiếu `SESSION_SECRET` lúc chạy ⇒ từ chối đăng nhập (không lúc build).
- Phân quyền: một hàm thuần `canAccess(role: StaffRole | null, pathname: string): boolean` trong `apps/web/lib/auth/policy.ts`, `middleware.ts` gọi nó (Edge: kiểm HMAC bằng Web Crypto). Bảng:

| Đường dẫn | bql_admin | bql_staff | guard | chưa đăng nhập |
| :-- | :-- | :-- | :-- | :-- |
| `/login`, `/api/auth/*` | ✅ | ✅ | ✅ | ✅ |
| `/` (trang chủ tạm) | ✅ | ✅ | ✅ | ⇒ `/login` |
| `/tickets/*` | ✅ | ✅ | ❌ | ⇒ `/login` |
| `/gate/*` (bảo vệ) | ✅ | ❌ | ✅ | ⇒ `/login` |
| `/admin/*`, `/dev/*` | ✅ | ❌ | ❌ | ⇒ `/login` |
| đường khác | ❌ mặc định từ chối | ❌ | ❌ | ⇒ `/login` |

  ❌ khi đã đăng nhập ⇒ 403. `/tickets` và `/gate` ở P01 chỉ là trang tạm có tiêu đề (P04 làm thật).
- Audit BẮT BUỘC: `auth.login.ok`, `auth.login.fail` (target = email, KHÔNG ghi mật khẩu), `auth.logout`.
- `create-admin`: `npm run create-admin -- --email <e> --role <bql_admin|bql_staff|guard>`; mật khẩu đọc từ stdin, CẤM nhận qua tham số dòng lệnh (OPERATIONS §6.2).

## §8. Máy đo P01

- `scripts/check_adapter_boundary.mjs`: quét `apps/**`, `packages/**`, `scripts/**` (bỏ `node_modules`, `.next`, `dist`). Vi phạm: import `pg` ngoài `adapters/db.ts`; import `@anthropic-ai/sdk` ngoài `adapters/model.ts`; import `zca-js` ngoài `adapters/transport.ts` và `apps/zalo-worker/**`; chuỗi `insert into outbox` (không phân biệt hoa thường) ngoài `adapters/transport.ts` và `db/migrations`. In `violations: <n>` + từng dòng `file:line`; n>0 ⇒ exit 1.
- `scripts/check_agent_tools.mjs`: (a) đọc khai báo `type JobCard` trong `domain/types.ts`, khoá cấm `apartment`, `apartment_code`, `apartment_id`, `floor`, `phone`, `resident_phone`, `resident_name`, `full_name`, `access_pass_code` ⇒ `pii_keys_in_jobcard: <n>`; (b) quét `packages/core/src/agent/tools/**` tên tool cấm `exec`, `shell`, `read_file`, `write_file`, `list_contacts`, `approve_ticket`, `update_config` ⇒ `forbidden_tools: <n>` (thư mục chưa có ⇒ 0). Tổng >0 ⇒ exit 1.
- Mỗi máy đo mới (2 script trên + `gate`) có bằng chứng ĐỎ: chạy trên bản sao tạm ngoài repo đã cố tình hỏng (thêm khoá `phone` vào JobCard; thêm `import pg` vào một file web), lưu output vào `evidence/P01/red-*.txt`.

## §9. Test bắt buộc P01 (TESTING §2 + G01–G03, phần P01 của G16)

| Ca | Loại | Kỳ vọng |
| :-- | :-- | :-- |
| `TRANSITIONS` có đủ mọi dòng §5; cặp ngoài bảng ⇒ `IllegalTransitionError` | unit | pass |
| `canAccess` đúng từng ô bảng §7 | unit | pass |
| hash/verify mật khẩu; cookie bị sửa 1 byte ⇒ không hợp lệ; hết hạn ⇒ không hợp lệ | unit | pass |
| `callModel` với client giả: đúng model theo route, có `cache_control`, 529 ⇒ `ModelUnavailableError` | unit | pass |
| migrate từ DB rỗng ⇒ mọi bảng §4 tồn tại; chạy lần 2 ⇒ `applied: 0`; sửa checksum ⇒ exit 1 | db | pass |
| seed 2 lần ⇒ số dòng không đổi (12 categories, 20 apartments) | db | pass |
| `transitionJob` sai `from` ⇒ `ConflictError`, không thêm `job_events`; đúng ⇒ đúng 1 `job_events` | db | pass |
| 20 `transitionJob` đồng thời cùng `from` ⇒ đúng 1 thành công (mầm BB-05) | db | pass |
| login đúng/sai ⇒ đúng 1 dòng audit `auth.login.ok`/`fail` | db | pass |
| `runScenario(echo.jsonl)` ⇒ `duplicates=1`, `outbound = inbound`, mọi outbox `sent` | db | pass |

## §10. Vùng cấm P01

- CẤM viết agent, tool agent, pipeline bước 1–8, pacer thật, zca-js — thuộc P02/P03/P05.
- CẤM ORM (Prisma/Drizzle): SQL thuần qua `sql`/`tx` — một nguồn DDL là `db/migrations`.
- CẤM NextAuth/Auth.js: 3 vai nội bộ, cookie HMAC đủ và kiểm được bằng test thuần.
- CẤM seed mật khẩu mặc định cho bất kỳ tài khoản nào.
- CẤM `/dev/sim` khi `DATA_MODE≠sim` — màn này ghi thẳng `inbound_events`.
