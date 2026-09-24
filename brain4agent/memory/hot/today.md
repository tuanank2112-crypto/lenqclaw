# 📅 Nhật Ký Làm Việc Ngày 2026-09-24 (Session Memory Log)

> Cập nhật lúc: `2026-09-24` | Phiên bản: `v0.0.1` (hồ sơ 01 chờ duyệt)

---

## 🏁 Phiên 2026-09-24 — Từ phân tích OpenClaw/ZaloClaw tới hồ sơ SPEC sàn việc thợ

### 🎯 Chỉ đạo
Phân tích OpenClaw + ZaloClaw (monas-team) với tài khoản Zalo cá nhân → định hướng rebuild → chọn ngách "sàn việc thợ trong tòa nhà" → "pipeline chuẩn, vẽ diagram, lấy repo não lắp vào, đọc não rồi lên plan".

### ✅ Đã làm
- Phân tích 4 mảng (ZaloClaw source, OpenClaw zalouser, OpenClaw core, zca-js + rủi ro pháp lý) — kết luận ghi ở `docs/SYSTEM-MAP.md` và `-known-gotchas.md` G01–G07.
- Sơ đồ PNG `docs/images/01…08` (08 = pipeline chuẩn, đã vẽ lại thành v0.2 theo Đ10).
- Cài não: `init_brain.js` (engine 1.13.1, khung 1.7.1) từ `D:\brain4agent.release` (người dùng gọi là `D:\brain4agent`; chỉ có bản `.release`). `--check` ⇒ `NÃO ĐÃ OK`, kênh hub sạch.
- Dựng hồ sơ `planning/01_2026-09-24_san-viec-tho-mvp/` đủ bộ SPEC.

- **Người dùng sửa pipeline (Đ10):** agent phải điều phối trọn vòng, không chỉ phân loại. Luồng: phân loại → ticket BQL | ticket case → job ẩn danh → nhóm thợ → chốt → ticket xin BQL cấp quyền → giao việc → đóng case. Đã vẽ lại `docs/images/08-pipeline-chuan.png` (v0.2) và sửa plan, 00, 01, P03–P06, TESTING.

- **Người dùng duyệt pipeline v0.2** sau khi xem ảnh (mở tab VS Code) + bản ASCII trong chat: "pipline khá ổn". Đồng bộ não bằng skill `nao-dong-bo` (không có git ⇒ đọc file trực tiếp).

- Người dùng hỏi: (1) dashboard BQL chưa có data thật ⇒ cần dựng dashboard nhận ticket từ agent; (2) cách tạo FOMO để thợ biết đến và chịu trả tiền giữ slot tháng. Đã làm mockup `docs/images/09-dashboard-bql-mockup.png` và đề xuất mô hình slot — ghi ở roadmap Idea Vault dạng CHỜ DUYỆT.

- Người dùng duyệt **Đ11** (dashboard ổn, rối mắt, fix sau) và chốt **Đ12**: bác slot hai hạng ("ai cũng mua thì hỏng") ⇒ slot đồng giá, ai nhanh tay thắng, ưu đãi thợ mới để sau. Đã sửa plan, 00, 01 (bảng slot_capacity/vendor_slots/slot_waitlist, ledger slot_fee), P00, P04, P05 §8, P06, OPERATIONS, TESTING (G15).

- **Đ13 (người dùng):** "đã đi quá xa — tập trung xây agent; FOMO chỉ là kế hoạch cho nhà đầu tư". Đã gỡ slot/phí/sổ phí/G0/P00 khỏi SPEC (01-CONTRACTS bỏ 3 bảng slot + ledger_entries; P05 §8, G15, trang /ledger bỏ), thêm `SimTransport` + chat giả lập `/dev/sim` + gate G16, đổi thứ tự P01 → P03 → P05 → P06.

- **Đ14 (người dùng sửa Đ13):** "vẫn phải có bài toán kinh tế thu phí thợ vào nhóm, nhưng free giữ slot khoảng thời gian đầu" ⇒ đưa lại slot đồng giá + trần + danh sách chờ + ledger, thêm dùng thử miễn phí `FREE_TRIAL_DAYS` (1 lần, chiếm chỗ). FOMO/P00/G0 vẫn ngoài phạm vi.

- Người dùng hỏi làm sao cư dân, BQL, thợ đều có lợi kinh tế và phải thấy nó hiện hữu trong hệ thống ⇒ vẽ `docs/images/10-kinh-te-ba-ben.png` (3 bề mặt + luật cân bằng), ghi Đ15 dạng CHỜ DUYỆT ở roadmap.

- Người dùng duyệt Đ15 ("tốt, đã gần đúng ý") và yêu cầu cập nhật não ⇒ ghi Đ15 vào plan.md, thêm gói P08 (SPEC-P08 chưa viết), đồng bộ kernel/roadmap/changelog/index/SYSTEM-MAP bằng skill `nao-dong-bo`.

### ⏭ Treo / cần người
- Giữ hay bỏ bước cư dân "Đồng ý"; chốt tham số phí + `MIN_EARNINGS_TO_FEE`; viết SPEC-P08; `git init`.
- Repo chưa là git repo ⇒ chưa commit được.
- Cần quy chế thật của tòa pilot để làm golden `responsibility` (G10).
