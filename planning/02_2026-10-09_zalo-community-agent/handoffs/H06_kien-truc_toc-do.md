1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG — vai architect (ghi SPEC + đo thật; KHÔNG ghi mã sản phẩm).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` §2 (ĐẶC BIỆT D09, D15, D22, D28, D31) → `specs/00-ARCHITECTURE.md` (§4 hình đã duyệt, §6 BB) → `specs/01-CONTRACTS.md` (§2, §10, §12) → `specs/SPEC-P03-Runtime-Agent.md` → `specs/SPEC-P04-Tri-Thuc.md` → `specs/TESTING-ACCEPTANCE.md` → mã `packages/core/src/adapters/model.ts`, `packages/core/src/runner/inbound-runner.ts`, `apps/zalo-worker/src/{pacer,pacer-policy,config}.ts`.

## 1. BỐI CẢNH TỰ CHỨA
- lenqclaw: agent phó nhóm Zalo; runtime LangGraph (D28, hình pipeline ĐÃ được người dùng duyệt — `docs/images/12-pipeline-langgraph.png`). P01, P02 xong; P03 chưa thi công.
- **D31 (người dùng chốt):** câu trả lời NGOÀI công việc < 5 s; câu liên quan công việc / dataset / cần RAG < 15 s.
- Hiện trạng đã kiểm: lời gọi model chính (Gemini/OpenAI-compat fetch) KHÔNG có timeout; chỉ triage có `TRIAGE_TIMEOUT_MS=4000`; retry 2 lần (1 s, 3 s) + chuỗi fallback ⇒ trường hợp xấu không có trần; runner tuần tự 1 bản — một lượt treo chặn mọi nhóm/DM và `runTimers`; pacer nhóm gap 8000 ms + jitter ≤ 3000 ms giữa 2 tin bot cùng nhóm (D09 chống khoá tài khoản); typing 1–3 s; runner poll 1 s; pacer tick 1 s; không streaming (Zalo không sửa tin được).
- Song song KHÔNG có agent nào khác ghi cây git lúc này. DB dev `127.0.0.1:15432`; `.env` có key model (nạp bằng `set -a; . ./.env; set +a`, CẤM in giá trị).

## 2. PHẠM VI
- ĐƯỢC GHI: `planning/02_2026-10-09_zalo-community-agent/specs/*.md` · `.../reports/R06_kien-truc_toc-do.md` · `.../evidence/ARCH-D31/*`. Script đo đặt NGOÀI repo trong `C:/Users/lenku/AppData/Local/Temp/claude/e--v-c-v-ch/47801419-0844-4205-81a0-b1d3481c9616/scratchpad/latency/` (chỉ chép output máy vào evidence).
- CẤM ĐỤNG: mọi mã sản phẩm, `package.json`, `plan.md`, `planning/01_*`, `planning/03_*`, `brain4agent/`, `docs/`.

## 3. VIỆC PHẢI LÀM
a. **Đo thật trước khi thiết kế** (≤ 120 lời gọi model tổng): p50/p95 thời gian của (1) model chính hiện dùng (`MODEL_PROVIDER`/model trong `.env`) và `gemini-3.6-flash`, `gemini-3.5-flash-lite` nếu có key — câu ngắn không tool, max output nhỏ; (2) một lượt có 1 vòng tool giả lập `search_knowledge` (2 lời gọi); (3) embedding 1 câu; (4) truy vấn lexical+vector trên DB dev (hoặc DB tạm, xoá sau). Ghi `evidence/ARCH-D31/latency-probe.txt` (không ghi key, không ghi nội dung riêng tư).
b. **Ngân sách thời gian từng bước** cho 2 làn (bảng ms: worker nhận → runner nhặt → triage → gate → prepare → model → tool/RAG → model → deliver → outbox → pacer → typing → gửi), đo được bằng cột thời gian nào (đề xuất cột/trường mới nếu thiếu — DDL chỉ ở dạng migration MỚI `010_*` thiết kế, không áp).
c. **Thiết kế** (đơn giản nhất đủ đạt D31), quyết định rõ chọn/bỏ/vì sao, gồm tối thiểu:
   - Làn nhanh vs làn RAG: ai quyết làn (BB-12: ý định nhận bằng model, code là lưới — cân nhắc gộp quyết làn vào triage, hoặc bỏ triage khỏi đường mention nếu nó ăn ngân sách), model/max_tokens/tool cho mỗi làn.
   - Timeout mỗi lời gọi model + hạn chót mỗi lượt + hành vi khi quá hạn (câu dự phòng — giữ BB-05 mustReply).
   - Runner: xử lý song song theo thread nhưng giữ thứ tự trong một thread; vẫn chặn chạy 2 bản (advisory lock Postgres).
   - Typing sớm; mention-reply có ưu tiên ở pacer không — nêu RỦI RO khoá tài khoản so với D09; nếu đề xuất nới gap thì đánh dấu 🖐 cần người dùng quyết, KHÔNG tự nới.
   - Đo & cổng: SLO p95 end-to-end theo làn (từ lúc tin tới hàng đợi vào → `outbox.sent_at`), nơi ghi, cách xem trên dashboard, gate mới trong TESTING (local bằng sim + model thật; zalo-thật ở P09), bằng chứng ĐỎ cho bộ đo (model giả chậm ⇒ gate đỏ).
d. Sửa SPEC: `00-ARCHITECTURE` (BB mới nếu cần; GIỮ HÌNH §4 — nếu buộc phải đổi node/cạnh thì nêu rõ trong report "CẦN NGƯỜI DUYỆT LẠI HÌNH"), `01-CONTRACTS` (§2 timeout, §10 env mới, §12 state/làn), `SPEC-P03`, `SPEC-P04` (ngân sách RAG), `TESTING-ACCEPTANCE` (gate tốc độ), `OPERATIONS` (theo dõi). Mỗi chỗ sửa ghi "D31: …".
e. **Giám sát + báo động (D32 Telegram, D33):** thiết kế (1) heartbeat runner + worker (bảng/cột ghi lần tick cuối, migration MỚI `010_*` dạng thiết kế) + `GET /api/healthz` ở web đọc heartbeat; (2) adapter `adapters/alert.ts` gửi Telegram Bot API (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; thiếu ⇒ tắt + audit, KHÔNG làm hỏng hệ thống; chống spam: gộp/giới hạn mỗi loại ≤ 1 tin / N phút) — BB-03 mở rộng cho adapter này; (3) bảng sự kiện báo động: phiên Zalo `kicked`/`dead`/`cookie_expired`, heartbeat runner/worker cũ hơn ngưỡng, `ModelUnavailableError` liên tục quá ngưỡng, p95 vượt SLO D31, `bot_is_admin=false`; ai phát hiện (tiến trình nào — lưu ý runner chết thì không tự báo được ⇒ chọn bên giám sát chéo); (4) chính sách giữ `turn_traces`/`audit_log`/`agent_runs`. D33: KHÔNG thêm cổng eval khi kích hoạt persona. Gate + ca đỏ cho báo động (token giả, heartbeat cũ ⇒ có đúng 1 tin).
f. Xong khi: `latency-probe.txt` có số đo thật; bảng ngân sách 2 làn cộng ≤ 5000 / ≤ 15000 ms ở p95 dự kiến, có biên an toàn ghi rõ; mọi env mới có giá trị mặc định + giới hạn; gate tốc độ có ca đỏ thiết kế sẵn.

## 4. LUẬT
Đơn giản nhất đủ dùng · luật cứng trong tool (BB-01) · BB-03 chỉ adapter gọi model · không chép mã repo khác · stage tường minh, commit bằng `git commit -m "…" -- <đường>` (chỉ đường của mình) · tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · không push · mâu thuẫn ⇒ câu hỏi trong report.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a–d | 🔴 | đổi hợp đồng runtime + rủi ro khoá tài khoản |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H06_kien-truc_toc-do.md`; dòng 3 `Base:`; dòng 4 `Head:`; bảng số đo; bảng ngân sách 2 làn; quyết định (chọn · bỏ · vì sao); đề xuất dòng bảng thay thế; câu hỏi 🖐 cho người (ngắn, mỗi câu kèm phương án mặc định). Dòng cuối `⏳ Chờ phán quyết.`
