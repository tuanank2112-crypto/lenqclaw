1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ13, Đ17, Đ22) → `specs/00-ARCHITECTURE.md` §6 → `specs/01-CONTRACTS.md` §3, §4 (bảng `zalo_*`, `inbound_events`, `outbox`, `conversations`), §8, §9 → `specs/SPEC-P02-Zalo-Transport.md` toàn bộ (**§9 là hợp đồng giai đoạn này**, thắng §1–§8) → `brain4agent/-known-gotchas.md` G01–G07, G11 → `docs/zalo-worker.md` → `docs/core.md`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. Agent cư dân (P03) đã duyệt và chạy trên kênh giả lập (`TRANSPORT=sim`, `/dev/sim`); core đã có `processInbound` nhận-trước-xử-lý-sau và `routeInboundEvent`. `apps/zalo-worker` là khung rỗng. Việc của bạn: cắm Zalo cá nhân thật (tài khoản `bql`) qua zca-js theo SPEC-P02 §9. Máy KHÔNG có tài khoản Zalo để bạn quét — mọi test dùng zca-js GIẢ; phần quét QR thật do SO + người dùng làm sau khi bạn nộp (§9.5 "Người").
Song song với bạn, một worker khác làm máy chấm golden (`scripts/eval_golden.mjs`, `evals/**`, `handoff_to_staff.ts`, `.env.example`) — KHÔNG đụng các file đó. Base: tự đo `git rev-parse HEAD` trước dòng sửa đầu tiên. Postgres dev `127.0.0.1:55432` (user/pass `lenqclaw`); tạo database riêng `lq_h07`, CẤM đụng database khác, drop khi xong. `.env` có key Gemini — CẤM in/ghi. Số đo nền: tự đo `npm test`, `npm run test:db` trên Base.

## 2. PHẠM VI
ĐƯỢC GHI: `apps/zalo-worker/**`, `apps/web/**` (CHỈ trang `/zalo` + `app/api/zalo/**` + liên kết tới chúng; giữ nguyên auth hiện có, trang chỉ `bql_admin`), `packages/core/src/runner/**` (mới), `packages/core/src/dev/**` (mới, cho `dev:link-zalo`), `packages/core/src/dbtests/*zalo*`/`*runner*` (mới), `db/migrations/004_zalo_login.sql` (mới), `package.json` + `package-lock.json` (script `core:run`, `zalo:worker`, `dev:link-zalo`; dependency `zca-js` pin chính xác), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R07_thi-cong_P02-g1.md, evidence/P02/**}`.
CẤM ĐỤNG: `db/migrations/00[1-3]_*`, `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `.env`, `.env.example` (liệt biến env mới trong report, SO thêm), `scripts/**`, `evals/**`, `packages/core/src/agent/**`, `packages/core/src/adapters/model.ts`, `packages/core/src/sim/**` (chỉ import). VÙNG CẤM + LÝ DO: SPEC-P02 §7, §9.6.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Migration 004 theo §9.2. Xong khi: DB rỗng `npm run db:migrate` ⇒ `applied: 4`.
b. Worker `apps/zalo-worker`: `ZaloClientLike` + bản thật bọc zca-js (pin, đối chiếu `.d.ts`) + bản giả cho test; mã hoá phiên §9.3; đăng nhập QR + lưu sau API đọc thử §9.2/§2.3; CAS §2.4; luồng vào §3 (chống trùng, `is_self` ⇒ takeover, tin không phải text ⇒ nội dung thay thế §9.1, không gửi "đã xem" trước nhận diện); pacer §5 (env `PACER_*`); watchdog §6; `ZALO_ACCOUNTS`. Xong khi: `npm run zalo:worker` không `ZALO_SESSION_KEY` ⇒ exit 1; test máy §9.5 xanh.
c. Runner `core:run` §9.2 (một bản, vòng `processInbound(routeInboundEvent)` 1 s, dừng êm khi SIGINT). Xong khi: test DB — ghi tin vào `inbound_events` ⇒ runner ⇒ có dòng `outbox`.
d. Web: `POST /api/zalo/bql/login` (chỉ `bql_admin`, vai khác ⇒ 403) + trang `/zalo` (trạng thái, banner đỏ khi `kicked`/`dead`/`logged_out`, ảnh QR còn hạn, tự làm mới 3 s). Xong khi: test route 401/403/200.
e. `dev:link-zalo` §9.4. Xong khi: test DB gắn đúng uid mới nhất chưa có danh tính; `DATA_MODE≠sim` ⇒ exit 1.
f. Hướng dẫn chạy thử người (đặt trong report mục 7, KHÔNG sửa docs): thứ tự lệnh bật DB, migrate, seed, seed:sim, web, `core:run`, `zalo:worker`, tạo admin, mở `/zalo`, quét QR, `dev:link-zalo`.
Xong khi (toàn gói): `npm ci`, `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h07 npm run test:db` (DB rỗng), `npm run gate` đều exit 0; 0 skip; số test mỗi lệnh > số đo nền; `git grep -nE "cookie|imei" -- apps/zalo-worker/src | grep -i "log"` không có dòng log bí mật (report giải thích từng dòng khớp nếu có).
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/P02/{baseline,typecheck,build,test,test-db,gate,migrate,red-no-session-key,pacer-sim,diff-stat}.txt` (`pacer-sim` = giả lập 50 tin/20 người ⇒ in thời điểm gửi + kết quả kiểm bảng §5).

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <đúng các đường đó>` (worker khác commit song song; `index.lock` ⇒ chờ vài giây thử lại). Không push. Không "sửa cho tốt hơn" ngoài SPEC. Commit tiếng Anh Conventional Commits theo việc, kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn (vd API zca-js khác giả định) ⇒ ghi "Câu hỏi mở", làm phần độc lập, KHÔNG sửa `specs/`. CẤM kết nối Zalo thật, CẤM gọi mạng tới Zalo trong test. Chuỗi gửi người dùng: tiếng Việt CÓ DẤU. Kiểm mã thoát trực tiếp. Không để server/worker chạy sau khi xong.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| b (mã hoá phiên, lưu credentials, watchdog) | 🔴 | ranh giới bảo mật + hành vi phiên không thử được bằng mạng thật |
| a, c, d, e, b (pacer, luồng vào) | 🟠 | hợp đồng chốt ở §5, §9; test giả tự biết đúng/sai |
| f | 🟢 | chép lệnh đã chạy |
Gặp quyết định chưa có trong SPEC-P02 ⇒ dừng phần đó, ghi Câu hỏi mở.

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H07_thi-cong_P02-g1.md`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng "mục SPEC-P02 → test"; phiên bản zca-js đã pin; danh sách biến env mới). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence riêng `docs(plan-01): report R07` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R07_thi-cong_P02-g1.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P02/gate.txt`
