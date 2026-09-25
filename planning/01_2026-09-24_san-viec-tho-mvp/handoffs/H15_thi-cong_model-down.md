1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ09, Đ21, Đ31) → `specs/SPEC-P03-Resident-Agent.md` §11.1, §11.6, §11.12 (hợp đồng của bạn) → `docs/core.md` → code `packages/core/src/agent/{resident-agent,emergency,pii}.ts`, `agent/tools/handoff_to_staff.ts`, test DB P03 hiện có. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. Agent cư dân P03 đã duyệt mã. Khi model sập, nhánh lỗi của `runResidentTurn` chỉ gửi "Em đang bận, sẽ trả lời trong vài phút." — không hotline, không ai được báo. Gói của bạn: làm đường lùi §11.12 (Đ31) — CODE, không prompt, không gọi model thật. Base: tự đo `git rev-parse HEAD`. Postgres dev `127.0.0.1:55432` (container `lenqclaw-db-1`; Docker tắt ⇒ tự bật lại); database riêng `lq_h15` (tạo rỗng, drop khi xong); CẤM đụng DB khác.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/src/agent/resident-agent.ts` (CHỈ nhánh lỗi `callModel` + import), `agent/emergency.ts` và/hoặc `agent/pii.ts` (CHỈ `bqlHotline()` + `MODEL_DOWN_REPLY`), test mới `packages/core/src/dbtests/p03-model-down.db.test.ts` (+ test thuần nếu cần), `docs/core.md` (một mục ngắn), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R15_thi-cong_model-down.md, evidence/model-down/**}`.
CẤM ĐỤNG: `packages/core/src/agent/prompts/**` (nhất là `resident.ts` — đang treo, KHÔNG stage), mọi tool (`agent/tools/**` — dùng `handoffToStaffTool` như có), `agent/vendor-*.ts`, `services/**`, `apps/**`, `db/migrations/**`, `evals/**`, `scripts/**`, `specs/**`, `plan.md`, `handoffs/**`, `brain4agent/**`, `package.json`, `.env`, 3 file untracked `*presentation_transcript*`.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. `bqlHotline()` dùng chung (emergency.ts đổi sang gọi nó, hành vi giữ nguyên) + `MODEL_DOWN_REPLY(hotline)` đúng câu chữ §11.12.
b. Nhánh lỗi `callModel` trong `runResidentTurn`: gửi `MODEL_DOWN_REPLY` + `handoffToStaffTool.run(ctx, { reason: 'model_unavailable' })`; giữ audit `agent.model_error` cho lỗi khác `ModelUnavailableError`.
c. Test (a)–(d) §11.12 với model giả + bằng chứng ĐỎ (khôi phục câu cũ ⇒ (a) đỏ, hoàn nguyên sau khi chụp).
Xong khi: `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_h15 npm run test:db` (DB rỗng, migrate+seed+`DATA_MODE=sim` seed:sim), `npm run gate` đều exit 0; 0 skip; số test không giảm (nền: `npm test` 317, `test:db` 192); hồi quy P03 (`p03-regression`, `p03`) xanh.
Evidence BẮT BUỘC: `evidence/model-down/{typecheck,build,test,test-db,gate,red-busy-reply,diff-stat}.txt`.

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh, `git commit -m … -- <đường>`. Không push. Commit tiếng Anh `fix(core): …`, kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn ⇒ "Câu hỏi mở", chọn cách an toàn nhất, KHÔNG sửa `specs/`. Kiểm mã thoát trực tiếp, không qua pipe.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🟠 | hợp đồng + câu chữ đã chốt §11.12; test tự biết đúng/sai |

## 6. REPORT PHẢI CÓ
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H15_thi-cong_model-down.md` / `Base:` / `Head:`; lệnh + exit code nguyên văn; test tổng/pass/fail/skip trước/sau; `git diff --stat` + SHA; bảng phân công thực tế; việc KHÔNG làm + lý do; Câu hỏi mở. Dòng không rỗng cuối = `⏳ Chờ người duyệt.`. Commit report + evidence riêng `docs(plan-01): report R15` SAU commit mã.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R15_thi-cong_model-down.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/model-down/`
