# R12 — Thi công P05-B (nền dispatch, không dùng model)

Vai: worker (vai-thi-cong) · loại: THI CÔNG · họ/model: Claude Sonnet 5 · Bước 0: exit 0 · hiểu việc: phạm vi P05-B là nền không dùng model cho P05 (migration 006, domain, `tool-kit` TCtx, `conversation.ts`, `vendor-intent.ts` thuần, dịch vụ dispatch/access/slots/timers/pii-gate/vendor-messages/system-events/vn-time/dispatch-config, `sim-transport.ts`, runner tick, `seed-sim.ts`, `sim_claims.mjs`, mở rộng `check_agent_tools.mjs`, `pii_probe.jsonl`, `.env.example`, `docs/core.md`); xong khi `npm run gate`/`test:db` exit 0, `test:db` ≥122+40 ca mới, `sim_claims.mjs` cho `jobs_with_two_winners:0` và `--break` exit 1, đồng hồ giả §10.8.4 xanh, 3 máy đo mới có bằng chứng đỏ; cấm đụng `agent/prompts/**`, tool agent (trừ `tool-kit.ts`), `agent/vendor-agent.ts`, `agent/vendor-triage.ts`, `apps/**`.

Handoff: `handoffs/H12_thi-cong_P05-B.md`
Base: `62e4992953303a7ae456187d4e95ef567f259416`
Head: `e28cbf6` (3 commit: `ed7fe06` core → `5f65bbb` máy đo/test → `e28cbf6` docs)

## 1. Lệnh + exit code nguyên văn

| Lệnh | Exit | Evidence |
| :-- | :-- | :-- |
| `npm run typecheck` | 0 | `evidence/P05-B/typecheck.txt` |
| `npm run build` (không `DATABASE_URL`) | 0 | `evidence/P05-B/build.txt` |
| `npm test` | 0 | `evidence/P05-B/test.txt` |
| `DATABASE_URL=…/lq_h12 npm run test:db` (DB rỗng, migrate+seed+`DATA_MODE=sim` seed:sim qua `scripts/seed-sim-for-test.mjs`) | 0 | `evidence/P05-B/test-db.txt` |
| `node scripts/gate.mjs` | 0 | `evidence/P05-B/gate.txt` |
| `node --import tsx scripts/sim_claims.mjs` | 0 | `evidence/P05-B/sim-claims.txt` |
| `node --import tsx scripts/sim_claims.mjs --break` | 1 | `evidence/P05-B/sim-claims-break.txt` |
| `npm test` trên HEAD gốc `62e4992` (đã `git stash`, chạy, `git stash pop`) | 0 | `evidence/P05-B/baseline.txt` |
| 3 máy đo mới trên cây cố tình hỏng (`jobreveal_outside_allowed`, `allow_reveal_outside_access`, `PiiGate`) | 1 (cả 3) | `evidence/P05-B/red-jobreveal.txt`, `red-vendor-send.txt`, `red-pii-gate.txt` |

`sim_claims.mjs` (đúng câu UPDATE có điều kiện thật của `claimJob`): `claims=200 won=50 lost=150 jobs_with_two_winners=0 job_events_held=50`.
`sim_claims.mjs --break` (bản đọc-rồi-ghi cố ý hỏng NGAY TRONG SCRIPT, không sửa `dispatch.ts`): `claims=200 won=200 lost=0 jobs_with_two_winners=50 job_events_held=0`.

## 2. Test tổng/pass/fail/skip trước/sau

| Bộ | Trước (base `62e4992`) | Sau (HEAD `e28cbf6`) | Fail | Skip |
| :-- | :-- | :-- | :-- | :-- |
| `npm test` — web | 24 | 24 | 0 | 0 |
| `npm test` — zalo-worker | 37 | 37 | 0 | 0 |
| `npm test` — core | 190 | 235 (+45) | 0 | 0 |
| `npm test` tổng | 251 | 296 (+45) | 0 | 0 |
| `npm run test:db` — core | (không đo riêng ở base; xem ghi chú) | 127 | 0 | 0 |
| `npm run test:db` — web | | 11 | 0 | 0 |
| `npm run test:db` — zalo-worker | | 27 | 0 | 0 |
| `npm run test:db` tổng | 122 (mốc R11, plan.md) | 165 (+43) | 0 | 0 |

P03 hồi quy: `p03-regression.db.test.ts` (53 ca), `p03.db.test.ts` (11 ca), `p03-category-code.db.test.ts` (3 ca), `p01/p02*.db.test.ts` đều xanh trong `evidence/P05-B/test-db.txt` — không đỏ.

## 3. `git diff --stat` (base→HEAD) + SHA từng commit

Toàn văn: `evidence/P05-B/diff-stat.txt` (39 files changed, 5009 insertions(+), 118 deletions(-)).

| Commit | SHA | Nội dung |
| :-- | :-- | :-- |
| 1 | `ed7fe06` | `feat(core): P05-B dispatch/access/slots/timers foundation (no model)` — migration 006 + domain + toàn bộ dịch vụ + agent phụ trợ |
| 2 | `5f65bbb` | `test(core): P05-B acceptance measures (G11, G12, G12b, G15) + db tests` — `sim_claims.mjs`, `check_agent_tools.mjs` mở rộng, `pii_probe.jsonl`, 5 file `dbtests/p05-*.db.test.ts` + `p05-helpers.ts` |
| 3 | `e28cbf6` | `docs(core): document P05-B services + .env.example P05 block` |

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu (handoff) | Họ/model đã dùng |
| :-- | :-- | :-- |
| a. Migration 006 + kiểu/lỗi/máy trạng thái | 🟠 | Claude Sonnet 5 |
| b. Dịch vụ dispatch/access/slots/timers/pii-gate/vendor-messages/system-events | 🟠 | Claude Sonnet 5 |
| c. `vendor-intent.ts` thuần + test bảng | 🟢 | Claude Sonnet 5 |
| d. Seed mô phỏng + `runScenario(handler)` + `.env.example` | 🟢 | Claude Sonnet 5 |
| e. Máy đo (`sim_claims.mjs`, `check_agent_tools.mjs` mở rộng) | 🟠 | Claude Sonnet 5 |

Không có gói nào leo tầng lên 🔴 — không gặp quyết định ngoài SPEC cần người chốt gấp trong lúc thi công (các điểm mơ hồ được xử lý và ghi ở mục "Câu hỏi mở" bên dưới thay vì tự quyết âm thầm).

## 5. Việc KHÔNG làm + lý do

- **P05-C (agent thợ)**: `agent/vendor-triage.ts`, `agent/vendor-agent.ts`, 9 tool phía thợ, `agent/tools/index.ts` (`VENDOR_TOOLS`) — CẤM ĐỤNG tường minh trong handoff, thuộc WP khác.
- **P05-D (phía cư dân)**: sửa `agent/tools/open_service_case.ts` sang `window_start/window_end`, `agent/consent.ts`, `publish_job_to_group.ts`, `respond_to_quote.ts`, `agent/prompts/resident.ts` — CẤM ĐỤNG tường minh (`resident.ts` đang treo chưa commit của gói khác, đã xác nhận KHÔNG stage).
- **P05-E (web)**: SPEC-P04 §8 (`/tickets`, `/gate`, `/vendors`, SimBoard, `/api/dev/sim/tick`, `/api/dev/sim/send` từ chối `senderUid='system'`) — ngoài `packages/core/**`, CẤM ĐỤNG `apps/**`.
- **`evals/scenarios/dispatch_smoke.jsonl`**: SPEC ghi "tuỳ chọn (chạy bằng nút phát lại...) — chỉ để nhìn tay"; không có tiêu chí đo bắt buộc, bỏ qua để tập trung vào phần có đo được.
- **G16a (`p05-e2e.db.test.ts` qua vòng agent thợ thật)**: cần `vendor-agent.ts`/9 tool của P05-C — không thể viết vì phần đó chưa tồn tại (phụ thuộc thứ tự B→C→D theo chính SPEC).
- **`db:seed:sim` chạy CLI trực tiếp**: không kiểm riêng (chỉ chạy qua `npm run test:db`/`seed-sim-for-test.mjs`) vì hành vi giống hệt, không thêm rủi ro.

## 6. Câu hỏi mở (không tự bịa, ghi lại quyết định an toàn đã chọn để không kẹt)

1. **`VendorTriageResult`/`VendorIntent` (§10.4.1) khai báo ở đâu**: `agent/vendor-tool-context.ts` (P05-B) cần kiểu này nhưng `agent/vendor-triage.ts` (P05-C) chưa tồn tại và tôi bị CẤM tạo file đó. Đã khai báo `VendorIntent`/`VendorTriageResult` ngay trong `vendor-tool-context.ts` (đúng hình dạng §10.4.1) kèm ghi chú: khi thi công P05-C, `vendor-triage.ts` nên `import type { VendorTriageResult } from '../vendor-tool-context.js'` thay vì định nghĩa lại — tránh hai nguồn chân lý.
2. **`PHONE_RE`/`APT_GENERIC_RE` dùng lại trong `pii-gate.ts`**: SPEC §10.10 nói "mẫu chung PHONE_RE/APT_GENERIC_RE của `agent/pii.ts`" nhưng file đó ngoài ĐƯỢC GHI của handoff (chỉ P03 được sửa) nên không export được hằng số đó. Đã LẶP LẠI (không import) hai regex trong `services/pii-gate.ts`, ghi rõ trong comment. Đề xuất: một handoff sau export hai hằng số này từ `agent/pii.ts` để dùng chung.
3. **`generatePassCode()` "trùng ⇒ sinh lại ≤5 lần"**: chữ ký spec là đồng bộ, không có tham số DB nên không thể tự kiểm trùng với `access_passes.code` đã có (schema cũng không có unique constraint trên cột này). Đã thi công đúng chữ ký spec (sinh một lần, đồng bộ), chưa làm retry — ghi trong comment tại `services/access.ts`.
4. **`sim_claims.mjs` và yêu cầu "pool ≥ 20 kết nối" (G11)**: script CẤM `import 'pg'` trực tiếp (nằm trong `scripts/**`, bị `check_adapter_boundary.mjs` quét), phải dùng lại pool của `adapters/db.ts` — file đó ngoài phạm vi ĐƯỢC GHI nên không thêm tham số cấu hình kích thước pool. Script dùng pool mặc định của `pg` (10) qua `@lenqclaw/core/adapters/db`; số đo `jobs_with_two_winners=0` vẫn đúng (tính đúng đắn không phụ thuộc kích thước pool, chỉ ảnh hưởng thời gian chạy).
5. **`decideAccessRequest` nhánh `reject`**: SPEC §10.3.2 mô tả cả khối "(tx): ... publishJobToGroup(reason:'access_rejected')" như một câu liền mạch, nhưng `publishJobToGroup` tự mở `tx()` riêng — không gọi lồng được. Đã làm: các ghi DB của nhánh reject (transitionJob, `job_offers`, gỡ gán) chạy trong tx của `decideAccessRequest`; `publishJobToGroup` + gửi tin chạy SAU KHI tx đó commit (post-commit) — cùng khuôn mẫu "sau commit" mà chính SPEC dùng cho nhánh approve.
6. **`confirmAssignment` khi `hold_expires_at ≤ now`**: SPEC ghi "gọi `releaseHold` TRONG CÙNG tx rồi ném `HoldExpiredError`" — nhưng `tx()` (adapters/db.ts) ROLLBACK toàn bộ khi hàm truyền vào ném lỗi, nên ghi của `releaseHold` sẽ bị cuốn ngược nếu ném ngay trong tx. Đã làm: phần GHI của release chạy trong cùng tx (đúng chữ "trong cùng tx"), nhưng việc NÉM `HoldExpiredError` dời ra SAU khi tx đã commit — ghi rõ lý do trong comment đầu `services/dispatch.ts`.

## 7. Bằng chứng đỏ 3 máy đo mới

- `jobreveal_outside_allowed` (`check_agent_tools.mjs`): chèn tạm chuỗi `'JobReveal'` vào `vendor-messages.ts` → `jobreveal_outside_allowed: 1`, exit 1 (`red-jobreveal.txt`); đã hoàn nguyên, `diff` rỗng, gate lại xanh.
- `allow_reveal_outside_access` (`check_agent_tools.mjs`): chèn tạm `{ allowReveal: true }` vào `dispatch.ts` → `allow_reveal_outside_access: 1`, exit 1 (`red-vendor-send.txt`); đã hoàn nguyên.
- `PiiGate` (`services/pii-gate.ts::assertNoResidentPii`): vô hiệu hoá tạm (return sớm) → 4/6 ca trong `pii-gate.test.ts` đỏ (`red-pii-gate.txt`), exit 1; đã hoàn nguyên, `npm run gate` lại xanh (đã đo lại).

## 8. Số đo lưới an toàn P05 (TESTING-ACCEPTANCE §6)

Không thu thập được trên "≥20 cuốc trọn bước 0→7 với model thật" vì P05-C/D (agent thợ + prompt cư dân) chưa tồn tại trong phạm vi gói này — không có cách nào tạo luồng agent thật end-to-end. Các sự kiện `timer.publish_fallback`, `timer.request_access_fallback`, `system.access_approved_reemit`, `dispatch.stuck`, `claim.fallback_no_model`, `pii.gate_blocked`, `vendor.group_noise` đã được audit đúng vị trí trong code (kiểm bằng test đơn lẻ ở `p05-timers.db.test.ts`/`p05-pii-probe.db.test.ts`), nhưng thống kê tần suất thật cần chờ P05-C/D.

## 9. Câu hỏi cần người

- Q1–Q10 (SPEC-P05 §10.16) vẫn giữ giá trị TẠM như đã chốt ở Đ27 — không có câu hỏi mới cần người quyết ngay để đóng gói P05-B.
- Xác nhận hướng xử lý 6 điểm "Câu hỏi mở" ở mục 6 (đặc biệt điểm 1, 2, 5, 6) trước khi P05-C bắt đầu, để tránh P05-C định nghĩa lại kiểu/đường ống theo cách khác.

⏳ Chờ người duyệt.
