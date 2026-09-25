1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ10, Đ21, Đ26, Đ27, Đ28) → `specs/SPEC-P05-Dispatch.md` §10.1, §10.4–§10.6, §10.8.2, §10.10, §10.13–§10.15 (§10.12 dòng P05-C là "xong khi") → `specs/01-CONTRACTS.md` §2, §7, §9 → `specs/TESTING-ACCEPTANCE.md` §3 (`vendor_intent.jsonl`), §6 → `reports/R12_thi-cong_P05-B.md` (nền bạn đứng lên + mục "SO phán") → `docs/core.md` → mẫu: `agent/triage.ts`, `agent/resident-agent.ts`, `agent/tools/open_service_case.ts`, `scripts/eval/score.mjs`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. P05-B (nền dispatch: migration 006, dịch vụ `services/{dispatch,access,slots,timers,system-events,vendor-messages,pii-gate}.ts`, `agent/vendor-intent.ts`, `agent/vendor-tool-context.ts`, `agent/conversation.ts`) đã duyệt (R12 ✅). Gói của bạn là **P05-C — agent thợ**: lớp hiểu ý thợ bằng model + agent thợ + 9 tool + golden + máy chấm. Luật người dùng (Đ21): model HIỂU Ý; code chỉ là lưới an toàn tất định và luật nằm TRONG tool. Song song với bạn, worker khác làm P05-E (`apps/web/**`, `docs/web.md`) — KHÔNG đụng. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432` (container `lenqclaw-db-1`); database riêng `lq_h13` (tạo rỗng, drop khi xong); CẤM đụng DB khác. `.env` có key model (gitignore) — chỉ nạp qua `--env-file=.env`; CẤM in/cat/echo key.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/src/agent/{vendor-triage,vendor-agent}.ts` (mới), `agent/prompts/{vendor-triage,vendor}.ts` (mới), `agent/tools/{claim_job,confirm_assignment,decline_hold,request_access,dispatch_to_vendor,get_my_assignments,request_slot,get_my_slot,vendor_handoff_to_staff}.ts` (mới), `agent/tools/index.ts` (CHỈ thêm `VENDOR_TOOLS`), `agent/resident-agent.ts` (CHỈ `routeInboundEvent`: `market` ⇒ `vendorHandler`), `agent/pii.ts` (CHỈ export regex dùng chung) + `services/pii-gate.ts` (bỏ bản regex lặp — R12 Q2), `agent/vendor-tool-context.ts` (giữ `VendorTriageResult` ở đây — R12 Q1), test mới/sửa trong `packages/core/src/**` + `dbtests/`, `evals/golden/vendor_intent.jsonl` (mới), `scripts/eval/vendor-intent.mjs` (mới), `scripts/check_agent_tools.mjs` (nếu tool mới cần vào máy đo), `docs/core.md` (mục agent thợ), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R13_thi-cong_P05-C.md, evidence/P05-C/**}`.
CẤM ĐỤNG: `agent/prompts/resident.ts` (đang treo — KHÔNG stage), `agent/prompts/triage.ts`, `agent/triage.ts`, mọi tool phía cư dân (`open_service_case`, `publish_job_to_group`, `respond_to_quote` — P05-D), `agent/consent.ts`, `apps/**`, `db/migrations/**`, `services/*.ts` khác ngoài `pii-gate.ts` (có lỗi ở dịch vụ ⇒ Câu hỏi mở, không sửa), `specs/**`, `plan.md`, `handoffs/**`, `brain4agent/**`, `package.json`/`package-lock.json`, `.env`, `scripts/eval_golden.mjs` + `scripts/eval/{score,run,args,red-fake-model}.mjs`, 3 file untracked `*presentation_transcript*`.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. `vendor-triage.ts` + prompt (§10.4.1, route `triage`); luật bắt tin nhóm 3 điều kiện (§10.4.3); bằng chứng ý định TRONG tool (§10.4.4, `IntentNotConfirmedError`, `VENDOR_INTENT_MIN`).
b. `vendor-agent.ts`: `vendorHandler`, `runVendorTurn`, lượt sự kiện hệ thống `access_approved` (§10.5), prompt `vendor.ts` (§10.5.5, route `vendor_parse`); agent KHÔNG phát text tự do vào nhóm.
c. 9 tool §10.6 (mẫu `open_service_case.ts`, `strict`, audit `tool.<tên>`), gọi dịch vụ P05-B, không viết SQL mới trong tool.
d. Test DB client kịch bản theo §10.12 dòng P05-C (claim thắng/thua, pending, no_slot, quote vượt khung, OK sau hạn ⇒ `HoldExpiredError`, sự kiện hệ thống ⇒ dispatch, nhóm nhiễu 0 lần gọi model, text tự do không vào nhóm) — model GIẢ, không mạng.
e. Golden `vendor_intent.jsonl` ≥ 60 ca theo TESTING §3 + `scripts/eval/vendor-intent.mjs` (ngữ nghĩa exit như `eval_golden`: thiếu credential/blocked >10% ⇒ exit 3; đạt ⇒ 0; trượt ⇒ 1) + bằng chứng ĐỎ với model giả trả rác ⇒ exit 1. CẤM chèn đáp án golden vào prompt.
f. Chạy thật MỘT lần: `MODEL_PROVIDER=gemini DATA_MODE=sim DATABASE_URL=…/lq_h13 npx tsx --env-file=.env scripts/eval/vendor-intent.mjs > evidence/P05-C/real-gemini.txt`. Exit 3 (quota) ⇒ chạy thêm MỘT lần `MODEL_PROVIDER=vyce` ⇒ `real-vyce.txt`, ghi rõ là số THAM KHẢO (Đ26/Đ28: gate chấm bằng Gemini). Trượt ⇒ được sửa prompt thợ tối đa 1 vòng, ghi số trước/sau.
Xong khi (toàn gói): `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h13 npm run test:db` (DB rỗng, migrate+seed+`DATA_MODE=sim` seed:sim), `npm run gate` đều exit 0; 0 skip; số test không giảm (nền: `npm test` 296, `test:db` 165); hồi quy P03 xanh; `git grep -nE "AIza[0-9A-Za-z_-]{30,}|sk-[a-f0-9]{30,}"` rỗng.
Evidence BẮT BUỘC: `evidence/P05-C/{baseline,typecheck,build,test,test-db,gate,red-fake-vendor,real-gemini,diff-stat}.txt` (+ `real-vyce.txt` nếu có).

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh, `git commit -m … -- <đường>` (worker P05-E commit song song; `index.lock` ⇒ chờ vài giây thử lại). Không push. Commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn ⇒ "Câu hỏi mở", chọn cách an toàn nhất, KHÔNG sửa `specs/`. Vùng cấm §10.14 + bất biến §10.1.3 là luật cứng. Kiểm mã thoát trực tiếp, không qua pipe. Lệnh dài chạy chặn tiền cảnh (>10 phút ⇒ chạy nền rồi chờ thông báo, KHÔNG poll log).

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c, d | 🟠 | hợp đồng + luật đã chốt §10.4–§10.6; test tự biết đúng/sai |
| e, f | 🟠 thi công · 🔴 review prompt + golden (SO làm sau khi nộp) | golden là thước đo an toàn — người khác phải soát |

## 6. REPORT PHẢI CÓ
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H13_thi-cong_P05-C.md` / `Base:` / `Head:`; lệnh + exit code nguyên văn; test tổng/pass/fail/skip trước/sau; `git diff --stat` + SHA; bảng phân công thực tế; bảng chỉ số → ngưỡng → số đo (ghi rõ cặp provider/model); token/latency theo route; việc KHÔNG làm + lý do; Câu hỏi mở. Dòng không rỗng cuối = `⏳ Chờ người duyệt.`. Commit report + evidence riêng `docs(plan-01): report R13` SAU commit mã cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R13_thi-cong_P05-C.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P05-C/`

## 7. PHỤ LỤC VÒNG 2 (SO, 2026-09-26) — thắng mục 1–6 khi khác
R13 🔁: 11/67 ca `vendor_intent.jsonl` trùng nguyên văn (sau chuẩn hoá bỏ dấu/chữ thường) với câu ví dụ trong `agent/prompts/{vendor-triage,vendor}.ts` — danh sách ở cuối R13 "SO phán vòng 1".
- Sửa PROMPT, không sửa golden (TESTING §3 bắt buộc golden có "e nhận", "cho em cuốc này"…): viết lại ví dụ trong prompt bằng câu KHÁC nghĩa bề mặt (định nghĩa nhãn + ví dụ gần-giống mới), giữ nguyên luật. CẤM xoá/đổi `expect_*` của ca golden; được thêm ca mới.
- Máy đo chống tái phạm: test thuần `packages/core/src/agent/prompts/vendor-golden-leak.test.ts` — chuẩn hoá (NFD bỏ dấu, `đ`→`d`, chữ thường, chỉ giữ `[a-z0-9 -]`), lấy mọi chuỗi trong ngoặc kép của hai prompt thợ, so với `text` mọi ca golden ⇒ 0 trùng. Bằng chứng ĐỎ: chèn tạm một câu golden vào prompt ⇒ test đỏ (`evidence/P05-C/red-golden-leak.txt`, hoàn nguyên).
- `defer` (V?? 2 ca): hoặc thêm nhãn `defer` vào enum `intent` của prompt triage thợ + `VendorTriageResult` (theo SPEC §10.4.1 nếu có), hoặc nêu rõ trong report vì sao máy chấm coi `defer` là "không phải claim" — chọn theo SPEC, SPEC không nói ⇒ Câu hỏi mở + cách an toàn (không tính vào claim).
- KHÔNG chạy model thật ở vòng này (Gemini chờ quota; lượt chấm golden thợ bằng Gemini do SO chạy cùng lượt H08). Worker P05-E đang sửa `packages/core/src/services/{vendors,access,timers,job-state}.ts`, `domain/errors.ts` cùng cây — KHÔNG đụng.
- Xong khi: test rò golden xanh + bằng chứng đỏ; `npm run typecheck`, `npm test`, `npm run gate` exit 0 (không DB); số test không giảm; 0 skip. Commit `fix(core): rewrite vendor prompt examples to avoid golden leakage`; ghi "## Vòng 2" trong R13, dòng cuối `⏳ Chờ người duyệt.`, commit `docs(plan-01): report R13 round 2`.
