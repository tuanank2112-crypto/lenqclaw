# OPERATIONS — Chạy thử Zalo thật, deploy, runbook, rollback

> Giữ nguyên hạ tầng kế hoạch 01 (VPS Việt Nam IP tĩnh, Docker, Caddy, `pg_dump` 02:00 giữ 14 bản). Mục này ghi phần KHÁC.
> D28: runtime agent chạy đồ thị LangGraph TRONG tiến trình runner (`core:run`) — không thêm tiến trình/dịch vụ (không LangGraph Platform/Studio/server), không thêm bảng (không checkpointer). Thêm: §1 cấm env tracing, §5 hàng runbook, §8 nâng LangGraph.
> D31/D32 (2026-10-16): runner song song theo thread + advisory lock (bản thứ hai tự thoát), heartbeat, `GET /api/healthz`, báo động Telegram — §1, §4, §5, §9; hợp đồng [SPEC-D31](SPEC-D31-Toc-Do-Giam-Sat.md).

## §1. Tiến trình & lệnh (máy dev; mọi lệnh từ root; script npm KHÔNG tự nạp `.env` — G20)
```powershell
# DB dev — compose đọc POSTGRES_* từ .env (thiếu ⇒ compose từ chối, đo 2026-10-09)
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm run db:migrate; npm run db:seed; npm run db:seed:sim                      # cần DATABASE_URL, DATA_MODE=sim
npm run create-admin -- --email admin@x --role admin                            # mật khẩu qua stdin
npm run dev -w @lenqclaw/web                                                   # cửa sổ 1
node --env-file=.env --import tsx packages/core/src/runner/inbound-runner.ts  # cửa sổ 2 — runner (D31: bản thứ 2 tự exit 1 RUNNER_ALREADY_RUNNING; song song theo thread bên trong)
node --env-file=.env --import tsx apps/zalo-worker/src/main.ts                # cửa sổ 3 — worker (D31: bản thứ 2 tự exit 1 WORKER_ALREADY_RUNNING)
```
D28: KHÔNG đặt `LANGSMITH_TRACING`/`LANGCHAIN_TRACING_V2` (`true`/`1` ⇒ `ConfigError`, runner exit 1 — BB-17: bật thì thư viện tự gửi vết ra endpoint ngoài, đã đo); `LANGSMITH_API_KEY` nếu có trong máy không được dùng.
D32: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` KHÔNG bắt buộc — thiếu ⇒ báo động tắt (audit `alert.disabled`), hệ thống vẫn chạy; đặt ở cả runner VÀ worker (giám sát chéo, §9).
Biến bắt buộc: `DATABASE_URL`, `SESSION_SECRET`, `ZALO_SESSION_KEY` (32 byte), `MODEL_PROVIDER` + key tương ứng, `ZALO_ACCOUNTS=community`, `DATA_MODE`, `TRANSPORT`; toàn bộ bảng 01-CONTRACTS §10 có mặc định. Dọn `.env` cũ: xoá biến sàn thợ (SPEC-P01 §5) — `readCommunityConfig` KHÔNG lỗi với biến thừa, nhưng `check_pivot_cleanup` không quét `.env`.

## §2. Thứ tự lần đầu trên máy dev (sau P03)
1. Migrate + seed + seed:sim; tạo admin; mở `/persona` kiểm 4 doc active (seed) — sửa tên bot & mẫu gọi tên ở IDENTITY.
2. `/zalo` ⇒ QR ⇒ quét bằng **tài khoản Zalo phụ dành riêng cho bot** (SIM riêng; CẤM Zalo chính của người dùng; CẤM mở Zalo Web/PC bằng tài khoản này — G01).
3. Thêm owner: nhắn DM cho bot từ Zalo cá nhân của chủ ⇒ `npm run dev:link-zalo -- --owner` (lấy uid người gửi mới nhất chưa có danh tính) ⇒ `account_owners`.
4. Tạo nhóm thử (2–3 Zalo phụ + chủ), **đặt bot làm phó nhóm** trong Zalo, lấy `thread_id` nhóm từ `inbound_events` (tin đầu tiên trong nhóm) ⇒ `/groups` thêm nhóm, `enabled`, `mode=mention` ⇒ "Đồng bộ ngay" ⇒ `bot_is_admin=true`.
5. Thử: mention bot ⇒ trả lời có quote (D31: ≤ 5 s câu ngoài công việc, ≤ 15 s câu cần tra tài liệu — trừ khi bot vừa nói trong nhóm < 11 s, gap D09); tin thường ⇒ im; chuyển `ambient` ⇒ hỏi câu không ai trả lời ⇒ sau `UNANSWERED_AFTER_MIN` bot nhặt; dán scam_phrase từ Zalo phụ ⇒ tin bị xoá + chủ nhận DM; `/approve <id>` ⇒ kick. Ghi `evidence/P0x/live.txt` (từ `audit_log`, không chép tay).

## §3. Hồ sơ dữ liệu cá nhân (Luật 91/2025/QH15) — 🖐 người
- Thông báo trong `rules`/mô tả nhóm: bot là phó nhóm, đọc tin nhóm để hỗ trợ, lưu tối đa 7 ngày (BB-11); hồ sơ thành viên chỉ ghi khi người đó nhắn riêng; dữ liệu gửi LLM nước ngoài (Gemini) sau khi che SĐT.
- Trước khi vào nhóm thật của cộng đồng (không phải nhóm thử): chủ đăng thông báo đó trong nhóm (ghi chú `daily_notes`). Lead: chỉ ghi thông tin khách tự cung cấp trong DM.

## §4. Quy định tài khoản Zalo bot (dán ở `rules` nội bộ)
1. Một tài khoản `community`, một điện thoại giữ phiên; QR qua `/zalo`.
2. CẤM Zalo Web/PC; CẤM chạy 2 worker/2 runner — D31: advisory lock Postgres CHẶN bằng máy (bản thứ hai exit 1), không còn chỉ là luật vận hành.
3. Khi `kicked`/`dead` ⇒ banner `/zalo` + DM? KHÔNG (phiên chết không DM được) ⇒ dashboard `/` thẻ đỏ + (D32) Telegram `zalo_session` ngay khi worker phát hiện; người mở QR lại.
4. Bị giới hạn (221/không msgId) ⇒ pacer lùi 30 phút (giữ); lặp > 3 lần/ngày ⇒ hạ `budget_per_hour` các nhóm và ghi `-known-gotchas.md`.
5. Bot bị gỡ quyền phó nhóm ⇒ `bot_is_admin=false` tự động khi action 166; kiểm duyệt hạ về cảnh cáo; DM owner `NEED_DEPUTY_DM`.

## §5. Runbook
| Sự cố | Dấu hiệu | Làm gì |
| :-- | :-- | :-- |
| Bot nói quá nhiều trong nhóm | `turn_traces` outcome `replied` dày ở nhóm (`/agent`), than phiền | `/groups` hạ `ambient_turns_per_hour`/`budget_per_hour` hoặc `mode=mention`; sửa `rules` "Biết khi nào nên nói"; chấm lại golden `activation` |
| Bot xoá nhầm | `/moderation` verdict sai | admin "Xoá điểm" người đó; thêm câu vào golden `moderation.jsonl` (ok-set); KHÔNG nới ngưỡng ngay — chạy golden trước |
| Thẻ duyệt không thi hành | `approvals.status='failed'` | xem `result.error.code`: 166 ⇒ đặt lại phó nhóm; khác ⇒ thử lại bằng nút "Duyệt lại" (tạo thẻ mới) |
| Model sập kéo dài | nhiều `agent.model_error`, nhóm im, DM `MODEL_DOWN_DM_REPLY` | đổi `MODEL_FALLBACKS`/provider; welcome/lệnh vẫn chạy bằng template |
| Embedding không khả dụng | `kb.embed_unavailable` | truy hồi lexical vẫn chạy; kiểm `EMBED_PROVIDER`/key |
| Phiên Zalo chết | `kicked`/`dead` | như kế hoạch 01 §5 (QR lại; kiểm IP) |
| Runner treo | (D32) Telegram `runner_stale` (heartbeat > 60 s) hoặc `inbound_backlog` (`queue`: tin chờ > 60 s · `stuck`: một lượt > 120 s); `/api/healthz` 503 | restart runner (khoá advisory tự nhả khi tiến trình chết); kiểm `lock_until` automations; `stuck` lặp ⇒ xem `turn_traces`/audit lượt đó, ghi gotcha |
| (D32) Worker chết | Telegram `worker_stale`; outbox `queued` tăng | restart worker; nếu `WORKER_ALREADY_RUNNING` ⇒ có bản cũ còn sống — tìm và tắt, KHÔNG xoá khoá tay |
| (D31) Trả lời chậm | Telegram `slo_breach` (`fast`/`rag`); thẻ "Tốc độ 24 giờ" `/agent` đỏ | xem đoạn nào lớn: `queued_ms` (runner/HOL ⇒ tăng `RUNNER_CONCURRENCY` ≤ 8) · `model_ms` (model chậm/quota ⇒ kiểm billing, `MODEL_COMMUNITY_FAST`) · `tool_ms` (embed ⇒ `EMBED_TIMEOUT_MS`) · pacer/`send_ms` (Zalo chậm) · `hold_ms` (gap D09 — KHÔNG nới khi chưa có quyết định người dùng, SPEC-D31 §7.3) |
| (D31) Nhiều câu "trục trặc kỹ thuật" | `turn_traces.deadline_hit` > 5 %, `agent_runs.outcome='deadline'` | model chậm hơn hạn chót: kiểm quota/billing Gemini (free tier ⇒ 429), thử `MODEL_FALLBACKS`; CẤM nâng `LANE_FAST_DEADLINE_MS` quá 4500 (ConfigError) — vượt là vi phạm D31, cần người dùng quyết |
| (D32) Không nhận báo động | audit `alert.disabled` / `alert.failed` | kiểm `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` ở CẢ runner và worker; bot đã được nhắn `/start` trong chat đích; `alert.capped` ⇒ đang có bão sự cố, xem `alert_state` |
| (D28) Lượt lỗi đồ thị | `turn_traces.outcome='error'` tăng; audit `inbound.handler_error` chứa `GraphRecursionError` hoặc lỗi node | `GraphRecursionError` = bug cạnh/trần (KHÔNG nâng `recursionLimit` tay) ⇒ ghi `-known-gotchas.md`, sửa theo SPEC-P03 §6.7; lỗi node khác ⇒ xem `data.message`, lượt đó đã mất (không chạy lại — 01-CONTRACTS §12.7) |
| (D28) Bot lặp tool | `turn.round_cap` > 1% lượt | xem `turn_traces.tools` của lượt chạm trần; sửa prompt/tool trả lỗi rõ hơn; KHÔNG nới `MAX_TOOL_ROUNDS` trước khi chạy lại golden |

## §6. Deploy VPS (P09, sau khi local + Zalo thật ✅)
Compose: `db` (pgvector pg16), `web`, `worker` (1 bản), `jobs` (`core:run`, 1 bản), `caddy` — như cũ, bỏ ghi chú pg-boss. Thứ tự: `up -d db` ⇒ migrate (001–009) ⇒ seed ⇒ `create-admin` ⇒ `up -d web jobs worker caddy` ⇒ `/zalo` QR ⇒ `/persona` nhập persona thật ⇒ `/knowledge` nhập tài liệu ⇒ `/groups` khai nhóm ⇒ chạy golden trên VPS (TESTING §4 cột `vps`).

## §7. Backup & rollback
- `pg_dump` hằng ngày (giữ). Migration chỉ THÊM từ 010 trở đi; 007 có `drop table` (không thể rollback bằng code cũ) ⇒ trước khi áp 007 trên DB có dữ liệu thật của kế hoạch 01 (không có — chưa pilot) phải `pg_dump` riêng tên `pre-007.sql`.
- Rollback mã: image tag trước + DB từ `pre-007.sql`; tag `archive/plan-01-marketplace` là điểm khôi phục mã.

## §8. Nâng zca-js — giữ luật kế hoạch 01 §8 (probe trên máy dev, chạy test worker với fake, ghi gotcha).
(D28) Nâng `@langchain/langgraph`/`@langchain/core`: cùng quy trình — chỉ bản phát hành ≥ 14 ngày; đo lại toàn cây (`npm view <gói> time`) và cập nhật `overrides` (01-CONTRACTS §12.1); chạy lại SPEC-P03 §11 hàng 5, 8–13 trên Node 22; đọc changelog mục `recursionLimit`/`getGraph`/reducer; ghi D mới + gotcha. CẤM nâng kèm việc khác trong cùng commit.

## §9. Theo dõi tốc độ & báo động (D31/D32)
1. 🖐 Tạo bot Telegram: nhắn `@BotFather` ⇒ `/newbot` ⇒ lấy token; tạo nhóm/chat riêng cho chủ, thêm bot, nhắn một tin; lấy `chat_id` (gọi `getUpdates` bằng trình duyệt của chủ — KHÔNG dán token vào chat với agent/issue/log). Đặt `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` vào `.env` của runner và worker. CẤM commit `.env`.
2. Thử: tắt runner ⇒ trong ≤ 2 phút nhận đúng 1 tin `runner_stale`; bật lại ⇒ 1 tin "✅ đã hồi phục". Ghi `evidence/P09/alert-live.txt` từ `audit_log action like 'alert.%'` (không chép tay).
3. Khoảng mù: runner VÀ worker cùng chết / máy / DB chết ⇒ không ai gửi (SPEC-D31 §10.2). Tuỳ chọn 🖐: dịch vụ ping ngoài (miễn phí) gọi `https://<domain>/api/healthz` mỗi 5 phút, báo khi ≠ 200.
4. Hằng ngày nhìn `/agent` thẻ "Tốc độ 24 giờ" (p95 `core_ms` theo làn, % `deadline_hit`, % `hold_ms`). P09 ghi 7 ngày `reply_latency` vào `evidence/P09/latency-7d.txt` (G23 cột `zalo-thật`).
5. Dữ liệu vận hành giữ: `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày (timer bước 8 tự dọn — SPEC-D31 §11).
