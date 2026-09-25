Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude (Sonnet 5) · Bước 0: exit 0 · hiểu việc: phạm vi ghi = `packages/core/src/adapters/model.ts`, `model.openrouter.test.ts` (mới), `scripts/check_adapter_boundary.mjs` (chỉ canh `openrouter.ai`), `scripts/eval/score.mjs` (chỉ `currentProvider`/`credentialEnvName`/`hasCredential`), `.env.example`, report+evidence H10 / xong khi = 5 mục 3a–e cụ thể (nhánh `openrouter` cho `callModel`/`callTriageModel` theo §2c; 2 nhánh cũ không đổi; máy đo biên canh `openrouter.ai`; `score.mjs` nhận provider `openrouter`; khói thật ≤3 lần gọi) + toàn gói (`typecheck`/`build`/`test`/`test:db`/`gate` exit 0, 0 skip, test không giảm, không lộ `sk-or-`) / cấm bằng lời mình = không đụng `packages/core/src/agent/prompts/resident.ts` (chưa commit của worker khác), `package*.json` (không thêm dependency), `specs/**`/`plan.md`/`brain4agent/**`/`docs/**`/`db/**`/`apps/**`/`evals/**`/`.env`, không push, không `git add -A`, không tự nới phạm vi

Handoff: handoffs/H10_thi-cong_openrouter.md
Base: 96ed160f2441ba69171991e48ab124a2a689e04f
Head: da8faacafc696e217dcd3a48190aba8ecc882e76

## 1. Lệnh + exit code (nguyên văn)

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| Bước 0 | `node ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 | (in "NÃO ĐÃ OK — KHÔNG CẦN NÂNG CẤP THÊM") |
| Baseline (trước sửa) | `npm run typecheck` rồi `npm test` | 0/0 | [baseline](../evidence/H10-openrouter/baseline.txt) |
| Typecheck (sau sửa) | `npm run typecheck` | 0 | [typecheck](../evidence/H10-openrouter/typecheck.txt) |
| Build (KHÔNG `DATABASE_URL`) | `npm run build` | 0 | [build](../evidence/H10-openrouter/build.txt) |
| Test (sau sửa) | `npm test` | 0 | [test](../evidence/H10-openrouter/test.txt) |
| Test DB | `DATABASE_URL=postgres://lenqclaw:lenqclaw@127.0.0.1:55432/lq_h10 npm run test:db` (DB rỗng, tạo mới trước, drop sau khi xong) | 0 | [test-db](../evidence/H10-openrouter/test-db.txt) |
| Gate | `npm run gate` | 0 | [gate](../evidence/H10-openrouter/gate.txt) |
| Đỏ biên `openrouter.ai` (mục 3c) | chèn tạm chuỗi vào `packages/core/src/domain/errors.ts` (ngoài `adapters/`) rồi `npm run gate`; gỡ ra, `node scripts/check_adapter_boundary.mjs` lại | 1 rồi 0 | [red-boundary](../evidence/H10-openrouter/red-boundary.txt) |
| Đỏ thiếu key (mục 3d) | `MODEL_PROVIDER=openrouter node scripts/eval_golden.mjs` (không `OPENROUTER_API_KEY`) | 3 | [red-no-key](../evidence/H10-openrouter/red-no-key.txt) |
| Khói thật (mục 3e) | `npx tsx --env-file=.env <script tạm scratchpad, KHÔNG commit>` — `callModel` route `diagnose` 1 tool đơn giản, ≤3 lần gọi mạng thật | script dừng ở lần gọi 1 (402) | [smoke-real](../evidence/H10-openrouter/smoke-real.txt) |

`errors.ts` sau khi gỡ marker: `git diff --stat -- packages/core/src/domain/errors.ts` rỗng (không có thay đổi tồn dư).

## 2. Test tổng/pass/fail/skip

- `npm test` (không DB): baseline 19 file/238 test (0 fail/0 skip) → sau sửa **20 file/245 test (0 fail/0 skip)** — +1 file (`model.openrouter.test.ts`), +7 test; `model.test.ts` (5 test) và `model.gemini.test.ts` (6 test) giữ nguyên số, xanh, KHÔNG sửa dòng nào (mục việc b).
- `npm run test:db` (DB `lq_h10` rỗng, migrate+seed sạch): core 84 + web 11 + zalo-worker 27 = **122/122/0/0** — không đổi so với nền roadmap ghi ở H09 (122), vì gói này không thêm test DB.
- `npm run gate` bao gồm lại đúng `npm test` ở trên (184 test core, tổng 245 toàn repo) + `check_adapter_boundary` (0 violations) + `check_agent_tools` (0/0) → `GATE_OK`.

## 3. `git diff --stat` + SHA

[diff-stat](../evidence/H10-openrouter/diff-stat.txt) (chỉ phạm vi của tôi, stage tường minh — KHÔNG `git add -A`, KHÔNG đụng `resident.ts`)

```
.env.example                        |  16 +-
packages/core/src/adapters/model.ts | 358 ++++++++++++++++++++++++++++++++++--
scripts/check_adapter_boundary.mjs  |   9 +
scripts/eval/score.mjs              |  14 +-
4 files changed, 376 insertions(+), 21 deletions(-)
+ packages/core/src/adapters/model.openrouter.test.ts (file MỚI, 262 dòng)
```

- Commit: `da8faacafc696e217dcd3a48190aba8ecc882e76` — `feat(core): add OpenRouter provider branch to model adapter` (5 file: `.env.example`, `packages/core/src/adapters/model.ts`, `packages/core/src/adapters/model.openrouter.test.ts`, `scripts/check_adapter_boundary.mjs`, `scripts/eval/score.mjs`; stage tường minh, không `git add -A`).

## 4. Bảng phân công thực tế

| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a. Nhánh `openrouter` cho `callModel`/`callTriageModel` | 🟠 | Claude (Sonnet 5) |
| b. 2 nhánh cũ không đổi hành vi | 🟠 | Claude (Sonnet 5) — chỉ đọc lại, không sửa |
| c. Máy đo biên canh `openrouter.ai` | 🟢 | Claude (Sonnet 5) |
| d. `score.mjs` nhận provider `openrouter` | 🟢 | Claude (Sonnet 5) |
| e. Khói thật | 🟢 | Claude (Sonnet 5) |

## 5. Bảng "dòng §2c → test"

| Dòng §2c | Bằng chứng |
| :-- | :-- |
| Chọn (`MODEL_PROVIDER=openrouter`, mặc định vẫn `gemini`) | `model.openrouter.test.ts` "MODEL_PROVIDER=openrouter mac dinh model google/gemini-3.6-flash..."; `model.gemini.test.ts` "MODEL_PROVIDER mac dinh la gemini" vẫn xanh không sửa |
| Gọi (POST `/chat/completions`, `authorization: Bearer`, `x-title`, `provider.data_collection:'deny'`, `max_tokens:16000`) | test "dich vao/ra vong tool 2 luot..." kiểm URL, header, `body.provider.data_collection`, `body.max_tokens` |
| Model (mặc định `google/gemini-3.6-flash`; `MODEL_<ROUTE>` ghi đè; `MODEL_FALLBACKS` mặc định `google/gemini-3-flash-preview`) | test trên (ghi đè `MODEL_DIAGNOSE='or-test-main'`) + test "429 x3...fallback" |
| Dịch vào (system/text/image/tool_use/tool_result — nhiều `tool_result` một lượt, đúng thứ tự sau assistant) | test "dich vao/ra vong tool 2 luot (nhieu tool_result mot luot, anh)" — 2 tool_calls round 1, round 2 có 2 `tool_result` liên tiếp (1 `is_error`) |
| Dịch ra (`content`, `tool_calls`→`tool_use`, `finish_reason` mapping, `usage`) | test trên (usage) + test 429-fallback (`stop_reason='end_turn'` cho `finish_reason:'stop'`) |
| Lỗi 429/500/502/503/504 → retry rồi fallback | "429 x3 (het retry)...model = fallback" |
| Lỗi 402 → `ModelUnavailableError`, KHÔNG retry, KHÔNG fallback | "402 (het credit)..." (1 fetch, không gọi model fallback) + khói thật (mục 3e, 402 thật) |
| Lỗi 400/401/403/404 → ném lỗi gốc | "400 => nem loi ngay, khong retry" |
| `arguments` hỏng → `input={}` | "arguments cua tool_call khong parse duoc JSON => input = {}" |
| `OPENROUTER_BASE_URL` ghi đè endpoint | "OPENROUTER_BASE_URL ghi de endpoint mac dinh" |
| Thử nghiệm: `setOpenRouterFetchForTest`, triage dùng lại `setTriageFetchForTest`, 0 mạng | toàn bộ 7 test dùng `setOpenRouterFetchForTest`; không có test mạng thật trong `npm test` |
| Máy chấm: `credentialEnvName()` = `OPENROUTER_API_KEY` khi provider `openrouter` | `red-no-key.txt` — `node scripts/eval_golden.mjs` thật, in đúng `BLOCKED (thieu OPENROUTER_API_KEY, MODEL_PROVIDER=openrouter)`, exit 3 |

## 6. Việc KHÔNG làm + lý do

- Không sửa `scripts/eval_golden.mjs` — không nằm trong "ĐƯỢC GHI" của handoff; nó đã dùng `hasCredential`/`credentialEnvName`/`currentProvider` từ `score.mjs` một cách generic nên tự động nhận `openrouter` mà không cần sửa gì thêm (đã xác nhận bằng `red-no-key.txt`).
- Không đụng `packages/core/src/agent/prompts/resident.ts` — thay đổi chưa commit của worker khác, đúng luật ở bối cảnh handoff; `git status` xác nhận file này vẫn `M` (chưa track) sau khi tôi commit xong.
- Không dùng hết cả 3 lần gọi mạng thật cho phép ở mục 3e — chỉ dùng 1 lần (`callModel` route `diagnose`), vì key OpenRouter người dùng đưa có hạn mức tín dụng/ngày thấp hơn `max_tokens:16000` cố định theo §2c (lỗi 402 thật, xem `smoke-real.txt`) — gọi lại `callTriageModel` hay gọi lại `callModel` sẽ cho CÙNG một 402 (không sinh thêm bằng chứng), nên dừng sớm để không lãng phí quota gọi thật.
- Không đổi `max_tokens` hay bất kỳ tham số nào để "né" lỗi 402 — §2c khoá cứng `max_tokens:16000` và cấm `temperature`/`top_p`/`reasoning`; hạ `max_tokens` sẽ vi phạm hợp đồng chỉ để che một giới hạn credit của môi trường thật.

## 7. Câu hỏi mở (cần người)

- Khói thật mục 3e chỉ chứng minh được đường lỗi 402 thật (đúng hợp đồng: không retry, không fallback), KHÔNG chứng minh được đường thành công (`stop_reason`/tool name/usage thật từ một lượt gọi OK) — vì key OpenRouter hiện có hạn mức tín dụng/ngày thấp hơn `max_tokens=16000` cố định theo §2c (log thật: "You requested up to 16000 tokens, but can only afford 10128"). Cần người: nạp thêm credit cho key, hoặc xác nhận key khác, để chạy lại khói thật lấy đường thành công — script tạm đã sẵn (không commit, đường dẫn trong scratchpad phiên này), có thể chạy lại ngay khi có key đủ credit.
- SO đã probe 2026-09-25 với cùng key này và ghi nhận 200 OK cho `google/gemini-3.6-flash`/`google/gemini-3.5-flash-lite`/`openai/gpt-4o-mini` + tools — không rõ probe đó có set `max_tokens` hay dùng giá trị nhỏ hơn 16000; nếu SO's probe không set `max_tokens` (OpenRouter mặc định thấp hơn), điều đó giải thích tại sao probe 200 còn khói thật của tôi (max_tokens cố định 16000 theo hợp đồng) 402. Nhờ người xác nhận cách probe trước đó để đối chiếu.

## 8. Tiếp theo

🖐 Cần tay người: nạp thêm credit OpenRouter (hoặc key khác đủ hạn mức ≥16000 token/lượt) rồi cho chạy lại khói thật để lấy đường thành công (script tạm sẵn sàng) · 🤖 Agent làm được ngay: chạy lại khói thật ngay khi có key/credit đủ, không cần sửa code · ⭐ Nên làm trước: xác nhận credit key vì đây là gate còn thiếu duy nhất của gói (mọi test giả lập + đường lỗi 402 thật đã xanh) · ⏸ Chưa làm: đường thành công của khói thật (mục 3e phần "in ra stop_reason/tool name/usage" từ một lượt OK) — chưa làm được vì giới hạn credit môi trường thật, không phải lỗi code (xem mục 7).

⏳ Chờ người duyệt.

## Duyệt — SO đo lại (2026-09-25 16:55)
- Phạm vi `da8faac`: 5 file, đều trong mục 2 H10 ✅; `resident.ts` (của H08) không bị stage ✅.
- DB rỗng `lq_so10`, cây `5b81b9c`: `typecheck` 0 · `build` (không `DATABASE_URL`) 0 · `npm test` 0 (184 + 37 + 24 = 245, 0 skip) · `test:db` 0 (84 + 11 + 27 = 122) · `gate` 0.
- Bộ đo mới biết đỏ: đổi `data_collection` thành `'allow'` ⇒ 1/7 đỏ; cho 402 đi đường retry ⇒ 1/7 đỏ (đã khôi phục).
- Q1/Q2: probe SO trước đó dùng `max_tokens: 200` nên lọt; `/api/v1/credits` ⇒ `total_credits: 0` — `limit: 250` của `/api/v1/key` là trần chi tiêu của key, KHÔNG phải số dư. 402 là đúng hợp đồng. Đường thành công qua mạng thật còn treo tới khi tài khoản có tín dụng (mục checklist riêng).

✅ DUYỆT
