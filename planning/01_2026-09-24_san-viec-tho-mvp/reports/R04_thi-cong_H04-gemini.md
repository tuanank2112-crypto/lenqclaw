Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude Sonnet 5 · Bước 0: exit 0 · hiểu việc: phạm vi = adapter Gemini trong `adapters/model.ts` + kiểm input tool trong `tool-kit.ts` + mẫu Gemini trong `check_adapter_boundary.mjs` + credential theo provider trong `eval_golden.mjs` + `.env.example`, KHÔNG đụng `resident-agent.ts`/8 file tool/`plan.md`/`specs/**` / xong khi = 8 lệnh cổng đo exit 0 (trừ `test:db` — xem Câu hỏi mở) + evidence đủ 9 file + 0 chuỗi "AIza" / cấm bằng lời mình = không tự quyết chỗ SPEC và CẤM ĐỤNG mâu thuẫn nhau, ghi Câu hỏi mở thay vì tự sửa

Handoff: handoffs/H04_thi-cong_H04-gemini.md
Base: a10acb885a30089b84f7a5d8024a228379513510
Head: 0fe11a560e37f36cf37b3347f17b30d48f598172

## 1. Lệnh + exit code (nguyên văn)
| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| 1 | `npm ci` | 0 | (chạy đầu phiên, không redirect riêng) |
| 2 | `npm run typecheck` | 0 | [typecheck](../evidence/H04-gemini/typecheck.txt) |
| 3 | `npm run build` (không `DATABASE_URL`) | 0 | [build](../evidence/H04-gemini/build.txt) |
| 4 | `npm test` | 0 | [test](../evidence/H04-gemini/test.txt) |
| 5 | `DATABASE_URL=…/lq_h04 npm run test:db -w @lenqclaw/core` | **1** | [test-db](../evidence/H04-gemini/test-db.txt) — xem Câu hỏi mở §6 |
| 6 | `npm run gate` (không DB) | 0 | [gate](../evidence/H04-gemini/gate.txt) |
| 7 | `node scripts/check_adapter_boundary.mjs` (cây thật + worktree ngoài repo có file vi phạm giả lập) | 0 / 1 đúng như kỳ vọng | [red-boundary](../evidence/H04-gemini/red-boundary.txt) |
| 8 | `npx tsx --env-file=.env scripts/eval_golden.mjs` (model thật, `DATABASE_URL=…/lq_h04`) | 1 (khói, không đánh gate — Đ19-4) | [eval-golden-smoke](../evidence/H04-gemini/eval-golden-smoke.txt) |
| 9 | Khói vòng agent thật (`runResidentTurn` qua `sendResidentMessage`, script tạm ngoài repo) | 0 | [agent-loop-smoke](../evidence/H04-gemini/agent-loop-smoke.txt) |
| 10 | `git grep -n "AIza"` (repo) và `grep -rn "AIza" evidence/H04-gemini/` | rỗng (exit 1 = không khớp) | — |

## 2. Test tổng/pass/fail/skip
`npm test`: **67/67 pass, 0 fail, 0 skip** (web 17 + core 50; core gồm 37 cũ + 6 `model.gemini.test.ts` mới + 7 `tool-kit.test.ts` mới, 0 skip) — vượt mốc nền 54.
`npm run test:db -w @lenqclaw/core`: 21 tổng, **12 pass, 9 fail, 0 skip** — cả 9 fail đều ở `src/dbtests/p03.db.test.ts` (file ngoài phạm vi được cấp của handoff này), lý do ở §6.

## 3. `git diff --stat <Base>..<Head>` + SHA từng commit
[diff-stat](../evidence/H04-gemini/diff-stat.txt)
- `390dc54` feat(core): add Gemini provider branch to callModel (01-CONTRACTS §2b)
- `1f9d4d9` feat(core): validate agent tool input against input_schema (01-CONTRACTS §2b)
- `3b0bfac` chore(scripts): Gemini leak guard + provider-aware golden credential (Đ18/Đ19)
- `0fe11a5` test(core): assert max_tokens=16000 on both model provider branches (Đ19-2)

## 4. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a — adapter Gemini (`model.ts`) | 🟠 | Claude Sonnet 5 |
| b — kiểm input tool (`tool-kit.ts` + `errors.ts`) | 🟠 | Claude Sonnet 5 |
| c — mẫu Gemini trong `check_adapter_boundary.mjs` + bằng chứng ĐỎ | 🟢 | Claude Sonnet 5 |
| d — credential theo provider trong `eval_golden.mjs` | 🟢 | Claude Sonnet 5 |
| e — test fetch giả (0 mạng) | 🟠 | Claude Sonnet 5 |
| f — khói model thật + vòng agent thật | 🟢 | Claude Sonnet 5 |

## 5. Việc KHÔNG làm + lý do
- **Không nối `assertValidToolInput` vào vòng lặp tool thật** trong `agent/resident-agent.ts`. Hàm `assertValidToolInput`/`validateToolInput` đã viết xong và có test riêng chạy đúng trên schema thật của 8 tool (`tool-kit.test.ts`), nhưng điểm GỌI nó (trước `tool.run(...)`, §10.2/§10.8) nằm trong `agent/resident-agent.ts` — file này nằm trong CẤM ĐỤNG của handoff (chỉ `tool-kit.ts` được sửa trong `agent/**`). Không tự quyết vượt phạm vi; xem Câu hỏi mở §6.
- **Không sửa `packages/core/src/dbtests/p03.db.test.ts`** dù 9 test ở đó đỏ sau khi đổi mặc định `MODEL_PROVIDER=gemini` (Đ18) — file không nằm trong `ĐƯỢC GHI` của handoff. Xem Câu hỏi mở §6.
- **Không đo lại G09/G10 bằng `eval_golden.mjs`** — đúng theo Đ19-4, số của `diagnosis`/`responsibility` (pass=0/40 và 21/30) chỉ là khói cho adapter, không dùng để đánh gate; máy chấm qua vòng agent thật là việc của gói riêng sau H05.
- **Không nâng SDK `@anthropic-ai/sdk`** để tìm `fallbacks` — giữ đúng Đ19 (2): dùng `MODEL_FALLBACKS` phía client cho cả hai nhánh, mặc định rỗng ở nhánh anthropic.

## 6. Câu hỏi mở (cần người)
1. **Xung đột thật giữa Đ18 (Gemini mặc định) và `src/dbtests/p03.db.test.ts` (ngoài phạm vi handoff này):** trước khi tôi sửa, 21/21 test DB core đều pass vì `callModel` mặc định gọi nhánh anthropic (không có `MODEL_PROVIDER` trong env khi chạy `npm run test:db`) và các test đó dùng `setModelClientForTest` (client giả nhánh anthropic) mà không tự đặt `MODEL_PROVIDER=anthropic`. Sau khi triển khai đúng Đ18 ("`MODEL_PROVIDER=gemini` mặc định"), `callModel` mặc định đi nhánh gemini (gọi `fetch` thật/`setGeminiFetchForTest`), nên 9/9 test trong `p03.db.test.ts` dùng client giả anthropic không còn được `callModel` gọi tới nữa ⇒ đỏ (bằng chứng: [test-db.txt](../evidence/H04-gemini/test-db.txt)). Đây không phải lỗi logic của adapter (44 test mới + cũ của `model.ts`/`tool-kit.ts` đều xanh, đo được cả nhánh gemini thật bằng model thật — [agent-loop-smoke.txt](../evidence/H04-gemini/agent-loop-smoke.txt)); đây là hệ quả trực tiếp, đã lường trước, của quyết định Đ18 va vào một file test không nằm trong phạm vi ghi của handoff. Đề xuất (không tự làm): thêm một dòng `process.env.MODEL_PROVIDER = 'anthropic'` vào đầu `p03.db.test.ts` (hoặc `beforeAll`) trong một gói riêng — việc 1 dòng, nhưng cần người cấp phạm vi vì `agent/resident-agent.ts` và các file P03 khác đang bị khoá cho thẩm định H05 song song.
2. **`assertValidToolInput` chưa được nối vào vòng lặp thật** (xem §5) — cần một gói riêng có quyền sửa `agent/resident-agent.ts` để thêm một dòng gọi trước `tool.run(ctx, tu.input)`.
3. **`diagnosis` golden pass=0/40 với model thật** ([eval-golden-smoke.txt](../evidence/H04-gemini/eval-golden-smoke.txt)) — có thể do cách chấm (`answer.includes(category_code)`) không khớp định dạng câu trả lời của Gemini, hoặc do hệ thống prompt tối giản trong `eval_golden.mjs` (không phải system prompt thật của agent). Không thuộc phạm vi H04 (Đ19-4: số này chỉ là khói, không đánh gate) — nêu để người biết, không tự sửa `eval_golden.mjs` scoring ngoài phần "chọn credential theo provider" được giao.

## 7. Tiếp theo
🖐 Cần tay người: quyết định câu hỏi mở #1 (cấp phạm vi sửa 1 dòng trong `p03.db.test.ts`, hoặc chấp nhận 9 test đó đỏ chờ H05 xong) và #2 (gói nối `assertValidToolInput` vào `resident-agent.ts`).
🤖 Agent làm được ngay: viết gói nối `assertValidToolInput` vào vòng lặp thật nếu được cấp quyền sửa `agent/resident-agent.ts`.
⭐ Nên làm trước: xử lý câu hỏi mở #1 — vì nó chặn `test:db` xanh toàn phần, điều kiện "xong khi" gốc của handoff.
⏸ Chưa làm: nối kiểm input tool vào vòng lặp thật (lý do: ngoài phạm vi ghi được cấp — §5, §6-2); sửa lại cách chấm `diagnosis`/`responsibility` của `eval_golden.mjs` (lý do: Đ19-4 nói rõ số này chỉ là khói, việc viết lại máy chấm qua vòng agent thật là gói riêng sau thẩm định P03).

⏳ Chờ phán quyết.
