# Kế hoạch 02 — Agent chăm sóc cộng đồng Zalo (phó nhóm AI cho cộng đồng AI agent / AI CSKH)

> Hồ sơ kế hoạch. **KHÔNG chứa thiết kế chi tiết** — thiết kế nằm ở `specs/` (bảng Mục 5). Thứ tự đọc: Mục 2 (D01–D25) → [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) → [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) → SPEC gói đang làm.

## 1. Metadata Header

| Trường | Giá trị |
| :-- | :-- |
| Mã hồ sơ | `02_2026-10-09_zalo-community-agent` |
| Ngày mở | 2026-10-09 |
| Chủ trì | Super Orchestrator; bộ SPEC do architect (Fable 5.1) soạn 2026-10-09 10:14–11:00 ICT trên HEAD `eada365` |
| Trạng thái | 🟢 SPEC ĐÃ DUYỆT (SO, 2026-10-09; D12–D21 giữ, Q1–Q12 giữ giá trị tạm) · bổ sung D22–D25 (2026-10-14, người dùng chốt hướng) — chờ người xác nhận gỡ 94 file (AGENTS §5.L.3) trước khi phóng P01 |
| Phạm vi | Một tài khoản Zalo cá nhân `community` làm phó nhóm trong các nhóm Zalo của cộng đồng; kênh giả lập trước, Zalo thật sau; dashboard Next.js |
| SemVer dự kiến | `0.1.0` (phát hành đầu tiên — D11; `package.json` ×4 đang `0.0.1`, chỉ tăng khi đóng kế hoạch) |
| Đặc tả kế thừa | Kế hoạch 01 (dừng — Đ32 bên đó): giữ nền P01/P02 (monorepo, Postgres, adapter, worker zca-js 2.2.0, SimTransport, auth web, golden/máy chấm); mã sàn thợ gỡ ở P01 sau tag `archive/plan-01-marketplace`. Nguồn mẫu: OpenClaw (MIT) + monas-team/zaloclaw v2.5.11 (MIT) — PORT theo mô tả, không chép |
| Bằng chứng architect | `evidence/ARCH/`: `migration-probe.txt` (007/008 áp từ rỗng, 21/21 OK), `gate-ref.txt` (28/28), `ladder-ref.txt` (14/14), `budget-ref.txt` (20 tin/giờ, gap ≥ 9000 ms), `db-checks.txt` (5/5), `migration-draft-sha256.txt` |

## 2. Nhật ký quyết định

Mỗi mục: quyết định · lý do · **chỗ có thể lật + chi phí lật**. D01–D11: Super Orchestrator chốt (người dùng duyệt 2026-10-09). D12–D21: architect chốt khi dựng SPEC (SO có thể lật trước khi phóng).

### D01 — 2026-10-09 · Pivot: sản phẩm là agent chat chăm sóc cộng đồng trong Zalo (người dùng chốt)
Sàn việc thợ "bỏ đi". Cộng đồng = người quan tâm AI agent, năng lực agent, và người muốn setup AI CSKH. Agent có quyền quản trị nhóm (phó nhóm). Dựa theo OpenClaw + zaloclaw nhưng là bản tự customize trên codebase lenqclaw: port mẫu thiết kế, không lệ thuộc gói openclaw, không chép nguyên file; chép đoạn MIT nào thì ghi `THIRD_PARTY_NOTICES.md`. Kế hoạch 01 dừng (SO ghi Đ32 bên đó). **Lật:** khôi phục từ tag `archive/plan-01-marketplace`; chi phí thấp về mã, cao về thời gian.

### D02 — 2026-10-09 · Giữ nền kỹ thuật
TS Node 22 npm workspaces · Postgres 16 + pgvector · `apps/zalo-worker` (zca-js pin 2.2.0, outbox pacer, watchdog, QR qua web, mã hoá phiên) · adapters db/model/transport (Gemini mặc định, nhánh openrouter/vyce) · `apps/web` (auth, `/zalo`) · SimTransport + `/dev/sim` mở rộng NHÓM. Giữ hai mẫu của kế hoạch 01: "luật nằm trong tool, agent làm mọi bước qua tool" và "hiểu ý bằng model + lưới tất định chính xác cao" (Đ21 cũ). **Lật:** không trong 0.1.

### D03 — 2026-10-09 · Gỡ mã sàn thợ thành một gói riêng, đi đầu
Tag git `archive/plan-01-marketplace` trước khi gỡ; gỡ tool/service/prompt/trang web/test của dispatch, slot, vendor, access, resident, emergency; migration MỚI drop bảng không dùng (append-only, không sửa 001–006). Danh sách chính xác 94 file: [SPEC-P01 §2](specs/SPEC-P01-Go-San-Tho.md). **Lật:** không.

### D04 — 2026-10-09 · Cổng nhận tin kiểu OpenClaw, hàm thuần trả mã lý do
`groupPolicy` mặc định allowlist (nhóm chưa khai ⇒ bỏ) → chặn/cho người gửi → kích hoạt (mention gốc | trả lời/quote tin bot | mẫu tên bot | lệnh của owner/moderator) → chế độ nhóm `mention` | `ambient`. Ambient: agent thấy mọi tin, chỉ lên tiếng bằng tool `send_group_message` (qua outbox pacer); im lặng là mặc định. Host BẮT BUỘC trả lời khi bị mention/lệnh. Đệm lịch sử nhóm trong Postgres (ring theo nhóm); tên nhóm/tên thành viên/quote là dữ liệu không tin cậy được rào. Hợp đồng: [SPEC-P03 §3](specs/SPEC-P03-Runtime-Agent.md), 28 ca `evidence/ARCH/gate-ref.txt`. **Lật:** thứ tự kiểm — sửa một hàm thuần + bảng ca; chi phí thấp.

### D05 — 2026-10-09 · Năng lực MVP
(a) hỏi đáp khi được gọi + nhặt câu hỏi bỏ trống quá N phút (ambient), trả lời có trích dẫn kho tri thức; (b) chào thành viên mới bằng agent + duyệt yêu cầu vào nhóm theo chính sách; (c) kiểm duyệt spam/lừa đảo/quảng cáo bằng model + lưới, thang cảnh cáo (nhóm, người) có suy giảm, xoá tin người khác (sửa lỗi `uidFrom` zaloclaw), KHÔNG lọc injection bằng regex — chống leo thang bằng chính sách tool theo vai; (d) kéo việc riêng sang 1-1; (e) thu thập & sàng lọc lead muốn setup AI CSKH ⇒ thẻ lead ⇒ chuyển chủ; (f) vận hành nhóm: thông báo, bình chọn, nhắc lịch, ghi chú, tóm tắt tuần, báo cáo ngày cho chủ qua DM; (g) tự giới thiệu năng lực. Marketing/FOMO/chiến dịch NGOÀI phạm vi. **Lật:** cắt bớt (f)/(g) nếu thiếu thời gian — chi phí thấp (gói P07 độc lập).

### D06 — 2026-10-09 · Vai & quyền
owner · moderator (admin nhóm khai trong DB hoặc đồng bộ từ `adminIds`) · member · stranger. Chính sách tool theo vai người yêu cầu + theo bề mặt (nhóm/DM/DM chủ). Tool nguy hiểm (kick/block) BẮT BUỘC thẻ duyệt trên dashboard hoặc lệnh xác nhận của owner/moderator. `disperse_group`, `change_group_owner`, `add/remove_group_deputy`, `self_update`, `restart`, gửi file theo đường dẫn: KHÔNG TỒN TẠI dưới dạng tool. Audit mọi hành động quản trị. Hợp đồng: [01-CONTRACTS §7](specs/01-CONTRACTS.md). **Lật:** bảng policy là dữ liệu TS — chi phí thấp.

### D07 — 2026-10-09 · Persona & tri thức kiểu OpenClaw nhưng lưu DB, sửa trên dashboard, có phiên bản
SOUL (giọng), RULES (luật, "biết khi nào nên nói"), IDENTITY (tên, mẫu gọi tên), CAPABILITIES; prompt riêng từng nhóm; skill dạng chỉ mục model đọc khi cần; trí nhớ: hồ sơ thành viên (KHÔNG BAO GIỜ vào phiên nhóm), ghi chú ngày, tìm kiếm lai pgvector + tsvector. **Lật:** thêm kind persona — một migration nhỏ.

### D08 — 2026-10-09 · Lịch
Bảng `automations` + bộ chạy tick trong `runTimers` (như kế hoạch 01, không pg-boss); watcher điều kiện là SQL thuần, không gọi model khi im; heartbeat chỉ DM owner. Kiểu lịch xem D16. **Lật:** pg-boss khi > 1 runner — chi phí trung bình.

### D09 — 2026-10-09 · Chống khoá tài khoản
Pacer theo tài khoản + theo nhóm, ngân sách số tin bot/nhóm/giờ, jitter; chunk ≤ 1800 (< 2000) ký tự; trích dẫn tin kích hoạt. Số đo: `evidence/ARCH/budget-ref.txt`. **Lật:** mọi số là env/cột DB.

### D10 — 2026-10-09 · Đo bằng golden thật với model thật
4 bộ: kích hoạt/nên-nói, kiểm duyệt, ý định lead, câu hỏi chưa ai trả lời; gate chấm bằng `gemini-3.6-flash` (Đ26 cũ giữ). Sim nhóm cho test tất định. [TESTING §3](specs/TESTING-ACCEPTANCE.md). **Lật:** ngưỡng từng bộ — sau lượt chấm đầu, ghi D mới.

### D11 — 2026-10-09 · Phiên bản mục tiêu `0.1.0` (chưa từng phát hành).

### D12 — 2026-10-09 10:20 · Một tài khoản Zalo `community`, đổi tên từ `bql`, bỏ `market` (architect)
Lý do: MVP một bot; tên `bql`/`market` mang nghĩa sàn thợ; đổi tên trong migration 007 GIỮ `session_enc` (đã đo: `enc` còn nguyên sau 007), nên phiên dev (nếu có) không phải quét lại. `AccountId = 'community'`; `ZALO_ACCOUNTS=community`. **Lật:** nhiều tài khoản ⇒ nới CHECK + `AccountId` — chi phí thấp (interface Transport đã theo tài khoản).

### D13 — 2026-10-09 10:20 · Vai web `admin` / `operator` thay `bql_admin`/`bql_staff`/`guard` (architect)
Lý do: tên vai cũ là nghiệp vụ BQL; chưa phát hành nên đổi sạch (migration 007 map `bql_admin→admin`, còn lại `operator`). Bảng quyền: [SPEC-P01 §3.1](specs/SPEC-P01-Go-San-Tho.md). **Lật:** thêm vai — sửa CHECK + policy.

### D14 — 2026-10-09 10:25 · Đệm nhóm trong Postgres: ring 200 tin/nhóm, giữ 7 ngày; tin bot chèn trước khi gửi rồi link msgId thật (architect)
Lý do: zaloclaw đệm RAM 50 tin/4 giờ mất khi restart và không lưu sender ⇒ không xoá được tin người khác; ta lưu `sender_uid`+`cli_msg_id` cho mọi tin, kể cả tin bot (`out-<outbox_id>` ⇒ pacer link msgId). Câu cắt đệm đã đo (`db-checks (a)`: `id <=` với `offset N` — bản `id <` giữ 201). Thay luật kế hoạch 01 "không lưu lịch sử nhóm" (`planning/01_2026-09-24_san-viec-tho-mvp/specs/SPEC-P02-Zalo-Transport.md` §3.5 cũ). **Lật:** số/ngày là env; bỏ lưu text (chỉ metadata) nếu pháp lý yêu cầu — chi phí trung bình (ambient mất ngữ cảnh).

### D15 — 2026-10-09 10:30 · Ambient không gọi model theo từng tin: cửa sổ gom `AMBIENT_DEBOUNCE_SEC` (20 s) + ngân sách lượt/giờ qua sự kiện hệ thống; một lời gọi triage/tin gộp kiểm duyệt + `is_question` + `lead_intent` (architect)
Lý do: chi phí và nhịp nói; OpenClaw xử lý từng room event nhưng dùng model lớn; với flash + nhóm đông, gom cửa sổ cho câu trả lời mạch lạc hơn và kiểm soát được bằng `ambient_turns_per_hour`. Mention vẫn chạy ngay. **Lật:** `AMBIENT_DEBOUNCE_SEC=0` ⇒ gần như từng tin; chi phí thấp.

### D16 — 2026-10-09 10:35 · Lịch chỉ `at | every | daily | weekly` (giờ VN), KHÔNG `cron` (architect — tinh chỉnh D08)
Lý do: D08 ghi "at|every|cron+tz"; cron cần thư viện (`croner`) hoặc parser tự viết dễ sai (OR day-of-month/day-of-week); VN không DST nên `daily/weekly` tính thuần bằng `vn-time.ts`. DDL `automations` đã đổi theo và áp thử (`migration-probe`). **Lật:** thêm `cron_expr` + `croner` pin — một migration thêm cột + hàm `computeNextRun` nhánh mới; chi phí thấp.

### D17 — 2026-10-09 10:33 · Thang cảnh cáo: suy giảm nửa đời 168 giờ, ngưỡng warn 1 / delete 2 / kick 3 / block 4, tăng spam/ad 1 · harass 1,5 · scam 2 (xoá ngay), owner/moderator miễn trừ, **làm tròn 1 chữ số thập phân trước khi so ngưỡng** (architect)
Lý do: chạy bản tham chiếu trên 14 ca lộ ra "spam lần 2 cùng ngày" = 1,996 < 2 ⇒ không xoá; làm tròn 0,1 là luật nhỏ nhất sửa đúng lỗi mà không đổi ngưỡng. `evidence/ARCH/ladder-ref.txt`. **Lật:** mọi số là hằng `LADDER`/`INCREMENT` + env nửa đời; chi phí thấp, phải chạy lại golden `moderation`.

### D18 — 2026-10-09 10:40 · Embedding Gemini `gemini-embedding-001` với `outputDimensionality=1024` khớp cột `vector(1024)` có sẵn; không đổi DDL; thiếu embedding ⇒ truy hồi lexical thuần (architect)
Lý do: giữ cột 001_init.sql, tránh migration đổi kiểu; RRF hợp nhất lexical + vector. Q3 nếu probe trả số chiều khác. **Lật:** đổi `EMBED_DIM` + migration `alter column type vector(n)` khi cột còn NULL — chi phí thấp lúc này, cao sau khi đã nhúng.

### D19 — 2026-10-09 10:45 · Thẻ duyệt: TTL 24 giờ, bằng chứng tất định `duyệt <id>` trong tin của người quyết (port `IntentNotConfirmedError`), moderator chỉ duyệt thẻ của nhóm mình, `agent_review` vào nhóm: model im ⇒ CHO VÀO mặc định (architect)
Lý do: không để model "tự hiểu" người đã đồng ý; đường DM chủ và lệnh nhóm dùng chung lưới. **Lật:** mặc định từ chối khi model im (Q9) — một hằng.

### D20 — 2026-10-09 10:50 · `processInbound` lỗi ở thread nhóm: chỉ audit, KHÔNG gửi `BUSY_REPLY` vào nhóm (architect — đổi hành vi SPEC-P01 cũ §6)
Lý do: câu "hệ thống đang bận" trong nhóm là tiếng ồn do lỗi hệ thống; DM giữ nguyên. **Lật:** không nên.

### D21 — 2026-10-09 10:50 · Host thi hành "bắt buộc trả lời" (D04): không gọi tool nhưng có text ⇒ host tự đăng text đó (quote tin kích hoạt); không text ⇒ gọi lại model 1 lần ⇒ vẫn không ⇒ câu cố định + `handoff_to_owner('no_reply')`; ambient: text cuối riêng tư, không đăng (architect)
Lý do: OpenClaw `visibleReplies: message_tool` giữ text cuối riêng tư và "bounded delivery recovery"; ta chọn tự đăng text ở lượt mention vì model flash hay quên gọi tool — đo được bằng audit `turn.auto_posted_final` (TESTING §5). **Lật:** tắt tự đăng ⇒ luôn retry — một cờ env.

### D22 — 2026-10-14 · Ngữ cảnh DM có trần, KHÔNG nén hội thoại (người dùng chốt)
Lượt DM chỉ nạp `DM_HISTORY_TURNS` (5) lượt trao đổi gần nhất (≤ 10 tin) + ghi chú thành viên (`member_profiles.notes`) của CHÍNH người nhắn + tóm tắt lead mở (trạng thái, điểm, trường còn thiếu). Trí nhớ dài hạn = ghi chú agent chủ đích ghi (`remember_member_note`) + trường lead có cấu trúc. KHÔNG nén (compaction), KHÔNG gọi model tóm tắt hội thoại, KHÔNG nạp toàn bộ lịch sử. `messages` chỉ giữ `MESSAGES_RETENTION_DAYS` (30) ngày rồi timer xoá. Tool `recall_member_profile` BỎ (ghi chú đã nạp sẵn mỗi lượt DM). Hợp đồng: [01-CONTRACTS §6, §10, §11](specs/01-CONTRACTS.md), [SPEC-P03 §5.1, §6.1](specs/SPEC-P03-Runtime-Agent.md), [SPEC-P06 §2](specs/SPEC-P06-Lead-Tri-Nho.md), BB-13. Lý do: giữ hội thoại dài ⇒ token mỗi lượt tăng tuyến tính theo độ dài; khách quay lại sau nhiều ngày chỉ cần vài lượt gần nhất + điều đáng nhớ. **Lật:** số lượt/số ngày là env — chi phí thấp; thêm nén là vùng cấm (00-ARCH §7), cần D mới.

### D23 — 2026-10-14 · Đường nối nhiều tenant: bảng `tenants` + `tenant_id` ở 3 bảng gốc (người dùng duyệt hướng, architect chốt hình)
Migration MỚI `009_tenant_trace.sql` (KHÔNG sửa 007/008 — đã áp thử, có sha256): `tenants`; `tenant_id` (mặc định `'default'`) ở `zalo_accounts`, `staff_users`, `kb_documents`. Các bảng 008 đã khoá theo `zalo_account_id` ⇒ tenant suy ra qua tài khoản; KHÔNG nhân bản `tenant_id` sang ~15 bảng (hai nguồn chân lý). 0.1 chạy đúng 1 tenant `default`: không RLS, dashboard không lọc tenant. Lý do: thêm cột khi bảng còn rỗng gần như miễn phí; thêm sau khi có dữ liệu doanh nghiệp phải backfill. Hợp đồng: [01-CONTRACTS §4 (009)](specs/01-CONTRACTS.md). **Lật:** một migration drop cột — chi phí thấp.

### D24 — 2026-10-14 · Vết từng lượt `turn_traces` + `agent_runs.turn_id`
Mỗi `runCommunityTurn` ghi đúng 1 dòng `turn_traces` (kind, trigger, số vòng, tên tool đã gọi, `sent`, `outcome`, tổng token, latency, phiên bản persona đang active); mọi `agent_runs` trong lượt mang `turn_id`. Thay audit `turn.done` (audit chỉ còn quyết định/hành động). Không lưu nội dung tin hay prompt ⇒ không có PII ⇒ không cần hạn giữ ở 0.1. Chi phí USD tính lúc đọc, không lưu. Lý do: đo được chi phí/lượt, tỉ lệ im/fallback theo phiên bản persona — nền cho mọi tối ưu và cho kế hoạch skill/voice/constraint sau 0.1. Hợp đồng: [01-CONTRACTS §4 (009)](specs/01-CONTRACTS.md), [SPEC-P03 §6.6](specs/SPEC-P03-Runtime-Agent.md). **Lật:** chi phí thấp.

### D25 — 2026-10-14 · Chỉ zca-js (tài khoản Zalo cá nhân) cho cả cộng đồng LẪN doanh nghiệp của chủ; KHÔNG Zalo OA, KHÔNG dựng lớp `ChannelAdapter` (người dùng chốt)
Người dùng chấp nhận rủi ro khoá tài khoản / điều khoản Zalo; giảm bằng D09 như cũ. Không cần lớp kênh mới: BB-02/BB-03 đã nhốt zca-js trong `apps/zalo-worker`, core chỉ thấy `inbound_events`/`outbox` — kênh khác (nếu có) là một worker mới ghi cùng hai bảng. Dùng cho doanh nghiệp (tài khoản thứ hai) là giai đoạn SAU 0.1: nới D12 (CHECK `zalo_accounts.id` + `AccountId`) + tenant thứ hai (D23). **Lật:** thêm kênh = worker mới, không đổi core.

### D26 — 2026-10-14 · Người dùng xác nhận gỡ 94 file sàn thợ theo cách "di chuyển an toàn" — lưu trữ bằng tag ĐÃ PUSH (người dùng chốt, SO thi hành)
Người dùng: "nếu không quan trọng thì di chuyển nó một cách an toàn". SO thi hành TRƯỚC khi phóng P01: (1) tag `archive/plan-01-marketplace` = `d7f50eb` (HEAD lúc đó, đủ 94/94 file — kiểm từng file bằng `git cat-file -e`), (2) **push tag lên `origin`** để còn bản ở GitHub kể cả khi máy hỏng, (3) bản sửa dở chưa commit của `prompts/resident.ts` lưu thành `evidence/P01/resident-ts-wip-diff.txt` rồi trả file về HEAD. Bằng chứng: [`evidence/P01/archive-tag.txt`](evidence/P01/archive-tag.txt). Khôi phục một file: `git checkout archive/plan-01-marketplace -- <đường>`. KHÔNG chép 94 file sang thư mục khác trong repo/workspace (rác root + `check_pivot_cleanup` đỏ; tag là bản lưu đầy đủ, có lịch sử). **Lật:** khôi phục từ tag — chi phí thấp.

### Quyết định bị thay thế
| Mốc cũ | Phát biểu cũ | Thay bằng | Lý do |
| :-- | :-- | :-- | :-- |
| D08 (SO, câu "at\|every\|cron+tz") | Lịch có `cron` | D16 | không thêm thư viện; VN không DST; cron thêm sau bằng migration cột |
| Kế hoạch 01 `SPEC-P02-Zalo-Transport.md` §3.5, `00-ARCHITECTURE.md` §7 (bên đó) | Không lưu lịch sử nhóm; nhóm là kênh phát | D14 | ambient + xoá tin cần đệm có sender; giới hạn 200 tin/7 ngày thay vì cấm |
| Kế hoạch 01 BB-03 | Kết luận phải có trích dẫn, thiếu ⇒ `unclear` ⇒ người | SPEC-P04 §4 | cộng đồng không có trách nhiệm pháp lý; trích dẫn là chất lượng (golden), không phải cổng |
| Kế hoạch 01 SPEC-P01 §6 / `sim-transport.ts::processInbound` | handler lỗi ⇒ `BUSY_REPLY` mọi thread | D20 | nhóm không nhận tin lỗi hệ thống |
| Kế hoạch 01 01-CONTRACTS §8 `createTransport('zalo')` | ném "P02 chưa làm" | 01-CONTRACTS §2.3 | worker là tiến trình riêng; core chỉ cần `enqueue` |
| Kế hoạch 01 Đ22 §9.1 "chỉ text, nhóm bị bỏ ở worker" | worker trả `ignored_group` | SPEC-P02 §2.1 | nhóm là sản phẩm; lọc do cổng ở core |
| Kế hoạch 01 roles `bql_admin/bql_staff/guard`, tài khoản `bql/market` | | D12, D13 | pivot |
| zaloclaw `delete-message` (`tool.ts:741`) | `uidFrom = uid bot` | SPEC-P02 §4.2 | không xoá được tin người khác |
| zaloclaw mention gating (`monitor.ts:850`) | chỉ mention gốc | D04 | 4 cách kích hoạt + ambient |
| SPEC-P01 §1 bước 1 (bản duyệt 2026-10-09) | worker tự đánh tag `eada365`, "KHÔNG push" | D26 | SO đã đánh tag `d7f50eb` + push để lưu trữ an toàn |
| zaloclaw injection-guard | regex chặn/kick | D05(c) | báo nhầm trong cộng đồng AI; bảo mật bằng policy tool theo vai |
| SPEC-P03 §5.1 bước 5 (bản duyệt 2026-10-09) | DM nạp "lịch sử 20 tin" | D22 | ≤ 5 lượt (10 tin) + ghi chú thành viên; chi phí |
| 01-CONTRACTS §7.1 (bản duyệt 2026-10-09) | tool `recall_member_profile` (D) | D22 | ghi chú nạp sẵn mỗi lượt DM — tool thừa tốn token định nghĩa |
| SPEC-P03 §6.6, SPEC-P04 §5 (bản duyệt 2026-10-09) | audit `turn.done` | D24 | `turn_traces` có cấu trúc |
| 00-ARCH §3 "Nhiều tài khoản Zalo, Zalo OA" · roadmap "Kênh Zalo OA song song" · đề xuất `ChannelAdapter` (chat 2026-10-14) | OA là hướng sau 0.1 | D25 | chỉ zca-js; BB-02 đã cô lập kênh |

## 3. Work Packages (hai cột rời: Chặn bởi · Ước lượng)

| Gói | Nội dung | Tầng | Chặn bởi | Ước lượng | SPEC |
| :-- | :-- | :-- | :-- | :-- | :-- |
| P01 | Tag, gỡ 94 file sàn thợ, migration 007/008 + 009 (tenant + vết lượt — D23/D24), tài khoản `community`, vai web, seed mới, máy đo `check_pivot_cleanup`, khung router | 🟠 | — | 1 ngày | [SPEC-P01](specs/SPEC-P01-Go-San-Tho.md) |
| P02 | Worker nhóm + sự kiện nhóm, action outbox (xoá/kick/block/duyệt vào/poll/nhắc/ghi chú/đồng bộ), pacer theo nhóm + ngân sách, sim nhóm + `/dev/sim` | 🟠 thi công · 🔴 thẩm định | P01 | 2 ngày | [SPEC-P02](specs/SPEC-P02-Transport-Nhom.md) |
| P03 | Cổng nhận tin, đệm, phiên nhóm/DM, cửa sổ ambient, persona/prompt, policy tool, vòng lượt, host ép trả lời, triage cộng đồng | 🔴 hợp đồng · 🟠 thi công · review prompt 🔴 | P01, P02 (sim nhóm) | 3 ngày | [SPEC-P03](specs/SPEC-P03-Runtime-Agent.md) |
| P04 | Kho tri thức, `embedTexts`, truy hồi lai RRF, `search_knowledge`, câu hỏi bỏ trống | 🟠 | P03 | 1,5 ngày | [SPEC-P04](specs/SPEC-P04-Tri-Thuc.md) |
| P05 | Lưới + model kiểm duyệt, thang cảnh cáo, xoá tin, thẻ duyệt, lệnh `/approve`, duyệt vào nhóm, chào mừng | 🟠 thi công · 🔴 thẩm định đối kháng | P02, P03 | 2,5 ngày | [SPEC-P05](specs/SPEC-P05-Kiem-Duyet.md) |
| P06 | Mời riêng, hồ sơ thành viên, lead + điểm + chuyển chủ, ghi chú ngày, `search_memory` | 🟠 | P03 (P04 cho vector, tuỳ chọn) | 1,5 ngày | [SPEC-P06](specs/SPEC-P06-Lead-Tri-Nho.md) |
| P07 | `schedule.ts`, `runTimers` 12 bước, automations, poll/nhắc/ghi chú/thông báo, tóm tắt tuần, báo cáo ngày | 🟠 | P02, P03 | 2 ngày | [SPEC-P07](specs/SPEC-P07-Lich-Van-Hanh.md) |
| P08 | Dashboard: nhóm, persona phiên bản, thẻ duyệt, lead, kiểm duyệt, tri thức, lịch, dòng thời gian | 🟠 route · 🟢 trang đọc | P01 (khung); từng trang theo P03–P07 | 2,5 ngày | [SPEC-P08](specs/SPEC-P08-Dashboard.md) |
| P09 | 4 golden thật + máy chấm, Zalo thật 7 ngày, VPS, bump `0.1.0` | 🟠 · gate 🔴 | P03–P08 | 3 ngày + 7 ngày chạy | [TESTING](specs/TESTING-ACCEPTANCE.md) · [OPERATIONS](specs/OPERATIONS.md) |

Thứ tự bắt buộc: `P01 → P02 → P03 → (P04 ∥ P05 ∥ P06 ∥ P07) → P08 hoàn tất → P09`. P08 có thể dựng khung ngay sau P01 (dữ liệu seed). Thẩm định 🔴 riêng cho P02 và P05 (agent khác, không thừa kế ngữ cảnh).

## 4. Checklist thực thi

- [x] Nghiên cứu OpenClaw + zaloclaw (clone chỉ đọc, findings có file:line) — 2026-10-09
- [x] Dựng bộ SPEC (00, 01, P01–P08, OPERATIONS, TESTING) + chạy thử 5 bộ kiểm trên dữ liệu giả (`evidence/ARCH/`) — architect 2026-10-09
- [x] 🖐 SO duyệt bộ SPEC + giữ giá trị tạm Q1–Q12 (Mục 6) — 2026-10-09; đo lại: `7a58d6d` chỉ chạm `planning/02` (20 file), vùng cấm hành động nguy hiểm có ở 00-ARCH BB-06, 01-CONTRACTS §8, SPEC-P01 §6, SPEC-P02
- [x] Bổ sung D22–D25 vào bộ SPEC (00 BB-13 + vùng cấm, 01 §1/§4 migration 009/§6/§7.1/§10/§11, P01, P03, P06, P07, P08, TESTING G21) — 2026-10-14; DDL 009 CHƯA áp thử (Docker tắt) ⇒ P01 áp thử, ghi `evidence/P01/migration-009-probe.txt`
- [ ] 🖐 Người dùng: tài khoản Zalo phụ cho bot (SIM riêng), 2–3 Zalo phụ làm thành viên thử, nhóm thử (OPERATIONS §2)
- [ ] 🖐 Người dùng: nội dung persona thật (SOUL/RULES/IDENTITY/CAPABILITIES) + tài liệu tri thức ban đầu (dán qua `/knowledge`)
- [ ] 🖐 Người dùng: quota/billing Gemini cho golden (~4 bộ × ≥ 60 ca ≈ 300–500 lượt gọi/lượt chấm) — G26 cũ
- [ ] 🖐 Người dùng: thông báo xử lý dữ liệu cho nhóm thật (OPERATIONS §3); dọn 5 file lạ ở root/docs (`lenqclaw_presentation_transcript.pdf`, `docs/*.html`, `docs/*.pdf`, `docs/images/11-*.png`) — không thuộc kế hoạch
- [x] 🖐 Người dùng xác nhận gỡ 94 file ("di chuyển an toàn") — 2026-10-14; SO: tag `archive/plan-01-marketplace` = `d7f50eb` đã push, 94/94 file trong tag ([evidence](evidence/P01/archive-tag.txt)) — D26
- [ ] P01 — gỡ sàn thợ (G01–G03 local) — handoff [H01](handoffs/H01_thi-cong_P01.md)
- [ ] P02 — transport nhóm (G04–G06 local) + thẩm định 🔴
- [ ] P03 — runtime agent (G07, G08, G14, G15 local)
- [ ] P04 — tri thức (G12 local sau golden)
- [ ] P05 — kiểm duyệt (G13, G16)
- [ ] P06 — lead & trí nhớ
- [ ] P07 — lịch & vận hành (G17 local)
- [ ] P08 — dashboard (G18 local)
- [ ] P09a — golden thật bằng `gemini-3.6-flash` (G09–G12) + bằng chứng đỏ máy chấm
- [ ] P09b — Zalo thật 7 ngày ≥ 2 nhóm (cột `zalo-thật`: G04–G08, G13, G15, G17, G19)
- [ ] P09c — VPS (cột `vps`) + `0.1.0` + Ma Trận 6 Điểm + changelog (G20)
- [ ] Đóng hồ sơ: mọi H có R, mọi report ✅, 5 số (HANDOFF_PROTOCOL §12b) ghi vào đây

## 5. Bảng trỏ SPEC

| File | Nội dung |
| :-- | :-- |
| [specs/00-ARCHITECTURE.md](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, luồng, thành phần, bất biến BB-01…BB-12, vùng cấm (lỗi zaloclaw/OpenClaw không lặp lại), tái sử dụng, số đo nền |
| [specs/01-CONTRACTS.md](specs/01-CONTRACTS.md) | Layout, adapter (+embedding), vai, DDL 007/008 nguyên văn (đã áp thử), máy trạng thái, kiểu TS, bảng tool × bề mặt × vai, hợp đồng worker/zca-js, outbox action, sự kiện hệ thống, bảng lỗi, env, lắp prompt |
| [specs/SPEC-P01-Go-San-Tho.md](specs/SPEC-P01-Go-San-Tho.md) | Danh sách 94 file gỡ, file sửa, phân quyền web, seed, máy đo mới, nghiệm thu |
| [specs/SPEC-P02-Transport-Nhom.md](specs/SPEC-P02-Transport-Nhom.md) | Luồng vào nhóm/sự kiện, `ZaloClientLike` mở rộng, thi hành action, pacer nhóm, sim nhóm |
| [specs/SPEC-P03-Runtime-Agent.md](specs/SPEC-P03-Runtime-Agent.md) | Router, cổng (28 ca), đệm/phiên/ambient, DM + triage, vòng lượt, host ép trả lời, persona, policy |
| [specs/SPEC-P04-Tri-Thuc.md](specs/SPEC-P04-Tri-Thuc.md) | Kho tri thức, nhúng, truy hồi lai RRF, trích dẫn, câu hỏi bỏ trống |
| [specs/SPEC-P05-Kiem-Duyet.md](specs/SPEC-P05-Kiem-Duyet.md) | Lưới, model, thang (14 ca), thẻ duyệt, duyệt vào nhóm, chào mừng, thẩm định đối kháng |
| [specs/SPEC-P06-Lead-Tri-Nho.md](specs/SPEC-P06-Lead-Tri-Nho.md) | Mời riêng, hồ sơ thành viên, lead, ghi chú ngày, tìm kiếm trí nhớ |
| [specs/SPEC-P07-Lich-Van-Hanh.md](specs/SPEC-P07-Lich-Van-Hanh.md) | `computeNextRun`, 12 bước timer, automations, công cụ nhóm, báo cáo ngày |
| [specs/SPEC-P08-Dashboard.md](specs/SPEC-P08-Dashboard.md) | Trang/route, vai, luật chung, nghiệm thu |
| [specs/OPERATIONS.md](specs/OPERATIONS.md) | Lệnh dev, thứ tự chạy Zalo thật, dữ liệu cá nhân, quy định tài khoản, runbook, VPS, rollback |
| [specs/TESTING-ACCEPTANCE.md](specs/TESTING-ACCEPTANCE.md) | Cổng, ma trận, 4 golden thật, Exit Gates `local / zalo-thật / vps`, số đo lưới an toàn |

## 6. Câu hỏi mở cho người (🖐 — giá trị TẠM để thi công không kẹt)

| # | Câu hỏi | Tạm dùng | Chỗ ghi |
| :-- | :-- | :-- | :-- |
| Q1 | Tên bot và mẫu gọi tên | `Claw`; `claw ơi; bé claw; @claw` (seed IDENTITY, sửa trên `/persona`) | SPEC-P01 §4.1, SPEC-P03 §7.2 |
| Q2 | Ngân sách mặc định: tin bot/nhóm/giờ, lượt ambient/giờ, cửa sổ gom | 20 · 12 · 20 s | 01-CONTRACTS §4 `zalo_groups`, §10 |
| Q3 | Embedding Gemini có trả đúng 1024 chiều với `outputDimensionality`? | giả định có; probe ở P04, khác ⇒ dừng báo | 01-CONTRACTS §2.2, D18 |
| Q4 | Chủ gõ tay trong NHÓM bằng tài khoản bot có làm bot im 30 phút không? | KHÔNG (chỉ DM) | SPEC-P02 §2.1 |
| Q5 | Bot có react (thả cảm xúc) không? | TẮT (không enqueue `react`) | SPEC-P02 §8 |
| Q6 | `/mute` cần cột `mute_until` thật? | không; `/mute` = chuyển `ambient→mention`, `/unmute` ngược lại | 01-CONTRACTS §7.1 |
| Q7 | Nhặt câu hỏi ở nhóm `mention` có tắt kiểm duyệt (không triage)? | không nhặt | SPEC-P04 §5 |
| Q8 | Nhặt câu hỏi bỏ trống chỉ ở nhóm `ambient`? | đúng | SPEC-P04 §5 |
| Q9 | `agent_review` vào nhóm: model im ⇒ cho vào hay từ chối? | CHO VÀO | SPEC-P05 §6, D19 |
| Q10 | Đệm nhóm giữ bao nhiêu ngày; ai đăng thông báo dữ liệu | 7 ngày; chủ đăng trong nhóm | BB-11, OPERATIONS §3 |
| Q11 | Provider chạy dev là `vyce/deepseek` (Đ28 cũ) — có đổi về Gemini sớm không? | dev giữ `.env` hiện tại; mọi gate chấm bằng Gemini | TESTING §3 |
| Q12 | Moderator (không phải owner) có được duyệt kick/block qua lệnh nhóm? | CÓ, chỉ thẻ của nhóm mình | SPEC-P05 §5.3 |
