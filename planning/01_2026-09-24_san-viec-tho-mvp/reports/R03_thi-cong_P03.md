Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude (Sonnet 5) · Bước 0: exit 0 · hiểu việc: phạm vi = `packages/core/**`, `apps/web/**` (chỉ nối handler `/dev/sim` + chọn kịch bản), `db/migrations/002_*.sql+`, `evals/**`, `scripts/eval_golden.mjs`, `package.json`/`package-lock.json` (script mới), `planning/.../{plan.md (chỉ tick checklist P03), reports/R03, evidence/P03/**}` / xong khi = `npm ci`, `typecheck`, `build`, `test`, `test:db` (DB rỗng), `gate` đều exit 0, 0 skip, số test > 40, `check_agent_tools` `forbidden_tools:0`, chạy tay `/dev/sim` 2 ca không cần LLM có evidence / cấm (bằng lời mình) = không sửa `db/migrations/001_init.sql`, `specs/**`, `scripts/check_*.mjs`, `scripts/gate.mjs`, không gọi LLM trong transaction DB, không dùng pg-boss ở P03, không đụng truy hồi lai/embedding, không sửa `report_problem`/dispatch/tool phía thợ, không tự "sửa cho tốt hơn" ngoài SPEC.

Handoff: handoffs/H03_thi-cong_P03.md
Base: 4955b5a96757ada62c0920c273ad3bb0043d131f
Head: e3d207933679feee064e982b3ab8080f97eed0f4

## 1. Lệnh + exit code (nguyên văn)

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| typecheck | `npm run typecheck` | 0 | [typecheck](../evidence/P03/typecheck.txt) |
| build | `npm run build` (không `DATABASE_URL`) | 0 | [build](../evidence/P03/build.txt) |
| test | `npm test` | 0 | [test](../evidence/P03/test.txt) |
| migrate | `npm run db:migrate` trên DB rỗng `lq_p03` | 0 (`applied: 2`) | [migrate](../evidence/P03/migrate.txt) |
| seed-sim | `npm run db:seed:sim` ×2 (idempotent) | 0/0 | [seed-sim](../evidence/P03/seed-sim.txt) |
| seed-sim RED | `npx tsx packages/core/src/db/seed-sim.ts` không `DATA_MODE=sim` | 1 | [red-seed-sim-guard](../evidence/P03/red-seed-sim-guard.txt) |
| test:db | `npm run test:db` trên DB rỗng mới | 0 | [test-db](../evidence/P03/test-db.txt) |
| gate | `npm run gate` | 0 | [gate](../evidence/P03/gate.txt) |
| eval:golden | `npm run eval:golden` (không `ANTHROPIC_API_KEY`) | 3 (blocked, đúng thiết kế Đ17-e) | [eval-golden](../evidence/P03/eval-golden.txt) |
| manual /dev/sim | 2 ca không cần LLM qua HTTP thật | — | [manual-sim](../evidence/P03/manual-sim.txt) |
| RED (đã sửa) | test BB-03 trước khi ép `::text` cho cột `date` | 1 | [red-bb03-date-cast-bug](../evidence/P03/red-bb03-date-cast-bug.txt) |

## 2. Test tổng/pass/fail/skip

`npm test`: 54/54/0/0 (web 17 + core 37, gồm 26 test emergency/pii mới). `npm run test:db`: 23/23/0/0 (core 21 gồm 11 ca P03 mới [9 ca §10.6(a)-(i) + 2 ca BB-03] + 10 ca P01; web 2). 0 skip cả hai. Dòng gate cuối: [gate](../evidence/P03/gate.txt).

## 3. `git diff --stat <Base>..<Head>` + SHA từng commit

[diff-stat](../evidence/P03/diff-stat.txt) (chụp lúc `git add -A` tạm thời để đo — không phản ánh cách chia commit thật, xem danh sách commit bên dưới cho nội dung chính xác từng đợt).

- `b1d4990` feat(p03): lexical regulation search (immutable_unaccent + generated tsv)
- `fdbc590` feat(p03): add InvalidCategoryError and ConsentMissingError
- `e76b7c7` feat(p03): 8 resident-agent tools (01-CONTRACTS §7, SPEC-P03 §10.3)
- `5a83bb1` feat(p03): resident agent orchestrator + emergency/register + web wiring
- `273821b` feat(p03): db:seed:sim (QC-DEMO regulations, sim residents, price_book)
- `6099096` feat(p03): golden datasets + eval_golden.mjs scorer
- `e3d2079` test(p03): emergency golden (npm test) + 9 agent-loop cases + BB-03 — **Head**

## 4. Bảng phân công thực tế

| Gói (mục §3 handoff) | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a — migration 002 + truy hồi từ khoá | 🟠 | Claude Sonnet 5 |
| b — db:seed:sim | 🟠 | Claude Sonnet 5 |
| c — 8 tool + 2 lỗi mới | 🟠 | Claude Sonnet 5 |
| d — residentHandler/runResidentTurn/prompt/nối `/dev/sim` | 🟠 | Claude Sonnet 5 |
| e — khẩn cấp tất định | 🟠 | Claude Sonnet 5 |
| f — golden + eval_golden.mjs | 🟠 | Claude Sonnet 5 |
| g — 9 ca §10.6(a)-(i) + BB-03 | 🟠 | Claude Sonnet 5 |

Không gói nào phải leo lên 🔴 (không gặp quyết định thiếu trong SPEC-P03 §10, trừ mục "Câu hỏi mở" bên dưới — mục đó không chặn phần còn lại nên xử lý bằng cách KHÔNG đụng vào, không tự leo tầng).

## 5. Việc KHÔNG làm + lý do

- **Không sửa `adapters/model.ts`** cho phần "fallback phía server" của §10.8: `@anthropic-ai/sdk@0.68.0` cài trong `node_modules` (đã tra `.d.ts` thật, không đoán) KHÔNG có trường `fallbacks`/`betas` server-side-fallback trên `messages.create` (chỉ `beta.messages.create` có `betas: Array<BetaAPI.AnthropicBeta>`, không có `fallbacks`). Theo đúng luật §10.8 ("vẫn không có ⇒ ghi Câu hỏi mở, KHÔNG tự đổi sang dạng mảng"), không implement, ghi ở mục 6.
- **`strict: true` trên `Tool`**: SDK không có trường này trên kiểu `Tool` (chỉ `Tool.InputSchema` có index signature). Giải quyết bằng giao `type ToolDefinition = Tool & { strict: true }` (không định nghĩa lại `Tool`) — ghi rõ trong `tool-kit.ts`, không phải Câu hỏi mở vì có lối đi kỹ thuật rõ ràng.
- **Không cập nhật `docs/core.md`, `brain4agent/**`**: nằm ngoài "ĐƯỢC GHI" của handoff (chỉ liệt `packages/core/**`, `apps/web/**` hẹp, `db/migrations/002_*`, `evals/**`, `scripts/eval_golden.mjs`, `package.json`, `planning/.../{plan.md, reports/R03, evidence/P03}`). Đồng bộ não (AGENTS.md §5.B) cần một lượt riêng do người/agent có quyền đụng `docs/`, `brain4agent/` thực hiện.
- **Không tick checklist P03 trong `plan.md`**: handoff cho phép ("chỉ tick checklist P03") nhưng theo Luật K.3/K.4, sign-off là việc của người duyệt SAU khi đo lại, không phải tự worker tự nhận đã xong — để trống chờ phán quyết, tránh report tự chấm điểm mình.
- **Không đụng `evals/scenarios/**` hay sửa `sim/sim-transport.ts`**: P03 chỉ cần `routeInboundEvent` (file mới, `agent/resident-agent.ts`) chọn `residentHandler`/`echoHandler`; `sim-transport.ts` giữ nguyên đúng ghi chú "KHÔNG sửa file này khi làm P03" trong chính file đó.
- **`price_book`/`window_start`/`window_end` khi mở `service_case`**: không tự bịa thuật toán quy đổi "2-3 khung giờ gợi ý" (chuỗi tự do do agent chọn) thành `timestamptz` thật — để `window_start`/`window_end` NULL, vì SPEC không cho công thức và bịa ra là quyết định kiến trúc nên để mục 6.
- **Golden `diagnosis`/`responsibility` nhánh CÓ credential**: viết một lượt gọi model đơn giản (không phải toàn bộ vòng tool 6 lượt) để chấm — nhánh này KHÔNG chạy được trên máy hiện tại (0 `ANTHROPIC_API_KEY`) nên chỉ kiểm được đường "blocked" (đã đo, exit 3); đường "có key" chưa có bằng chứng chạy thật, ghi ở mục 6.

## 6. Câu hỏi mở (cần người)

1. **Phát hiện trong lúc thi công — commit song song `f03f480`/`7df2a60` (23:48–23:51, cùng ngày, do phiên khác) đã đổi `01-CONTRACTS.md` thêm §2b "Nhà cung cấp LLM — Gemini mặc định (Đ18)"** trong khi tôi đang thi công theo Base `4955b5a` (chưa có §2b, và `SPEC-P03 §10.8` tôi đọc lúc "hiểu việc" vẫn ghi "Model giữ `claude-opus-5` (Đ06)"). §2b nói rõ "`callModel` giữ NGUYÊN chữ ký §2 — core, agent, tool KHÔNG biết nhà cung cấp", nên code P03 của tôi (chỉ gọi `callModel()` qua interface có sẵn, KHÔNG đụng `adapters/model.ts`) không bị hỏng bởi thay đổi này. Nhưng **`adapters/model.ts` hiện tại (không phải do tôi sửa) vẫn CHỈ gọi Anthropic**, chưa có nhánh Gemini/`MODEL_PROVIDER`/dịch content-block/`InvalidToolInput`/`thoughtSignature` mà §2b mô tả — tức §2b là hợp đồng đã chốt nhưng CHƯA có ai thi công. Đây là việc ngoài phạm vi handoff H03 (không nằm trong SPEC-P03 §10, không trong "ĐƯỢC GHI"), tôi KHÔNG tự làm. Cần người: xác nhận có gói/handoff riêng cho §2b (Gemini adapter) và cập nhật SPEC-P03 §10.8 cho khớp Đ18, hoặc revert nếu chưa chốt.
2. **`@anthropic-ai/sdk@0.68.0` không có `fallbacks`** trên `messages.create`/`beta.messages.create` — xác nhận: bỏ qua phần "fallback phía server" của §10.8 cho tới khi có SDK/route hỗ trợ, hay cần workaround khác (retry thủ công nhiều model qua `MODEL_FALLBACKS`, giống ý tưởng ở §2b)?
3. **`window_start`/`window_end` của `jobs`** khi `open_service_case` chạy: hiện để NULL (SPEC không cho công thức quy đổi "khung giờ gợi ý" dạng chuỗi tự do sang `timestamptz`) — cần chốt quy ước (vd giờ cố định theo "buổi sáng/chiều" hay chờ cư dân xác nhận giờ chính xác ở bước sau) trước khi P05/P06 dùng các cột này.
4. **Golden `diagnosis`/`responsibility` nhánh có `ANTHROPIC_API_KEY`**: `scripts/eval_golden.mjs` gọi `callModel` một lượt đơn (không phải vòng tool 6 lượt như agent thật) để chấm — chưa chạy thật được trên máy này (0 key). Cần người có key chạy thử một lần khi có, hoặc xác nhận cách chấm đơn-lượt là đủ cho G09/G10.

## 7. Tiếp theo

🖐 Cần tay người: trả lời 4 câu hỏi mở ở mục 6 (đặc biệt câu 1 — xung đột Đ18/§2b) · 🤖 Agent làm được ngay: chờ lệnh, có thể triển khai Gemini adapter (§2b) hoặc revert nếu được xác nhận phạm vi · ⭐ Nên làm trước: xử lý câu hỏi 1 (Đ18/§2b) vì nó là thay đổi hợp đồng lớn đang treo, ảnh hưởng mọi route gọi model kể cả P03 · ⏸ Chưa làm: tick checklist P03 trong `plan.md` (để người duyệt làm sau khi đo lại — mục 5), đồng bộ `docs/`/`brain4agent/` (ngoài phạm vi handoff), nhánh "có credential" của golden diagnosis/responsibility.

⏳ Chờ người duyệt.

🔁 SỬA: C1–C7, N2–N3, N5–N14, G1/G6–G10 theo SPEC-P03 §11 (Đ20) — vòng 2 giao ở handoffs/H06_thi-cong_P03-v2.md · SO · 2026-09-25 09:51:29
