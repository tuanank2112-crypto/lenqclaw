# SPEC-P03 — Agent cư dân (bước 0–3, pipeline v0.2)

> Hợp đồng 🔴, thi công 🟠. Đọc `01-CONTRACTS.md` §5–§7, §9 và `00-ARCHITECTURE.md` §6 (BB-01, 03, 06, 08).

## §1. Bước 1 — Nhận tin & khẩn cấp (tất định)

- Chuẩn hoá (bỏ dấu, thường hoá) rồi khớp danh sách `EMERGENCY_TERMS`: `chay, khoi, kẹt thang/ket thang, mac ket, ngap, ro gas/mui gas, dien giat, chap dien boc khoi, nuoc tran hanh lang`.
- Khớp ⇒ gửi ngay (bỏ qua pacer jitter, vẫn qua outbox) mẫu `EMERGENCY_REPLY` (hotline BQL + 114/115 tuỳ loại) + tạo `tickets(reason='emergency')` + báo ca trực. Agent vẫn chạy sau đó để hỏi thêm.
- LLM ở bước 2 được đặt `urgency='emergency'` ⇒ cùng hành vi; LLM KHÔNG được hạ cờ đã bật (BB-06).
- `Party.type` ≠ `resident` hoặc `status` ≠ `active` ⇒ chỉ được đăng ký (SPEC-P04 §2) hoặc nhận câu trả lời chung; không tạo cuốc.

## §2. Bước 2 — Chẩn đoán

- Mục tiêu: `JobDraft` đủ để thợ báo giá mà không cần gọi điện. Tối đa **3 câu hỏi** trước khi lưu nháp; mỗi câu một ý.
- Luôn xin ảnh nếu loại việc cần (bảng `job_categories` có cột gợi ý ảnh, seed ở P04).
- Ảnh gửi vào model dạng image block; model mô tả, KHÔNG suy đoán giá.
- `category_code` phải thuộc `job_categories`; không chắc ⇒ `null` + ghi `confidence_note`.
- Ghi bằng `save_job_draft` sau mỗi lượt có thông tin mới (không dồn cuối).

## §3. Bước 2 — Phân loại trách nhiệm (Đ10)

1. Agent gọi `search_regulations` (truy hồi lai: `tsv` + `embedding`, port từ build phase) với hiện tượng + vị trí.
2. Agent gọi `classify_responsibility({party, citations, reason_vi})`. Tool chốt:
   - citations rỗng, nguồn không `approved`, hoặc ngoài `effective_from/to` ⇒ ép `unclear`;
   - hai citation còn hiệu lực kết luận ngược nhau ⇒ `unclear`.
3. **Có trách nhiệm BQL** (`bql` hoặc `unclear`) ⇒ agent gọi `push_bql_ticket` ⇒ ticket lên dashboard; trả lời cư dân kèm trích dẫn (hoặc "BQL sẽ xác nhận trong <SLA>"); agent tiếp tục báo tiến độ khi ticket đổi trạng thái.
4. **Không** (`resident`) ⇒ sang §4.
5. Chưa có quy chế thật ⇒ mọi verdict là `unclear` (đúng thiết kế).

## §4. Bước 3 — Ticket case

- Một tin gửi cư dân gồm: kết luận + trích dẫn ("Theo <tài liệu> mục <x>: …"), câu "BQL sẽ tìm thợ đã được duyệt; anh/chị thanh toán trực tiếp với thợ" (Đ05), khung giá tham khảo nếu `get_price_band` có, 2–3 khung giờ gợi ý, câu hỏi đồng ý.
- Cư dân đồng ý + chọn giờ ⇒ `open_service_case` ⇒ ticket `service_case` (BQL chỉ theo dõi) ⇒ chuyển P05 bước 4.
- `mode`: `job_categories.default_mode`; `price_book` rỗng ⇒ `quote` (thợ báo giá khi nhận). Giá là thông tin kèm cuốc, **không phải cổng**.

## §5. Ngữ cảnh & chi phí

- System prompt cố định (vai, luật trả lời, định dạng trích dẫn) + định nghĩa tool ⇒ đặt `cache_control`; phần biến đổi (ngày giờ, thông tin căn) đặt sau breakpoint.
- Lịch sử: 20 lượt gần nhất của conversation + `JobDraft` hiện tại; không nạp tin của thread khác.
- Ghi `agent_runs` mỗi lượt (token, cache_read, latency, outcome).
- Trả lời tiếng Việt, ≤ 4 câu mỗi tin trừ khi trích dẫn; không markdown bảng.

## §6. Phát triển trên kênh giả lập (Đ13)

P03 thi công và nghiệm thu hoàn toàn trên `SimTransport` (01-CONTRACTS §8): người phát triển đóng vai cư dân ở `/dev/sim`; golden và `evals/scenarios` chạy tự động. Chưa cần Zalo.

## §7. Vùng cấm

- CẤM agent tự kết luận `bql`/`resident` mà không có trích dẫn (BB-03).
- CẤM hứa giá cố định; chỉ nói "khung tham khảo".
- CẤM đề xuất thợ cụ thể theo tên (việc của P05).
- CẤM dùng nội dung tin nhắn kiểu "[userId: …]" làm danh tính (BB-08).

## §8. Lỗi

| Tình huống | Hành vi |
| :-- | :-- |
| `ModelUnavailableError` | "Em đang bận, sẽ trả lời trong vài phút"; retry qua pg-boss; khẩn cấp vẫn chạy (§1) |
| `RegulationUnavailable` | `unclear` ⇒ ticket |
| Cư dân gửi ảnh không đọc được | xin lại ảnh, không đoán |
| Quá 3 câu hỏi mà vẫn mơ hồ | lưu nháp `category_code=null`, `mode='quote'` |

## §9. Nghiệm thu (G08–G10)

Golden (TESTING-ACCEPTANCE §3): `emergency` 100% bật đúng, 0 bỏ sót; `responsibility` ≥ 90% đúng `party` và 100% verdict `resident`/`bql` có citation hợp lệ; `diagnosis` ≥ 85% đúng `category_code`.

## §10. Chốt thi công (Đ17 — Super Orchestrator, 2026-09-24)

Các mục dưới đây là hợp đồng thi công P03; §1–§9 vẫn giữ nguyên hiệu lực. Sửa lỗi chữ ở §1: ticket khẩn cấp là `tickets.kind='emergency'` (DDL không có cột `reason`).

### §10.1 Nhận tin — sửa `processInbound` (thay SPEC-P01 §6 phần "Xử lý")
- Nhận việc TRƯỚC, xử lý SAU: `UPDATE inbound_events SET processed_at=now() WHERE id=(SELECT id … WHERE processed_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, rồi gọi handler **ngoài** transaction. Ngữ nghĩa: mỗi tin xử lý **tối đa một lần** — không bao giờ trả lời trùng. Handler ném lỗi ⇒ ghi `audit_log action='inbound.handler_error'` + gửi mẫu `BUSY_REPLY`, không xử lý lại.
- `echoHandler` giữ cho account `market` tới khi P05 thay. Account `bql` + thread `user` ⇒ `residentHandler`.
- Mọi chuỗi gửi người dùng là tiếng Việt **có dấu**, UTF-8 (sửa luôn `echoHandler` thành `"[sim] đã nhận: <text>"`).

### §10.2 Vòng lượt agent — `packages/core/src/agent/resident-agent.ts`
- `residentHandler(e)`: (1) `Party` từ `zalo_identities` theo `(account, sender_uid)` (BB-08); (2) khẩn cấp §1 chạy **trước mọi lời gọi LLM**, kể cả khi `Party` không phải cư dân active; (3) không phải cư dân `active` ⇒ mẫu `REGISTER_REPLY`, dừng; (4) ngược lại `runResidentTurn`.
- `runResidentTurn(ctx, text)`: nạp 20 tin gần nhất của conversation + `JobDraft` đang mở; lặp `callModel({route:'diagnose', …tools})` tối đa **6 vòng tool**; mỗi `tool_use` ⇒ chạy tool với `ctx` do server dựng; lỗi có kiểu ⇒ `tool_result` `is_error:true` với `{code, message}`; hết vòng mà chưa có text cuối ⇒ `handoff_to_staff('agent_loop_limit')` + `BUSY_REPLY`. Text cuối ⇒ `enqueue` về đúng thread; ghi `messages` cả chiều vào và ra.
- Che PII trước khi gửi model (OPERATIONS §9): SĐT (`(\+?84|0)\d{9,10}`) ⇒ `[SĐT]`; mã căn dạng `[A-Z]-?\d{3,4}` ⇒ `[CĂN]`. Bản gốc chỉ nằm trong DB.
- Prompt: `agent/prompts/resident.md` (tiếng Việt, luật §5, §7). Tool definitions + system có `cache_control` (adapter đã làm).

### §10.3 Tool P03 — mỗi tool một file `agent/tools/<tên>.ts` export `{ definition, run(ctx, input) }`, `definition.strict=true`
`save_job_draft` · `search_regulations` · `classify_responsibility` · `push_bql_ticket` · `open_service_case` · `get_price_band` · `get_my_cases` · `handoff_to_staff`. (`report_problem` là bước 8 ⇒ P06.)
- `save_job_draft`: lần đầu tạo job `drafting` với `code` = `C-` + 4 ký tự từ `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (trùng ⇒ sinh lại, tối đa 5 lần); các lần sau cập nhật `draft`. `category_code` ngoài danh mục ⇒ lỗi `InvalidCategoryError`.
- `classify_responsibility`: chạy luật BB-03 (§3.2) **trong tool**, lưu `jobs.responsibility`; `resident` hợp lệ ⇒ `transitionJob drafting→awaiting_consent`; trả verdict đã chốt để agent biết bị ép `unclear` hay không.
- `push_bql_ticket`: chỉ khi verdict đã lưu là `bql`/`unclear` ⇒ ticket `bql_responsibility`/`unclear` + `transitionJob drafting→routed_bql`.
- `open_service_case`: chỉ khi job `awaiting_consent` VÀ tin cư dân mới nhất (nhận sau lúc job vào `awaiting_consent`) khớp tất định `CONSENT` (bỏ dấu: `dong y|ok|oke|duoc|chot|tim tho|dat lich`) và KHÔNG khớp `khong|chua|thoi|huy` ⇒ ticket `service_case`, `jobs.case_ticket_id`, `window_*`, `mode`, `transitionJob awaiting_consent→case_open`. Sai ⇒ lỗi `ConsentMissingError` (thêm vào bảng lỗi, caller: hỏi lại cư dân).
- Mọi tool ghi `audit_log action='tool.<tên>'`.

### §10.4 Truy hồi quy chế — chỉ từ khoá ở P03
- Port `lib/retrieval/query.ts` của build phase: `immutable_unaccent()` (migration mới, chỉ thêm), cột `kb_sections.tsv` sinh từ `heading || body` qua cùng hàm, `to_tsquery('simple', …)` nối `|`, `ts_rank_cd(…, 32)`, top 8. Chuỗi rỗng ⇒ không chạy SQL, trả rỗng. Lỗi DB ⇒ `RegulationUnavailable`.
- `embedding` để NULL; truy hồi lai chờ chọn nhà cung cấp embedding (Idea Vault). Lý do: stack chỉ có Claude, Anthropic không có API embedding; kho quy chế một tòa chỉ vài chục mục.

### §10.5 Dữ liệu mô phỏng cho P03 (`npm run db:seed:sim`, chỉ khi `DATA_MODE=sim`, idempotent)
- Quy chế `QC-DEMO` (`status='approved'`, tiêu đề mở đầu "MÔ PHỎNG —"), ≥12 mục phân định trách nhiệm (ống chung/đứng vs ống trong căn, điện trước/sau công tơ, thấm từ căn trên, cửa căn hộ, thiết bị trong căn, điều hoà…); 1 mục `deprecated` + 1 mục hết hiệu lực để test ép `unclear`.
- 3 cư dân `active` gắn căn + `zalo_identities` (`bql`, `sim-res-1..3`); 1 cư dân `pending` (`sim-res-9`); `price_book` seed cho 6 danh mục `fixed`.

### §10.6 Golden & máy chấm
- `evals/golden/emergency.jsonl` (20 ca, TESTING §3) chạy trong `npm test` (tất định, không LLM) ⇒ G08 được gate canh.
- `diagnosis.jsonl` (40) và `responsibility.jsonl` (30, theo `QC-DEMO`) + `scripts/eval_golden.mjs` (port `lib/eval/score.ts`): thiếu `ANTHROPIC_API_KEY` hoặc lỗi 429/5xx ⇒ `blocked`, **mã thoát 3**, không tính trượt. G10 thật vẫn cần quy chế thật của tòa pilot.
- Test vòng agent bằng model giả có kịch bản (`setModelClientForTest`): (a) khẩn cấp ⇒ ticket `emergency` + tin trong outbox, 0 lần gọi model; (b) verdict `bql` ⇒ ticket + job `routed_bql`; (c) verdict `resident` không citation ⇒ bị ép `unclear`; (d) `resident` hợp lệ + "đồng ý" ⇒ `case_open`; (e) "không đồng ý" ⇒ `ConsentMissingError`; (f) cư dân `pending` ⇒ `REGISTER_REPLY`, 0 job; (g) tin chứa "[userId: …]" không đổi `Party`; (h) SĐT/mã căn không có trong `messages` gửi model; (i) 6 vòng tool ⇒ handoff.

### §10.7 Vùng cấm bổ sung
- CẤM gọi LLM trong transaction DB. CẤM pg-boss ở P03 (retry model để P07 — lý do: cần runner `jobs`, chưa có). CẤM truy hồi lai/embedding. CẤM sửa `report_problem`, dispatch, tool phía thợ.

### §10.8 Hợp đồng gọi model (tra skill `claude-api` 2026-09-24 — `claude-opus-5` là ID hợp lệ)
- Model giữ `claude-opus-5` (Đ06). Thinking của Opus 5 **bật mặc định** — CẤM gửi `thinking: {type:'disabled'}` hay `budget_tokens` (400); không đặt `temperature`/`top_p` (400). `max_tokens` 16000, không streaming ở P03.
- Vòng tool: sau mỗi phản hồi, nối **nguyên** `response.content` (kể cả khối `thinking`) làm lượt `assistant` — CẤM chỉ nối text; mọi `tool_result` của một lượt nằm trong **một** message `user`; lỗi tool ⇒ `tool_result` `is_error:true`, không bỏ. Parse `tool_use.input` như object (đã là JSON), không so chuỗi.
- Tool: `strict: true` ở cấp định nghĩa tool (cạnh `name`/`description`/`input_schema`); `input_schema` có `additionalProperties:false` + `required` đủ trường. `tool_choice` để `auto`.
- Từ chối: kiểm `stop_reason === 'refusal'` TRƯỚC khi đọc `content` ⇒ `handoff_to_staff('model_refusal')` + `BUSY_REPLY`. Bật fallback phía server mặc định trong `adapters/model.ts`: gọi `client.beta.messages.create` với `betas: ['server-side-fallback-2026-07-01']` và `fallbacks: 'default'` (dạng chuỗi — CẤM ghép với header `-2026-06-01`). Kiểu SDK không có trường ⇒ tra `.d.ts` của gói đã cài; vẫn không có ⇒ ghi Câu hỏi mở, KHÔNG tự đổi sang dạng mảng.
- Kiểu dữ liệu: dùng kiểu SDK (`MessageParam`, `Tool`, `ToolUseBlock`, `ToolResultBlockParam`), CẤM tự định nghĩa lại.
