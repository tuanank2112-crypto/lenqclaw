1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0: `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` (từ root repo). `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG cờ đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/01_2026-09-24_san-viec-tho-mvp/plan.md` §2 (Đ17–Đ20) → `specs/00-ARCHITECTURE.md` §6 → `specs/01-CONTRACTS.md` §2b, §4–§7, §9 → `specs/SPEC-P03-Resident-Agent.md` toàn bộ (**§11 là hợp đồng vòng này**, thắng §1–§10 chỗ mâu thuẫn) → `reports/R05_tham-dinh_P03.md` §7 (mã lệch C/N/G) → `evidence/P03-audit/attack-source.txt` → `docs/core.md`. Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
Repo `D:\lenqclaw`, nhánh `main`. P03 (agent cư dân: 8 tool, vòng tool, khẩn cấp, che PII, seed sim, golden) đã thi công ở `e3d2079`. Thẩm định đối kháng R05 tìm 7 lệch mức chặn và 14 lệch nên sửa; SO đã đo lại và phán R03 `🔁`. Hợp đồng vá: SPEC-P03 §11. Adapter Gemini (H04) đã vào `main` trước bạn: `tool-kit.ts` đã kiểm input theo schema (N4), `max_tokens` 16000 (N1) — KHÔNG làm lại, chỉ đừng phá.
Base: tự đo `git rev-parse HEAD` trước dòng sửa đầu tiên. Postgres dev đang chạy (`127.0.0.1:55432`, user/pass `lenqclaw`); tạo database riêng `lq_p03v2`, CẤM đụng database khác, drop khi xong. `.env` ở root có key Gemini — KHÔNG cần cho vòng này (mọi test dùng model giả); CẤM in/ghi key. Số đo nền: tự đo `npm test` và `npm run test:db` trên Base, ghi vào report.

## 2. PHẠM VI
ĐƯỢC GHI: `packages/core/**`, `apps/web/**` (chỉ khi §11 buộc — vd `BUSY_REPLY`/takeover qua `/dev/sim`), `db/migrations/003_*.sql` (mới, chỉ thêm), `evals/golden/emergency.jsonl`, `package.json` (chỉ script `db:seed:sim`/`test:db` theo §11.7 C7), `scripts/` file MỚI nếu C7 cần (vd chạy lệnh kèm env đa nền tảng), `planning/01_2026-09-24_san-viec-tho-mvp/{reports/R06_thi-cong_P03-v2.md, evidence/P03-v2/**}`.
CẤM ĐỤNG: `db/migrations/001_*.sql`, `002_*.sql`, `specs/**`, `plan.md`, `brain4agent/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.claude/**`, `.env`, `scripts/check_*.mjs`, `scripts/gate.mjs`, `scripts/eval_golden.mjs`, `evals/golden/{diagnosis,responsibility}.jsonl`, nhánh dịch Gemini/Anthropic trong `adapters/model.ts`. VÙNG CẤM + LÝ DO: SPEC-P03 §7, §10.7, §11.9.

## 3. VIỆC PHẢI LÀM (xong khi: <lệnh> → <kết quả>)
a. §11.1 + §11.2 khẩn cấp (C5, C4, G1) + mở rộng `emergency.jsonl`. Xong khi: test golden emergency trong `npm test` ⇒ 0 bỏ sót, ≤1 báo nhầm; test mới: 0/70 ca `diagnosis`+`responsibility` golden bị `detectEmergency` bắt.
b. §11.3 che PII (C6, G8). Xong khi: test chạy 20 biến thể ca 1 của R05 qua `runResidentTurn` với model giả ghi request ⇒ 0 chuỗi thô.
c. §11.4 citation + migration 003 (C1, N12). Xong khi: DB rỗng `npm run db:migrate` ⇒ `applied: 3`; ca 2g/2h/2i của R05 ⇒ `unclear`, quote lưu = đoạn body.
d. §11.5 đồng ý (C2, C3). Xong khi: 8 câu ca 3 của R05 + đồng ý cùng lượt + đổi verdict ⇒ 0 case mở; "đồng ý", "ok ạ", "đồng ý, 9h sáng mai nhé" ở lượt sau ⇒ `case_open`.
e. §11.6 (N2, N3, N6, N7, N8, N11, G9) và §11.7 (C7, N5, N9, N10, N14, G6, G7, G10).
f. Chuyển MỌI ca ĐỎ trong `attack-source.txt` thành test hồi quy trong repo (tên test ghi mã ca R05), trừ ca thuộc §11.9 (liệt kê ở report kèm lý do).
Xong khi (toàn gói): `npm ci`, `npm run typecheck`, `npm run build` (KHÔNG `DATABASE_URL`), `npm test`, `DATABASE_URL=…/lq_p03v2 npm run test:db` (DB rỗng), `npm run gate` đều exit 0; 0 skip; số test mỗi lệnh > số đo nền; `DATA_MODE=production npm run db:seed:sim` ⇒ exit 1; `test:db` đảo thứ tự file 3 lượt ⇒ exit 0 cả 3 (ghi lệnh đảo trong report).
Evidence BẮT BUỘC (stdout máy, redirect): `evidence/P03-v2/{baseline,typecheck,build,test,test-db,gate,migrate,red-seed-guard,test-db-reversed,regression-map,diff-stat}.txt` (`regression-map` = bảng mã ca R05 → tên test, sinh bằng lệnh `grep`).

## 4. LUẬT
Không `git add -A`/`.` — stage tường minh rồi `git commit -m … -- <đúng các đường đó>`. Không push. Không "sửa cho tốt hơn" ngoài SPEC. Danh sách từ ở §11.1/§11.5 là hợp đồng: không đạt ngưỡng ⇒ Câu hỏi mở, CẤM tự thêm/bớt. Commit tiếng Anh Conventional Commits theo việc (a…f), kết bằng dòng `Co-Authored-By` của vỏ bạn. SPEC thiếu/mâu thuẫn ⇒ ghi "Câu hỏi mở", làm phần độc lập, KHÔNG sửa `specs/`. Chuỗi gửi người dùng: tiếng Việt CÓ DẤU. Kiểm mã thoát trực tiếp, không qua pipe. Lệnh dài chạy CHẶN ở tiền cảnh, redirect thẳng vào evidence. Không để server chạy sau khi xong.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c, d, e | 🟠 | luật chốt ở §11 kèm ca đỏ cụ thể; test tự biết đúng/sai |
| f | 🟢 | chép ca có sẵn thành test |
Gặp quyết định chưa có trong §11 ⇒ dừng phần đó, ghi Câu hỏi mở.

## 6. REPORT PHẢI CÓ
Theo mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7 (dòng 1 khai vai; dòng 2–4 `Handoff: handoffs/H06_thi-cong_P03-v2.md`/`Base:`/`Head:`; 7 mục; bảng phân công thực tế; bảng "mã lệch R05 → commit → test"). Dòng không rỗng cuối cùng khi nộp = `⏳ Chờ người duyệt.` — CẤM tự ghi phán quyết (không ai phán việc của mình), CẤM để trống (máy đo hồ sơ đòi dòng cuối là phán quyết hoặc ⏳). Commit report + evidence riêng `docs(plan-01): report R06` SAU commit công việc cuối.

Report: `planning/01_2026-09-24_san-viec-tho-mvp/reports/R06_thi-cong_P03-v2.md` · Evidence: `planning/01_2026-09-24_san-viec-tho-mvp/evidence/P03-v2/gate.txt`
