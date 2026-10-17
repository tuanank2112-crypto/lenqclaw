1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG (P03 runtime agent trên LangGraph + runtime D31).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` D04, D15, D19–D24, **D28**, **D31–D34** → `specs/00-ARCHITECTURE.md` §4, §6 (BB-01…BB-20), §7 → `specs/01-CONTRACTS.md` §1, §2.1, §3, §6, §7, §8.2, §8.5, §9, §10, §11, **§12 (toàn bộ)** → `specs/SPEC-P03-Runtime-Agent.md` (toàn bộ) → `specs/SPEC-D31-Toc-Do-Giam-Sat.md` §1, §3–§6, §8, §9, §12–§16 → `specs/TESTING-ACCEPTANCE.md` hàng P03, G07, G08, G14, G15, G23 → `evidence/ARCH-D28/` (spike) + `evidence/ARCH-D31/` (migration-010-probe, latency-probe).

## 1. BỐI CẢNH TỰ CHỨA
- P01 (gỡ sàn thợ) và P02 (transport nhóm, outbox, pacer, sim nhóm) đã nghiệm thu. Khung `packages/core/src/agent/community/router.ts` là chỗ P03 thay bằng `runPipeline`.
- D28: runtime = hai đồ thị LangGraph.js (`pipelineGraph` 1 sự kiện, `turnGraph` 1 lượt); hình = hợp đồng `PIPELINE_SHAPE`/`TURN_SHAPE`; KHÔNG checkpointer/LangSmith/ChatModel LangChain (BB-17); model chỉ qua `adapters/model.ts` (BB-03). Sơ đồ người dùng đã duyệt — CẤM đổi node/cạnh.
- D31: hạn chót theo làn `fast` 5 s / `rag` 15 s, runner song song theo thread + advisory lock + heartbeat runner, typing sớm, tin gọi bot không triage, `MODEL_COMMUNITY_FAST`, migration `010_ops_latency.sql` (đã áp thử DB tạm — chép DDL nguyên văn SPEC-D31 §12).
- Giá trị TẠM cho câu chờ người: Q-D31-1 = CÓ (`MODEL_COMMUNITY_FAST=gemini-3.5-flash-lite`), Q-D31-2 = KHÔNG nới gap, Q-D31-3 = chưa có billing (Vyce 401, Gemini free tier) ⇒ G23 phần model THẬT có thể ra exit 3 `blocked` — chấp nhận, ghi report; các ca ĐỎ G23 (fake delay) BẮT BUỘC chạy.
- Số đo trước: gate exit 0 (218 unit), test:db 33/24/73 (core/web/worker). DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Base: tự đo `git rev-parse HEAD` trước lần sửa đầu.
- Máy có Node 24.12; SPEC-P03 §11 hàng 13 đòi chạy trên Node 22 — dùng `npx -y node@22` hoặc bản Node 22 sẵn có; không có ⇒ ghi report, không chặn phần còn lại.

## 2. PHẠM VI
- ĐƯỢC GHI: `packages/core/src/**` (trừ `adapters/alert.ts`), `packages/core/package.json` (thêm 2 gói `@langchain/*` PIN chính xác 01-CONTRACTS §12.1), `package-lock.json`, `db/migrations/010_ops_latency.sql` (mới), `scripts/check_adapter_boundary.mjs`, `scripts/latency_slo.mjs` (mới), `evals/scenarios/group-mention.jsonl` (mới), `apps/web/tests/**`, `apps/web/app/api/dev/sim/**`, `docs/core.md`, `docs/web.md`; hồ sơ: `reports/R07_thi-cong_P03.md` + `evidence/P03/*` (file mới).
- CẤM ĐỤNG: `apps/zalo-worker/**` và `adapters/alert.ts` (gói P03b), `db/migrations/001…009`, `planning/**` ngoài 2 đường hồ sơ, `brain4agent/`, `package.json` root (trừ khi thêm script `latency:slo` — ghi lý do), version `0.0.1` (D11), `lenqclaw_presentation_transcript.pdf`.

## 3. VIỆC PHẢI LÀM (commit theo từng gói, mỗi gói xanh mới sang gói sau)
a. **P03-A hàm thuần:** `gate.ts`, `policy.ts`, `triage.ts` (parse), `persona.ts`, `graph/state.ts`, `graph/shape.ts`, `graph/edges.ts` ⇒ SPEC-P03 §11 hàng 1–4, 8, 11; SPEC-D31 §16 hàng 1.
b. **P03-B đồ thị + node:** `graph/pipeline.ts`, `graph/turn.ts`, `graph/nodes/*`, `buffer.ts`, `sessions.ts`, `routeInboundEvent = runPipeline` ⇒ hàng 5 (a)–(s), 6, 7, 9, 10, 12 (kèm bằng chứng đỏ `red-boundary-langgraph.txt`).
c. **P03-C runtime D31:** `adapters/model.ts` (hạn chót, `AbortSignal`, `ModelDeadlineError`, tier `fast`, `maxOutputTokens`), runner song song theo thread + `holdAdvisoryLock` + heartbeat runner, migration 010, `latency_slo.mjs` ⇒ hàng 14–17 + 3 ca ĐỎ G23 (`red-latency-deadline.txt`, `red-latency-p95.txt`, `red-latency-serial.txt`).
d. Mỗi bộ đo MỚI phải từng ĐỎ ít nhất một lần trên mã cố tình hỏng (ghi `evidence/P03/red-*.txt`), trả mã nguyên trạng sau đó.
e. Prompt seed `rules` (SPEC-P03 §7.3) viết đủ mục; SO sẽ review 🔴 — ghi đường file trong report.
f. Docs module theo thực tế (`docs/core.md`, `docs/web.md`).
g. **Xong khi** (chạy lại cuối, ghi `evidence/P03/`):
   - `npm run gate > gate.txt` → `GATE_OK`, exit 0
   - `npm test > test.txt` → tổng ≥ 218 + ca mới, 0 fail, 0 skip
   - `npm run test:db > test-db.txt` → exit 0, 0 skip, chạy 2 lần liên tiếp đều xanh
   - `npm ls @langchain/langgraph @langchain/core @langchain/langgraph-checkpoint @langchain/langgraph-sdk langsmith zod > npm-ls.txt` → khớp §12.1, exit 0
   - `migration-010-probe.txt`: 010 áp từ rỗng sau 009, chạy lại `applied 0`
   - G23: 3 ca đỏ exit 1; lượt model thật exit 0 hoặc 3 (ghi nguyên văn)
   - `git diff --stat <Base>..HEAD > diff-stat.txt` ⊆ ĐƯỢC GHI

## 4. LUẬT
Stage tường minh · KHÔNG push · kiểm mã thoát trực tiếp · không nới kỳ vọng test cũ (đổi ⇒ giải thích từng ca) · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · CẤM log nội dung tin/cookie/key · CẤM regex injection guard (BB-12) · SPEC mâu thuẫn mã/thư viện ⇒ ghi câu hỏi report, làm phần độc lập; quyết định chưa có trong SPEC ⇒ dừng gói đó, hỏi (🔴).

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| P03-A, P03-B, P03-C | 🟠 | hợp đồng §12 + bảng nghiệm thu có sẵn, test tự biết đúng/sai |
| docs, scenario jsonl | 🟢 | theo thực tế / có mẫu `echo.jsonl` |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H07_thi-cong_P03.md`; dòng 3 `Base:`; dòng 4 `Head:` (commit công việc cuối); bảng SPEC-P03 §11 hàng 1–17 → lệnh → kết quả → evidence; bảng bằng chứng đỏ; bảng phân công (gói → tầng yêu cầu → họ/model đã dùng); việc KHÔNG làm + lý do; câu hỏi cần người. Report commit riêng. Dòng cuối `⏳ Chờ phán quyết.`
