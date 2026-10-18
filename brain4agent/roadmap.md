# Roadmap & Active Tasks

File này chứa danh sách các tính năng, mục tiêu sắp tới và tình trạng công việc hiện tại.

> Nguồn chi tiết: [`planning/02_2026-10-09_zalo-community-agent/plan.md`](../planning/02_2026-10-09_zalo-community-agent/plan.md) §3–§4. File này chỉ tóm tắt.

## Mục tiêu hiện tại (Active) — hồ sơ `02_2026-10-09_zalo-community-agent`, SemVer đích `0.1.0`

Pivot 2026-10-09 (D01): agent chăm sóc cộng đồng Zalo. Bộ SPEC ĐÃ DUYỆT (architect `7a58d6d`, SO `f6a4465`). Thứ tự bắt buộc: `P01 → P02 → P03 → (P04 ∥ P05 ∥ P06 ∥ P07) → P08 → P09`; P08 dựng khung được ngay sau P01.

- [x] Nghiên cứu OpenClaw + zaloclaw (clone chỉ đọc) — 2026-10-09
- [x] Dựng bộ SPEC (00, 01, P01–P08, OPERATIONS, TESTING) + chạy thử 5 bộ kiểm (`evidence/ARCH/`) — 2026-10-09
- [x] SO duyệt SPEC, giữ Q1–Q12 giá trị tạm — 2026-10-09
- [x] Bổ sung D22–D25 (2026-10-14): ngữ cảnh DM ≤ 5 lượt + ghi chú, không nén · tenant `default` + `turn_traces` (migration 009) · chỉ zca-js cho cả cộng đồng lẫn doanh nghiệp
- [x] 🖐 Người xác nhận GỠ 94 file sàn thợ — 2026-10-14 ("di chuyển an toàn": tag `archive/plan-01-marketplace` = `d7f50eb` đã push, D26)
- [x] P01 — gỡ sàn thợ, migration 007/008/009, tài khoản `community`, vai admin/operator, seed, `check_pivot_cleanup` (🟠, G01–G03 ✅ local) — R01 ✅ 2026-10-16 (D27)
- [x] P02 — transport nhóm (G04–G06 ✅ local) — R02 🔁 → thẩm định R03 → R05 ✅ 2026-10-16 (D29, D30)
- [x] D28 — SPEC runtime trên LangGraph (R04 ✅ kỹ thuật)
- [x] 🖐 Người dùng duyệt sơ đồ pipeline LangGraph (ảnh 12) — 2026-10-16
- [x] D31–D34 — SPEC tốc độ (làn fast/rag, hạn chót, runner song song) + báo động Telegram (R06 ✅ kỹ thuật)
- [ ] 🖐 Q-D31-1 flash-lite · Q-D31-2 gap nhóm · Q-D31-3 billing Gemini (chặn số đo thật G23)
- [x] P03 — runtime agent trên LangGraph + runtime D31 — ✅ 2026-10-17 (D36; G07/G08/G14/G15 local, G23 chờ model thật)
- [x] P03b — worker D31 + báo động Telegram + heartbeat/healthz + dọn dữ liệu + `own_uid` — ✅ 2026-10-17 (D38; G24 local)
- [ ] P02 — transport nhóm: worker + action outbox + pacer nhóm + sim nhóm (🟠 thi công · 🔴 thẩm định, G04–G06)
- [ ] P03 — runtime agent: cổng nhận tin, đệm, ambient, persona, policy tool, host ép trả lời (🔴/🟠, G07, G08, G14, G15)
- [x] P04 — tri thức ✅ 2026-10-17 (D39) —: kho, embedding, truy hồi lai RRF, câu hỏi bỏ trống (🟠, G12)
- [x] P05 — kiểm duyệt ✅ 2026-10-18 (D40–D42) — lưới + model, thang cảnh cáo, thẻ duyệt, duyệt vào nhóm, chào (G16 local; G13 chờ vệ sinh test H15; golden ở P09a)
- [ ] 🖐 Q13 — tin gọi bot chứa cụm scam dạng cảnh báo: lưới xoá (tạm) hay để agent `flag_message`
- [ ] P06 — lead & trí nhớ: mời riêng, hồ sơ thành viên, thẻ lead, ghi chú ngày (🟠)
- [ ] P07 — lịch & vận hành: `runTimers`, automations, poll/nhắc/tóm tắt tuần/báo cáo ngày (🟠, G17)
- [ ] P08 — dashboard: nhóm, persona, thẻ duyệt, lead, kiểm duyệt, tri thức, lịch, dòng thời gian (🟠/🟢, G18)
- [ ] P09 — 4 golden thật (Gemini) + Zalo thật 7 ngày ≥ 2 nhóm + VPS + bump `0.1.0` (G09–G12, G19, G20)
- [ ] 🖐 Tài khoản Zalo phụ cho bot (SIM riêng) + 2–3 Zalo thành viên thử + nhóm thử
- [ ] 🖐 Nội dung persona thật (SOUL/RULES/IDENTITY/CAPABILITIES) + tri thức ban đầu
- [ ] 🖐 Quota/billing Gemini cho golden (~300–500 lượt gọi/lượt chấm)
- [ ] 🖐 Thông báo xử lý dữ liệu cho nhóm thật; dọn 5 file lạ (root `lenqclaw_presentation_transcript.pdf`, `docs/*.html`, `docs/*.pdf`, `docs/images/11-*.png`)
- [ ] 🖐 Q1–Q12 (plan 02 §6) đang dùng giá trị tạm — chốt hoặc giữ

## ⛔ Đã dừng / BỎ — kế hoạch `01_2026-09-24_san-viec-tho-mvp` (Đ32, 2026-10-09)

Người dùng: sàn việc thợ "bỏ đi". Kế hoạch 01 đóng ở trạng thái DỪNG (không nghiệm thu, không phát hành). Mã sàn thợ giữ tới P01 rồi gỡ sau tag `archive/plan-01-marketplace`. Nền P01/P02 cũ (monorepo, DB, adapter, worker, SimTransport, máy chấm) được kế hoạch 02 kế thừa.

Việc treo của kế hoạch 01 — tất cả **BỎ do pivot**: lượt Gemini H08 (`--set diagnosis,responsibility`) và gate G08–G10 sàn thợ · nhả/commit `resident.ts` (đang sửa dở, chưa commit) · P05-D, P05-F · P06 sàn thợ, P07 cũ, P08 sổ lợi ích ba bên · bước cư dân "Đồng ý" · tham số phí (`FREE_TRIAL_DAYS`, `SLOT_FEE_MONTHLY`, `SLOT_MIN_JOBS_PER_VENDOR`, `BQL_SHARE_PCT`, `MIN_EARNINGS_TO_FEE`, `MINUTES_PER_CASE_BASELINE`) · Zalo `market` + nhóm thợ · thử người agent cư dân qua Zalo thật · SPEC-P08 sổ lợi ích · `.env.example` pacer của kế hoạch 01 · P04 dashboard BQL tối thiểu.

## Tương lai (Upcoming) — Lộ trình chuẩn doanh nghiệp (chốt hướng 2026-10-14)

Mỗi giai đoạn = một hồ sơ `planning/` đủ bộ SPEC, đóng bằng cổng đo được. Kênh DUY NHẤT là zca-js (D25). Thứ tự GĐ1 ↔ GĐ2 đổi được nếu doanh nghiệp cần chạy sớm — GĐ2 khi đó dùng persona tự do như 0.1.

| GĐ | SemVer | Mục tiêu | Nội dung chính | Cổng ra |
| :-- | :-- | :-- | :-- | :-- |
| 0 | `0.1.0` (kế hoạch 02) | Cộng đồng chạy thật | P01–P09 + D22–D25 | G01–G21 ✅ cột `vps` |
| 1 | `0.2.0` (kế hoạch 03) | Khung hành vi: **Skill · Voice · Constraint** (Voice = GIỌNG ĐIỆU, người dùng chốt 2026-10-14; tin nhắn thoại là GĐ4) | Skill có phiên bản + bộ ca test riêng + bề mặt được dùng; Voice có cấu trúc (xưng hô, độ dài, emoji, từ ưu/cấm, ví dụ đúng-sai) theo tenant × bề mặt; Constraint 3 tầng: cứng trong tool (BB) · cổng ra kiểm bằng code theo tenant (trước `enqueue`) · mềm trong RULES đo bằng golden; kích hoạt phiên bản persona chỉ khi golden hồi quy đạt; so phiên bản bằng `turn_traces.persona_versions` | golden `voice` + `constraints` + ca từng skill đạt; 0 vi phạm tầng cứng; rollback phiên bản 1 thao tác |
| 2 | `0.3.0` (kế hoạch 04) | Doanh nghiệp của chủ | Tài khoản Zalo thứ 2 (nới D12), tenant thứ 2 (D23), kho tri thức + persona + skill riêng; luồng CSKH 1-1; chuyển người thật có hàng chờ + SLA + nhắc; staff và dashboard lọc theo tenant | 14 ngày chạy song song 2 tenant; 0 rò dữ liệu chéo tenant (test + truy vấn kiểm); SLA chuyển người đạt |
| 3 | `0.4.0` | Vận hành chuẩn | Model dự phòng + ngắt mạch; kill switch toàn cục/nhóm; cảnh báo (tỉ lệ fallback, `model_down`, phiên Zalo rớt) qua DM chủ; chi phí/lượt & /tenant từ `turn_traces`; backup + diễn tập khôi phục; hạn giữ + xoá dữ liệu theo yêu cầu (Luật 91/2025); xoay secrets | diễn tập khôi phục đạt; cảnh báo bắn đúng trên lỗi giả lập; yêu cầu xoá dữ liệu xử lý ≤ 72 giờ |
| 4 | `1.0.0` | Mở cho khách ngoài | Onboarding tenant tự phục vụ, RLS Postgres, quota theo tenant, nhận ảnh/voice (STT), nhiều runner (advisory lock / pg-boss) | ≥ 3 tenant ngoài chạy 30 ngày; thẩm định bảo mật đối kháng |

Việc lẻ chưa xếp giai đoạn: lịch `cron` (D16, `cron_expr` + `croner`).
- *(Sàn thợ: mọi mục tương lai cũ về nhiều tòa/BQL đã BỎ do pivot.)*

## 💡 Kho Ý Tưởng & Backlog (Idea Vault)

> Mục của kế hoạch 01 (sàn thợ) bên dưới là LỊCH SỬ — đã BỎ do pivot (Đ32), chỉ giữ ý tưởng dùng lại được. Mục mới của kế hoạch 02 xếp ngay dưới dòng này.

- **Câu trả lời khi hết giờ do xếp hàng (D35.13, R08 G1)** — tin gọi bot chờ ≥ 3,5 s sau lượt khác cùng nhóm ⇒ 0 lời gọi model, vẫn trả `MODEL_DOWN_GROUP_REPLY` ("trục trặc kỹ thuật") dù model khoẻ. Đổi câu riêng cho `deadline_hit` do `queued_ms` (vd "mình đang bận chút, hỏi lại giúp mình nhé") — quyết khi có số đo P09.
- **Người trong `deny_users` gọi bot (D35.13, R08 G2)** — 0 triage và 0 lượt ⇒ không lớp model kiểm duyệt nào; lưới tất định ở `moderate` vẫn chạy. Xét lại ở P05.

- **Nhận ảnh/file/voice vào agent cộng đồng** (speech-to-text, OCR ảnh chụp lỗi) — non-goal 0.1, cần giới hạn tải file + bộ nhớ.
- **Nhiều tài khoản `community` / tài khoản doanh nghiệp** — D12 + D25 (GĐ2 lộ trình). Zalo OA: người dùng BỎ (D25 — chỉ zca-js).
- **Lịch `cron` + `croner`** — D16 chỉ làm `at|every|daily|weekly`.
- **Khoá chống chạy hai runner (advisory lock)** vẫn dùng được cho kế hoạch 02.

- **Khoá chống chạy hai bản worker/runner** (advisory lock Postgres) — giai đoạn 1 chỉ là luật vận hành (R07 Q5).

- **Lớp hiểu ý cho thợ và BQL (Đ21 mở rộng):** cùng mẫu triage cho tin "nhận"/báo giá của thợ ở P05 và phản hồi BQL — thay regex bằng ý định + luật trong code.
- **Hiển thị `triage` trong dòng thời gian agent (P04):** BQL thấy vì sao một tin bị coi là khẩn cấp/đồng ý.


*Đã cân nhắc, chưa làm ở vòng 0.1 — giữ lý do để không lật lại khi chưa có căn cứ mới.*

- **[KINH DOANH — tài liệu nhà đầu tư, ngoài phạm vi build (Đ13)]** FOMO chỉ từ số thật (bảng tin tuần: số cuốc, giá trung vị, slot còn trống), chiến dịch kéo thợ (QR phòng kỹ thuật, cửa hàng vật tư, nhóm thợ khu vực), ưu đãi khác ngoài dùng thử, kiểm chứng tay P00/G0. Bác phương án slot hai hạng (ai cũng mua thì ưu tiên mất nghĩa). Cơ chế phí vào nhóm + dùng thử thì ĐÃ vào phạm vi build (Đ14).

- **Nhắn riêng top thợ song song với đăng nhóm** — rút theo Đ10 (đăng thẳng nhóm là đủ nhanh, ít rủi ro khoá tài khoản hơn); cân nhắc lại nếu thời gian có người nhận > 30 phút.

- **Booking tiện ích qua chat** (từ `docs/DESIGN.md` v0.1) — rút theo Đ01; form/Mini App làm tốt hơn chat cho việc có cấu trúc.
- **Hỏi đáp nội quy tổng quát** — rút theo Đ01; lõi trích dẫn vẫn được port cho bước "việc của ai?", mở rộng sau rất rẻ.
- **Thanh toán trong hệ thống / cọc giữ cuốc** — rút theo Đ05; cân nhắc lại nếu tỷ lệ bùng > 10%.
- **Trí tuệ liên tòa**: đối chuẩn, cảnh báo sớm, xếp hạng nhà thầu (xem `docs/SYSTEM-MAP.md` §3) — cần ≥ 5–10 tòa và danh mục chuẩn chung.
- **Marketplace dịch vụ mở rộng** (vệ sinh, chuyển nhà, giặt là) — sau khi thợ sửa chữa chạy ổn.
- **Truy hồi lai (từ khoá + embedding) cho quy chế** — Đ17: P03 chỉ dùng từ khoá. Đ18 (Gemini) mở đường dùng `gemini-embedding-001`; làm khi đo thấy truy hồi từ khoá hụt hoặc kho quy chế lớn lên.
- **Nâng vitest 5 / Next 16 để vá `npm audit`** (7 lỗ, đều ở công cụ dev hoặc postcss của Next) — cần Đ mới vì Next 16 lệch Đ06; xét ở P07.
- **Unique index một phần cho mã vào tòa còn hiệu lực** (`access_passes.code`) — R12 Q3: 6 ký tự / 31 chữ ≈ 8,9·10⁸ tổ hợp, trùng gần như không xảy ra ở 1–2 tòa; làm khi mở nhiều tòa.
- **Siết `JOB_CODE_RE` của lưới trích mã cuốc** (R13 Q3): dạng không gạch nối khớp nhầm từ thường ("check" ⇒ `C-HECK`); hiện vô hại vì mã phải tồn tại trong DB, nhưng tốn một lượt tra.
- **`p05-helpers.createJob` dùng `generateJobCode()`** thay mã viết tay (R13 Q3).
- **Nhãn `defer` chính thức cho ý định thợ** ("để em xem đã", "tí em báo") — hiện ngoài enum, máy chấm đọc là "không phải nhận"; cân nhắc khi đo thấy agent xử nhầm thành `decline`.
- **Nhận tin nhắn thoại của thợ** (speech-to-text) — thợ quen gửi voice.

## Đã hoàn thành (Done)

- [x] **2026-10-18 — P05 kiểm duyệt:** lưới tất định (`scam_phrase`/`repeat_burst` hard, model `ok` bác được lưới) + thang cảnh cáo suy giảm, thẻ duyệt `approvals` (bằng chứng `duyệt <id>`, từ do dự ⇒ hỏi lại), 3 lớp chặn kick/block, duyệt vào nhóm 3 policy (Q9 cho vào), gom chào mừng. Thẩm định đối kháng R13 0 CHẶN, vòng sửa 14 mục. `npm test` 752, `test:db` 315, 0 skip.

- [x] **2026-10-17 — P04 tri thức:** kho tài liệu có phiên bản + hiệu lực, `embedTexts` Gemini 1024 chiều, truy hồi lai (lexical + vector `<=>` + RRF), tool `search_knowledge` trích dẫn `(theo …)`, nhặt câu hỏi bỏ trống ở nhóm ambient. `npm test` 602, `test:db` 258.

- [x] **2026-10-17 — P03b vận hành:** pacer ưu tiên tin trả lời + typing tươi + tick 250 ms, khoá chống 2 worker, heartbeat runner/worker + `/api/healthz`, báo động Telegram có chống lặp CAS (8 loại sự cố, runner và worker canh chéo), dọn vết 180/365 ngày, uid bot thật (`own_uid`, migration 011). `npm test` 585, `test:db` 238.

- [x] **2026-10-17 — P03 runtime agent trên LangGraph + tốc độ D31:** hai đồ thị `pipelineGraph`/`turnGraph`, cổng nhận tin, đệm/phiên nhóm, persona, policy tool, host ép trả lời, làn fast/rag + hạn chót, runner song song theo thread + advisory lock, migration 010, `latency_slo.mjs`. Thẩm định đối kháng R08 tìm 3 CHẶN (tin trùng khi lời gọi chốt sập, lỗi đọc thân phản hồi, chủ bị im) ⇒ D35 ⇒ R09 ✅ (D36). Bỏ lời gọi chốt sau tool trả lời: mention 2→1 lời gọi model. `npm test` 549, `test:db` 209, 0 skip.

- [x] **2026-10-16 — P02 kế hoạch 02 (R05 ✅, D29/D30):** worker nhận tin/sự kiện nhóm, 10 action quản trị, kick/block chỉ khi thẻ duyệt `approved` (CAS), pacer 20 tin/giờ/nhóm cách ≥ 9 s, sim nhóm `/dev/sim`; thẩm định đối kháng 22 đột biến → sửa → 23/23 bắt.
- [x] **2026-10-16 — D28 LangGraph:** người dùng chốt LangGraph + pipeline đồ thị làm nền; architect thiết kế lại SPEC (R04).
- [x] **2026-10-16 — P01 kế hoạch 02 (R01 ✅, D27):** gỡ 95 file sàn thợ (94 theo §2 + `tool-kit.test.ts` dời chỗ), migration 007–009, nền cộng đồng biên dịch được; gate xanh (unit 82/31/37), test:db 16/14/27, `pivot_hits: 0`. Cổng DB dev → `15432` (G31).
- [x] **2026-10-09 — Pivot sang agent cộng đồng Zalo:** nghiên cứu OpenClaw + zaloclaw, Đ32 dừng kế hoạch 01, architect dựng bộ SPEC kế hoạch 02 (`7a58d6d`, bằng chứng `evidence/ARCH/`), SO duyệt (`f6a4465`). Chưa đổi mã; P01 chờ người xác nhận gỡ file. Các mục Done bên dưới là của sàn thợ (kế hoạch 01), giữ làm lịch sử và nền tái dùng.

- [x] **2026-09-26 — P05-B nền + P05-C agent thợ + P05-E dashboard tối thiểu (Đ27, Đ30):** migration 006, dịch vụ chốt thợ/cấp quyền/slot/đồng hồ, PiiGate; agent thợ hiểu ý bằng model + 9 tool; `/tickets` duyệt cấp quyền, `/gate`, `/vendors`, `/jobs`, SimBoard Tick; `suspendVendor` có thứ tự + chốt chặn giao việc (vá lỗ PII phát hiện khi duyệt). `npm test` 317, `test:db` 192, 0 skip. Cổng model (G08–G10, golden thợ) chờ Gemini.

- [x] **2026-09-26 — Máy chấm có cờ `--set` (Đ29, R08 vòng 5 ✅):** chấm bù theo route — `emergency`/`consent` giữ số real-run-1 (triage không đổi), chỉ chấm lại `diagnosis`/`responsibility` khi prompt agent chính đổi. Vòng 4 Gemini ⛔ quota (G26); Đ28 tạm chạy dev bằng `vyce/deepseek-v4-flash`.

- [x] **2026-09-25 — Máy chấm model thật + sửa cột danh mục + UI Zalo + nhánh OpenRouter:** lượt chấm đầu ra chẩn đoán 0/40 ⇒ SO tìm lỗi sản phẩm `save_job_draft` không ghi cột `jobs.category_code` (Đ23, SPEC-P03 §11.11) ⇒ sửa xong chẩn đoán 97,3%. Máy chấm mới `scripts/eval/{score,red-fake-model}.mjs` chạy vòng agent thật, biết đỏ với model giả. H09 đăng xuất/QR (R09 ✅ sau vòng test DB web chập chờn). H10 nhánh `openrouter` (Đ24, 01-CONTRACTS §2c, R10 ✅). `npm test` 245, `test:db` 122, 0 skip.

- [x] **2026-09-25 — P02 giai đoạn 1 (Zalo thật, Đ22):** worker zca-js 2.2.0 cho `bql` (phiên AES-256-GCM, QR qua DB, luồng vào chống trùng, pacer, watchdog), runner `core:run`, `/zalo`, `dev:link-zalo`, migration 004. R07 ✅ sau 2 vòng (test đếm migration ghi cứng). `npm test` 229, `test:db` 110. Chạy thử với Zalo phụ: QR, nhận tin, trả lời mời đăng ký, bỏ tin nhóm — đạt.

- [x] **2026-09-25 — P03 mã được duyệt + adapter Gemini:** thẩm định đối kháng R05 tìm 7 lỗi chặn (trích dẫn ngược nhãn, mở case cùng lượt, đồng ý bằng regex, khẩn cấp `chay`=cháy/chảy, 16/20 PII lọt, chốt `DATA_MODE` vô hiệu) ⇒ Đ20 SPEC-P03 §11 + Đ21 lớp hiểu ý (triage) ⇒ H06 hai vòng (vòng 2 vá `\b` ASCII làm tê liệt lưới có dấu). Adapter Gemini H04 (fetch, `thoughtSignature`, fallback, kiểm input tool). `npm test` 173, `test:db` 76, 0 skip.

- [x] **2026-09-24 — P01 Nền tảng (R01 ✅ sau thẩm định R02):** npm workspaces, migration 001 + seed nền, adapter db/model/transport, máy trạng thái cuốc, SimTransport + `/dev/sim`, auth 3 vai cookie HMAC, `npm run gate`; 40 test (28 unit + 12 DB). Thẩm định đối kháng tìm 2 lỗi chặn ở máy đo (bỏ lọt import nhiều dòng, khoá `phone?:`) — đã vá ở vòng 2.

- [x] **2026-09-24 — Hình kinh tế ba bên** `docs/images/10-kinh-te-ba-ben.png` và mockup dashboard `docs/images/09-dashboard-bql-mockup.png`.

- [x] **2026-09-24 — Pipeline v0.2 được duyệt (Đ10):** agent điều phối trọn vòng; ảnh `docs/images/08-pipeline-chuan.png` + bản ASCII ở `docs/SYSTEM-MAP.md` §10.

- [x] **2026-09-24 — Dựng bộ SPEC hồ sơ 01** (plan + 00/01/P00/P02–P06/OPERATIONS/TESTING-ACCEPTANCE) và sơ đồ pipeline `docs/images/08-pipeline-chuan.png`.
- [x] **2026-09-24 — Phân tích OpenClaw/ZaloClaw, định vị sản phẩm** (`docs/SYSTEM-MAP.md`, ảnh 01–07).
- [x] **Khởi tạo Bộ Nhớ Não Bộ Chuẩn:** brain4agent engine 1.13.1, khung 1.7.1.
