1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ11, Đ14, Đ27) → `specs/SPEC-P04-Vendor-Console.md` §8 (toàn bộ §8.0–§8.6 — hợp đồng của bạn) → `specs/SPEC-P05-Dispatch.md` §10.3, §10.9, §10.11 (dịch vụ bạn gọi) → `specs/TESTING-ACCEPTANCE.md` §4 G07 → `reports/R12_thi-cong_P05-B.md` → `docs/web.md`, `docs/core.md` → code hiện có `apps/web/app/{tickets,gate,dev}/**`, `apps/web/lib/auth/policy.ts`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. P05-B đã duyệt (R12 ✅): dịch vụ core `services/{access,slots,dispatch,timers}.ts` (vd `decideAccessRequest`, "Đã thu phí", đặt trần slot, `runTimers(now)`) đã có và có test DB. Gói của bạn là **P05-E — dashboard BQL tối thiểu cho P05** (Next.js 15 `apps/web`): duyệt/từ chối ticket cấp quyền (lý do bắt buộc), `/gate`, `/vendors`, `/jobs`, SimBoard thêm khung DM thợ + chọn nhóm + nút Tick, `/api/dev/sim/tick`. Mọi đổi trạng thái đi qua dịch vụ core — web KHÔNG viết SQL đổi trạng thái cuốc. Song song với bạn, worker khác làm P05-C (`packages/core/src/agent/**`, `evals/**`, `scripts/eval/**`, `docs/core.md`) — KHÔNG đụng. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432` (container `lenqclaw-db-1`); database riêng `lq_h14` (tạo rỗng, drop khi xong); CẤM đụng DB khác. Gói này KHÔNG gọi model.

## 2. PHẠM VI
ĐƯỢC GHI: `apps/web/**` (trang, route handler, `lib/**`, test, `vitest` config của web nếu cần), `docs/web.md`, `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R14_thi-cong_P05-E.md, evidence/P05-E/**}`.
CẤM ĐỤNG: `packages/**` (dịch vụ core thiếu/sai ⇒ Câu hỏi mở kèm chữ ký cần, KHÔNG tự sửa core), `apps/zalo-worker/**`, `db/migrations/**`, `evals/**`, `scripts/**`, `specs/**`, `plan.md`, `handoffs/**`, `brain4agent/**`, `docs/core.md`, `package.json` gốc/`package-lock.json` (thêm phụ thuộc mới ⇒ Câu hỏi mở), `.env`, `packages/core/src/agent/prompts/resident.ts` (đang treo — KHÔNG stage), 3 file untracked `*presentation_transcript*`.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. Phân quyền `lib/auth/policy.ts` §8.1 (giữ `matchesSegment`; test ≥12 ca mới).
b. API §8.2 (route handler, `force-dynamic`, body JSON, 400/403/404/409 theo §8.6; từ chối cấp quyền THIẾU lý do ⇒ 400; quyết định hai lần ⇒ 409).
c. Trang §8.3: `/tickets` (duyệt/từ chối `access_request`), `/gate` (thay `/passes`), `/vendors` (+ "Đã thu phí", duyệt, đình chỉ, đặt trần), `/jobs` 🟢; nhãn "DỮ LIỆU MÔ PHỎNG" khi `DATA_MODE=sim`; style inline như trang hiện có.
d. SimBoard + `/api/dev/sim/tick` (§8.3 / SPEC-P05 §10.11): khung DM thợ (thread = uid), chọn nhóm, nút Tick gọi `runTimers(now)`; chỉ khi `DATA_MODE=sim`; `/api/dev/sim/send` từ chối `sender_uid='system'`.
Xong khi (toàn gói): `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test` (web: policy ≥12 ca mới), `DATABASE_URL=…/lq_h14 npm run test:db` (DB rỗng, migrate+seed+`DATA_MODE=sim` seed:sim; web ≥10 ca mới) và `npm run gate` đều exit 0; 0 skip; số test không giảm (nền: `npm test` 296, `test:db` 165); vùng cấm §8.5 có test chứng minh (vd vai không phải staff gọi API duyệt ⇒ 403).
Evidence BẮT BUỘC: `evidence/P05-E/{baseline,typecheck,build,test,test-db,gate,diff-stat}.txt` + một bằng chứng ĐỎ: bỏ tạm kiểm "lý do bắt buộc" ⇒ test đỏ (`red-reject-reason.txt`, hoàn nguyên sau khi chụp).

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh, `git commit -m … -- <đường>` (worker P05-C commit song song; `index.lock` ⇒ chờ vài giây thử lại). Không push. Commit tiếng Anh Conventional Commits (`feat(web): …`), kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn ⇒ "Câu hỏi mở", chọn cách an toàn nhất, KHÔNG sửa `specs/`. Test DB web chạy tuần tự (`fileParallelism: false` — gotcha G24). Kiểm mã thoát trực tiếp, không qua pipe.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, d | 🟠 | phân quyền + API có hợp đồng §8.1–§8.2, §8.6; test tự biết đúng/sai |
| c | 🟠 (`/jobs` 🟢) | trang theo mẫu có sẵn |

## 6. REPORT PHẢI CÓ
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H14_thi-cong_P05-E.md` / `Base:` / `Head:`; lệnh + exit code nguyên văn; test tổng/pass/fail/skip trước/sau; `git diff --stat` + SHA; bảng phân công thực tế; việc KHÔNG làm + lý do; Câu hỏi mở. Dòng không rỗng cuối = `⏳ Chờ người duyệt.`. Commit report + evidence riêng `docs(plan-01): report R14` SAU commit mã cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R14_thi-cong_P05-E.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P05-E/`

## 7. PHỤ LỤC VÒNG 2 (SO, 2026-09-26) — thắng mục 1–6 khi khác
R14 🔁 ở đúng một điểm: route `POST /api/vendors/{id}/status` nhánh `suspended`. Hợp đồng sửa: `specs/SPEC-P05-Dispatch.md` §10.17 (Đ30) — đọc toàn bộ.
- MỞ PHẠM VI: `packages/core/src/services/vendors.ts` (mới), `services/access.ts` (CHỈ `withdrawGranted` mới + chốt chặn trong `dispatchToVendor`), `services/timers.ts` (CHỈ nhánh `reemitStuckGranted` §10.17), `services/job-state.ts` (cặp `access_granted → published`) + test của nó, `domain/errors.ts` (`VendorNotFoundError`), export mới ở entry package core nếu cần, test DB core mới `packages/core/src/dbtests/p05-suspend.db.test.ts`, `docs/core.md` (CHỈ mục đình chỉ — worker P05-C cũng sửa file này, giữ thay đổi nhỏ, thử lại nếu xung đột). Mọi CẤM khác giữ nguyên. Worker P05-C vẫn đang sửa `packages/core/src/agent/**` + `services/pii-gate.ts` — KHÔNG đụng.
- Route web chỉ gọi `suspendVendor`; xoá SQL `vendors`/`vendor_slots` khỏi route; test web cho 404/409 cập nhật theo.
- Xong khi: 4 ca (a)–(d) §10.17 xanh trên DB rỗng `lq_h14`; 2 bằng chứng ĐỎ §10.17 (`evidence/P05-E/red-suspend-order.txt`, `red-dispatch-guard.txt`, hoàn nguyên sau khi chụp); `npm run typecheck`, `npm run build`, `npm test`, `test:db`, `npm run gate` exit 0, số test không giảm (nền vòng 1: 308 / 184), 0 skip.
- Commit `fix(core,web): suspendVendor service with ordered steps and dispatch guard (D30)`; ghi "## Vòng 2" trong R14, dòng cuối `⏳ Chờ người duyệt.`, commit `docs(plan-01): report R14 round 2`.
