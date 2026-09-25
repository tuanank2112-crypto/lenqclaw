# Roadmap & Active Tasks

File này chứa danh sách các tính năng, mục tiêu sắp tới và tình trạng công việc hiện tại.

> Nguồn chi tiết: [`planning/01_2026-09-24_san-viec-tho-mvp/plan.md`](../planning/01_2026-09-24_san-viec-tho-mvp/plan.md) §3–§4. File này chỉ tóm tắt.

## Mục tiêu hiện tại (Active) — hồ sơ `01_2026-09-24_san-viec-tho-mvp`, SemVer đích `0.1.0`

Thứ tự (Đ13, Đ15): `P01 → P03 → P05 → P06 → P08`; P04 tối thiểu song song từ P03; P02 (Zalo thật) sau; P07 chạy dọc. P00 ngoài phạm vi build.

- [x] 🖐 Người dùng duyệt pipeline v0.2 (Đ10) — 2026-09-24
- [x] 🖐 Duyệt Đ11 (dashboard + mô phỏng) — 2026-09-24
- [x] 🖐 Đ13: trọng tâm = xây agent; kinh doanh ra khỏi phạm vi — 2026-09-24
- [ ] 🖐 Giữ/bỏ bước cư dân "Đồng ý"
- [x] 🖐 Đ14: phí vào nhóm (slot đồng giá) + miễn phí thời gian đầu TRONG phạm vi — 2026-09-24
- [x] 🖐 Đ15: sổ lợi ích ba bên hiện trong hệ thống — 2026-09-24 ("gần đúng ý", tinh chỉnh khi viết SPEC-P08)
- [ ] 🖐 Chốt `FREE_TRIAL_DAYS`, `SLOT_FEE_MONTHLY`, `SLOT_MIN_JOBS_PER_VENDOR`, `BQL_SHARE_PCT`, `MIN_EARNINGS_TO_FEE`, `MINUTES_PER_CASE_BASELINE`
- [ ] Viết SPEC-P08 "Sổ lợi ích ba bên" + gate G17
- [x] `git init` + remote private `github.com/tuanank2112-crypto/lenqclaw` — 2026-09-24
- [x] P01 — Nền tảng + SimTransport (chat giả lập `/dev/sim`, kịch bản `evals/scenarios`) — G01–G03 ✅ local, 2026-09-24
- [ ] P04 — Dashboard BQL tối thiểu + thợ & slot + sổ phí + dữ liệu mô phỏng (🟠) — song song từ P03
- [ ] P03 — Agent cư dân bước 0–3 (🔴/🟠) — **mã đã duyệt 2026-09-25** (thẩm định R05 + vòng vá H06); còn gate G08–G10 chờ máy chấm model thật
- [ ] **Kế tiếp — H08 vòng 3:** máy chấm model thật đã có (R08, mã ✅ SO đo lại); lượt 1: khẩn cấp 100/100, đồng ý 92% (0 nhận nhầm), chẩn đoán 97,3%, **trách nhiệm 86,7% < 90%** (R25/R29 kết luận `resident` khi thiếu căn cứ). Sửa prompt `resident.ts` đang treo chưa commit ⇒ chạy lại đủ 4 bộ bằng `vyce/deepseek-v4-flash` (Đ25) sau khi H11 (nhánh `vyce`) được duyệt
- [ ] P05 — Agent bước 4–7: job ẩn danh → nhóm thợ giữ slot → chốt → ticket cấp quyền → giao việc + luật slot/dùng thử (🔴)
- [ ] P06 — Agent bước 8: theo dõi, nghiệm thu, đóng case, điểm thợ, giá thật (🟠)
- [ ] P08 — Sổ lợi ích ba bên: phiếu hoàn thành, bảng thu nhập thợ, thẻ Hiệu quả tháng, luật cân bằng slot (🟠)
- [x] P02 giai đoạn 1 — Zalo `bql` trên máy dev (Đ22): mã R07 ✅; chạy thử người: QR ✅, `REGISTER_REPLY` ✅ — 2026-09-25
- [x] P02 UI Zalo (H09, SPEC-P02 §9.8): đăng xuất + trạng thái QR + migration 005 — R09 ✅ 2026-09-25
- [ ] 🖐 Thử người `/zalo` (đăng nhập → đăng xuất → đăng nhập lại) + thử agent chẩn đoán/khẩn cấp qua Zalo thật
- [ ] P02 giai đoạn 2 — `market` + nhóm thợ + ảnh + cột `outbox.sent_at` (cùng P05) (🔴)
- [ ] P07 — Golden + deploy VPS + backup (🟠)

## Tương lai (Upcoming)

- Kênh Zalo OA song song (giữ interface `Transport`), khi nhân rộng 5–10 tòa.
- Dashboard nhiều tòa, trang minh bạch cho Ban quản trị.
- **Tinh gọn UI dashboard BQL** — người dùng: "ổn nhưng chưa tối ưu, rối mắt, fix sau" (Đ11).

## 💡 Kho Ý Tưởng & Backlog (Idea Vault)

- Máy chấm: cờ chọn bộ (`--set responsibility`) để chạy lại riêng bộ trượt, tiết kiệm token (một lượt đủ 4 bộ ≈ 1 triệu token vào). Chưa làm vì ngoài phạm vi H08.

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
- **Nhận tin nhắn thoại của thợ** (speech-to-text) — thợ quen gửi voice.

## Đã hoàn thành (Done)

- [x] **2026-09-25 — Máy chấm model thật + sửa cột danh mục + UI Zalo + nhánh OpenRouter:** lượt chấm đầu ra chẩn đoán 0/40 ⇒ SO tìm lỗi sản phẩm `save_job_draft` không ghi cột `jobs.category_code` (Đ23, SPEC-P03 §11.11) ⇒ sửa xong chẩn đoán 97,3%. Máy chấm mới `scripts/eval/{score,red-fake-model}.mjs` chạy vòng agent thật, biết đỏ với model giả. H09 đăng xuất/QR (R09 ✅ sau vòng test DB web chập chờn). H10 nhánh `openrouter` (Đ24, 01-CONTRACTS §2c, R10 ✅). `npm test` 245, `test:db` 122, 0 skip.

- [x] **2026-09-25 — P02 giai đoạn 1 (Zalo thật, Đ22):** worker zca-js 2.2.0 cho `bql` (phiên AES-256-GCM, QR qua DB, luồng vào chống trùng, pacer, watchdog), runner `core:run`, `/zalo`, `dev:link-zalo`, migration 004. R07 ✅ sau 2 vòng (test đếm migration ghi cứng). `npm test` 229, `test:db` 110. Chạy thử với Zalo phụ: QR, nhận tin, trả lời mời đăng ký, bỏ tin nhóm — đạt.

- [x] **2026-09-25 — P03 mã được duyệt + adapter Gemini:** thẩm định đối kháng R05 tìm 7 lỗi chặn (trích dẫn ngược nhãn, mở case cùng lượt, đồng ý bằng regex, khẩn cấp `chay`=cháy/chảy, 16/20 PII lọt, chốt `DATA_MODE` vô hiệu) ⇒ Đ20 SPEC-P03 §11 + Đ21 lớp hiểu ý (triage) ⇒ H06 hai vòng (vòng 2 vá `\b` ASCII làm tê liệt lưới có dấu). Adapter Gemini H04 (fetch, `thoughtSignature`, fallback, kiểm input tool). `npm test` 173, `test:db` 76, 0 skip.

- [x] **2026-09-24 — P01 Nền tảng (R01 ✅ sau thẩm định R02):** npm workspaces, migration 001 + seed nền, adapter db/model/transport, máy trạng thái cuốc, SimTransport + `/dev/sim`, auth 3 vai cookie HMAC, `npm run gate`; 40 test (28 unit + 12 DB). Thẩm định đối kháng tìm 2 lỗi chặn ở máy đo (bỏ lọt import nhiều dòng, khoá `phone?:`) — đã vá ở vòng 2.

- [x] **2026-09-24 — Hình kinh tế ba bên** `docs/images/10-kinh-te-ba-ben.png` và mockup dashboard `docs/images/09-dashboard-bql-mockup.png`.

- [x] **2026-09-24 — Pipeline v0.2 được duyệt (Đ10):** agent điều phối trọn vòng; ảnh `docs/images/08-pipeline-chuan.png` + bản ASCII ở `docs/SYSTEM-MAP.md` §10.

- [x] **2026-09-24 — Dựng bộ SPEC hồ sơ 01** (plan + 00/01/P00/P02–P06/OPERATIONS/TESTING-ACCEPTANCE) và sơ đồ pipeline `docs/images/08-pipeline-chuan.png`.
- [x] **2026-09-24 — Phân tích OpenClaw/ZaloClaw, định vị sản phẩm** (`docs/SYSTEM-MAP.md`, ảnh 01–07).
- [x] **Khởi tạo Bộ Nhớ Não Bộ Chuẩn:** brain4agent engine 1.13.1, khung 1.7.1.
