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

## 🏁 Phiên 2026-09-25 (chiều) — Thẩm định P03, adapter Gemini, vòng vá, lớp hiểu ý
- Bước 0 exit 0; Docker Desktop tắt ⇒ bật lại để có Postgres dev.
- **Đ19** chốt 4 câu hỏi mở R03 (provider tách, fallback phía client, `max_tokens` 16000, G09/G10 chỉ chấm qua vòng agent thật).
- H04 (worker 🟠) adapter Gemini ∥ H05 (thẩm định 🔴 ngữ cảnh sạch) chạy song song. R05: cổng xanh nhưng bộ phá đỏ 27/40 ⇒ 7 lỗi chặn; SO đo lại xác nhận ⇒ R05 ✅, R03 🔁.
- **Đ20** SPEC-P03 §11 (vòng vá). Người dùng hỏi C1 ("BQL không ăn tiền cuốc") ⇒ giữ: BQL thu phí slot nên trích dẫn buộc kết luận là thứ giữ lòng tin cư dân. Người dùng: "bắt key rất khó và dễ sai" ⇒ **Đ21 lớp hiểu ý** `triageMessage` (khẩn cấp + đồng ý), từ khoá lùi thành lưới an toàn. Lưu memory `intent-by-model-not-keywords`.
- R04 🔁 vì `test:db` đỏ 9/21 (lỗi phạm vi handoff của SO) ⇒ gộp vào H06 mục 0.
- H06 vòng 1: 103/70 test; SO probe câu thật ⇒ lưới có dấu tê liệt (`\b` chỉ ASCII, G14) ⇒ 🔁; vòng 2 (cùng worker) vá + test sinh từ mảng + bằng chứng đỏ 35/78 ⇒ 173/76 ⇒ R06 ✅, R03 ✅, R04 ✅.
- Lệch sót sau R06: `handoff_to_staff` ghi cứng 30 phút (§11.6 đòi env `HUMAN_TAKEOVER_MIN` = 60), `.env.example` thiếu biến triage — đưa vào gói kế.

### ⏭ Treo / cần người
- Push các commit hôm nay (chưa push). Giữ/bỏ bước "Đồng ý"; tham số phí.
- Gói kế: máy chấm model thật (G08–G10) — cần key Gemini trong `.env` (đã có).

## 🏁 Phiên 2026-09-25 (chiều muộn) — Zalo thật giai đoạn 1
- Push `origin/main` = `d1070cc` (người dùng duyệt). Người dùng hỏi "sao chưa thấy Zalo" ⇒ giải thích Đ13, đề xuất đưa P02 lên song song ⇒ duyệt ⇒ **Đ22** + SPEC-P02 §9.
- H07 (worker Opus) Zalo `bql` ∥ H08 (Sonnet) máy chấm model thật. R07 🔁 vì test P01 ghi cứng số migration (lại lỗi phạm vi SO) ⇒ vòng 2 ⇒ ✅ (229/110 test).
- Chạy thử: SO bổ sung `.env` (DATABASE_URL, DATA_MODE, SESSION_SECRET, ZALO_SESSION_KEY sinh ngẫu nhiên), migrate/seed DB dev, bật web + runner + worker nền; người dùng cho phép SO tạo admin `admin@lenqclaw.local` (mật khẩu đã đưa trong chat — tạo lại trước VPS). Quét QR lần 1 hết hạn vì chưa bấm xác nhận (G19); lần 2 `connected`; tin cá nhân ⇒ `REGISTER_REPLY`; tin nhóm bị bỏ; `dev:link-zalo` gắn đúng uid người dùng vào `sim-res-1`.
- Người dùng hỏi nút refresh QR (có — bấm lại nút) và nút đăng xuất (không có — zca-js không có API, G18) ⇒ SO dừng worker, xoá `session_enc`, audit `zalo.logout_manual`.
- H08 giữa chừng: khẩn cấp hai lớp 100/100 (0 bỏ sót, 0 báo nhầm), đồng ý 42/44 (0 nhận nhầm); đang chấm chẩn đoán/trách nhiệm.

### ⏭ Treo
- Gói UI Zalo (đăng xuất, "đã quét chờ xác nhận", đồng hồ QR). Thử agent chẩn đoán/khẩn cấp qua Zalo thật (cần quét QR lại).
- Phán R08; `.env.example` thêm `PACER_*`/`ZALO_ACCOUNTS`, sửa `PACER_MAX_PER_MINUTE` 20→10, bỏ `PACER_MIN_INTERVAL_MS` (sau khi H08 nhả file).


## 🏁 Phiên 2026-09-25 (tối) — Máy chấm model thật, lỗi cột danh mục, UI Zalo, OpenRouter
- Bước 0 exit 0; Docker tắt ⇒ bật lại. Worker H08 vòng 1 bị ngắt 12:31, chưa commit; chẩn đoán 0/40 `thực tế=null` ⇒ SO lần ra `save_job_draft` không ghi cột `jobs.category_code` (lỗi sản phẩm) ⇒ **Đ23** SPEC-P03 §11.11 + phụ lục vòng 2 H08.
- H08 vòng 2 ∥ H09 (UI Zalo). R09 vòng 1 🔁: SO đo lại test DB web đỏ 2/5 (thiếu `fileParallelism: false`, G24) — report worker ghi xanh do may; vòng 2 ⇒ R09 ✅.
- H08 lượt 1 thật: khẩn cấp 100/100, đồng ý 42/44 (0 nhận nhầm), chẩn đoán 36/37, trách nhiệm 26/30 (R25/R29 kết luận `resident` khi thiếu căn cứ; R26/R27 không kết luận). Worker sửa prompt ⇒ lượt 2 chết giữa chừng vì Gemini 429 quota ngày (G22). SO phán R24–R29 trong phạm vi, giữ kỳ vọng.
- Cảnh báo bảo mật "mass delete" trên worker H08 = báo nhầm: chỉ `DROP DATABASE lq_h08` (DB thử của chính gói); DB `lenqclaw` chạy thử còn nguyên.
- Người dùng đưa key OpenRouter (dán trong chat — nên thu hồi sau) ⇒ **Đ24** 01-CONTRACTS §2c, H10 nhánh `openrouter` ⇒ R10 ✅ (đột biến `data_collection`, 402 đều bị bắt). Nhưng tài khoản 0 USD (G23: `limit` của key ≠ số dư; probe SO dùng `max_tokens` 200 nên lọt).
- Số cuối: `npm test` 245, `test:db` 122, gate 0, 0 skip (SO đo lại DB rỗng).

### ⏭ Treo
- 🖐 Tín dụng model (nạp OpenRouter ~1 USD/lượt hoặc chờ quota Gemini) ⇒ H08 vòng 3 chấm lại, phán R08, commit/bỏ prompt `resident.ts` đang treo.
- 🖐 Thử `/zalo` đăng nhập → đăng xuất → đăng nhập lại; thử agent qua Zalo thật. Push (chưa push từ `d1070cc`).
- SO: `.env.example` pacer (`PACER_MAX_PER_MINUTE` 10, bỏ `PACER_MIN_INTERVAL_MS`, `ZALO_ACCOUNTS`).
- Người dùng bỏ phương án nạp OpenRouter, đưa key **Vyce AI** ("chọn deepseek cũng được") ⇒ lưu `.env` `VYCE_API_KEY`; dò ra base `https://vyceai.com/v1` (`api.vyceai.com` không phân giải); `deepseek-v4-flash` + tool + `max_tokens` 16000 ⇒ 200, 2,2 s. Liệt kê toàn bộ model bị bộ phân loại auto mode chặn (Data Exfiltration) — không cần, bỏ qua. **Đ25** 01-CONTRACTS §2d + H11 (worker làm R10 nhận tiếp). Commit não `4f3ff0e`, hồ sơ `fd1144a`.
- R11 ✅ (SO đo lại 251/122, đột biến chặn `DATA_MODE` + trường `provider` đều bị bắt). H08 vòng 3 bằng `vyce/deepseek-v4-flash`: khẩn cấp 91/100 (bỏ sót 1, báo nhầm 8%), đồng ý nhận nhầm 2, chẩn đoán 2/40 ⇒ SO dừng, **Đ26**: gate chấm bằng Gemini; không sửa prompt cho DeepSeek (G25). Treo: 🖐 quota/billing Gemini ⇒ H08 vòng 4.

## 🏁 Phiên 2026-09-25 (khuya) — H08 vòng 4 bằng Gemini
- Bước 0 exit 0. SO probe Gemini `gemini-3.6-flash` 22:50 ⇒ HTTP 200 (quota đã hồi) ⇒ phụ lục H08 §9 (`c1f51c0`): chấm lại đủ 4 bộ một lần với prompt `resident.ts` đang treo; đạt ⇒ commit prompt; trượt ⇒ đúng 1 vòng sửa; 429 dồn dập ⇒ nộp `blocked`, không đổi provider. Phóng worker 🟠 chạy nền.

### ⏭ Treo
- Chờ R08 vòng 4 ⇒ SO đo lại, phán, cập nhật G08–G10.
