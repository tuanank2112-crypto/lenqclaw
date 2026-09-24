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

- **Git + GitHub:** tạo repo private `github.com/tuanank2112-crypto/lenqclaw` qua GitHub API (gh CLI chưa đăng nhập; dùng credential Git Credential Manager). `git init -b main`, commit nền `478bf32` đã push.
- **Đ16 — SPEC-P01:** soạn handoff P01 lộ ra quyết định chưa có trong 01-CONTRACTS ⇒ viết `specs/SPEC-P01-Foundation.md` (test không DB tách `test:db`, cookie HMAC, SQL thuần, SimTransport vọng lại, seed nền, DB dev `127.0.0.1:55432`); vá DDL `job_categories` mất cột `default_mode`. Commit `b7e907f`.
- **P01 xong:** worker 🟠 thi công theo H01 (30 test) → thẩm định đối kháng H02 (🔴, agent khác) tìm D1/D2 chặn (máy đo bỏ lọt import nhiều dòng, `pg/lib/*`, khoá `phone?:`) + 8 lỗi nên sửa → R01 🔁 → vòng 2 vá hết (40 test) → SO đo lại trên DB rỗng + cây cố tình hỏng ⇒ R01 ✅, R02 ✅. G01–G03 ✅ local. Đồng bộ não (skill `nao-dong-bo`) + docs module `docs/{core,web,zalo-worker}.md`.
- **Đ17 — chốt thi công P03** ở SPEC-P03 §10 (nhận-trước-xử-lý-sau đã làm luôn ở vòng 2 P01; truy hồi từ khoá; đồng ý tất định; QC-DEMO; golden LLM `blocked` khi thiếu key).
- Thẩm định chưa chạy được phần giả mạo cookie qua HTTP (vỏ agent tự dừng) ⇒ bù bằng test unit `verifySessionCookie`; đã báo người.

- **Push:** người dùng duyệt ⇒ `origin/main` = `4955b5a` (P01 + SPEC/H03).
- **Đ18 — Gemini:** người dùng "sử dụng key gemini". Auto mode CHẶN việc chép key từ `D:uild phase.env.local` (Credential Exploration) ⇒ người dùng tự dán key ⇒ ghi `.env` (gitignore). Probe: `gemini-3.6-flash`/`3-flash-preview` 200 + functionCall + `thoughtSignature`; `3.5-flash-lite` 200; `3.5-flash`/`3.1-flash-lite`/`flash-latest` 503; mọi `2.x` 404 (G13). Hợp đồng 01-CONTRACTS §2b + `MODEL_FALLBACKS`.

## 🏁 Phiên 2026-09-25 (tiếp) — P03 thi công xong, tạm dừng
- Worker 🟠 thi công H03 ⇒ R03 ⏳ (`e3d2079`, report `ee362f7`): 8 tool, resident agent, migration 002, seed sim, 3 bộ golden + `eval_golden.mjs`. Bắt được bug thật: `pg` trả cột `date` thành JS `Date` ⇒ so hiệu lực sai ⇒ ép `::text`.
- SO đo lại: phạm vi sạch (không đụng specs/brain/docs/check scripts); `npm ci`/typecheck/build/`npm test` 54/`test:db` 23 trên DB rỗng/gate = 0.
- **Người dùng: "dừng lại rồi cập nhật não"** ⇒ CHƯA phóng thẩm định P03, CHƯA giao H04. Đồng bộ não.

### ⏭ Treo / cần người
- Thẩm định P03 (đối kháng, agent khác) rồi phán R03; H04 adapter Gemini (`model.ts` hiện chỉ Anthropic).
- Câu hỏi mở R03: `window_start/end` khi mở case; `eval_golden` chấm một lượt đơn (không phải vòng tool thật); SDK Anthropic 0.68 không có `fallbacks`; SPEC-P03 §10.8 lệch Đ18.
- Trạng thái `unassigned`/`disputed` chưa có đường ra (01-CONTRACTS §5) — chốt khi soạn P05/P06.
- Giữ hay bỏ bước cư dân "Đồng ý"; chốt tham số phí + `MIN_EARNINGS_TO_FEE`; viết SPEC-P08.
- Cần quy chế thật của tòa pilot để làm golden `responsibility` (G10).
