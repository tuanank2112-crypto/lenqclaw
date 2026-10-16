# OPERATIONS — Chạy thử Zalo thật, deploy, runbook, rollback

> Giữ nguyên hạ tầng kế hoạch 01 (VPS Việt Nam IP tĩnh, Docker, Caddy, `pg_dump` 02:00 giữ 14 bản). Mục này ghi phần KHÁC.
> D28: runtime agent chạy đồ thị LangGraph TRONG tiến trình runner (`core:run`) — không thêm tiến trình/dịch vụ (không LangGraph Platform/Studio/server), không thêm bảng (không checkpointer). Thêm: §1 cấm env tracing, §5 hàng runbook, §8 nâng LangGraph.

## §1. Tiến trình & lệnh (máy dev; mọi lệnh từ root; script npm KHÔNG tự nạp `.env` — G20)
```powershell
# DB dev — compose đọc POSTGRES_* từ .env (thiếu ⇒ compose từ chối, đo 2026-10-09)
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm run db:migrate; npm run db:seed; npm run db:seed:sim                      # cần DATABASE_URL, DATA_MODE=sim
npm run create-admin -- --email admin@x --role admin                            # mật khẩu qua stdin
npm run dev -w @lenqclaw/web                                                   # cửa sổ 1
node --env-file=.env --import tsx packages/core/src/runner/inbound-runner.ts  # cửa sổ 2 — runner (ĐÚNG 1 bản; đồng hồ runTimers bên trong)
node --env-file=.env --import tsx apps/zalo-worker/src/main.ts                # cửa sổ 3 — worker (ĐÚNG 1 bản)
```
D28: KHÔNG đặt `LANGSMITH_TRACING`/`LANGCHAIN_TRACING_V2` (`true`/`1` ⇒ `ConfigError`, runner exit 1 — BB-17: bật thì thư viện tự gửi vết ra endpoint ngoài, đã đo); `LANGSMITH_API_KEY` nếu có trong máy không được dùng.
Biến bắt buộc: `DATABASE_URL`, `SESSION_SECRET`, `ZALO_SESSION_KEY` (32 byte), `MODEL_PROVIDER` + key tương ứng, `ZALO_ACCOUNTS=community`, `DATA_MODE`, `TRANSPORT`; toàn bộ bảng 01-CONTRACTS §10 có mặc định. Dọn `.env` cũ: xoá biến sàn thợ (SPEC-P01 §5) — `readCommunityConfig` KHÔNG lỗi với biến thừa, nhưng `check_pivot_cleanup` không quét `.env`.

## §2. Thứ tự lần đầu trên máy dev (sau P03)
1. Migrate + seed + seed:sim; tạo admin; mở `/persona` kiểm 4 doc active (seed) — sửa tên bot & mẫu gọi tên ở IDENTITY.
2. `/zalo` ⇒ QR ⇒ quét bằng **tài khoản Zalo phụ dành riêng cho bot** (SIM riêng; CẤM Zalo chính của người dùng; CẤM mở Zalo Web/PC bằng tài khoản này — G01).
3. Thêm owner: nhắn DM cho bot từ Zalo cá nhân của chủ ⇒ `npm run dev:link-zalo -- --owner` (lấy uid người gửi mới nhất chưa có danh tính) ⇒ `account_owners`.
4. Tạo nhóm thử (2–3 Zalo phụ + chủ), **đặt bot làm phó nhóm** trong Zalo, lấy `thread_id` nhóm từ `inbound_events` (tin đầu tiên trong nhóm) ⇒ `/groups` thêm nhóm, `enabled`, `mode=mention` ⇒ "Đồng bộ ngay" ⇒ `bot_is_admin=true`.
5. Thử: mention bot ⇒ trả lời có quote (≤ 30 s); tin thường ⇒ im; chuyển `ambient` ⇒ hỏi câu không ai trả lời ⇒ sau `UNANSWERED_AFTER_MIN` bot nhặt; dán scam_phrase từ Zalo phụ ⇒ tin bị xoá + chủ nhận DM; `/approve <id>` ⇒ kick. Ghi `evidence/P0x/live.txt` (từ `audit_log`, không chép tay).

## §3. Hồ sơ dữ liệu cá nhân (Luật 91/2025/QH15) — 🖐 người
- Thông báo trong `rules`/mô tả nhóm: bot là phó nhóm, đọc tin nhóm để hỗ trợ, lưu tối đa 7 ngày (BB-11); hồ sơ thành viên chỉ ghi khi người đó nhắn riêng; dữ liệu gửi LLM nước ngoài (Gemini) sau khi che SĐT.
- Trước khi vào nhóm thật của cộng đồng (không phải nhóm thử): chủ đăng thông báo đó trong nhóm (ghi chú `daily_notes`). Lead: chỉ ghi thông tin khách tự cung cấp trong DM.

## §4. Quy định tài khoản Zalo bot (dán ở `rules` nội bộ)
1. Một tài khoản `community`, một điện thoại giữ phiên; QR qua `/zalo`.
2. CẤM Zalo Web/PC; CẤM chạy 2 worker/2 runner (advisory lock vẫn là Idea Vault — vận hành bằng luật).
3. Khi `kicked`/`dead` ⇒ banner `/zalo` + DM? KHÔNG (phiên chết không DM được) ⇒ dashboard `/` thẻ đỏ; người mở QR lại.
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
| Runner treo | không có `runner.processed` 5 phút trong khi `inbound_events processed_at null` tăng | restart runner; kiểm `lock_until` automations |
| (D28) Lượt lỗi đồ thị | `turn_traces.outcome='error'` tăng; audit `inbound.handler_error` chứa `GraphRecursionError` hoặc lỗi node | `GraphRecursionError` = bug cạnh/trần (KHÔNG nâng `recursionLimit` tay) ⇒ ghi `-known-gotchas.md`, sửa theo SPEC-P03 §6.7; lỗi node khác ⇒ xem `data.message`, lượt đó đã mất (không chạy lại — 01-CONTRACTS §12.7) |
| (D28) Bot lặp tool | `turn.round_cap` > 1% lượt | xem `turn_traces.tools` của lượt chạm trần; sửa prompt/tool trả lỗi rõ hơn; KHÔNG nới `MAX_TOOL_ROUNDS` trước khi chạy lại golden |

## §6. Deploy VPS (P09, sau khi local + Zalo thật ✅)
Compose: `db` (pgvector pg16), `web`, `worker` (1 bản), `jobs` (`core:run`, 1 bản), `caddy` — như cũ, bỏ ghi chú pg-boss. Thứ tự: `up -d db` ⇒ migrate (001–009) ⇒ seed ⇒ `create-admin` ⇒ `up -d web jobs worker caddy` ⇒ `/zalo` QR ⇒ `/persona` nhập persona thật ⇒ `/knowledge` nhập tài liệu ⇒ `/groups` khai nhóm ⇒ chạy golden trên VPS (TESTING §4 cột `vps`).

## §7. Backup & rollback
- `pg_dump` hằng ngày (giữ). Migration chỉ THÊM từ 010 trở đi; 007 có `drop table` (không thể rollback bằng code cũ) ⇒ trước khi áp 007 trên DB có dữ liệu thật của kế hoạch 01 (không có — chưa pilot) phải `pg_dump` riêng tên `pre-007.sql`.
- Rollback mã: image tag trước + DB từ `pre-007.sql`; tag `archive/plan-01-marketplace` là điểm khôi phục mã.

## §8. Nâng zca-js — giữ luật kế hoạch 01 §8 (probe trên máy dev, chạy test worker với fake, ghi gotcha).
(D28) Nâng `@langchain/langgraph`/`@langchain/core`: cùng quy trình — chỉ bản phát hành ≥ 14 ngày; đo lại toàn cây (`npm view <gói> time`) và cập nhật `overrides` (01-CONTRACTS §12.1); chạy lại SPEC-P03 §11 hàng 5, 8–13 trên Node 22; đọc changelog mục `recursionLimit`/`getGraph`/reducer; ghi D mới + gotcha. CẤM nâng kèm việc khác trong cùng commit.
