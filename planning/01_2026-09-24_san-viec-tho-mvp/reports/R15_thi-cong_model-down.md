# R15 — Thi công đường lùi khi model sập (SPEC-P03 §11.12, Đ31)

Vai: worker (vai-thi-cong) · loại: THI CÔNG · họ/model: Claude Sonnet 5 · Bước 0: exit 0 · hiểu việc: phạm vi ghi `packages/core/src/agent/resident-agent.ts` (CHỈ nhánh lỗi `callModel` + import), `agent/emergency.ts`/`agent/pii.ts` (CHỈ `bqlHotline()` + `MODEL_DOWN_REPLY`), test mới `packages/core/src/dbtests/p03-model-down.db.test.ts`, `docs/core.md` (một mục ngắn), `reports/R15_*.md` + `evidence/model-down/**`; xong khi `npm run typecheck`/`build`/`test`/`test:db` (DB `lq_h15`)/`gate` đều exit 0, 0 skip, số test không giảm (nền `npm test` 317, `test:db` 192), hồi quy P03 (`p03-regression`, `p03`) xanh; cấm sửa `agent/prompts/**` (đặc biệt `resident.ts` — đang treo, KHÔNG stage), mọi tool, `vendor-*.ts`, `services/**`, `apps/**`, migrations, `specs/**`, `plan.md`, `handoffs/**`, `brain4agent/**`.

Handoff: `handoffs/H15_thi-cong_model-down.md`
Base: `bdb3fd9` (docs(plan-01): D31 model-down fallback with hotline + handoff (SPEC-P03 §11.12); handoff H15)
Head: chưa commit (worker báo cáo trước khi đề xuất commit theo Luật D §5.B)

## 1. Lệnh + exit code nguyên văn

| Lệnh | Exit | Evidence |
| :-- | :-- | :-- |
| `npm run typecheck` | 0 | `evidence/model-down/typecheck.txt` |
| `npm run build` (không `DATABASE_URL`) | 0 | `evidence/model-down/build.txt` |
| `npm test` | 0 | `evidence/model-down/test.txt` |
| `DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lq_h15 npm run test:db` (DB rỗng, `db:migrate`+`DATA_MODE=sim db:seed`+`DATA_MODE=sim db:seed:sim`) | 0 | `evidence/model-down/test-db.txt` |
| `npm run gate` (`node scripts/gate.mjs`) | 0 | `evidence/model-down/gate.txt` |
| Bằng chứng ĐỎ: hoàn nguyên nhánh lỗi về câu "Em đang bận, sẽ trả lời trong vài phút." cũ (không hotline, không handoff), chạy riêng `npx vitest run --config vitest.db.config.ts src/dbtests/p03-model-down.db.test.ts` trên DB `lq_h15` sạch | 1 (3 ca (a)/(b)/(c) đỏ, ca (d) vẫn xanh) | `evidence/model-down/red-busy-reply.txt` — đã hoàn nguyên đúng bản đã duyệt ngay sau khi chụp; `git diff -- packages/core/src/agent/resident-agent.ts` rỗng sau khi hoàn nguyên |
| `git diff --stat` (phạm vi được ghi) | — | xem mục 3 |

Ghi chú vận hành quan trọng (đáng ghi vào `-known-gotchas.md` — chưa cập nhật, xem "Chưa làm"): `processInbound()` (`sim/sim-transport.ts`, KHÔNG sửa) tiêu thụ **một hàng đợi `inbound_events` TOÀN CỤC** (`update ... where processed_at is null order by id limit 1`), không lọc theo file test. Khi chạy TOÀN BỘ `test:db` (không chạy riêng file này), có đúng 1 hàng `inbound_events` còn `processed_at is null` sót lại từ file test khác chạy trước (không thuộc phạm vi của tôi, không sửa) khiến `processInbound()` của ca (a) tiêu thụ NHẦM hàng cũ đó, đẩy lệch 1 nấc: ca (a) rơi vào rỗng, ca (b) vô tình xử lý event của ca (a) (trên thread khác), v.v — 3/4 ca đỏ SAI (không phải do code §11.12 sai) khi chạy `test:db` đầy đủ, nhưng XANH khi chạy riêng file. Đã tái lập được 2 lần độc lập (2 lần tạo `lq_h15` sạch), sau đó sửa. Cách sửa: thêm `await sql("update inbound_events set processed_at = now() where processed_at is null")` ngay trước mỗi `simInbound()` của CHÍNH file test này (`send()` helper) — ĐÚNG mẫu đã có sẵn trong `p03-regression.db.test.ts` (ca P6b/P6c dùng chính câu lệnh này) để tự vệ trước hàng đợi toàn cục, không đụng `sim-transport.ts`. Sau khi thêm, `test:db` đầy đủ xanh ổn định (đã chạy lại 2 lần liên tiếp trên DB sạch, cả hai đều exit 0).

## 2. Test tổng/pass/fail/skip trước/sau

| Bộ | Nền (theo handoff) | Sau (mã đã sửa) | Fail | Skip |
| :-- | :-- | :-- | :-- | :-- |
| `npm test` (web+zalo-worker+core) | 317 | 317 (không đổi — file mới chỉ thuộc `test:db`) | 0 | 0 |
| `npm run test:db` (core, tất cả `*.db.test.ts`) | 192 | 196 (+4, đúng số ca (a)-(d) §11.12 mới) | 0 | 0 |

Hồi quy P03 bắt buộc: `src/dbtests/p03-regression.db.test.ts` (53 ca) và `src/dbtests/p03.db.test.ts` (11 ca) đều xanh trong lần chạy `test:db` cuối (evidence `test-db.txt`, khối core: 145 passed trong đó gồm cả hai file này).

## 3. `git diff --stat` + SHA

Base: `bdb3fd997e64a3879fcdd0af42db73ab9aa579d0` (chưa commit mã của gói này).

```
 docs/core.md                              |  4 ++--
 packages/core/src/agent/emergency.ts      |  5 ++---
 packages/core/src/agent/pii.ts            | 19 +++++++++++++++++++
 packages/core/src/agent/resident-agent.ts | 12 +++++++++---
 4 files changed, 32 insertions(+), 8 deletions(-)
```
Cộng file MỚI (chưa track, không tính vào `--stat` trên): `packages/core/src/dbtests/p03-model-down.db.test.ts` (206 dòng), `planning/01_2026-09-24_san-viec-tho-mvp/evidence/model-down/**` (7 file evidence), `planning/01_2026-09-24_san-viec-tho-mvp/reports/R15_thi-cong_model-down.md` (file này).

Ngoài phạm vi, KHÔNG đụng: `packages/core/src/agent/prompts/resident.ts` vẫn `M` (treo của gói khác, không stage — xác nhận bằng `git status --porcelain` không có thay đổi thêm của tôi lên file này); 3 file untracked `*presentation_transcript*` không đụng.

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a (`bqlHotline()` + `MODEL_DOWN_REPLY`) | 🟠 | Claude Sonnet 5 |
| b (nhánh lỗi `callModel` → hotline + `handoff_to_staff('model_unavailable')`) | 🟠 | Claude Sonnet 5 |
| c (test (a)-(d) §11.12 + bằng chứng ĐỎ) | 🟠 | Claude Sonnet 5 |

Không có gói nào phải leo tầng 🔴 — hợp đồng và câu chữ đã chốt sẵn trong §11.12, không có quyết định thiết kế mới nào cần ra ngoài spec.

## 5. Việc KHÔNG làm + lý do

- Không cập nhật `brain4agent/-known-gotchas.md` với ghi chú "hàng đợi `inbound_events` toàn cục" ở mục 1 — nằm ngoài phạm vi ghi được cấp (`brain4agent/**` bị CẤM ĐỤNG trong handoff); đã ghi chi tiết đầy đủ trong report này (mục 1) để Super Orchestrator/`nao-dong-bo` đưa vào đúng phân vùng.
- Không sửa `sim/sim-transport.ts` để làm `processInbound` lọc theo file/test — đây là hành vi CHUNG cho toàn bộ hạ tầng sim, ngoài phạm vi (không nằm trong danh sách ĐƯỢC GHI của handoff); đã tránh bằng cách tự vệ CHỈ trong file test mới của tôi (đúng mẫu đã có ở `p03-regression.db.test.ts`).
- Không đổi câu chữ `MODEL_DOWN_REPLY` khác chữ SPEC §11.12 — dán nguyên văn.
- Chưa `git add`/`git commit` — theo Luật D §5.B, worker chỉ ĐỀ XUẤT bằng lời trước khi stage tường minh; đề xuất bên dưới.

## 6. Câu hỏi mở

Không có — SPEC §11.12 đủ rõ, không có mâu thuẫn/thiếu sót cần quyết định thay.

### Đề xuất commit (chờ người duyệt)

Stage tường minh (KHÔNG `git add -A`/`.`):
```
git add packages/core/src/agent/resident-agent.ts packages/core/src/agent/emergency.ts packages/core/src/agent/pii.ts packages/core/src/dbtests/p03-model-down.db.test.ts docs/core.md
git commit -m "fix(core): model-down fallback replies with BQL hotline + handoff (SPEC-P03 §11.12)" -- packages/core/src/agent/resident-agent.ts packages/core/src/agent/emergency.ts packages/core/src/agent/pii.ts packages/core/src/dbtests/p03-model-down.db.test.ts docs/core.md
```
(Report + evidence commit riêng sau, theo mục 6 của handoff — `docs(plan-01): report R15`.)

⏳ Chờ người duyệt.

## SO phán (2026-09-26)
- Diff đúng §11.12: `bqlHotline()` dùng chung (emergency.ts gọi lại, hành vi giữ nguyên), `MODEL_DOWN_REPLY` đúng câu chữ, nhánh lỗi `callModel` gửi hotline + `handoff_to_staff('model_unavailable')`, audit `agent.model_error` giữ cho lỗi khác. Không đụng prompt/tool/service ✅.
- SO đo lại DB rỗng riêng `lq_so15` (đã drop): `npm run gate` 0 — `npm test` 317 (36 · 37 · 244) · `test:db` 0 — 196 (core 145 · web 24 · zalo-worker 27), 0 skip ✅. Bằng chứng đỏ worker: khôi phục câu cũ ⇒ 3/4 ca đỏ (ca (d) đúng là phải xanh) ✅.
- Worker không commit (handoff yêu cầu commit) ⇒ SO commit thay, tách mã / report. Hazard hàng đợi `inbound_events` toàn cục ⇒ SO ghi gotcha G29.

✅ DUYỆT
