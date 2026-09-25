1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ10, Đ14, Đ21, Đ22, Đ27) → `specs/SPEC-P05-Dispatch.md` §10.0–§10.3, §10.8–§10.15 (§10.12 dòng P05-B là "xong khi" của bạn) → `specs/01-CONTRACTS.md` §4–§9 → `specs/TESTING-ACCEPTANCE.md` §4 (G11, G12, G12b, G15), §6 → `docs/core.md`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. P03 (agent cư dân bước 0–3) đã duyệt mã. Đ27 (ĐÃ DUYỆT 2026-09-26) chốt hợp đồng thi công P05 bước 4–7 trên kênh giả lập. Gói của bạn là **P05-B — nền không dùng model**: migration, dịch vụ SQL có điều kiện, đồng hồ, slot, PiiGate, dữ liệu mô phỏng, máy đo. Gói sau (P05-C agent thợ, P05-E web, P05-D phía cư dân) đứng trên nền này. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432` (container `lenqclaw-db-1`; Docker tắt ⇒ tự bật lại). Dùng database riêng `lq_h12` (tạo rỗng, drop khi xong); CẤM đụng database khác (`lenqclaw` là DB chạy thử của người dùng). Gói này KHÔNG gọi model thật; `.env` không cần đọc.

## 2. PHẠM VI
ĐƯỢC GHI (đúng các dòng WP-B của SPEC-P05 §10.1.2 + §10.12): `packages/core/src/domain/{errors,types}.ts`, `packages/core/src/domain/` máy trạng thái (`TRANSITIONS` + cặp `confirmed→published`), `agent/tools/tool-kit.ts` (tham số `TCtx`), `agent/vendor-tool-context.ts` (mới), `agent/conversation.ts` (mới, TÁCH từ `resident-agent.ts` — hành vi giữ nguyên), `agent/resident-agent.ts` (CHỈ để dùng `conversation.ts`, không đổi hành vi, không thêm route `market`), `agent/vendor-intent.ts` (mới, thuần), `services/{dispatch,access,slots,timers,system-events,vendor-messages,pii-gate,vn-time,dispatch-config}.ts` (mới), `sim/sim-transport.ts`, `runner/inbound-runner.ts`, `db/seed-sim.ts`, `db/migrations/006_dispatch_slots.sql` (mới), test mới/sửa trong `packages/core/src/**` và `packages/core/src/dbtests/`, `scripts/sim_claims.mjs` (mới), `scripts/check_agent_tools.mjs`, `evals/golden/pii_probe.jsonl` (mới), `.env.example`, `docs/core.md` (mục mới cho dịch vụ P05), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R12_thi-cong_P05-B.md, evidence/P05-B/**}`.
CẤM ĐỤNG: `packages/core/src/agent/prompts/**` (nhất là `resident.ts` — đang treo chưa commit, KHÔNG stage), mọi tool agent (`agent/tools/*.ts` trừ `tool-kit.ts` — tool là P05-C/D), `agent/vendor-agent.ts`, `agent/vendor-triage.ts`, `apps/**` (P05-E), `apps/zalo-worker/**`, `specs/**`, `plan.md`, `handoffs/**`, `brain4agent/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `.env`, `package.json`/`package-lock.json` (trừ khi SPEC ghi tên lệnh npm mới — khi đó ghi Câu hỏi mở, không tự thêm), migration 001–005, `scripts/eval*`. 3 file untracked `*presentation_transcript*` không phải của bạn — không đụng.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Migration 006 + kiểu/lỗi/máy trạng thái theo SPEC-P05 §10.2 + 01-CONTRACTS §4–§6, §9.
b. Dịch vụ §10.3 (SQL có điều kiện, BB-05; 7 điều kiện BB-10 trong `claimJob`), slot §10.9, PiiGate + tin mẫu §10.10, sự kiện hệ thống + `sender_uid='system'` dành riêng §10.8.2, đồng hồ `runTimers(now)` §10.8 (mọi SQL so `$now`, không `now()`), runner tick `TIMER_INTERVAL_MS`.
c. `vendor-intent.ts` thuần §10.4.2 + test bảng (ba danh sách cụm khớp bằng nhau; trích mã `C-XXXX`; `parsePriceVnd` với sàn/trần Q5).
d. Seed mô phỏng §10.11; `runScenario(path, handler = echoHandler)`; `.env.example` khối P05 §10.2.3 (`DISPATCH_TIMEOUT_MIN=45`, tham số phí GIẢ theo §10.16 Q1).
e. Máy đo: `scripts/sim_claims.mjs` (200 claim / 50 cuốc) + `--break`; `check_agent_tools.mjs` thêm 2 máy đo §10.1.3 (JobReveal chỉ ở `types.ts` + `services/access.ts`; tin tới `market` chỉ qua `sendVendorMessage`); G12/G12b/G15 theo TESTING §4.
Xong khi (toàn gói): `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h12 npm run test:db` (DB rỗng, sau migrate+seed+`DATA_MODE=sim` seed:sim), `npm run gate` đều exit 0; `test:db` ≥ 122 + 40 ca mới; 0 skip; số test `npm test` không giảm so với nền; test P03 không đỏ; `DATABASE_URL=…/lq_h12 node --import tsx scripts/sim_claims.mjs` ⇒ `jobs_with_two_winners: 0`, `--break` ⇒ exit 1; đồng hồ giả §10.8.4 xanh; mỗi máy đo mới có bằng chứng ĐỎ trên cây cố tình hỏng (hoàn nguyên sau khi chụp).
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/P05-B/{baseline,typecheck,build,test,test-db,gate,sim-claims,sim-claims-break,red-jobreveal,red-vendor-send,red-pii-gate,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh, `git commit -m … -- <đường>`. Không push. Commit tiếng Anh Conventional Commits (`feat(core): …`), kết bằng dòng `Co-Authored-By` của vỏ bạn; tách commit hợp lý (migration+dịch vụ / máy đo / docs). SPEC thiếu/mâu thuẫn ⇒ "Câu hỏi mở", KHÔNG sửa `specs/`; chọn cách an toàn nhất để không kẹt và ghi rõ. Vùng cấm §10.14 và bất biến §10.1.3 là luật cứng (CẤM pg-boss). Kiểm mã thoát trực tiếp, không qua pipe. Lệnh dài chạy chặn tiền cảnh, redirect thẳng evidence.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, e | 🟠 | SQL + luật đã chốt ở §10.2–§10.3, §10.8–§10.10; máy đo tự biết đúng/sai |
| c, d | 🟢 | hàm thuần/seed/env theo mẫu có sẵn |

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H12_thi-cong_P05-B.md` / `Base:` / `Head:`; lệnh + exit code nguyên văn; test tổng/pass/fail/skip trước/sau; `git diff --stat` + SHA; bảng phân công thực tế; việc KHÔNG làm + lý do; Câu hỏi mở. Dòng không rỗng cuối = `⏳ Chờ người duyệt.`. Commit report + evidence riêng `docs(plan-01): report R12` SAU commit mã cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R12_thi-cong_P05-B.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P05-B/`
