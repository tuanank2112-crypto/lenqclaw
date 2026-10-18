# Kế hoạch 02 — Agent chăm sóc cộng đồng Zalo (phó nhóm AI cho cộng đồng AI agent / AI CSKH)

> Hồ sơ kế hoạch. **KHÔNG chứa thiết kế chi tiết** — thiết kế nằm ở `specs/` (bảng Mục 5). Thứ tự đọc: Mục 2 (D01–D25) → [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) → [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) → SPEC gói đang làm.

## 1. Metadata Header

| Trường | Giá trị |
| :-- | :-- |
| Mã hồ sơ | `02_2026-10-09_zalo-community-agent` |
| Ngày mở | 2026-10-09 |
| Chủ trì | Super Orchestrator; bộ SPEC do architect (Fable 5.1) soạn 2026-10-09 10:14–11:00 ICT trên HEAD `eada365` |
| Trạng thái | 🟢 SPEC ĐÃ DUYỆT (SO, 2026-10-09; D12–D21 giữ, Q1–Q12 giữ giá trị tạm) · bổ sung D22–D25 (2026-10-14) · 🔨 THI CÔNG: P01 ✅ (2026-10-16, D27) → kế tiếp P02 |
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

### D27 — 2026-10-16 · Nghiệm thu P01 (SO đo lại, ✅) + chỉnh 2 kỳ vọng SPEC-P01 §10 theo thực đo
SO đo lại độc lập trên `f164f23`: `gate` exit 0 (core 82 · web 31 · worker 37), `test:db` exit 0 hai lần liên tiếp (16 · 14 · 27, 0 skip), `pivot_hits: 0` + bằng chứng ĐỎ mới (file thử chứa từ khoá ⇒ `pivot_hits: 1`, exit 1), hàng 7 = 0, hàng 8 = 11, tag `d7f50eb`. Hai chỉnh: (1) hàng 6 = **95** file xoá — thừa đúng `agent/tools/tool-kit.test.ts` vì §2 bắt chuyển sang `agent/community/tools/` VÀ viết lại ⇒ git thấy xoá + thêm; (2) hàng 4 `applied: 9` chỉ in khi migrate từ DB rỗng ⇒ đo trên DB tạm `TEST_DB_RESET=1` (`evidence/P01/p01-reset-probe.txt`); DB dev in `applied: 0`. Chấp nhận máy quét viết từ khoá `'b' + 'ql'`, `'mark' + 'et'` và miễn trừ `/^007_drop_/` (hàng 7 grep thô bắt chính chuỗi trong script, kể cả `marketplace` của tên file). Cổng DB dev đổi `127.0.0.1:15432` (G31, `a589539`). Phán quyết: [R01](reports/R01_thi-cong_P01.md). **Lật:** không cần.

### D28 — 2026-10-16 · Runtime agent dựng trên LangGraph (LangGraph.js), pipeline là ĐỒ THỊ tường minh — nền cho mọi phát triển sau (người dùng chốt)
Người dùng chốt trong phiên 2026-10-16: "bảo sử dụng nó và pipeline nữa mà? sau đó nó sẽ là cơ sở phát triển repo". Đây là quyết định MỚI của phiên này (không phải chỉ đạo cũ bị thất lạc); bộ SPEC 2026-10-09 thiết kế vòng tool tự viết (SPEC-P03 §6, port `resident-agent.ts`) nên phải thiết kế lại. Từ nay: toàn bộ xử lý một sự kiện vào (đệm → kiểm duyệt → cổng → lượt agent model⇄tool → outbox) là một đồ thị LangGraph với state có kiểu; kế hoạch 03 (Skill · Voice · Constraint) và các giai đoạn doanh nghiệp dựng tiếp trên đồ thị này (node/subgraph). GIỮ: P01, P02 (transport/outbox — framework nào cũng cần), mọi BB trừ khi SPEC mới ghi rõ thay thế + lý do. Trình tự: architect 🔴 sửa bộ SPEC (H04) ⇒ **người dùng duyệt sơ đồ pipeline** ⇒ mới thi công P03. **Lật:** đắt (đổi nền runtime) — chỉ khi người dùng đổi ý.

### D29 — 2026-10-16 · Phán R02 = 🔁 SỬA theo thẩm định R03; SO chốt cách sửa P02 (SO)
SO xác minh mục CHẶN R03 §1 trong mã (`actions.ts:86-96` gọi Zalo không kiểm thẻ duyệt). Chốt, thi công ở [H05](handoffs/H05_thi-cong_P02-fix.md):
1. **Worker là lớp chặn cuối của BB-06:** `remove_member`/`block_member` CHỈ gọi Zalo khi `approvalId` trỏ tới `approvals` có `status='approved'`, `kind` khớp (`kick_member`↔`remove_member`, `block_member`↔`block_member`), cùng `thread_id` và cùng uid đích; kiểm + chuyển trạng thái TRƯỚC khi gọi Zalo trong cùng một câu lệnh có điều kiện (CAS) để hai tick không cùng chạy. Thiếu/sai ⇒ `failed('approval_invalid')` + audit `zalo.action_blocked`, KHÔNG gọi Zalo.
2. **Nhóm chưa khai HOẶC `enabled=false`:** mọi `text`/`action` (trừ `sync_group_info`) ⇒ `cancelled('group_unknown' | 'group_disabled')` + audit (SPEC-P02 §9). `sync_group_info` vẫn được tạo dòng `enabled=false` (giữ, để dashboard thấy nhóm lạ).
3. **Đồng hồ ngân sách:** đếm cửa sổ 1 giờ bằng `now()` của DB, không truyền đồng hồ worker.
4. **Action không idempotent** (`create_poll`, `create_reminder`, `create_note`, `update_group_settings`): lỗi mạng/không rõ kết quả ⇒ `failed('outcome_unknown')`, KHÔNG thử lại; chỉ `ZaloRateLimitError` (chưa thi hành) mới `requeue`.
5. `delete_message` có `cliMsgId === msgId` ⇒ `failed('cli_msg_id_suspect')` (worker + sim); sim so `cliMsgId` với `group_messages.cli_msg_id`.
6. `applySimOutbox` chỉ xử lý hàng có `thread_id` bắt đầu `sim-` và `not_before <= now()`.
7. `check_agent_tools` `forbidden_actions` bắt thêm dạng `case '<x>'`.
8. Bộ đo thiếu (R03 §2, §3, §7, §12): gap nhóm trên đường gửi thật; ngân sách phân biệt cửa sổ (hàng 30–59 phút trước VẪN tính, hàng 61 phút KHÔNG tính) + đếm cả hàng `sending`; `/api/dev/sim/thread` 403 cho operator / 404 khi `DATA_MODE≠sim`; log không chứa nội dung tin. Mỗi bộ đo mới phải ĐỎ trên đột biến tương ứng của R03 (M21, M7, M22, M18, M19, M15).
9. **Hoãn (Idea Vault, không chặn):** xoá tin của chính bot (R03 §14 — cần `cliMsgId` của tin bot từ kết quả `sendMessage`; kiểm ở Zalo thật P09). `review_join` trả `{}` giữ coi là xong (R03 §10) tới khi đo trên Zalo thật. `msg_type` (R03 §16) giữ.
**Lật:** không.

### D30 — 2026-10-16 · Nghiệm thu P02 sau vòng sửa (R05 ✅); chốt các điểm còn mở (SO)
SO đo lại trên `2723955`: gate exit 0 (31/102/85, có và không nạp `.env`), test:db exit 0 ×2 (33/24/73), `pacer-sim --group` `first_hour: 20`, `violations: 0`; đột biến SO tự làm (tắt cổng thẻ duyệt `pacer.ts:350`) ⇒ 12 test DB đỏ, đã trả mã. Chốt: (1) `runScenario` được truyền `extraThreadIds` cho thread kịch bản không `sim-` — chỉ đường test, route web vẫn chỉ `sim-%`; (2) `approvals.executed_at` làm dấu "đã nhận thẻ" (không thêm trạng thái/migration); thẻ treo khi worker chết giữa nhận và hoàn tất ⇒ P07 thêm bước cảnh báo owner (KHÔNG tự nhả — tránh kick lặp); (3) sim CHƯA kiểm thẻ duyệt cho kick/block ⇒ P05 bổ sung để test core thấy cổng như worker; (4) 4 điểm lệch R02 §6 (audit `zalo.action`/`zalo.action_failed`/`zalo.action_blocked`, `ZaloActionError.code` = tên lớp + `apiCode`, chữ ký mở rộng, `sync_group_info` tạo nhóm `enabled=false`) chấp nhận — ghi SPEC-P02 §11; (5) commit `88e3a52` mang nhầm message của worker nhưng chứa SPEC D28 của architect — giữ lịch sử, ghi chú tại đây. G04–G06 ✅ local. **Lật:** không.

### D31 — 2026-10-16 · Mục tiêu tốc độ trả lời: ngoài công việc < 5 s, công việc/tra tài liệu (RAG) < 15 s (người dùng chốt)
Người dùng: "tôi cần nhanh hơn. các câu trả lời ngoài luồng công việc phải <5s. còn liên quan đến công việc, dataset, phải rag thì <15s". Bối cảnh (bóc tách 2026-10-16): SPEC chưa có mục tiêu tốc độ; lời gọi model chính KHÔNG có timeout (`adapters/model.ts`, chỉ triage có 4 s); runner xử lý tuần tự 1 bản (`runner/inbound-runner.ts:30-38`) ⇒ một lượt treo chặn mọi nhóm/DM; khoảng cách tin nhóm ≥ 9 s (D09) có thể vượt 5 s nếu bot vừa nói. Architect 🔴 thiết kế "làn nhanh / làn RAG" + đo thật ⇒ [H06](handoffs/H06_kien-truc_toc-do.md); thay đổi hình đồ thị đã duyệt (ảnh 12) phải đưa người dùng duyệt lại. **Lật:** người dùng đổi mục tiêu.

### D32 — 2026-10-16 · Kênh báo động ngoài Zalo = Telegram (người dùng chốt)
Người dùng: "báo qua telegram". Lý do cần: khi phiên Zalo chết (kicked/dead) bot không DM được chủ và báo cáo ngày cũng không gửi (P07 §5, OPERATIONS §4.3) ⇒ chủ không biết. Telegram dùng cho BÁO ĐỘNG vận hành (phiên Zalo chết, runner/worker mất heartbeat, model sập kéo dài, vượt SLO D31), KHÔNG phải kênh chat với thành viên. Thiết kế ở H06 §3.f. **Lật:** đổi kênh = đổi một adapter.

### D33 — 2026-10-16 · Kích hoạt persona KHÔNG bắt buộc qua eval (người dùng chốt)
Người dùng: "không". Kích hoạt phiên bản persona trên dashboard có hiệu lực ngay như SPEC-P08; eval golden vẫn chạy tay theo OPERATIONS §5. CẤM thêm cổng eval chặn kích hoạt persona. **Lật:** người dùng đổi ý.

### D34 — 2026-10-16 · Duyệt kỹ thuật SPEC-D31 (R06); SO chốt các câu không cần người (SO)
SO kiểm `33248d1`: 0 key lộ trong evidence/specs/report, gate exit 0 (218 test), hình đồ thị KHÔNG đổi node/cạnh (chỉ chú thích §4.1/§4.2 + tác dụng phụ typing của `prepare`) ⇒ không cần người duyệt lại ảnh 12. SO chốt: Q-D31-4 CHẤP NHẬN tin gọi bot không qua triage (lưới tất định + agent `flag_message` + kiểm duyệt ở tin sau); Q-D31-5 ping ngoài `/api/healthz` HOÃN tới P09/VPS; Q-D31-6 giữ `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày. Xếp gói: runtime D31 (làn, hạn chót, runner song song + advisory lock, typing sớm) vào P03; worker D31 (tick 250, advisory lock, heartbeat) + adapter báo động Telegram + dọn dữ liệu thành gói **P03b** 🟠 sau P03; thẻ dashboard + `/api/healthz` vào P08. Hạn giữ `inbound_events`/`outbox` (chứa nội dung tin) ⇒ Idea Vault, quyết trước P09. CHỜ NGƯỜI: Q-D31-1 (flash-lite cho tin gọi bot), Q-D31-2 (nới gap nhóm D09), Q-D31-3 (billing Gemini + `MODEL_PROVIDER=gemini`; Vyce đang 401). **Lật:** không.

### D42 — 2026-10-18 · Nghiệm thu P05 sau vòng sửa (R14 ✅); G13 chưa đo được do dọn test lệch (SO)
SO đo lại trên `1e8b836` (công việc `1e1f469`, Base `128acac`): gate exit 0, `npm test` 752 (32/114/606), test:db exit 0 = 315 (203/30/82), 0 skip, `own_uid` null; diff 27 file trong phạm vi H14. Đột biến SO tự làm: (A) cho model bác lưới cả khi triage null ⇒ 5 ca đỏ ở 3 bộ; (B) bỏ `chua` khỏi `HESITATION` ⇒ "chưa duyệt <id>" đỏ; (C) bỏ `redactPhones` ở `WELCOME_TEMPLATE` ⇒ ca F13 đỏ; đã trả mã. Chấp nhận các quyết định ngoài chữ SPEC của R14 §5 (F16 điều kiện "không còn thành viên chưa chào" cùng câu update; F5 một audit mỗi hit bị bác; F11 tra `outbox` trong `catch`; F7 đọc `join_policy` từ DB + `decideApproval` truyền `approvalId`) và lệch K.3 (docs 🟢 làm bằng 🟠 vì không có model 🟢). ⇒ **R12/R14 ✅, P05 ✅ (mã)**; G16 ✅ local (R13). **G13:** truy vấn trên DB dev = 2016/2075 — phân lập: (1) mọi test xoá `approvals` ở bước dọn nhưng giữ `outbox` ⇒ hàng không còn thẻ; (2) các lần đột biến "bằng chứng đỏ" (P02-fix 10-16, H12 10-17, H14 10-18) gỡ lớp chặn ⇒ test đỏ ⇒ bỏ bước dọn ⇒ thẻ `pending` ở lại ⇒ timer toàn cục chuyển `expired`. Đo trên DB tạm mới tinh sau test:db xanh: 33 vi phạm, CẢ 33 thẻ đã bị xoá (`(none)`), 0 hàng kick/block có thẻ ở trạng thái sai ⇒ không phải lỗi mã. Sửa bằng gói vệ sinh test [H15](handoffs/H15_thi-cong_test-hygiene.md) 🟢 (dọn outbox cùng thẻ, `scripts/check_g13.mjs`, nâng timeout ca `p02-worker` 50 tin 120 → 300 s — đỏ giả khi máy tải cao, R14). Rác DB dev giữ nguyên (xoá dữ liệu cần người). Gotcha G36. **Lật:** không.

### D41 — 2026-10-18 · Phán R12 = 🔁 SỬA theo thẩm định R13 + D40; SO chốt cách sửa P05 (SO)
R13 (`989f94c`, opus, không đọc R12): 0 CHẶN — kick/block/từ chối `manual` không có thẻ `approved` không có đường nào (3 lớp: tool, `enqueueAction`, sim/worker); 17 đột biến, bộ hiện có bắt 14, LỌT 3 (b1 có lớp sau chặn; c5, e1). SO xác minh trong mã: F1 `approvals.ts:28-46` ("đừng duyệt <id>" ⇒ approve), F2 `bot.ts:61-73` (cờ `sim` trên cache chung), F3 `moderate.ts:21` (chỉ `deleted` mới dừng ⇒ bot không phó nhóm trả lời tin scam kèm @bot), F4 `apps/zalo-worker/src/store.ts:438` (không sinh `approval_executed`). Chốt (SPEC-P05 §11 là hợp đồng; §2, §3, §4.1, §5.4, §5.5 sửa tại chỗ; 01-CONTRACTS §4.11, §7.1; SPEC-P08 `/approvals`): sửa M2, F1 (thứ tự xét — từ do dự ⇒ hỏi lại, không đoán), F2, F3, F4, F6, F5 (model `ok` bác lưới; triage null ⇒ lưới vẫn xoá), F7, F8, F10, F11, F13, F16, G35. CHẤP NHẬN không sửa: F9, F12, F14, F15 (lý do ở SPEC-P05 §11). 🖐 Q13 (mới): tin gọi bot không triage ⇒ câu cảnh báo kèm @bot vẫn bị lưới xoá — giá trị TẠM giữ như hiện tại. Thi công [H14](handoffs/H14_thi-cong_P05-fix.md) 🟠. **Lật:** rẻ (F5/Q13 là một dòng hợp nhất).

### D40 — 2026-10-18 · SO đo lại P05 (R12); CHƯA phán — chờ thẩm định đối kháng H13 rồi gộp một vòng sửa (SO)
SO đo lại trên `3864da3` (công việc `034a1ab`): gate exit 0 (`pivot_hits: 0`), `npm test` 721 (32/114/575), test:db exit 0 = 295 (187/30/78), 0 fail, 0 skip; `zalo_accounts.own_uid` = null. Diff `9989aef..034a1ab` 35 file; CHẤP NHẬN 4 file ngoài danh sách tên H12 §2: `nodes/deliver.ts` (`join_default` thi hành Q9 thật — SPEC-P05 §6), `nodes/prepare.ts` (rào `<<<untrusted join_request>>>` cho lượt `group_join_review`), `services/outbox-actions.ts` (lớp chặn thứ hai BB-06), `runner/inbound-runner.ts` (truyền `threadId` cho D39b) — đều là THÂN node/dịch vụ, `shape.ts`/`edges.ts`/`pipeline.ts`/`turn.ts`/`state.ts` không đổi. Đột biến SO: (M1) nới trần `modWarnPerHour` ⇒ ca (e) đỏ; (M3) bỏ `applyJoinDefault` ở `join_default` ⇒ 2 ca Q9 đỏ; (M2) bỏ `ageMs > DELETE_MAX_AGE_MS` trong `applyModeration` (`moderation.ts:244`) ⇒ **LỌT** (18/18 xanh — ca `(d2)` chỉ kiểm đường tool `delete_message`, không kiểm đường pipeline; tin > 24 h vào pipeline khi worker offline lâu rồi chạy bù `inbound_events`). Đã trả mã. Câu R12 Q2 xác nhận: ca P05 dùng thread `p03g-*` phụ thuộc `own_uid = null` toàn cục ⇒ test:db bị ngắt giữa chừng ⇒ core đỏ giả (G34). Vòng sửa (sau R13) BẮT BUỘC gồm: test đường pipeline tin > 24 h ⇒ 0 `delete_message` + audit `moderation.cannot_delete reason too_old`, phải ĐỎ với M2; ca P05 không phụ thuộc `own_uid` (đặt cột giá trị rác rồi chạy ⇒ vẫn xanh). Phóng [H13](handoffs/H13_tham-dinh_P05.md) (🔴, agent khác, không đọc R12). **Lật:** không.

### D39 — 2026-10-17 · Nghiệm thu P04 (R11 ✅); chốt 3 câu, 2 sửa nhỏ đưa vào gói P05 (SO)
SO đo lại trên `56b383d`: gate exit 0, `npm test` 602 (32/114/456), test:db exit 0 ×2 = 258 (150/30/78), 0 skip; diff 11 file trong phạm vi. Đột biến SO: bỏ điều kiện `effective_to` (`search-knowledge.ts:136`) ⇒ ca "hết hạn ⇒ 0 hit" đỏ; đã trả mã. Chấp nhận 6 quyết định ngoài chữ SPEC của worker (R11): `EMBED_PROVIDER` tách khỏi `MODEL_PROVIDER`, `opts.timeoutMs` cho embed hàng loạt, chặn mạng thật dưới test, `onlyDocumentIds`/`onlyThreads` cho test, `safeStep`. Chốt: (1) mẫu trích dẫn là `(theo <title> · <heading>)` (SPEC-P04 §4 + golden) — sửa §3; (2) **nâng làn TRƯỚC khi chạy tool `extendsDeadline`** (lựa chọn tra cứu của model đã quyết làn — T1), để `embedTexts` nhận hạn `rag`; hành vi node `tools`, KHÔNG đổi hình — sửa SPEC-D31 §5.2; (3) test `p03b-worker.db.test.ts` để lại `zalo_accounts.own_uid='7700555'` trên DB dev (SO đo xác nhận) ⇒ sim không nhận ra tin gọi bot: test phải dọn `own_uid` ở `afterAll`, VÀ luật mới — `DATA_MODE=sim` + thread `sim-%` ⇒ `botUid = BOT_UID_SIM` bất kể cột (sim không bao giờ dùng uid thật) — sửa 01-CONTRACTS §4.11. Sửa (2)(3) thi công ở đầu gói P05 ([H12](handoffs/H12_thi-cong_P05.md) mục 3.0). SO đặt lại `own_uid=null` cho dòng test trên DB dev. **Lật:** không.

### D38 — 2026-10-17 · Nghiệm thu P03b (R10 ✅); chấp nhận 4 lệch nhỏ (SO)
SO đo lại trên `8f8c5d1`: gate exit 0, `npm test` 585 (32/114/439), test:db exit 0 ×2 = 238 (130/30/78), 0 skip, `pacer-sim --group` `first_hour: 20` `violations: 0`; diff `dc7fb0e..8f8c5d1` trong phạm vi trừ `apps/web/lib/auth/policy{,.test}.ts` (ngoại lệ đúng GET/HEAD `/api/healthz` — middleware chặn mọi đường chưa đăng nhập; CHẤP NHẬN). Đột biến SO tự làm: nới ngoại lệ thành `pathname.startsWith('/api/')` ⇒ 6 test web đỏ; thêm token vào audit `alert.failed` ⇒ `alert.test` đỏ; đã trả mã. Chấp nhận: (1) gửi Telegram lỗi ⇒ đặt `last_sent_at` về mốc đã hết hạn lặp + giữ `open` + giảm `sent_count` (SPEC-D31 §10.1 ghi `null` là SAI — CAS không bao giờ thắng với null); (2) `resolveBotUid()` đồng bộ trả hằng `BOT_UID_UNKNOWN` khi không có nguồn (không uid thật nào trùng ⇒ cổng không thấy mention bot — đúng D37 "không đoán"), `botUid(account)` async trả `null`; (3) bước `opsWatch` chỉ chạy khi runner bật `ctx.opsWatch`; (4) `checkOps(now, self, {cfg?, startedAt?})`. Test đổi kỳ vọng (`tickMs` 250; typing p02 theo T7; `sim-replay-group` 6→3 lời gọi model với ngân sách nhóm dựng tất định — hệ quả D35.4) chấp nhận. Sự cố: một lần chạy test gọi `pruneBuffers` với `now` năm 2031 xoá dữ liệu test cũ ở DB dev (seed lại, xanh) — gotcha G34. G24 ✅ local (🖐 bot Telegram thật ở P09). **Lật:** không.

### D37 — 2026-10-17 · Phạm vi gói P03b + nguồn `botUid` thật (SO)
P03b 🟠 = SPEC-D31 §7.1 (tick 250, ưu tiên tin trả lời, typing tươi, `picked_at`/`hold_reason`), T6 advisory lock worker `lenqclaw:worker:community`, §9 heartbeat worker **+ `GET /api/healthz`** (dời từ P08 về đây — G24 đo nó, route nhỏ, không cần đăng nhập; thẻ dashboard vẫn P08), §10 `adapters/alert.ts` + `services/ops-watch.ts` (runner bước `opsWatch` + worker `every('ops')`), §11 dọn `turn_traces`/`agent_runs`/`audit_log` trong `pruneBuffers`. **`botUid` (D35.13):** migration MỚI `011_bot_uid.sql` thêm `zalo_accounts.own_uid text` (null tới khi đăng nhập); worker ghi `session.ownUid` mỗi lần phiên `connected`; core `botUid(account)` đọc cột, null ⇒ env `BOT_ZALO_UID` ⇒ (chỉ `DATA_MODE=sim`) `BOT_UID_SIM`; không có ⇒ cổng coi như không có mention bot (không đoán). DDL ở 01-CONTRACTS §4.11. Q-D31-2 vẫn giữ gap D09. Handoff [H10](handoffs/H10_thi-cong_P03b.md). **Lật:** rẻ.

### D36 — 2026-10-17 · Nghiệm thu P03 sau vòng sửa (R09 ✅); chốt 2 câu còn mở (SO)
SO đo lại trên `c39e0c9`: gate exit 0, `npm test` 549 (31/102/416), test:db exit 0 ×2 = 209 (111/25/73), 0 skip; diff `4247719..c39e0c9` 26 file trong phạm vi; G14 `grep -c member_profiles persona.ts` = 0; G15 đệm DB dev max 53/thread, min `received_at` trong 8 ngày. Đột biến SO tự làm: tắt `skipFinalCall` (`nodes/agent.ts:32`) ⇒ 5 test DB đỏ; cho `owner_dm` takeover lại (`handoff.ts:22`) ⇒ 2 test DB đỏ; đã trả mã. Số lời gọi model (fetch giả): mention 1, RAG 2 (khớp SPEC-D31 §3). Chốt: (1) R09 Q1 — route `/api/dev/sim/send` vẫn có thể nhận tin cùng thread khi dispatcher đang chạy tin trước (đã đặt `processed_at`): CHẤP NHẬN vì chỉ ở `DATA_MODE=sim` (ghi `docs/web.md`); đường thật chỉ có MỘT dispatcher (advisory lock); (2) R09 Q2 — bảng 01-CONTRACTS §12.5 dòng D8 ghi `¬DM ∧ answered > 0` cho khớp mã (DM không có tool `answers`). G07, G08, G14, G15 ✅ local. G23: ca đỏ + fake PASS ✅, lượt model THẬT vẫn `blocked` (chờ Q-D31-3) ⇒ cột local giữ ⬜. **Lật:** không.

### D35 — 2026-10-17 · Phán R07 = 🔁 SỬA theo thẩm định R08; SO chốt cách sửa P03 (SO)
SO đo lại `d8e744f`: gate exit 0, `npm test` 499/0/0, test:db ×2 = 182 (84/25/73), 0 skip, diff 91 file trong phạm vi (root `package.json` `overrides` + `latency:slo` đúng 01-CONTRACTS §12.1 — H07 cấm nhầm, chấp nhận). Prompt `rules` khớp nguyên văn SPEC-P03 §7.3 (review 🔴 đạt). SO xác minh 3 mục CHẶN R08 trong mã (`edges.ts:154`, `model.ts:611/919`, `handoff.ts:20`). Chốt, thi công ở [H09](handoffs/H09_thi-cong_P03-fix.md):
1. **C1 — thứ tự `decideDelivery`:** D8 (`answered > 0` ⇒ `none`/`replied`) xét NGAY SAU D3, trước D4. Nhóm đã có tin trả lời thì lời gọi chốt sập/hết giờ KHÔNG sinh tin thứ hai (`deadline_hit` vẫn ghi). Không thêm/bớt dòng (01-CONTRACTS §12.5).
2. **C2 — adapter model:** đọc + parse thân phản hồi nằm TRONG phân loại lỗi: huỷ khi đang đọc thân ⇒ như timeout (hết hạn lượt ⇒ `ModelDeadlineError`, còn giờ ⇒ lỗi retryable); thân 200 không phải JSON ⇒ retryable. Mọi nhánh provider (Gemini, OpenAI-compat). Không còn đường lỗi thô từ adapter ở lượt mention.
3. **C3 — takeover:** `human_takeover_until` CHỈ đặt khi `kind='dm'`; `owner_dm` không bao giờ takeover, không tự DM handoff cho chính chủ.
4. **N6 — bỏ lời gọi chốt (không đổi hình):** node `agent` KHÔNG gọi model nếu vòng `tools` vừa xong gồm TOÀN tool cờ `answers` và tất cả chạy thành công ⇒ `stop='end_turn'`, `finalText=''`. Kỳ vọng: mention trả bằng `send_group_message` = **1** `agent_runs` (SPEC-P03 §11 hàng 5(a) giữ nguyên), RAG = 2 (khớp SPEC-D31 §3 dòng 7 + 9). Câu hỏi R07 Q3 đóng.
5. **Rào dữ liệu không tin cậy (N1, N2, N3, G3, G8):** dòng tiêu đề tin trong khung focus thoát xuống dòng và dấu nháy của tên/nội dung; text DM của người dùng nằm trong rào `<<<untrusted>>>` sau khối trí nhớ; tên hiển thị, `memberNotes` và lý do handoff ghi audit đều qua che SĐT (§5.3).
6. **N4:** tin kích hoạt bị xoá giữa lượt ⇒ `deliver` đăng KHÔNG quote (vẫn đúng 1 tin), không ném.
7. **N5 + R07 Q4:** `processInbound` = `claimNextInbound([])` ép thứ tự thread ĐÚNG SPEC-D31 §6 (bỏ câu nhận không ép thứ tự); test P01 "12 `processInbound` đồng thời" đổi thành 12 tin ở 12 thread (mục đích giữ: không xử lý trùng). Route sim gọi `processInbound` khi đó không phá thứ tự.
8. **N7:** `check_adapter_boundary` bắt thêm: import gián tiếp (re-export), tên gói `@langchain/*`/`langsmith` ngoài allowlist §12.1, `import()` không literal ⇒ vi phạm; thêm máy đo cạnh THUẦN (file `graph/edges.ts` không import `adapters/*`, `services/*`). Mỗi luật có bằng chứng đỏ.
9. **N8:** test §6.4.4 (host post khi hết ngân sách vẫn enqueue hàng `queued`) + test mốc `received_at` tại `prepare`.
10. **G7:** `remember_member_note` ở bề mặt G chỉ cho `uid = requester` (như D) — chặn cấy ghi chú vào hồ sơ người khác từ nhóm.
11. **G5:** kết nối giữ advisory lock bật `keepAlive`.
12. **Sửa SPEC theo thực tế thư viện / mã (không đổi hành vi):** R07 Q2 — trường state `PipelineState.triageResult`/`gateDecision` (LangGraph cấm kênh trùng tên node); R07 Q6 — node `gate` chỉ đọc, KHÔNG audit `sender_denied`/`sender_not_allowed` (lý do ở `gateDecision.reason`, `turn_traces` không có lượt) — `group.denied` audit ở `ingest`; G4 — `prepare` ghi thêm `conversations`; R07 Q7 ⇒ gotcha G33.
13. **Hoãn:** R07 Q5 (`botUid` thật — tạm env `BOT_ZALO_UID`) chốt ở P03b (worker ghi `ownUid`); G1 (câu "trục trặc kỹ thuật" khi hết giờ do xếp hàng) và G2 (người `deny_users` không còn lớp model kiểm duyệt) ⇒ Idea Vault.
**Lật:** không.

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
| SPEC-P01 §10 hàng 4, 6 (bản duyệt 2026-10-09) | `applied: 9` trên DB dev · `94 files changed` | D27 | DB dev đã migrate in 0; `tool-kit.test.ts` dời + viết lại tính là xoá |
| SPEC-P01 §1 bước 4, H01 §1 (cổng `55432`) | DB dev `127.0.0.1:55432` | D27 / G31 | Windows giữ dải cổng động ⇒ `15432` |
| SPEC-P03 §6 (bản duyệt 2026-10-09) · 00-ARCH §4 "router.ts" tuần tự | Vòng lượt tự viết `turn.ts::runCommunityTurn` (port `resident-agent.ts`) | D28 | người dùng chốt LangGraph + pipeline đồ thị làm nền |
| SPEC-P03 §2 (bản duyệt 2026-10-09) | `routeInboundEvent` gọi tuần tự `handleSystemEvent`/`handleGroupEvent`/`ingestGroupMessage→moderate→decideGroupInbound`/`handleDm` | D28 — `pipelineGraph` (SPEC-P03 §2, 01-CONTRACTS §12) | pipeline là đồ thị tường minh, hình = hợp đồng test được |
| SPEC-P03 §4.1 bước 3 | `is_question` = kết quả triage lúc chèn đệm | D28 — chèn `false`, node `triage` cập nhật sau `ingest` | triage là node sau ingest |
| SPEC-P03 §4.2 | "sau lượt" cập nhật `last_seen_message_id`, `pending_since=null`, `turns_in_window++` | D28 — node `prepare`, trước model | lượt lỗi không bị flush lặp |
| SPEC-P03 §6.2 | refusal ở mention ⇒ fallback gồm gọi lại | D28 — `decideDelivery` D10: fallback ngay, không nudge | gọi lại sau refusal vô ích |
| 01-CONTRACTS §6 `GroupTurnContext.sent`, §7.1 `ctx.sent++` | host kiểm mustReply qua ctx mutable | D28 — `TurnState.answered` + cờ tool `answers` | cạnh thuần chỉ đọc state |
| SPEC-P05 §6 | `agent_review`: model không gọi tool ⇒ approve | D28 — D3 `join_default` cả khi model sập/refusal/chạm trần | một luật Q9 |
| 00-ARCH §8 hàng "Vòng lượt tool" | port vòng `resident-agent.ts:135-269` | D28 — chỉ port LUẬT vào node `agent`/`tools` | vòng = cạnh `tools → agent` |
| (mới) | — | D28 BB-17 / 00-ARCH §7 — cấm checkpointer, LangSmith, ChatModel/prebuilt LangChain | đo trong `evidence/ARCH-D28/spike.txt` |
| SPEC-P02 §9 hàng "nhóm chưa có" (chỉ text) | huỷ `group_unknown` cho text | D29 — huỷ mọi text/action vào nhóm lạ hoặc `enabled=false` (trừ `sync_group_info`) | thẩm định R03 P2 |
| 00-ARCH §3, §7 · OPERATIONS §1 · `inbound-runner.ts` (Đ22 cũ) | Một runner xử lý TUẦN TỰ toàn cục | D31 — BB-19, SPEC-D31 §6: một runner, song song theo thread, tuần tự trong thread | một lượt treo chặn mọi nhóm (mô phỏng: chờ 46,8 s) |
| OPERATIONS §4 mục 2 | "advisory lock vẫn là Idea Vault — vận hành bằng luật" | D31 — advisory lock bắt buộc (runner + worker) | song song chỉ an toàn khi chắc một dispatcher |
| SPEC-P03 §5.1 bước 4, §5.2 (b) · 01-CONTRACTS §12.4 `needsTriage` | Mọi tin DM (và mọi tin nhóm có kiểm duyệt, kể cả tin gọi bot) qua triage | D31 T3 — tin gọi bot không triage | triage p95 2953 ms ⇒ 49 % lượt chạm hạn 5 s |
| 01-CONTRACTS §2.1 (`max_tokens` 16000) · route `community` một model | 16000 token; một model cho mọi lượt | D31 T2, T10 — `MODEL_COMMUNITY_FAST` cho lượt tương tác, `MODEL_MAX_OUTPUT_TOKENS` 1024 | 3.6-flash 1 lời gọi p95 4419 ms |
| 01-CONTRACTS §2.1 / `callModel` | lời gọi model không timeout; retry + fallback không trần | D31 BB-18 — hạn chót lượt + `AbortSignal` + `ModelDeadlineError` | trường hợp xấu không có trần |
| SPEC-P04 §2 bước 2 | embed timeout 3 s | D31 T11 — `EMBED_TIMEOUT_MS` 1500 ∧ ≤ hạn lượt | p95 đo 447 ms |
| SPEC-P02 §5 / `PACER_DEFAULTS` | tick 1000 ms; typing 1–3 s ngay trước mọi text | D31 T7, T9 — tick 250; bỏ typing lặp khi đã có typing sớm | tiết kiệm 1–3,7 s/tin, không đổi giới hạn D09 |
| SPEC-P07 §5 "Heartbeat = CHÍNH báo cáo này — không có heartbeat khác" | không có heartbeat khác | D32 — dấu sống tiến trình `process_heartbeats` (không gửi cho ai) + báo động Telegram | runner/worker chết thì không ai biết |
| D34 "thẻ dashboard + `/api/healthz` vào P08" | healthz ở P08 | D37 — `/api/healthz` vào P03b (thẻ dashboard vẫn P08) | G24 đo healthz cùng báo động |
| D24 "không cần hạn giữ ở 0.1" · SPEC-P07 §2 bước 8 "KHÔNG chạm `turn_traces`, `audit_log`" | giữ vết vô hạn | D32 e4 — `turn_traces`/`agent_runs` 180 ngày, `audit_log` 365 ngày | bảng tăng không giới hạn; 365 ngày cho BB-09 |
| 01-CONTRACTS §2.2 / plan.md Q3 | "giả định 1024 chiều; probe ở P04" | đóng Q3 — đo trả đúng 1024 | `latency-probe.txt` |
| 01-CONTRACTS §12.5 thứ tự D4 → D8 | `stop=model_down` xét trước `answered>0` | D35.1 — D8 ngay sau D3 | nhóm đã trả lời vẫn nhận thêm tin "trục trặc" (R08 C1) |
| SPEC-P03 §6.2 cạnh `tools → agent` luôn gọi model | lời gọi chốt sau mọi vòng tool | D35.4 — bỏ lời gọi khi vòng chỉ gồm tool `answers` thành công | 2 lời gọi/mention, vượt ngân sách D31 §3 |
| 01-CONTRACTS §12.2 `PipelineState.triage`/`gate` | tên trường trùng tên node | D35.12 — `triageResult`/`gateDecision` | LangGraph ném khi kênh trùng tên node |
| SPEC-P03 §2 "audit khi có quyết định (admitted/denied)" | node `gate` audit | D35.12 — `gate` chỉ đọc; `group.denied` audit ở `ingest` | §12.3 BB-15 |
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
- [x] P01 — gỡ sàn thợ (G01–G03 local ✅) — handoff [H01](handoffs/H01_thi-cong_P01.md) ↔ [R01](reports/R01_thi-cong_P01.md) ✅ DUYỆT 2026-10-16 (SO đo lại; D27) — WIP `601aac7` + `f164f23`, Base `b356f07`
- [x] P02 — transport nhóm (G04–G06 local ✅) — H02↔R02 🔁 · H03↔R03 thẩm định ✅ · H05↔R05 ✅ 2026-10-16 (D29, D30)
- [x] D28 — architect 🔴 sửa SPEC theo LangGraph + sơ đồ pipeline — H04↔[R04](reports/R04_kien-truc_LangGraph.md) ✅ 2026-10-16 (SPEC ở `88e3a52`, report `a9d4a47`)
- [x] 🖐 Người dùng duyệt sơ đồ pipeline LangGraph (luồng xử lý trong nhóm, [ảnh 12](../../docs/images/12-pipeline-langgraph.png)) — "ok đây là luồng xử lý trong group" 2026-10-16
- [ ] 🖐 Người dùng xem bóc tách luồng kỹ thuật: tốc độ output · chất lượng · eval · status · sessions (yêu cầu 2026-10-16) — có thể bổ sung SPEC P03 trước khi thi công
- [x] D31–D33 — SPEC tốc độ + giám sát Telegram — H06↔[R06](reports/R06_kien-truc_toc-do.md) ✅ kỹ thuật (D34)
- [ ] 🖐 Người dùng: Q-D31-1 (model cho tin gọi bot) · Q-D31-2 (gap nhóm) · Q-D31-3 (billing Gemini, `.env`)
- [x] P03 — runtime agent trên LangGraph (G07, G08, G14, G15 local) + runtime D31 — H07↔[R07](reports/R07_thi-cong_P03.md) 🔁 · H08↔[R08](reports/R08_tham-dinh_P03.md) thẩm định ✅ · H09↔[R09](reports/R09_thi-cong_P03-fix.md) ✅ 2026-10-17 (D36) — G07/G08/G14/G15 ✅ local; G23 chờ model thật
- [x] P03b — worker D31 + báo động Telegram + heartbeat/healthz + dọn dữ liệu + `own_uid` (🟠, D37) — H10↔[R10](reports/R10_thi-cong_P03b.md) ✅ 2026-10-17 (D38); G24 ✅ local
- [x] P04 — tri thức (G12 local sau golden) — H11↔[R11](reports/R11_thi-cong_P04.md) ✅ 2026-10-17 (D39); golden `unanswered` ở P09a (tuần tự P04 → P05 → P06 → P07: cùng chạm `policy.ts`/tools, tránh G32)
- [x] P05 — kiểm duyệt (G13, G16) — H12↔[R12](reports/R12_thi-cong_P05.md) 🔁 → thẩm định H13↔[R13](reports/R13_tham-dinh_P05.md) 0 CHẶN → H14↔[R14](reports/R14_thi-cong_P05-fix.md) ✅ 2026-10-18 (D40–D42); G16 ✅ local; G13 ⬜ chờ vệ sinh test [H15](handoffs/H15_thi-cong_test-hygiene.md); golden `moderation` ở P09a
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
| Q9 | `agent_review` vào nhóm: model im ⇒ cho vào hay từ chối? | ✅ CHỐT (người dùng 2026-10-16): CHO VÀO — kể cả khi model sập/refusal/chạm trần; KHÔNG tạo thẻ duyệt: agent duyệt, hoặc owner (là admin nhóm) tự duyệt thẳng trên Zalo | SPEC-P05 §6, D19, 01-CONTRACTS §12.5 D3 |
| Q10 | Đệm nhóm giữ bao nhiêu ngày; ai đăng thông báo dữ liệu | 7 ngày; chủ đăng trong nhóm | BB-11, OPERATIONS §3 |
| Q11 | Provider chạy dev là `vyce/deepseek` (Đ28 cũ) — có đổi về Gemini sớm không? | dev giữ `.env` hiện tại; mọi gate chấm bằng Gemini | TESTING §3 |
| Q12 | Moderator (không phải owner) có được duyệt kick/block qua lệnh nhóm? | CÓ, chỉ thẻ của nhóm mình | SPEC-P05 §5.3 |
| Q13 | Tin GỌI BOT (không triage) chứa cụm scam nhưng là câu cảnh báo/hỏi ("@bot 'việc nhẹ lương cao' có phải lừa không?") — lưới vẫn xoá + cộng điểm, hay để agent tự `flag_message`? | giữ lưới xoá (ưu tiên chặn scam) | SPEC-P05 §11, D41 |
