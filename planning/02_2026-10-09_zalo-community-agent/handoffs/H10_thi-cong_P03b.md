1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (gói P03b — worker D31, báo động Telegram, heartbeat/healthz, dọn dữ liệu, `own_uid`).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` **D09, D32, D34, D37** → `specs/00-ARCHITECTURE.md` §6 (BB-03, BB-09, BB-18…BB-20) → `specs/SPEC-D31-Toc-Do-Giam-Sat.md` §4 (T6–T9), §7, §9, §10, §11, §13–§16 → `specs/01-CONTRACTS.md` §2.4, §4.11, §8, §10 → `specs/SPEC-P02-Transport-Nhom.md` §5 (pacer) → `specs/TESTING-ACCEPTANCE.md` hàng G24 → `docs/zalo-worker.md`, `docs/core.md`.

## 1. BỐI CẢNH TỰ CHỨA
- P01, P02, P03 đã nghiệm thu. P03 đã có: migration 010 (`process_heartbeats`, `alert_state`, cột đo `outbox.picked_at`/`hold_reason`…), runner song song + advisory lock + heartbeat runner, `holdAdvisoryLock` trong `adapters/db.ts`, `runTimers` có bước `pruneBuffers`. `agent/community/bot.ts` đang đọc tạm env `BOT_ZALO_UID`.
- Gói này: phần phía worker của D31 + báo động vận hành D32 + `botUid` thật (D37). KHÔNG nới gap/ngân sách D09 (Q-D31-2 = giữ).
- Telegram thật CHƯA có bot/token — mọi test dùng fetch giả (`setAlertFetchForTest`), 0 gọi mạng thật; thiếu `TELEGRAM_*` ⇒ `'disabled'`.
- Số đo trước: gate exit 0, `npm test` 549 (web 31 · worker 102 · core 416), `test:db` 209 (core 111 · web 25 · worker 73), 0 skip. DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu.

## 2. PHẠM VI
- ĐƯỢC GHI: `apps/zalo-worker/src/**`, `packages/core/src/adapters/alert.ts` (mới) + test, `packages/core/src/services/ops-watch.ts` (mới) + test, `packages/core/src/runner/**`, `packages/core/src/services/{timers,community-config}*.ts` (hoặc file chứa `runTimers`/`pruneBuffers`), `packages/core/src/agent/community/bot.ts` + test, `packages/core/src/dbtests/**`, `packages/core/src/domain/errors.ts`, `db/migrations/011_bot_uid.sql` (mới — DDL nguyên văn 01-CONTRACTS §4.11), `apps/web/app/api/healthz/**` (mới), `apps/web/tests/**`, `scripts/check_adapter_boundary.mjs` (luật `api.telegram.org`/`TELEGRAM_BOT_TOKEN` chỉ ở `adapters/alert.ts`), `docs/zalo-worker.md`, `docs/core.md`, `docs/web.md`; hồ sơ: `reports/R10_thi-cong_P03b.md` + `evidence/P03b/*` (file mới).
- CẤM ĐỤNG: `packages/core/src/agent/community/graph/**` (hình đồ thị chốt), `db/migrations/001…010`, `package.json`/`package-lock.json` (không thêm thư viện — Telegram bằng `fetch`), `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `lenqclaw_presentation_transcript.pdf`. Cần sửa file ngoài danh sách ⇒ ghi lý do trong report (một dòng/file).

## 3. VIỆC PHẢI LÀM (commit theo gói, mỗi gói xanh mới sang gói sau)
a. **P03b-A pacer + khoá worker:** SPEC-D31 §7.1 mục 1–4 + T6 (`lenqclaw:worker:community`; lần 2 ⇒ thoát 1, không mở phiên zca-js). Test: thứ tự `pickNext` (tin trả lời trước, trong thread giữ thứ tự), typing tươi ⇒ không typing lặp/không trễ, `picked_at`/`hold_reason` = lý do ĐẦU TIÊN; `pacer-sim --group` vẫn `first_hour: 20`, `violations: 0`.
b. **P03b-B heartbeat + healthz + own_uid:** heartbeat worker §9; `GET /api/healthz` §9 (200/503, body không token/số liệu/tên); migration 011 + worker ghi `own_uid` + `botUid(account)` theo D37 (thứ tự nguồn + cache 60 s).
c. **P03b-C báo động:** `adapters/alert.ts` §10.1 (CAS chống lặp, trần giờ, `resolved`, `localOnly`), `ops-watch.ts::checkOps` §10.2 đủ 8 `kind`; runner gọi qua `opsWatch` (tự giới hạn `OPS_WATCH_INTERVAL_MS`), worker `every('ops')`; worker gửi `zalo_session` NGAY khi `kicked`/`dead`/`cookie_expired`.
d. **P03b-D dọn dữ liệu:** §11 trong `pruneBuffers` (≤ 5000 dòng/tick/bảng; 180/365 ngày).
e. Mỗi bộ đo MỚI phải từng ĐỎ ít nhất một lần trên mã cố tình hỏng (`evidence/P03b/red-*.txt`), gồm BẮT BUỘC ca đỏ G24: bỏ mệnh đề `where` của CAS `alert_state` ⇒ ca "gọi lại 3 lần" ra 4 fetch (`red-alert-dedupe.txt`); file tạm có `api.telegram.org` ngoài adapter ⇒ boundary `violations: 1` (`red-boundary-telegram.txt`). Trả mã nguyên trạng sau đó.
f. Docs module theo thực tế (bảng env mới, lệnh vận hành).
g. **Xong khi** (chạy lại cuối, ghi `evidence/P03b/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 549 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip, 2 lần liên tiếp đều xanh
   - `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group > pacer-group.txt` → `violations: 0`, `first_hour: 20`
   - `migration-011-probe.txt`: 011 áp từ rỗng sau 010, chạy lại `applied 0`
   - G24 (TESTING-ACCEPTANCE) mọi ca local xanh + 2 ca đỏ ở mục e
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh, commit bằng `git commit <đường>…` · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi ⇒ giải thích từng ca) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · CẤM log/audit token, URL Telegram, nội dung tin, cookie, `DATABASE_URL` · SPEC mâu thuẫn mã ⇒ ghi câu hỏi report, làm phần độc lập; quyết định chưa có trong SPEC ⇒ dừng phần đó, hỏi.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| P03b-A, B, C, D | 🟠 | hợp đồng SPEC-D31 §7/§9–§11 + G24 có sẵn, test tự biết đúng/sai |
| docs | 🟢 | theo thực tế |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H10_thi-cong_P03b.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng mục SPEC → test → kết quả → evidence; bảng bằng chứng đỏ; bảng phân công (gói → tầng yêu cầu → họ/model đã dùng); việc KHÔNG làm + lý do; câu hỏi cần người. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
