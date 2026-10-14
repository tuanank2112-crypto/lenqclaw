# 00 — KIẾN TRÚC & BẤT BIẾN · Agent chăm sóc cộng đồng Zalo

> **Trạng thái:** hợp đồng kiến trúc, khoá cho vòng `0.1.x` (phát hành đầu tiên — D11).
> **Nguồn chân lý cấp trên:** [`../plan.md`](../plan.md) §2 (D01–D11 của Super Orchestrator, D12–D20 của architect). Mâu thuẫn ⇒ `plan.md` thắng, rồi file này, rồi `01-CONTRACTS.md`, rồi SPEC-P từng gói, rồi `docs/`.
> **Người đọc mục tiêu:** worker KHÔNG có lịch sử hội thoại. Mọi tên hàm/bảng/lệnh trong bộ SPEC này đã được đối chiếu với mã thật tại HEAD `eada365` ngày 2026-10-09 (xem §9).

## §1. Router thứ tự đọc

| # | File | Đọc khi nào | Bỏ qua được |
| :-- | :-- | :-- | :-- |
| 1 | `00-ARCHITECTURE.md` (file này) | Luôn luôn | ❌ |
| 2 | [`01-CONTRACTS.md`](01-CONTRACTS.md) | Trước khi viết bất kỳ type/DDL/tool/API | ❌ |
| 3 | [`SPEC-P01-Go-San-Tho.md`](SPEC-P01-Go-San-Tho.md) | Gói đầu tiên — gỡ mã sàn thợ, migration 007/008 | chỉ khi P01 đã ✅ |
| 4 | [`SPEC-P02-Transport-Nhom.md`](SPEC-P02-Transport-Nhom.md) | Mọi thứ nhận/gửi Zalo nhóm, hành động quản trị, kênh giả lập nhóm | ✅ |
| 5 | [`SPEC-P03-Runtime-Agent.md`](SPEC-P03-Runtime-Agent.md) | Cổng nhận tin, phiên, đệm, persona, chính sách tool, vòng lượt | ❌ (mọi gói agent đọc) |
| 6 | [`SPEC-P04-Tri-Thuc.md`](SPEC-P04-Tri-Thuc.md) | Kho tri thức, truy hồi lai, trích dẫn, câu hỏi bỏ trống | ✅ |
| 7 | [`SPEC-P05-Kiem-Duyet.md`](SPEC-P05-Kiem-Duyet.md) | Kiểm duyệt, thang cảnh cáo, thẻ duyệt, duyệt vào nhóm, chào mừng | ✅ |
| 8 | [`SPEC-P06-Lead-Tri-Nho.md`](SPEC-P06-Lead-Tri-Nho.md) | Kéo sang 1-1, thẻ lead, hồ sơ thành viên, ghi chú ngày | ✅ |
| 9 | [`SPEC-P07-Lich-Van-Hanh.md`](SPEC-P07-Lich-Van-Hanh.md) | Lịch (`automations`), bình chọn/nhắc/ghi chú, tóm tắt tuần, báo cáo ngày | ✅ |
| 10 | [`SPEC-P08-Dashboard.md`](SPEC-P08-Dashboard.md) | Mọi trang/route web mới | ✅ |
| 11 | [`OPERATIONS.md`](OPERATIONS.md) | Trước lần chạy Zalo thật đầu tiên và trước deploy VPS | ❌ |
| 12 | [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md) | Trước khi báo "xong" bất kỳ gói nào | ❌ |

## §2. Mục tiêu (D01, D05)

Một tài khoản Zalo cá nhân (`community`) làm **phó nhóm** trong các nhóm Zalo của cộng đồng quan tâm AI agent / muốn dựng AI chăm sóc khách hàng. Agent:

1. **Hỏi đáp** khi được gọi (mention / trả lời tin bot / gọi tên) và **nhặt câu hỏi bị bỏ trống** quá `UNANSWERED_AFTER_MIN` phút ở nhóm chế độ `ambient`; trả lời **có trích dẫn** từ kho tri thức cộng đồng.
2. **Chào thành viên mới** bằng lời do agent soạn (không chỉ template) và **duyệt yêu cầu vào nhóm** theo chính sách từng nhóm.
3. **Kiểm duyệt:** phân loại spam / lừa đảo / quảng cáo bằng **model + lưới tất định chính xác cao**, thang cảnh cáo theo (nhóm, người) có suy giảm, **xoá tin người khác** (sửa đúng lỗi `uidFrom` của zaloclaw), đề nghị kick/block qua **thẻ duyệt**.
4. **Kéo việc riêng sang 1-1**, **thu thập & sàng lọc khách tiềm năng** muốn setup AI CSKH ⇒ thẻ lead trên dashboard ⇒ chuyển chủ.
5. **Vận hành nhóm:** thông báo, bình chọn, nhắc lịch, ghi chú, tóm tắt tuần; **báo cáo ngày** cho chủ qua DM.
6. **Tự giới thiệu năng lực** khi được hỏi — agent là bản demo sống của sản phẩm.

Số đo thành công vòng 0.1 (TESTING §4): golden thật với model thật (D10) đạt ngưỡng; 7 ngày chạy Zalo thật trong ≥ 2 nhóm không bị khoá tài khoản, 0 hành động quản trị nguy hiểm ngoài thẻ duyệt.

## §3. Non-goals (vòng 0.1)

| Không làm | Lý do / quyết định |
| :-- | :-- |
| Sàn việc thợ, cư dân, BQL, slot, ticket, access pass | D01 — bỏ hẳn; mã gỡ ở P01, tag `archive/plan-01-marketplace` |
| Marketing / FOMO / chiến dịch kéo thành viên | D05 — ngoài phạm vi |
| Nhiều tài khoản Zalo | D12 — một tài khoản `community` ở 0.1; tài khoản doanh nghiệp là giai đoạn sau (D25); đường nối tenant có sẵn (D23) |
| Zalo OA, lớp `ChannelAdapter` | D25 — chỉ zca-js; BB-02/BB-03 đã nhốt zca-js trong worker |
| Nhiều tenant thật (RLS, dashboard lọc tenant) | D23 — 0.1 chỉ có tenant `default`; bảng + cột có sẵn |
| Tin ảnh/file/voice vào agent (chỉ ghi nhận loại tin) | D12 — rủi ro tải file + bộ nhớ; Idea Vault |
| Gửi file theo đường dẫn, `exec`, đọc file hệ thống, tự cập nhật (`git pull`), restart từ chat | Vùng cấm §7 — lỗi zaloclaw không lặp lại |
| Giải tán nhóm, đổi chủ nhóm, thêm/bớt admin từ agent | D06 — KHÔNG TỒN TẠI dưới dạng tool |
| Lọc prompt-injection bằng regex | D05(c) — cộng đồng AI bàn prompt công khai; chống leo thang bằng chính sách tool theo vai |
| Lịch dạng `cron` | D16 — chỉ `at`/`every`/`daily`/`weekly` (không thêm thư viện); cron khi có nhu cầu |
| pg-boss, hàng đợi ngoài Postgres | Giữ Đ22/Đ27 của kế hoạch 01: một runner tuần tự + `runTimers(now)` |
| Thanh toán, hợp đồng với lead | Lead chỉ tới thẻ "chuyển chủ" |

## §4. Luồng chuẩn (bản ASCII — không có ảnh)

```text
Zalo (zca-js 2.2.0) ──listener──► apps/zalo-worker ──INSERT──► inbound_events (Postgres)
                                                     (text, group_event, undo)      │
                                                                                    ▼ runner core:run (1 bản, tuần tự)
   ┌───────────────────────────── packages/core/src/agent/community/router.ts ──────┐
   │ 1 ingest nhóm: upsert group_members, INSERT group_messages (đệm vòng 200/nhóm)   │
   │ 2 kiểm duyệt (SPEC-P05): lưới tất định + triage model ⇒ thang cảnh cáo ⇒ outbox │
   │ 3 cổng nhận tin decideGroupInbound (SPEC-P03 §3) — hàm thuần, trả mã lý do      │
   │ 4 lượt agent theo loại: group_mention | group_ambient_flush | group_welcome |     │
   │   group_unanswered | group_join_review | dm | owner_dm | automation              │
   │ 5 agent làm MỌI việc qua tool; luật nằm TRONG tool (BB-01)                       │
   └──────────────────────────────────────────────────────────────────────────────────┘
                                   │ enqueue() — hàm DUY NHẤT ghi outbox (BB-04)
                                   ▼
   outbox (text | action | typing | seen | react) ──pacer theo tài khoản + theo nhóm──► zca-js
   timers (runTimers(now) trong runner): flush ambient · flush welcome · câu hỏi bỏ trống ·
   automations · hết hạn thẻ duyệt · cắt đệm · báo cáo ngày ⇒ ghi inbound_events sender='system'
   apps/web: dashboard (nhóm, persona có phiên bản, thẻ duyệt, lead, kiểm duyệt, tri thức, lịch,
   dòng thời gian agent) + /zalo (QR) + /dev/sim (nhóm giả lập)
```

## §5. Thành phần (giữ nền D02)

```text
apps/zalo-worker    zca-js 2.2.0 (pin), MỘT tài khoản `community`, phiên mã hoá AES-GCM, QR qua web,
                    listener message/group_event/undo/closed/error, outbox pacer (text + action), watchdog
packages/core       adapters/{db,model,transport} · agent/community/* · services/* · retrieval/* · sim/* · runner
apps/web            Next.js 15: auth 2 vai (admin, operator), dashboard §4, /zalo, /dev/sim (nhóm)
Postgres 16 + pgvector 0.8.5 (đo 2026-10-09), Docker; migration append-only 007, 008, 009 (D23/D24)
```

## §6. Bất biến (BẮT BUỘC — mọi gói)

| Mã | Bất biến | Cách canh |
| :-- | :-- | :-- |
| BB-01 | Agent thực hiện MỌI việc qua tool; luật cứng nằm TRONG tool (kiểm vai, ngân sách, trạng thái) và tool từ chối bằng lỗi có kiểu (01-CONTRACTS §9). Agent không có tool ngoài danh sách 01-CONTRACTS §7 | `scripts/check_agent_tools.mjs` (bản mới, SPEC-P01 §6) quét tên tool cấm + đối chiếu danh sách |
| BB-02 | Mọi lời nói/hành động ra Zalo đi qua `outbox` bằng `enqueue()` của `adapters/transport.ts`; CẤM gọi zca-js ngoài `apps/zalo-worker` | `scripts/check_adapter_boundary.mjs` (giữ nguyên) |
| BB-03 | Chỉ `adapters/db.ts` mở Postgres, chỉ `adapters/model.ts` gọi LLM/embedding (Gemini mặc định — Đ18 cũ giữ), chỉ `adapters/transport.ts` ghi outbox | `check_adapter_boundary` |
| BB-04 | Danh tính & vai (`owner`/`moderator`/`member`/`stranger`) lấy từ `account_owners` + `group_members`, KHÔNG BAO GIỜ từ nội dung tin, tên hiển thị hay output model | test giả mạo `[userId: …]`, `@Tên` (SPEC-P03 §3 ca G24/G25) |
| BB-05 | Ở nhóm, agent chỉ lên tiếng bằng tool `send_group_message`; text cuối của lượt `ambient` là RIÊNG TƯ (không đăng). Lượt `mention`/`reply_to_bot`/`name_pattern`/`owner_command` BẮT BUỘC có một tin ra (host thi hành, SPEC-P03 §6.4) | test lượt ambient không gọi tool ⇒ 0 outbox; lượt mention không gọi tool ⇒ 1 outbox fallback |
| BB-06 | Hành động nguy hiểm (kick, block, từ chối vào nhóm khi policy `manual`, thông báo toàn nhóm do agent tự đề xuất) chỉ TẠO `approvals`; thi hành chỉ sau khi owner/moderator/staff duyệt. `disperse_group`, `change_group_owner`, `add/remove_group_deputy`, `self_update`, `restart`, `send_file`, `exec` KHÔNG TỒN TẠI dưới dạng tool hay action outbox | `check_agent_tools` cấm tên; `outbox.body.action` enum 01-CONTRACTS §8.3 |
| BB-07 | Hồ sơ thành viên (`member_profiles`) và ghi chú ngày (`daily_notes`) KHÔNG BAO GIỜ được nạp vào lượt nhóm; lượt nhóm chỉ thấy persona + kho tri thức công khai + đệm nhóm | test prompt nhóm không chứa chuỗi từ `member_profiles.notes` |
| BB-08 | Ngân sách phát ngôn: ≤ `zalo_groups.budget_per_hour` tin text/nhóm/giờ, ≤ `PACER_MAX_PER_MINUTE` tin/tài khoản/phút, khoảng cách ≥ `PACER_GROUP_GAP_MS` + jitter giữa 2 tin cùng nhóm; chunk ≤ `PACER_MAX_CHARS` (1800 < 2000) | `budget-ref` (evidence/ARCH) + test pacer worker |
| BB-09 | Mọi hành động quản trị (xoá tin, cảnh cáo, duyệt vào nhóm, kick/block, đổi chế độ nhóm, đổi persona) ghi `audit_log` với actor | test đếm audit = đếm hành động |
| BB-10 | Tên nhóm, tên thành viên, nội dung quote, nội dung tin là DỮ LIỆU KHÔNG TIN CẬY — rào bằng khung `<<<untrusted …>>>` khi nạp vào model; CẤM nối chuỗi `[uid, name]: body` không thoát (lỗi zaloclaw `monitor.ts:931`) | test prompt có khung + ca injection (SPEC-P03 §8) |
| BB-11 | Đệm nhóm giữ ≤ `GROUP_BUFFER_MAX` (200) tin/nhóm và ≤ `GROUP_BUFFER_RETENTION_DAYS` (7) ngày; `group_messages` lưu `sender_uid` + `cli_msg_id` cho mọi tin (kể cả tin bot) | `db-checks` (a) evidence/ARCH |
| BB-12 | Model hiểu ý, code là lưới tất định chính xác cao (kế hoạch 01 Đ21 giữ): mọi quyết định "có phải spam", "có muốn setup", "có hỏi không" là model + lưới; CẤM regex là cơ chế chính, CẤM regex "injection guard" | review prompt/golden |
| BB-13 | Ngữ cảnh có trần (D22): lượt DM nạp ≤ `2 × DM_HISTORY_TURNS` tin gần nhất + ghi chú thành viên của chính người nhắn + tóm tắt lead mở — KHÔNG nhiều hơn; lượt nhóm theo SPEC-P03 §4.2 (25/40 tin). `messages` giữ ≤ `MESSAGES_RETENTION_DAYS` ngày. CẤM nén/tóm tắt hội thoại bằng model | test body fetch giả lượt DM (SPEC-P03 §11 hàng 5m) + G21 |
| BB-14 | Mỗi lượt agent ghi đúng 1 dòng `turn_traces`, không chứa nội dung tin/prompt (D24) | test DB SPEC-P03 §11 hàng 5n + G21 |

## §7. Vùng cấm (đã cân nhắc, quyết KHÔNG làm — kèm lý do)

- **Mega-tool nhiều `action`** (zaloclaw `tool.ts:136-309`, 153 action, ~4k token/lượt, không phân quyền được) — mỗi tool một việc, mỗi tool tự kiểm vai.
- **`delete-message` với `uidFrom = chính bot`** (zaloclaw `tool.ts:741`): không xoá được tin người khác. Ta lưu `sender_uid` + `cli_msg_id` trong `group_messages` và truyền đúng `uidFrom` của người gửi (SPEC-P02 §4.2).
- **Tool `self-update`/`restart-channel`/`disperse-group`/`change-group-owner`** (zaloclaw `tool.ts:483-499`, `1081-1096`, `2023-2031`): không tồn tại.
- **Gửi file theo đường dẫn cục bộ** (zaloclaw `tool.ts:621-642` `send-file`, `validateLocalFilePath`): rò file hệ thống — không có tool gửi file.
- **Regex "injection guard" tự động chặn/kick** (zaloclaw `injection-guard.ts:31-57`, `autoRemove`): báo nhầm hàng loạt trong cộng đồng AI; bảo mật bằng BB-04/BB-06/BB-07, không bằng từ khoá.
- **Nối sender vào body không rào** (zaloclaw `monitor.ts:931` `[userId: ${senderId}, name: ${name}]: ${rawBody}`) — giả mạo danh tính bằng text; ta rào `<<<untrusted>>>` và danh tính chỉ từ DB.
- **Chỉ nhận mention gốc, bỏ quote/tên bot** (zaloclaw `monitor.ts:850-877`): ta có 4 cách kích hoạt + `ambient` (OpenClaw `mention-gating.ts:88-117`).
- **Đệm nhóm trong RAM 50 tin/4 giờ** (zaloclaw `monitor.ts:66-80`): mất khi restart ⇒ đệm trong Postgres (BB-11).
- **Lưu TOÀN BỘ lịch sử nhóm vĩnh viễn ra JSONL** (zaloclaw `passive-collector.ts`): rủi ro Luật 91/2025 ⇒ đệm vòng + hạn 7 ngày; không có tool "recall toàn bộ lịch sử".
- **Sự kiện nhóm chỉ template, bỏ qua groupPolicy** (zaloclaw `group-event.ts`): ta cho agent soạn lời chào, có qua `enabled`/policy nhóm; template chỉ là đường lùi khi model sập.
- **Không pacing/jitter khi gửi** (zaloclaw `send.ts`): giữ outbox pacer + ngân sách nhóm (BB-08).
- **Mở mặc định (`dmPolicy`/`groupPolicy = open`** — zaloclaw `monitor.ts:713,738`): mặc định ta là allowlist — nhóm chưa khai trong `zalo_groups` thì KHÔNG đệm, KHÔNG trả lời.
- **Config ghi file không atomic, credentials rõ, một zca instance toàn cục** (zaloclaw): ta giữ cấu hình trong Postgres, phiên AES-GCM (P02 cũ), `AccountSession` theo tài khoản.
- **Tự xin QR mới khi hết hạn, tự đăng nhập lại sau 3000/3003** — giữ nguyên luật kế hoạch 01 (G01).
- **Kết bạn/nhắn chủ động người lạ**: agent chỉ DM người đã nhắn bot trước HOẶC là thành viên nhóm đang được mời "nhắn riêng" (SPEC-P06 §2) và tuân pacer `maxRecipients`.
- **Chấm golden bằng model không dùng thật** (Đ26 cũ): gate chấm bằng `gemini-3.6-flash`.
- **Tiêm hồ sơ thành viên / ghi chú ngày vào nhóm** (OpenClaw: MEMORY never injected in group sessions) — BB-07.
- **Sửa migration 001–006**: append-only; 007/008 đã được architect áp thử từ rỗng (`evidence/ARCH/migration-probe.txt`). Thay đổi sau ngày duyệt đi vào file MỚI (009), không sửa 007/008.
- **Nén hội thoại (compaction) / tóm tắt phiên bằng model / nạp toàn bộ lịch sử DM** (D22): token mỗi lượt tăng theo độ dài hội thoại và mỗi lần nén là thêm một lời gọi model; khách quay lại chỉ cần 5 lượt gần nhất + ghi chú. Trí nhớ dài = `remember_member_note` có chủ đích + trường lead.
- **`tenant_id` trên mọi bảng** (D23): các bảng 008 đã khoá theo `zalo_account_id`; tenant suy qua `zalo_accounts.tenant_id` — một nguồn chân lý.
- **Zalo OA / lớp `ChannelAdapter` trừu tượng** (D25): người dùng chỉ dùng zca-js; ranh giới worker ↔ `inbound_events`/`outbox` đã là đường nối kênh.

## §8. Tái sử dụng từ kế hoạch 01 (PORT, không copy mù)

| Thứ | File gốc (HEAD `eada365`) | Dùng ở |
| :-- | :-- | :-- |
| Vòng lượt tool (≤N vòng, kiểm input schema, `tool_result` một message, lỗi có `code`) | `packages/core/src/agent/resident-agent.ts:135-269` | SPEC-P03 §6 |
| Lớp hiểu ý JSON, quá hạn ⇒ `null`, không retry | `packages/core/src/agent/triage.ts`, `adapters/model.ts::callTriageModel` | SPEC-P03 §5, SPEC-P05 §3 |
| Bằng chứng ý định tất định trong tool (`IntentNotConfirmedError`) | `packages/core/src/agent/tools/claim_job.ts` (đọc trước khi xoá) | `decide_approval` (SPEC-P05 §5.4) |
| Sự kiện hệ thống trên `inbound_events` (`sender_uid='system'`) | `packages/core/src/services/system-events.ts` | SPEC-P03 §4.3 |
| `runTimers(now)` tham số hoá, mỗi bước idempotent | `packages/core/src/services/timers.ts` | SPEC-P07 §2 |
| Pacer thuần + `verifySendLog` + `simulatePacer` | `apps/zalo-worker/src/pacer-policy.ts` | SPEC-P02 §5 |
| Truy hồi từ khoá an toàn (`buildQueryTokens` chỉ `[a-z0-9]`, N14) | `packages/core/src/retrieval/search-regulations.ts:45-63` | SPEC-P04 §2 |
| `immutable_unaccent` + tsv generated | `db/migrations/002_search.sql` | 008 (`daily_notes.tsv`) |
| Che SĐT trước model (`PHONE_RE`) | `packages/core/src/agent/pii.ts:137` | SPEC-P03 §5.3 |
| SimTransport nhận-trước-xử-lý-sau | `packages/core/src/sim/sim-transport.ts::processInbound` | giữ nguyên |
| Máy chấm golden: `blocked` khi thiếu credential / >10% lỗi hạ tầng, exit 0/1/3 | `scripts/eval/score.mjs`, `eval_golden.mjs` | TESTING §3 |

Mẫu OpenClaw/zaloclaw (MIT) chỉ được port theo mô tả trong SPEC; nếu chép nguyên đoạn mã nào thì ghi vào `THIRD_PARTY_NOTICES.md` (SPEC-P01 §7).

## §9. Số đo nền đã đo (2026-10-09, HEAD `eada365`)

| Số | Giá trị | Lệnh |
| :-- | :-- | :-- |
| Unit test hiện có | 317 (core 244, web 36, worker 37) | `npm test -w @lenqclaw/core` … (TESTING §1) |
| Test DB hiện có | 196 (kernel) — sẽ giảm mạnh ở P01 vì xoá test sàn thợ | `npm run test:db` |
| Migration áp trên DB dev | 001–004 (005, 006 chưa áp trên DB dev; `test:db` tự áp) | `select version from schema_migrations` |
| Constraint thật | `zalo_accounts_id_check`, `outbox_kind_check`, `staff_users_role_check`, `staff_users_building_id_fkey`, `kb_documents_building_id_fkey` | `evidence/ARCH/migration-probe.txt` |
| DDL 007+008 | áp từ rỗng sau 001–006: `applied 2`, chạy lại `applied 0`, 27 bảng, 21/21 kiểm OK | `evidence/ARCH/migration-probe.txt` |
| Cổng nhận tin tham chiếu | 28/28 ca | `evidence/ARCH/gate-ref.txt` |
| Thang cảnh cáo tham chiếu | 14/14 ca (sau khi chốt làm tròn 1 chữ số thập phân) | `evidence/ARCH/ladder-ref.txt` |
| Ngân sách nhóm | 100 tin ⇒ 20 tin/giờ đầu, khoảng cách tối thiểu 9000 ms, mọi cửa sổ ≤ 20 | `evidence/ARCH/budget-ref.txt` |
| SQL đệm/câu hỏi/ngân sách/ambient | 5/5 OK | `evidence/ARCH/db-checks.txt` |
