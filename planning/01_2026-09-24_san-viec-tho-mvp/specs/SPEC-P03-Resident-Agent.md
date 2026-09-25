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
- `diagnosis.jsonl` (40) và `responsibility.jsonl` (30, theo `QC-DEMO`) + `scripts/eval_golden.mjs` (port `lib/eval/score.ts`): thiếu credential của nhà cung cấp đang chọn (`GEMINI_API_KEY` khi `MODEL_PROVIDER=gemini`, `ANTHROPIC_API_KEY` khi `anthropic`) hoặc lỗi 429/5xx ⇒ `blocked`, **mã thoát 3**, không tính trượt. G10 thật vẫn cần quy chế thật của tòa pilot.
- **Đ19 (2026-09-25):** G09/G10 chỉ được đánh ✅ khi chấm qua **vòng agent thật** (`runResidentTurn` trên DB sim đã seed `QC-DEMO`, đọc kết quả từ DB: `jobs.category_code`, verdict của `classify_responsibility`). Máy chấm một lượt `callModel` hiện có chỉ là khói (smoke) cho adapter — CẤM dùng số của nó để đánh gate. Viết lại máy chấm là gói riêng sau thẩm định P03.
- Test vòng agent bằng model giả có kịch bản (`setModelClientForTest`): (a) khẩn cấp ⇒ ticket `emergency` + tin trong outbox, 0 lần gọi model; (b) verdict `bql` ⇒ ticket + job `routed_bql`; (c) verdict `resident` không citation ⇒ bị ép `unclear`; (d) `resident` hợp lệ + "đồng ý" ⇒ `case_open`; (e) "không đồng ý" ⇒ `ConsentMissingError`; (f) cư dân `pending` ⇒ `REGISTER_REPLY`, 0 job; (g) tin chứa "[userId: …]" không đổi `Party`; (h) SĐT/mã căn không có trong `messages` gửi model; (i) 6 vòng tool ⇒ handoff.

### §10.7 Vùng cấm bổ sung
- CẤM gọi LLM trong transaction DB. CẤM pg-boss ở P03 (retry model để P07 — lý do: cần runner `jobs`, chưa có). CẤM truy hồi lai/embedding. CẤM sửa `report_problem`, dispatch, tool phía thợ.

### §10.8 Hợp đồng gọi model (tra skill `claude-api` 2026-09-24 — `claude-opus-5` là ID hợp lệ)
> **Đ18/Đ19 (2026-09-25):** mục này CHỈ áp cho nhánh `MODEL_PROVIDER=anthropic`. Nhà cung cấp mặc định là Gemini — hợp đồng ở 01-CONTRACTS §2b. Câu "fallback phía server" bên dưới bị thay bởi `MODEL_FALLBACKS` phía client (SDK 0.68 không có `fallbacks`). Luật vòng tool (nối nguyên `content`, một message `user` cho mọi `tool_result`, kiểm `refusal` trước) áp cho CẢ HAI nhánh vì core chỉ thấy dạng Anthropic.
- Model giữ `claude-opus-5` (Đ06). Thinking của Opus 5 **bật mặc định** — CẤM gửi `thinking: {type:'disabled'}` hay `budget_tokens` (400); không đặt `temperature`/`top_p` (400). `max_tokens` 16000, không streaming ở P03.
- Vòng tool: sau mỗi phản hồi, nối **nguyên** `response.content` (kể cả khối `thinking`) làm lượt `assistant` — CẤM chỉ nối text; mọi `tool_result` của một lượt nằm trong **một** message `user`; lỗi tool ⇒ `tool_result` `is_error:true`, không bỏ. Parse `tool_use.input` như object (đã là JSON), không so chuỗi.
- Tool: `strict: true` ở cấp định nghĩa tool (cạnh `name`/`description`/`input_schema`); `input_schema` có `additionalProperties:false` + `required` đủ trường. `tool_choice` để `auto`.
- Từ chối: kiểm `stop_reason === 'refusal'` TRƯỚC khi đọc `content` ⇒ `handoff_to_staff('model_refusal')` + `BUSY_REPLY`. Bật fallback phía server mặc định trong `adapters/model.ts`: gọi `client.beta.messages.create` với `betas: ['server-side-fallback-2026-07-01']` và `fallbacks: 'default'` (dạng chuỗi — CẤM ghép với header `-2026-06-01`). Kiểu SDK không có trường ⇒ tra `.d.ts` của gói đã cài; vẫn không có ⇒ ghi Câu hỏi mở, KHÔNG tự đổi sang dạng mảng.
- Kiểu dữ liệu: dùng kiểu SDK (`MessageParam`, `Tool`, `ToolUseBlock`, `ToolResultBlockParam`), CẤM tự định nghĩa lại.

## §11. Vòng 2 — vá sau thẩm định R05 (Đ20 — Super Orchestrator 🔴, 2026-09-25)

Mục này THAY các câu tương ứng ở §1, §10.2, §10.3, §10.5; chỗ nào §11 không nói thì §1–§10 giữ nguyên. Mã lệch = mã trong [R05](../reports/R05_tham-dinh_P03.md) §7. Bộ phá thử của thẩm định (`evidence/P03-audit/attack-source.txt`) là **hồi quy bắt buộc**: mọi ca ĐỎ ở R05 phải thành test, trừ ca ghi rõ ở vùng cấm §11.9.

### §11.1 Khẩn cấp — hai lớp: lưới tất định + lớp hiểu ý (C5, G1; Đ21 thay bản Đ20)
Lý do đổi (người dùng 2026-09-25): bắt từ khoá không thể phủ hết cách người Việt nói (không dấu, teencode, vùng miền, nói gián tiếp "thấy mùi khét ngoài hành lang"). Hiểu ý giao cho model; code giữ lưới an toàn và luật. Đ09/BB-06 giữ nguyên: lưới tất định không chờ model, model chỉ được BẬT cờ.
- **Lớp 1 — lưới tất định, ưu tiên CHÍNH XÁC** (`detectEmergency`, không gọi model, chạy trước mọi thứ): so theo ranh giới từ (dãy token nguyên, không so chuỗi con); tiền xử lý gộp dãy **≥3** chữ cái đơn cách bởi `.`, `-`, `_`, khoảng trắng (`c.h.á.y` ⇒ `cháy`); "chữ cái đơn" xác định bằng ranh giới Unicode `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` — CẤM `\b` (trong JS `\b` chỉ hiểu ASCII ⇒ R06 SO đo: "bếp bốc khói" bị gộp thành "bếpbốc khói", lưới có dấu tê liệt). Test bắt buộc: MỌI cụm (A) và (B) đặt giữa câu có từ có dấu hai bên (vd `bếp {cụm} nghi ngút`, `nhà em {cụm} rồi`) ⇒ bắt được.
  - (A) bản GIỮ dấu (NFC, chữ thường) — R06 Q1 SO chốt: bỏ từ đơn `cháy` (báo nhầm "bóng đèn cháy", golden R22), thêm `nhà cháy`, `nhà bị cháy`; "cháy" đơn lẻ giao lớp 2: `bốc cháy`, `hỏa hoạn`, `hoả hoạn`, `bốc khói`, `khói đen`, `kẹt thang`, `kẹt trong thang`, `mắc kẹt`, `rò gas`, `rò rỉ gas`, `xì gas`, `mùi gas`, `điện giật`, `giật điện`, `chập điện`, `tia lửa điện`, `cháy nổ`, `phát nổ`, `nước tràn hành lang`.
  - (B) bản BỎ dấu, chỉ cụm không nhập nhằng: `boc chay`, `dam chay`, `chay no`, `nha chay`, `nha bi chay`, `hoa hoan`, `boc khoi`, `khoi den`, `ket thang`, `ket trong thang`, `mac ket`, `ro gas`, `ro ri gas`, `xi gas`, `mui gas`, `dien giat`, `giat dien`, `chap dien`, `phat no`, `nuoc tran hanh lang`. CẤM từ đơn bỏ dấu (`chay`, `khoi`, `ngap`).
  - Ngưỡng (trong `npm test`, không model): 0 báo nhầm trên bộ gần-giống + 0/70 ca golden `diagnosis`/`responsibility`. Độ phủ của lớp 1 chỉ ghi số, không chặn cổng — phủ là việc của lớp 2.
- **Lớp 2 — hiểu ý bằng model** (`triageMessage`, §11.10): mọi tin cư dân không trúng lớp 1 ⇒ gọi phân loại ý định. `emergency ≠ null` và `emergency_confidence ≥ TRIAGE_EMERGENCY_MIN` (env, mặc định `0.5` — nghiêng về bắt thừa) ⇒ đường khẩn cấp. Lỗi/quá hạn ⇒ chỉ còn lớp 1 + lớp 3, ghi `audit_log action='triage.unavailable'`.
- **Lớp 3 — agent chính** bật `urgency='emergency'` (§11.2).
- Đường khẩn cấp (chung ba lớp): ticket `kind='emergency'` + `EMERGENCY_REPLY` (bỏ jitter, vẫn qua outbox), **0 lần gọi model agent chính trong lượt đó** (G1: §10.6(a) thắng; lượt KẾ TIẾP chạy agent bình thường). `EMERGENCY_REPLY` thêm câu cuối: "Nếu không phải khẩn cấp, anh/chị nhắn lại mô tả để em hỗ trợ sửa chữa." ⇒ báo nhầm chỉ tốn cư dân một tin, bỏ sót mới là rủi ro — vì vậy lớp 2 nghiêng về bắt thừa.
- Chống lặp: cư dân đã có ticket `emergency` còn mở tạo < 30 phút ⇒ KHÔNG tạo ticket mới, KHÔNG gửi lại `EMERGENCY_REPLY`, chạy agent bình thường.
- Golden: `emergency.jsonl` mở rộng ≥100 ca (≥50 khẩn cấp: có dấu/không dấu/teencode/vùng miền/gián tiếp; ≥50 gần giống: rò rỉ, chảy nước, "chạy máy", "khỏi bệnh", khói thuốc hàng xóm…), gồm mọi câu của bộ phá R05 ca 5. Chấm **hai lớp gộp bằng model thật**: 0 bỏ sót, báo nhầm ≤ 5%. Lớp 1 chấm riêng trong `npm test` theo ngưỡng chính xác ở trên.

### §11.2 Khẩn cấp phía model (C4)
- `save_job_draft` với `urgency='emergency'` ⇒ trong tool chạy đúng đường §11.1 (ticket + `EMERGENCY_REPLY` qua outbox, cùng luật chống lặp). Cờ đơn điệu: job đã `emergency` thì input `normal` bị bỏ qua, output tool báo `urgency_locked: true`. Đây là lưới thứ hai cho biến thể §11.1 không bắt được.

### §11.3 Che PII trước model (C6, G8) — thay regex §10.2
- Áp cho: tin hiện tại, 20 tin lịch sử, `JobDraft` nạp vào ngữ cảnh, output mọi tool trả về model.
- SĐT: `(?<!\d)(?:\+?84|0)(?:[\s.\-()]*\d){8,10}(?!\d)` ⇒ `[SĐT]`.
- Căn: (1) mọi `apartments.code` của tòa (so không phân biệt hoa thường, bỏ qua `.`/`-`/khoảng trắng) ⇒ `[CĂN]`; (2) sau từ khoá `căn|can|căn hộ|can ho|phòng|phong|p.` là mã `[A-Za-z]{0,2}[\s.\-]?\d{1,2}[\s.\-]?\d{2}` ⇒ `[CĂN]`; (3) `\b[A-Za-z]{1,2}[\s.\-]?\d{3,4}\b` (không phân biệt hoa thường) ⇒ `[CĂN]`.
- Ngoại lệ G8: mã cuốc (`jobs.code`) CỦA CHÍNH cư dân này giữ nguyên (thay bằng khoá tạm trước khi che, trả lại sau).
- Xong khi: bộ 20 biến thể của R05 ca 1 ⇒ 0 chuỗi thô trong `messages` gửi model (bắt bằng model giả ghi lại request).

### §11.4 Trách nhiệm có trích dẫn (C1, N12)
- `classify_responsibility`: `party ∈ {resident, bql}` chỉ giữ khi MỌI citation hợp lệ có nhãn (`[BQL]`/`[CƯ DÂN]`) và nhãn = `party`; citation thiếu nhãn hoặc ngược nhãn ⇒ `unclear`.
- `quote` lưu = đoạn cắt từ `kb_sections.body` (≤300 ký tự đầu của mục); `quote` do model gửi bị BỎ QUA.
- Migration `003_*.sql` (chỉ thêm): `kb_documents.building_id uuid references buildings`, điền tòa của dữ liệu hiện có, rồi `set not null`. `search_regulations` và kiểm citation lọc `building_id = ctx.buildingId`; citation tòa khác ⇒ không hợp lệ. Sửa 01-CONTRACTS §4 cùng đợt (SO làm).

### §11.5 Đồng ý của cư dân (C2, C3) — thay luật `CONSENT` §10.3
- `classify_responsibility` chỉ chạy khi job `drafting`; trạng thái khác ⇒ lỗi có kiểu `VerdictLockedError` (thêm vào `domain/errors.ts` + bảng §9: caller báo cư dân "đã kết luận, cần BQL xem lại").
- `open_service_case` cần ĐỦ: job `awaiting_consent`; `jobs.responsibility.party = 'resident'`; tin đồng ý là tin `in` có `created_at` SAU `job_events.created_at` của chuyển `drafting→awaiting_consent` (tức ở lượt sau lượt hỏi).
- Tin đồng ý (bỏ dấu, chữ thường, bỏ dấu câu cuối, bỏ tiểu từ `a|nhe|nha|luon|di|em|anh|chi|minh`): hoặc BẰNG một trong `dong y`, `toi dong y`, `em dong y`, `ok`, `oke`, `okay`, `duoc`, `chot`, `tim tho`, `tim tho giup`, `dat lich`, `co`; hoặc BẮT ĐẦU bằng một cụm đó rồi `,`/`.` và phần sau không chứa token `khong|ko|k|hong|hok|chua|dung|thoi|huy|suy nghi|hoi` — và cả tin không có `?`. Còn lại ⇒ xét lớp hiểu ý: `triage.intent = 'consent'` với `intent_confidence ≥ 0.8` của CHÍNH tin đó (kết quả do server lưu, agent chính không truyền vào được) ⇒ chấp nhận; `decline`/`defer`/`question`, độ tin thấp, hoặc triage lỗi ⇒ `ConsentMissingError` (Đ21). Prompt dặn agent khi hỏi lại: "anh/chị trả lời ĐỒNG Ý để em tìm thợ". Golden `consent.jsonl` ≥40 ca (phủ định, hoãn, hỏi lại, đồng ý kiểu miền/không dấu): 0 đồng ý sai, ≥ 90% đồng ý thật được nhận — chấm bằng model thật.

### §11.6 Hội thoại, im lặng khi người tiếp quản, trả lời luôn có (N2, N3, N6, N7, N8, N11, G9)
- N11: `conversations.party_id` đã có và ≠ `Party` giải từ người gửi (BB-08) ⇒ không nạp lịch sử, `audit_log action='conversation.party_mismatch'`, `BUSY_REPLY`, không gọi model.
- N3: `handoff_to_staff` đặt `human_takeover_until = now() + HUMAN_TAKEOVER_MIN` (env, mặc định 60) + ticket `kind='unclear'` cho nhân viên. Khi còn hạn: lưu tin vào, 0 lần gọi model, không trả lời — trừ đường khẩn cấp §11.1 (BB-06).
- N2: vòng kết thúc mà không có text (rỗng, `max_tokens`) ⇒ `BUSY_REPLY` + `handoff_to_staff('agent_empty')`. Mỗi tin vào nhận đúng một tin ra, trừ khi người đang tiếp quản.
- N6: tin hiện tại xuất hiện ĐÚNG một lần trong `messages` gửi model. N7: `JobDraft` đang mở (đã che) nạp vào phần biến đổi sau breakpoint cache. N8: danh sách `job_categories` (`code` — `name`) vào phần cố định của system prompt.
- G9: một cư dân chỉ có tối đa một job `drafting` (tạo trong transaction có khoá theo `resident_id`; đua ⇒ dùng lại job đã có).

### §11.7 Còn lại (C7, N5, N9, N10, N14, G6, G7, G10)
- C7: script npm `db:seed:sim` KHÔNG được tự gán `DATA_MODE`; `runSeedSim` từ chối (exit 1) khi `process.env.DATA_MODE !== 'sim'`. `test:db` tự đặt `DATA_MODE=sim` cho bước seed của chính nó, chạy được trên Windows và Linux.
- N5: mọi tool (kể cả chỉ đọc) ghi `audit_log action='tool.<tên>'`.
- N9: mỗi file `*.db.test.ts` tự dựng dữ liệu của mình, chạy đúng khi đảo thứ tự file. Xong khi: 3 lượt đảo thứ tự đều xanh.
- N10: test canh 3 luật vòng tool §10.8 (nối nguyên `content` kể cả khối lạ; mọi `tool_result` một lượt trong một message `user`; `refusal` kiểm trước `content`); đột biến m5–m7 của R05 phải chết.
- N14: token truy hồi dựng phía TS (NFD, bỏ dấu, `đ→d`, chữ thường, tách theo `[^a-z0-9]`, tối đa 12 token), truyền làm tham số; tsquery chỉ chứa `[a-z0-9]` và `|`.
- G6: lỗi sai trạng thái trong tool dùng lỗi có kiểu sẵn (`ConflictError`/`VerdictLockedError`), không `Error` thường. G7: hiệu lực quy chế so theo ngày `Asia/Ho_Chi_Minh`. G10: `callModel` ném lỗi khác `ModelUnavailableError` ⇒ vẫn `BUSY_REPLY` nhưng `audit_log action='agent.model_error'` kèm tên lỗi (không nuốt im).

### §11.8 Nghiệm thu vòng 2
Cổng TESTING §1 xanh; `npm test` và `test:db` không giảm số test, 0 skip; bộ phá R05 chạy lại ⇒ mọi ca ĐỎ thành XANH (trừ §11.9); golden emergency mới đạt ngưỡng §11.1.

### §11.9 Vùng cấm vòng 2
- CẤM để model GỠ cờ khẩn cấp hay để lớp 1 chờ kết quả model (BB-06). CẤM so khớp mờ ở lớp 1 (mờ là việc của lớp 2).
- CẤM gửi tin chưa che PII vào triage; CẤM agent chính đọc/ghi kết quả triage qua tool.
- CẤM che số viết bằng chữ ("không chín không…") — hiếm, chi phí cao, dễ che nhầm; ghi nhận là giới hạn.
- CẤM viết lại máy chấm golden ở vòng này (Đ19-4 là gói riêng).
- CẤM đổi định dạng mã cuốc `C-XXXX` (01-CONTRACTS §4).

### §11.10 Lớp hiểu ý — `packages/core/src/agent/triage.ts` (Đ21)
- `triageMessage(text: string, recent: string[]): Promise<TriageResult | null>` — `text` và tối đa 3 tin gần nhất ĐÃ che PII (§11.3). Gọi `callModel({route:'triage', …})` không tool; model trả JSON thuần; parse + kiểm schema lỗi ⇒ `null`.
- `TriageResult = { emergency: 'fire'|'smoke'|'gas'|'electric'|'flood'|'elevator'|'other'|null; emergency_confidence: number; intent: 'describe_problem'|'consent'|'decline'|'defer'|'question'|'other'; intent_confidence: number }` (số trong `[0,1]`).
- Model: route `triage` ⇒ env `MODEL_TRIAGE`, mặc định `gemini-3.5-flash-lite` (provider gemini) / `claude-haiku-4-5` (anthropic); KHÔNG rơi về `MODEL_DEFAULT`. Quá hạn `TRIAGE_TIMEOUT_MS` (mặc định 4000) ⇒ `null`; không retry, không `MODEL_FALLBACKS` (độ trễ quan trọng hơn).
- Server lưu kết quả vào `messages.content.triage` của tin vào (và `agent_runs` route `triage`); `open_service_case` đọc từ đó. Prompt: `agent/prompts/triage.ts` — tiếng Việt, định nghĩa từng nhãn kèm ví dụ gần-giống, dặn "nghi ngờ khẩn cấp thì chọn khẩn cấp".
- Chi phí: một lời gọi model rẻ mỗi tin cư dân; `agent_runs` tách route để đo.
- Test (model giả, `npm test`/`test:db`): triage `null`/quá hạn ⇒ chỉ lớp 1; triage khẩn cấp ⇒ đường khẩn cấp, agent chính 0 lần gọi; triage `consent` nhưng cùng lượt hỏi ⇒ từ chối; JSON hỏng ⇒ `null`; request triage không chứa PII thô.

### §11.11 Cột `jobs.category_code` là nguồn chân lý của danh mục (Đ23 — Super Orchestrator 🔴, 2026-09-25)
- Lỗi tìm thấy khi chấm model thật (H08 lượt 1): `save_job_draft` chỉ ghi `category_code` vào JSON `jobs.draft`, cột `jobs.category_code` (01-CONTRACTS §4) không ai ghi ⇒ `open_service_case` tra khung giá với `null`, máy chấm G09 đọc cột ra `null` (0/40), P05 ghép thợ theo `vendor_skills` sẽ gãy.
- BẮT BUỘC: `save_job_draft` ghi `jobs.category_code = input.category_code` trong CÙNG câu lệnh ghi `draft` — cả nhánh tạo mới (`insert`), nhánh dùng lại job `drafting` đã có (G9) và nhánh cập nhật theo `ctx.jobId`. `null` ghi đè thành `null` (cư dân sửa lại mô tả ⇒ danh mục mới thắng).
- Đọc danh mục ở mọi nơi (tool, dashboard, P05, máy chấm) từ CỘT, không từ `draft->>'category_code'`. `draft.category_code` giữ nguyên để tương thích, luôn bằng cột.
- CẤM: migration mới cho việc này (cột đã có từ `001_init.sql`); trigger DB đồng bộ hai nơi (logic nằm trong tool — BB-01); backfill dữ liệu (DB dev/sim dựng lại được).
- Xong khi: test DB — gọi `save_job_draft` lần 1 (`ong_nuoc_ro`), lần 2 (`null`), lần 3 (`khoa_cua`) trên cùng cư dân ⇒ sau mỗi lần cột = draft = input; `open_service_case` trên job có danh mục + `price_book` ⇒ ticket case mang giá p50 (không còn nhánh `null`).

