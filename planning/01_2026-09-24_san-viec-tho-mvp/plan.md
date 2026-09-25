# Kế hoạch 01 — Sàn việc thợ trong tòa nhà (MVP pilot 1–2 tòa)

> Hồ sơ kế hoạch. **KHÔNG chứa thiết kế chi tiết** — thiết kế nằm ở `specs/` (bảng Mục 5).
> Sơ đồ pipeline: [`../../docs/images/08-pipeline-chuan.png`](../../docs/images/08-pipeline-chuan.png).

## 1. Metadata Header

| Trường | Giá trị |
| :-- | :-- |
| Mã hồ sơ | `01_2026-09-24_san-viec-tho-mvp` |
| Ngày mở | 2026-09-24 |
| Chủ trì | Super Orchestrator (cửa sổ này) |
| Trạng thái | 🟢 PIPELINE v0.2 · Đ13 trọng tâm agent · Đ14 phí vào nhóm · Đ15 sổ lợi ích ba bên — ĐÃ DUYỆT (2026-09-24). Chờ: SPEC-P08, tham số phí. Git: `origin` = github.com/tuanank2112-crypto/lenqclaw (private). P01 đang thi công (H01) |
| Phạm vi | Pilot 1–2 tòa, một công ty vận hành, kênh Zalo cá nhân |
| SemVer dự kiến | `0.1.0` (MINOR đầu tiên — dựng mới) |
| Đặc tả kế thừa | `docs/DESIGN.md` v0.1 (trợ lý BQL tổng quát) — bị thu hẹp bởi Đ01, xem "Quyết định bị thay thế" · Lõi trả lời có trích dẫn của repo `D:\build phase` (Resident Agent v1.0) — tham chiếu để port, không chép mù |

## 2. Nhật ký quyết định

Mỗi mục: quyết định · lý do · **chỗ có thể lật + chi phí lật**.

### Đ01 — 2026-09-24 · Sản phẩm là sàn việc thợ, agent cư dân là cửa vào
Nguồn việc là **việc sửa chữa trong căn** mà BQL đang từ chối. Agent cư dân chẩn đoán và phân định trách nhiệm; việc thuộc BQL rẽ sang ticket nội bộ; việc thuộc cư dân lên sàn cho thợ đã được BQL duyệt. Lý do: phía thợ là bên sẵn lòng trả tiền; BQL giữ hai thứ không ai sao chép được (quy chế, cửa ra vào).
**Lật được:** nếu cổng G0 (P00) cho thấy thợ không trả phí hoặc không đủ việc → quay về trợ lý BQL thuần (ticket + hỏi đáp). **Chi phí lật:** thấp — P01–P04 dùng chung cho cả hai hướng.

### Đ02 — 2026-09-24 · Kênh Zalo cá nhân, HAI tài khoản, sau lớp Transport
Tài khoản `bql` nói chuyện với cư dân; tài khoản `market` nói chuyện với thợ (nhóm "Thợ Tòa X" + nhắn riêng). Thư viện `zca-js` pin đúng phiên bản. Lý do: người dùng chọn Zalo cá nhân; tách tài khoản để một tài khoản bị khoá không kéo sập bên kia.
**Lật được:** chuyển sang Zalo OA. **Chi phí lật:** thấp nếu mọi gửi/nhận đi qua `Transport` (01-CONTRACTS §8); cao nếu gọi thẳng zca-js.

### Đ03 — 2026-09-24 · LLM chỉ đề xuất, code quyết định
LLM được: chẩn đoán, đề xuất trách nhiệm kèm trích dẫn, soạn lời, so ảnh (tư vấn). LLM KHÔNG được: gán thợ, đặt giá, mở thông tin căn hộ, chọn phòng ban, ghi sổ. Lý do: sai ở các chỗ này là mất tiền, mất an ninh.
**Lật được:** không trong vòng 0.x.

### Đ04 — 2026-09-24 · Hai chế độ chốt: giá chốt và khảo sát
`fixed`: việc phổ biến có khung giá → thợ đủ điều kiện trả lời "nhận", **ai nhận hợp lệ trước thì được**, giữ cuốc 10 phút. `quote`: việc mơ hồ → thợ báo giá trong cửa sổ, cư dân chọn. Lý do: tốc độ chốt là giá trị thật (liên tưởng nhóm taxi Zalo), nhưng chỉ an toàn khi việc đã chuẩn hoá và người nhận đã được duyệt.
**Lật được:** tỷ lệ bùng cao → thêm cọc giữ chỗ. **Chi phí lật:** trung bình (thêm trạng thái).

### Đ05 — 2026-09-24 · Không xử lý thanh toán trong MVP
Hệ thống chỉ ghi sổ phí cuốc và phần chia BQL (`ledger_entries`); thu tiền ngoài hệ thống. Lý do: thanh toán kéo theo pháp lý và đối soát, không cần để kiểm chứng giả thuyết.
**Lật được:** khi G0 xanh và có đối tác thanh toán. **Chi phí lật:** trung bình.

### Đ06 — 2026-09-24 · Stack
TypeScript (Node 22 LTS), npm workspaces: `apps/web` (Next.js 15, console BQL), `apps/zalo-worker` (tiến trình dài hạn, zca-js), `packages/core` (domain, agent, adapters). PostgreSQL 16 + pgvector tự host bằng Docker trên VPS Việt Nam. Hàng đợi `pg-boss`. LLM qua adapter duy nhất, mặc định Claude `claude-opus-5`. Lý do: zca-js là TypeScript; cùng ngôn ngữ với build phase để port lõi trích dẫn; một Postgres cho mọi thứ.
**Lật được:** model (đổi trong adapter, đo lại golden). **Chi phí lật:** thấp.

### Đ07 — 2026-09-24 · Kiểm chứng tay chạy song song, khoá tự động hoá dispatch
P00 (BQL tự đăng cuốc theo mẫu vào nhóm thợ 2–4 tuần) chạy song song P01–P04. **Cổng G0 chưa xanh thì CẤM thi công P05.** Lý do: tự động hoá một chợ chưa ai mua là đốt công.
**Lật được:** không — đây là hàng rào chống xây thứ không ai dùng.

### Đ08 — 2026-09-24 · Khoá PII bằng kiểu dữ liệu
`JobCard` (thứ thợ nhìn thấy) **không có trường** số căn / SĐT / tên cư dân ở mức type. Chỉ tool `dispatch_to_vendor` ở trạng thái `access_granted` (sau khi BQL duyệt ticket cấp quyền — Đ10) mới trả `JobReveal`. Lý do: "sửa khoá + số căn" là rủi ro an ninh; chặn ở type thì worker sau không lỡ tay.
**Lật được:** không.

### Đ09 — 2026-09-24 · Đường khẩn cấp không phụ thuộc LLM
Từ khoá khẩn cấp (cháy, khói, kẹt thang, ngập, rò gas, điện giật) khớp ở bước 1 ⇒ trả hotline ngay + báo ca trực, không chờ agent. LLM chỉ được **thêm** cờ khẩn cấp, không được gỡ.
**Lật được:** không.

### Đ10 — 2026-09-24 · Pipeline v0.2: agent điều phối trọn vòng, ticket là trục (chỉ đạo người dùng)
Người dùng bác pipeline 10 bước vì agent chỉ chiếm 3 ô ⇒ "agent chưa có giá trị". Luồng chốt:
phản ánh → agent phân loại trách nhiệm (có trích dẫn) → **có:** đẩy ticket lên dashboard BQL · **không:** agent tạo **ticket case** → tạo **job ẩn danh** → **đăng thẳng nhóm thợ** → **chốt thợ** → agent **quay lại tạo ticket xin BQL cấp quyền ra vào** → BQL duyệt → agent giao việc (số căn + mã vào) → theo dõi, nghiệm thu, đóng case.
Hệ quả: (a) agent là tác nhân thực hiện MỌI bước qua tool; luật cứng nằm TRONG tool (BB-01 viết lại); (b) quyền vào tòa không còn tự cấp — chỉ qua ticket `access_request` BQL duyệt (BB-11); (c) PII chỉ mở sau khi BQL duyệt quyền vào; (d) bước "đồng ý + định giá" gộp vào bước tạo ticket case; khung giá là thông tin kèm cuốc, không phải cổng.
**Duyệt:** người dùng xem sơ đồ và bản ASCII ngày 2026-09-24, trả lời "pipline khá ổn" ⇒ Đ10 có hiệu lực.
**Lật được:** không trong vòng 0.1 — đây là định nghĩa sản phẩm.

### Đ11 — 2026-09-24 · Dựng dashboard BQL riêng + bộ dữ liệu mô phỏng, làm trước kết nối Zalo (người dùng duyệt)
BQL chưa có dữ liệu thật ⇒ dựng dashboard nhận ticket do agent chuyển đến (mockup `docs/images/09-dashboard-bql-mockup.png`: "Cần bạn làm ngay" · dòng thời gian việc agent đã làm · case đang chạy) + script seed dữ liệu MÔ PHỎNG (1 tòa, căn, cư dân, thợ, 30 ngày ticket), mọi màn hình gắn nhãn "MÔ PHỎNG", đổi sang dữ liệu thật bằng biến môi trường. Thứ tự gói đổi thành `P01 → P04 → P02` để có bản demo trọn luồng đi tìm BQL pilot mà chưa đụng rủi ro Zalo.
Người dùng nhận xét: "dashboard ổn nhưng chưa tối ưu và rối mắt — để fix sau" ⇒ tinh gọn UI vào roadmap Upcoming, không chặn P04.
**Lật được:** thứ tự gói, nếu đã có BQL pilot sẵn sàng. **Chi phí lật:** thấp.

### Đ12 — 2026-09-24 · Slot tháng ĐỒNG GIÁ, ai nhanh tay trước thì được (người dùng chốt) — ⚠️ THAY BỞI Đ13: chỉ còn là ghi chú kinh doanh
Mọi thợ muốn nhận cuốc ở một tòa đóng **cùng một khoản phí tháng** để giữ một slot theo (tòa × nhóm nghề). Không có hạng ưu tiên: trong nhóm thành viên, **"nhận" hợp lệ đầu tiên thắng** (BB-05). Không có nhóm mở cho thợ không slot. Số slot có **trần** theo nhu cầu thật để mỗi thành viên vẫn có đủ việc: `capacity = max(2, ceil(cuốc_dự_kiến_tháng / SLOT_MIN_JOBS_PER_VENDOR))`, xem lại hằng tháng; đầy ⇒ danh sách chờ theo thứ tự đăng ký. Doanh thu = phí slot (thay phí theo cuốc); BQL được chia `BQL_SHARE_PCT`. Thu tiền ngoài hệ thống, hệ thống ghi sổ (Đ05). Ưu đãi cho thợ mới: để sau (Idea Vault).
Lý do: người dùng chỉ ra phương án hai hạng (trả tiền để được ưu tiên 10 phút) sẽ hỏng khi ai cũng mua ⇒ ưu tiên mất nghĩa. Giá trị slot nằm ở **quyền được vào sàn có trần số người**, cạnh tranh công bằng bằng tốc độ.
**Lật được:** trần slot và phí tháng (cấu hình). **Chi phí lật:** thấp.

### Đ13 — 2026-09-24 · Trọng tâm là xây agent; mô hình kinh doanh ra khỏi phạm vi (người dùng chốt)
Người dùng: "chúng ta đã đi quá xa… cần đúng trọng tâm để xây dựng agent; FOMO chỉ là kế hoạch nói với nhà đầu tư, không còn là việc của chúng ta".
Hệ quả:
- **Ra khỏi phạm vi build:** slot tháng, phí, chia doanh thu, sổ phí (`ledger_entries`), FOMO, bài đo sẵn lòng trả tiền. Đ12 chuyển thành ghi chú kinh doanh (roadmap Idea Vault), không còn là hợp đồng kỹ thuật.
- **P00 (kiểm chứng tay) và cổng G0 ra khỏi phạm vi build** — là việc của đội kinh doanh; KHÔNG còn chặn P05. Hàng rào Đ07 bị thay.
- **Phát triển agent trên kênh giả lập trước** (`SimTransport`, 01-CONTRACTS §8): một màn chat dev đóng vai cư dân / nhóm thợ / BQL để chạy trọn pipeline v0.2 mà chưa cần Zalo. Zalo thật (P02) cắm vào sau qua cùng interface.
- **Dashboard (P04) thu về tối thiểu:** đủ cho 2 điểm người duyệt (ticket BQL, duyệt vào tòa), xem case + dòng thời gian agent, quy chế, duyệt thợ; dữ liệu mô phỏng giữ lại (Đ11).
- **Thứ tự mới:** `P01 (nền tảng + SimTransport) → P03 (agent bước 0–3) → P05 (agent bước 4–7) → P06 (bước 8) · P04 tối thiểu song song từ P03 → P02 (Zalo thật) → P07`.
**Lật được:** có — khi người dùng muốn đưa lại phần kinh doanh vào sản phẩm. **Chi phí lật:** thấp (bảng mới, không đổi pipeline).

### Đ14 — 2026-09-24 · Thu phí thợ vào nhóm (slot tháng đồng giá) có thời gian miễn phí đầu — TRONG phạm vi build (người dùng chốt)
Người dùng sửa Đ13: "vẫn phải có bài toán kinh tế thu phí thợ vào nhóm, nhưng cho free giữ slot trong một khoảng thời gian đầu".
- **Đưa lại vào phạm vi** cơ chế của Đ12: mọi thợ cùng một phí tháng `SLOT_FEE_MONTHLY` để giữ slot theo (tòa × nhóm nghề); không hạng ưu tiên, trong nhóm ai "nhận" hợp lệ trước thắng; trần slot `capacity = max(2, ceil(cuốc_dự_kiến_tháng / SLOT_MIN_JOBS_PER_VENDOR))` + danh sách chờ; BQL được chia `BQL_SHARE_PCT`; hệ thống chỉ **ghi sổ** (`ledger_entries`), thu tiền ngoài hệ thống (Đ05).
- **Mới — miễn phí thời gian đầu:** slot đầu tiên của một thợ tại (tòa × nhóm nghề) là **slot dùng thử** `is_trial=true`, phí 0, dài `FREE_TRIAL_DAYS` (cấu hình, người chốt). Dùng thử **vẫn chiếm chỗ** trong trần. Mỗi thợ chỉ được dùng thử **một lần** mỗi (tòa × nhóm nghề). Hết hạn dùng thử: agent nhắc trước 3 ngày; không trả phí ⇒ slot `expired`, gỡ khỏi nhóm, mời người đầu danh sách chờ.
- **Vẫn NGOÀI phạm vi (giữ Đ13):** FOMO/marketing (bảng tin tuần, chiến dịch kéo thợ), kiểm chứng thị trường P00/G0.
**Lật được:** độ dài dùng thử, phí, trần (đều là cấu hình). **Chi phí lật:** thấp.

### Đ15 — 2026-09-24 · Sổ lợi ích ba bên hiện hữu trong hệ thống (người dùng duyệt: "tốt, đã gần đúng ý")
Lợi ích kinh tế của từng bên phải **nhìn thấy được trong sản phẩm**, không chỉ nằm trong tài liệu (ảnh tham chiếu `docs/images/10-kinh-te-ba-ben.png`):
- **Cư dân — phiếu hoàn thành** gửi qua Zalo khi đóng case: giá đã trả so với khung giá tòa (giữa/khung), hạn bảo hành, "Phí dịch vụ: 0đ".
- **Thợ — bảng thu nhập tháng** agent nhắn riêng + lệnh "slot của tôi": số cuốc, tiền công (theo cư dân xác nhận), phí slot, **tỷ lệ thu nhập/phí**, điểm, bùng, hạn slot, độ dài danh sách chờ.
- **BQL — thẻ "Hiệu quả tháng"** trên dashboard: case agent xử lý trọn, giờ công ước tính (`MINUTES_PER_CASE_BASELINE`, gắn nhãn "ước tính"), lượt vào tòa có duyệt, tranh chấp, phần BQL từ phí slot, số slot dùng thử.
- **Luật cân bằng (tất định):** theo (tòa × nhóm nghề), thu nhập trung vị 30 ngày của mỗi slot / `SLOT_FEE_MONTHLY` < `MIN_EARNINGS_TO_FEE` ⇒ ngừng cấp slot mới + cảnh báo BQL; trở lại ≥ ngưỡng ⇒ mở lại.
- **Giá công bằng:** khung giá từ giá thật các cuốc đã đóng ở chính tòa; báo giá vượt khung >30% ⇒ agent hỏi cư dân trước khi chốt (đã có ở SPEC-P05 §2.6).
- Người dùng nói "gần đúng ý" ⇒ chi tiết hiển thị còn tinh chỉnh khi viết SPEC-P08; khung (3 bề mặt + luật cân bằng) đã chốt.
**Lật được:** ngưỡng và cách hiển thị (cấu hình/UI). **Chi phí lật:** thấp.

### Đ16 — 2026-09-24 · P01 có SPEC riêng (Super Orchestrator chốt, 🔴)
Khi soạn handoff P01 lộ ra các quyết định 01-CONTRACTS chưa nói: test không DB (`npm test`) tách khỏi test cần DB (`npm run test:db`, thiếu `DATABASE_URL` ⇒ đỏ, không skip); phiên đăng nhập = cookie HMAC tự viết, không NextAuth; SQL thuần, không ORM; SimTransport ở P01 chạy vòng vọng lại (`echoHandler`) để P03 chỉ thay handler; seed nền 1 tòa/20 căn/12 danh mục; DB dev cổng `127.0.0.1:55432`. Ghi tại [SPEC-P01](specs/SPEC-P01-Foundation.md). Kèm vá lỗi DDL: comment trong `job_categories` nuốt mất cột `default_mode` (01-CONTRACTS §4).
**Lật được:** mọi mục (chưa có mã phụ thuộc). **Chi phí lật:** thấp.

### Đ17 — 2026-09-24 · Chốt thi công P03 (Super Orchestrator, 🔴)
Ghi ở [SPEC-P03 §10](specs/SPEC-P03-Resident-Agent.md): (a) `processInbound` đổi sang nhận-trước-xử-lý-sau, mỗi tin tối đa một lần, LLM không chạy trong transaction — vá thiết kế SPEC-P01 §6 (handler trong transaction + outbox ghi ngoài transaction ⇒ trả lời trùng khi lỗi); (b) truy hồi quy chế chỉ từ khoá (port build phase), embedding để trống vì stack chỉ có Claude; (c) đồng ý của cư dân kiểm tất định trong tool `open_service_case` — giữ bước "Đồng ý" theo SPEC hiện hành cho tới khi người chốt khác; (d) quy chế `QC-DEMO` + cư dân mô phỏng để chạy trên kênh giả lập; (e) chưa có `ANTHROPIC_API_KEY` ⇒ golden cần LLM trả `blocked` (mã 3), golden khẩn cấp tất định chạy trong `npm test`.
**Lật được:** (c) khi người chốt bỏ bước đồng ý — chi phí thấp (một tool, một chuyển trạng thái); (b) khi chọn nhà cung cấp embedding — thêm cột dữ liệu, không đổi tool.

### Đ18 — 2026-09-24 · LLM mặc định là Gemini, qua cùng adapter (người dùng chốt)
Người dùng: "sử dụng key gemini" — máy không có credential Anthropic, chỉ có key Gemini. Hợp đồng ở [01-CONTRACTS §2b](specs/01-CONTRACTS.md): `callModel` giữ nguyên dạng vào/ra, chỉ `adapters/model.ts` dịch sang Gemini `generateContent` (functionCall ⇄ tool_use, giữ `thoughtSignature` trong vòng tool); `MODEL_PROVIDER=gemini` mặc định, `anthropic` vẫn chạy được. Model mặc định `gemini-3.6-flash` (build phase đo 2026-09-23: `3.5-flash` 429/503 liên tục, `3.6-flash` 200). Gemini không có `strict` ⇒ tool tự kiểm input theo schema.
**Hệ quả:** golden `diagnosis`/`responsibility` chạy được bằng model thật khi có key trong `.env`; embedding Gemini (`gemini-embedding-001`) mở đường truy hồi lai — vẫn để Idea Vault (Đ17 b), chưa làm.
**Lật được:** có — `MODEL_PROVIDER=anthropic` + key, đo lại golden. **Chi phí lật:** thấp (chỉ env).

### Đ19 — 2026-09-25 · Chốt câu hỏi mở R03 (Super Orchestrator, 🔴)
(1) SPEC-P03 §10.8 chỉ áp nhánh `anthropic`; Gemini theo 01-CONTRACTS §2b. (2) Không làm fallback phía server của Anthropic (SDK 0.68 không có `fallbacks`), dùng chung `MODEL_FALLBACKS` phía client; `max_tokens` 16000 cả hai nhánh. (3) `jobs.window_start/end` để NULL ở P03, chốt quy ước trong SPEC-P05 trước khi thi công P05. (4) G09/G10 chỉ đánh ✅ khi chấm qua vòng agent thật trên DB sim; máy chấm một lượt hiện có chỉ là khói cho adapter. Thi công: H04 (adapter Gemini) ∥ H05 (thẩm định P03).
**Lật được:** (2) khi SDK có `fallbacks` — chi phí thấp; (4) không nên lật — số một lượt không đo đúng agent.

### Đ20 — 2026-09-25 · Vòng 2 P03 sau thẩm định R05 (Super Orchestrator, 🔴)
Thẩm định R05 tìm 7 lệch chặn (C1–C7); SO đo lại C1/C2/C3/C5/C6/C7 trên mã thật ⇒ R03 🔁. Hợp đồng vá ở [SPEC-P03 §11](specs/SPEC-P03-Resident-Agent.md): khẩn cấp so theo ranh giới từ với hai danh sách có dấu/không dấu (bỏ từ đơn nhập nhằng `chay`, `khoi`); lượt khẩn cấp 0 lần gọi model, lượt sau chạy bình thường (G1); model đặt `emergency` ⇒ cùng đường, cờ đơn điệu; che PII theo mã căn thật trong DB + regex có dấu phân cách; citation phải cùng nhãn với `party`, quote lấy từ DB, quy chế gắn `building_id`; đồng ý phải là tin ở lượt SAU, khớp danh sách bằng nhau thay vì regex chứa.
**Lật được:** danh sách từ khẩn cấp/đồng ý — sửa SPEC §11.1/§11.5 rồi đo lại golden; chi phí thấp.

### Đ21 — 2026-09-25 · Hiểu ý bằng model, luật giữ bằng code (người dùng: "bắt key rất khó và dễ sai, cần phương án bắt đúng ý định của mọi người")
Thêm lớp hiểu ý `triageMessage` (model rẻ, JSON, quá hạn 4 s) cho mọi tin cư dân: phát hiện khẩn cấp theo ý nghĩa và nhận diện đồng ý/từ chối/hoãn/hỏi lại. Từ khoá lùi về vai lưới an toàn ưu tiên chính xác (không chờ model — Đ09 giữ nguyên). Đồng ý = luật lượt sau (code) + ý định `consent` độ tin ≥ 0.8 (model) hoặc câu khớp danh sách. Golden đổi thước đo: ≥100 ca khẩn cấp + ≥40 ca đồng ý, chấm bằng model thật. Chi tiết: [SPEC-P03 §11.1, §11.5, §11.10](specs/SPEC-P03-Resident-Agent.md).
**C1 giữ nguyên** (người dùng hỏi): BQL không ăn tiền cuốc, nhưng thu phí slot thợ ⇒ càng nhiều việc bị đẩy sang "cư dân trả" thì slot càng có giá ⇒ cư dân sẽ nghi. Trích dẫn buộc chặt kết luận là thứ giữ lòng tin đó.
**Lật được:** có — tắt lớp 2 bằng env, quay về chỉ lưới từ khoá; chi phí thấp.

### Đ22 — 2026-09-25 · Đưa P02 (Zalo thật) lên chạy song song, giai đoạn 1 chỉ `bql` (người dùng: "ok làm đi")
Lý do: P03 đã duyệt, P02 không phụ thuộc P05/P06; rủi ro Zalo là ẩn số lớn nhất ⇒ gặp sớm. Giai đoạn 1 ([SPEC-P02 §9](specs/SPEC-P02-Zalo-Transport.md)): tài khoản `bql`, máy dev IP nhà, chỉ text, không pg-boss (runner `core:run` tuần tự + cột `login_requested_at`), gắn Zalo thật vào cư dân mô phỏng bằng `dev:link-zalo`; thử bằng Zalo phụ của người dùng, chưa mời cư dân thật (Luật 91/2025, OPERATIONS §9). Chạy song song với gói máy chấm model thật.
**Lật được:** có — `TRANSPORT=sim`; chi phí thấp.

### Đ23 — 2026-09-25 · Cột `jobs.category_code` là nguồn chân lý của danh mục (Super Orchestrator, 🔴)
Lý do: lượt chấm model thật đầu tiên (H08) ra chẩn đoán 0/40 vì `save_job_draft` chỉ ghi danh mục vào JSON `draft`, không ghi cột — lỗi sản phẩm (khung giá ticket case luôn rỗng, P05 ghép thợ sẽ gãy), không chỉ lỗi máy chấm. Hợp đồng: [SPEC-P03 §11.11](specs/SPEC-P03-Resident-Agent.md). Giao trong H08 vòng 2 (worker trước bị ngắt giữa lượt chấm); H08 được mở phạm vi thêm `save_job_draft.ts` + test.
**Lật được:** có — chỉ một câu lệnh ghi trong tool.

### Đ24 — 2026-09-25 · Thêm nhà cung cấp OpenRouter, chấm lại bằng CÙNG model Gemini (người dùng đưa key OpenRouter: "lấy tạm key này… model nào cũng được, nhẹ chút")
Lý do: key Gemini trực tiếp hết hạn mức giữa lượt chấm H08 (429 cả 3 model). OpenRouter có `google/gemini-3.6-flash` ⇒ SO chọn chấm lại bằng CÙNG model (số so được với lượt 1 và với mặc định sản phẩm) thay vì `gpt-4o-mini` (rẻ hơn nhưng số đo không nói gì về model đang dùng; đổi sang được bằng `MODEL_DEFAULT`). Chi phí ước ~1 USD/lượt đủ 4 bộ. Hợp đồng: [01-CONTRACTS §2c](specs/01-CONTRACTS.md); giao H10. Mặc định sản phẩm vẫn `gemini`.
**Lật được:** có — bỏ `MODEL_PROVIDER=openrouter`.

### Đ25 — 2026-09-25 · Chấm bằng DeepSeek qua Vyce AI (người dùng: "thêm api key của vyce đi… chọn deepseek cũng được k sao")
Lý do: Gemini hết quota, OpenRouter 0 USD. Vyce là proxy dạng OpenAI ⇒ nhánh `vyce` dùng chung phần dịch của §2c; model `deepseek-v4-flash`. Hệ quả: lượt chấm vòng 3 của H08 chạy LẠI ĐỦ 4 bộ bằng cùng một model (không ghép số Gemini lượt 1 với DeepSeek), và G08–G10 ✅ chỉ có giá trị cho cặp `vyce/deepseek-v4-flash`. Nhánh `vyce` chỉ chạy với `DATA_MODE=sim` (proxy bên thứ ba). Hợp đồng: [01-CONTRACTS §2d](specs/01-CONTRACTS.md); giao H11.
**Lật được:** có — bỏ `MODEL_PROVIDER=vyce`.

### Đ26 — 2026-09-25 · Cổng G08–G10 chấm bằng Gemini 3.6 flash; DeepSeek qua Vyce bị loại (Super Orchestrator, 🔴)
Lý do: vòng 3 H08 bằng `vyce/deepseek-v4-flash` — khẩn cấp bỏ sót 1 + báo nhầm 8%, đồng ý nhận nhầm 2, chẩn đoán 2/40 (hỏi dồn 3 câu, không lưu nháp sớm, triage độ tin mâu thuẫn), triage quá hạn 11% dù 8 s. Là chất lượng model, không phải adapter (tool có được gọi). Không sửa prompt cho model không dùng thật (dễ làm lệch hành vi trên Gemini). Nhánh `vyce` giữ trong mã (R11 ✅) nhưng KHÔNG dùng cho agent cư dân. Lượt chấm kế: Gemini 3.6 flash (trực tiếp khi có quota/billing, hoặc OpenRouter khi có tín dụng), đủ 4 bộ, prompt đang treo.
**Lật được:** có — model khác phải chấm đủ 4 bộ đạt ngưỡng mới dùng.

### Đ27 — 2026-09-25 23:17 · Chốt thi công P05 (bước 4–7) trên kênh giả lập + P04 tối thiểu (Super Orchestrator giao, architect soạn — CHỜ DUYỆT)
Hợp đồng ở [SPEC-P05 §10](specs/SPEC-P05-Dispatch.md) và [SPEC-P04 §8](specs/SPEC-P04-Vendor-Console.md); bổ sung [01-CONTRACTS](specs/01-CONTRACTS.md) §1/§4/§5/§6/§7/§8/§9, [TESTING](specs/TESTING-ACCEPTANCE.md) §2–§4, §6, [OPERATIONS](specs/OPERATIONS.md) §2–§3. Các quyết định chính:
- **Hiểu ý thợ bằng model (Đ21 áp cho thợ):** `triageVendorMessage` (route `triage`) + agent thợ (route `vendor_parse`) gọi tool; code chỉ là lưới tất định (trích mã cuốc `C-XXXX`, đọc giá, danh sách cụm khớp BẰNG NHAU) và bằng chứng ý định nằm TRONG tool (`IntentNotConfirmedError`). Thay SPEC-P05 §2.1, 01-CONTRACTS §7, SPEC-P02 §3.5 (luật bắt tin nhóm 3 điều kiện thay regex).
- **Tác nhân:** agent cư dân đăng nhóm (`publish_job_to_group`, cùng lượt sau `open_service_case`) và trả lời báo giá vượt khung (`respond_to_quote`); agent thợ chốt (`claim_job` UPDATE có điều kiện BB-05 + 7 điều kiện BB-10), xác nhận, xin cấp quyền, giao việc (`dispatch_to_vendor` do **sự kiện hệ thống** `access_approved` — dòng `inbound_events` `sender_uid='system'` — kích hoạt sau khi BQL duyệt); timer và BQL là tác nhân đúng các dòng 01-CONTRACTS §5; ba lưới an toàn (đăng/xin quyền/phát lại) có audit riêng để đo tần suất agent quên.
- **Đồng hồ không pg-boss:** `runTimers(now)` trong runner `core:run` (`TIMER_INTERVAL_MS`), tham số `now` ⇒ test bằng đồng hồ giả; `/api/dev/sim/tick` cho demo. Hạn giữ `HOLD_MINUTES=10`, `DISPATCH_TIMEOUT_MIN=45` (07–21h, ngoài giờ tới 08:00), nhắc BQL `ACCESS_REMIND_MIN=30`.
- **Quy ước `jobs.window_start/end` (chốt Đ19-3):** ghi bởi `open_service_case(window_start, window_end, note)` ISO 8601; NULL tới `case_open`, bắt buộc từ đó; agent cư dân nhận mốc "Bây giờ" trong ngữ cảnh. Bằng chứng đồng ý = chuỗi tin sau mốc `awaiting_consent` (mới nhất trước), không chỉ tin cuối.
- **Slot (Đ14) trên bảng đã có:** migration 006 chỉ thêm `vendor_groups`, cột đồng hồ và `reminded_at`; dùng thử 1 lần theo `one_trial_ever`; gia hạn = slot cũ `expired` + slot mới nối ngày; "Đã thu phí" chỉ trên web (2 dòng ledger); tham số phí GIẢ chờ người chốt.
- **P04 tối thiểu:** `/tickets` duyệt/từ chối `access_request` (lý do bắt buộc), `/gate` (thay `/passes`), `/vendors` + "Đã thu phí"/duyệt/đình chỉ/đặt trần, `/jobs` (🟢), SimBoard thêm khung DM thợ + chọn nhóm + Tick.
- **WP:** P05-B nền (🟠) → P05-C agent thợ (🟠, review prompt 🔴) ∥ P05-E web (🟠) → P05-D phía cư dân (🟠, **chờ H08 nhả `prompts/resident.ts`**, chấm lại 1 lượt golden sau khi đổi prompt) → P05-F thẩm định đối kháng (🔴). Số đo architect đã chạy thử trên DB tách riêng: đua 200 claim/50 cuốc ⇒ 0 hai người thắng (bản hỏng: 20), đua 50 xin slot/1 chỗ ⇒ 1+49, G12b bắt 2 dòng xấu.
- 🖐 Câu hỏi mở Q1–Q10 tại SPEC-P05 §10.16 (tham số phí; thợ bị từ chối có nhận lại cuốc; lời mời chờ có giữ chỗ; hạn im lặng giá; trần giá; 4 nhóm Zalo/tòa; giờ hành chính…), mỗi câu có giá trị TẠM để thi công không kẹt.
**Lật được:** lớp hiểu ý thợ (tắt bằng `VENDOR_INTENT_MIN=1.01` ⇒ chỉ còn cụm an toàn) — chi phí thấp; sự kiện hệ thống ⇒ gọi thẳng dịch vụ từ route duyệt — chi phí thấp nhưng bỏ bước 7 khỏi agent (trái Đ10). Mọi hằng số là env.

### Quyết định bị thay thế
| Mốc cũ | Phát biểu cũ | Thay bằng | Lý do |
| :-- | :-- | :-- | :-- |
| Đ03 (bản đầu) | "LLM chỉ đề xuất, code quyết định" ⇒ pipeline 10 bước, 7 bước là dịch vụ | Đ10 | Agent phải là người điều phối; luật chuyển vào trong tool thay vì tước bước khỏi agent |
| 00-ARCH §4 bản đầu | Hệ thống tự cấp thẻ vào tòa khi thợ xác nhận | Đ10 (b) | BQL giữ quyền duyệt người vào tòa |
| SPEC-P05 bản đầu | Nhắn riêng top 3 thợ song song với đăng nhóm | Đ10 | Đăng thẳng nhóm thợ; nhắn riêng vào Idea Vault |
| Đ05 + SPEC-P06 bản đầu | Thu phí theo từng cuốc (`LEAD_FEE`) | Đ12 | Phí slot tháng đồng giá |
| Đ07 | P00/G0 chặn thi công P05 | Đ13 | P00/G0 là việc kinh doanh, ngoài phạm vi build |
| Đ12 | Slot tháng đồng giá là hợp đồng kỹ thuật (bảng, luật dispatch, G15) | Đ13 | Chỉ còn là ghi chú kinh doanh cho nhà đầu tư |
| Đ13 (phần phí) | Phí, slot, sổ phí ra khỏi phạm vi build | Đ14 | Người dùng: vẫn phải thu phí thợ vào nhóm, có miễn phí thời gian đầu; chỉ FOMO/marketing và P00/G0 là ngoài phạm vi |
| SPEC-P01 §6 "Xử lý" | `processInbound` gọi handler trong transaction khoá dòng | Đ17 (a) | Trả lời trùng khi handler lỗi; giữ khoá suốt lượt LLM |
| 00-ARCH §1 | "P01 không có SPEC riêng" | Đ16 | Quyết định P01 cần chỗ ghi có hợp đồng |
| Đ13 (thứ tự) | Zalo thật chỉ cắm sau khi agent chạy trọn bước 0→8 trên kênh giả lập | Đ22 | Người dùng muốn thấy Zalo sớm; rủi ro Zalo cần gặp sớm |
| SPEC-P02 §2.1, §3.4 | pg-boss cho đăng nhập QR và làn xử lý tin | Đ22 (§9.2) | P03 cấm pg-boss tới P07; một runner tuần tự đủ cho giai đoạn 1 |
| SPEC-P03 §11.1 bản Đ20 | Khẩn cấp chỉ bằng hai danh sách từ khoá; CẤM LLM phát hiện khẩn cấp | Đ21 | Người dùng: từ khoá không bắt được ý định thật; model hiểu ý, từ khoá thành lưới an toàn |
| SPEC-P03 §1, §10.2, §10.3 | `EMERGENCY_TERMS` so chuỗi con sau bỏ dấu; regex PII hẹp; `CONSENT` là regex chứa | Đ20 (§11) | Thẩm định R05: bỏ sót 11/12, báo nhầm 8/8; lọt 16/20 PII; 6/8 câu phủ định mở được case |
| SPEC-P03 §10.8 | Fallback phía server `fallbacks: 'default'` | Đ19 (2) | SDK đã cài không có trường; dùng `MODEL_FALLBACKS` phía client |
| SPEC-P03 §10.6 | Golden một lượt `callModel` đủ để chấm G09/G10 | Đ19 (4) | Không đo vòng tool thật của agent |
| Đ06 (LLM) | LLM mặc định Claude `claude-opus-5` | Đ18 | Chỉ có key Gemini; Claude giữ làm lựa chọn qua env |
| Đ11 (thứ tự) | `P01 → P04 → P02` | Đ13 | Agent trước: `P01 → P03 → P05 → P06`, P04 tối thiểu song song, Zalo sau |
| Đề xuất Đ12 bản nháp (chat) | Hai hạng: thành viên trả tiền được ưu tiên 10 phút, nhóm mở cho thợ thường | Đ12 | Ai cũng mua thì ưu tiên mất nghĩa — người dùng bác |
| `docs/DESIGN.md` v0.1 | Trợ lý BQL tổng quát: booking tiện ích, hỏi đáp, ticket | Đ01 | Người dùng chọn ngách sàn việc thợ; booking tiện ích vào Idea Vault; hỏi đáp chỉ còn phần quy chế trách nhiệm; ticket BQL là nhánh rẽ |
| Hội thoại 2026-09-24 | "Bỏ cơ chế ai nhanh người đó ăn" | Đ04 | Tốc độ chốt là giá trị, an toàn khi việc đã chuẩn hoá và thợ đã duyệt |
| `docs/DESIGN.md` v0.1 | Một tài khoản Zalo | Đ02 | Tách rủi ro khoá tài khoản |
| SPEC-P05 §2.1, 01-CONTRACTS §7 (đoạn "parse tất định"), 00-ARCH §4 bước 5 + §7 | Worker parse tất định `nhận C-XXXX`/`OK` thành sự kiện; "chỉ parse lệnh nhận <mã>" | Đ27 (SPEC-P05 §10.4) | Đ21 của người dùng: bắt từ khoá khó và dễ sai — model hiểu ý, code là lưới tất định + luật trong tool (SO đồng bộ 00-ARCH — ngoài phạm vi architect) |
| SPEC-P02 §3.5 | Nhóm `market`: chỉ đưa vào pipeline tin khớp regex nhận/ok, tin khác không lưu | Đ27 (SPEC-P05 §10.4.3): bắt tin nhóm khi có mã cuốc, người gửi đang giữ cuốc, hoặc nhóm có cuốc đang đăng | Regex không bắt được cách nói của thợ; luật 3 điều kiện vẫn không lưu lịch sử nhóm (SO đồng bộ SPEC-P02) |
| SPEC-P04 §4 | Trang bảo vệ `/passes` | Đ27: `/gate` | Code P01 (`policy.ts`, `app/gate`) đã dùng `/gate` (SPEC-P01 §7) |
| SPEC-P05 §5 + `.env.example` | `DISPATCH_TIMEOUT` 45 phút / `DISPATCH_TIMEOUT_MIN=30` | Đ27: `DISPATCH_TIMEOUT_MIN`, mặc định 45 | Một tên, một số; `.env.example` sửa cùng WP-B |
| 01-CONTRACTS §7, SPEC-P03 §11.5 (cách thi công) | `open_service_case(window_options, note)`; đồng ý chỉ xét tin mới nhất `ctx.latestText` | Đ27 (SPEC-P05 §10.7): `open_service_case(window_start, window_end, note)` ISO ghi `jobs.window_*`; bằng chứng đồng ý = chuỗi tin sau mốc, mới nhất trước | Cần khung giờ cho thẻ cuốc/mã vào (Đ19-3); "đồng ý" rồi lượt sau chọn giờ bị từ chối oan |
| Đ19 (3) | `jobs.window_start/end` để NULL ở P03, chốt ở SPEC-P05 | Đ27 §10.2.2 | Đã chốt quy ước |
| 01-CONTRACTS §5 | `confirmed` chỉ có đường `→ access_pending` / `→ cancelled` | Đ27: thêm `confirmed → published` (thợ rút / BQL đình chỉ) | Không có đường thoát khi thợ rút hoặc bị đình chỉ sau xác nhận |
| 01-CONTRACTS §8, OPERATIONS §2 | pg-boss cho timer cuốc | Đ27 (SPEC-P05 §10.8): `runTimers(now)` trong runner `core:run` | Đ22 đã bỏ pg-boss; đồng hồ tham số hoá để test |
| 01-CONTRACTS §7 | `publish_job_to_group` thuộc bảng tool phía thợ; `set_availability`, `register_vendor` trong P05 | Đ27: `publish_job_to_group` là tool agent cư dân (cùng lượt sau `open_service_case`); onboarding thợ dời SPEC-P04 §3 gói sau | Bước 4 do agent đang nói với cư dân thực hiện; đăng ký thợ không cần cho kênh giả lập (seed) |

## 3. Work Packages

| Gói | Nội dung | Tầng | Phụ thuộc | SPEC |
| :-- | :-- | :-- | :-- | :-- |
| P00 | ~~Kiểm chứng tay~~ — **ngoài phạm vi build (Đ13)**, bàn giao đội kinh doanh | — | — | [SPEC-P00](specs/SPEC-P00-Concierge-Validation.md) (tham khảo) |
| P01 | Nền tảng: monorepo, Postgres, migrations, 3 adapter, **SimTransport + màn chat dev**, auth web, audit log | 🟠 | — | [SPEC-P01](specs/SPEC-P01-Foundation.md) · [01-CONTRACTS](specs/01-CONTRACTS.md) §1–§4, §8 · [OPERATIONS](specs/OPERATIONS.md) §2–§3 |
| P02 | Zalo Transport: worker, đăng nhập QR qua web, hàng đợi vào, outbox pacer, watchdog | 🔴 | P01 | [SPEC-P02](specs/SPEC-P02-Zalo-Transport.md) |
| P03 | Agent cư dân (bước 1–3): khẩn cấp, chẩn đoán, phân loại trách nhiệm có trích dẫn, ticket BQL / ticket case | 🔴 hợp đồng · 🟠 thi công | P01, P02 | [SPEC-P03](specs/SPEC-P03-Resident-Agent.md) |
| P04 | Dashboard BQL **tối thiểu**: 2 điểm duyệt, case + dòng thời gian agent, quy chế, duyệt thợ, **thợ & slot + sổ phí (Đ14)**, dữ liệu mô phỏng | 🟠 | P01 | [SPEC-P04](specs/SPEC-P04-Vendor-Console.md) |
| P05 | Job ẩn danh → nhóm thợ giữ slot → chốt → ticket cấp quyền → giao việc (bước 4–7) + luật slot/dùng thử (Đ14) | 🔴 | P03, P04 | [SPEC-P05](specs/SPEC-P05-Dispatch.md) |
| P06 | Theo dõi, nghiệm thu, đóng case (bước 8), điểm thợ, giá thật | 🟠 | P05 | [SPEC-P06](specs/SPEC-P06-Execution-Settlement.md) |
| P08 | Sổ lợi ích ba bên (Đ15): phiếu hoàn thành cư dân, bảng thu nhập thợ, thẻ "Hiệu quả tháng" BQL, luật cân bằng slot | 🟠 | P05, P06 | SPEC-P08 — **chưa viết** |
| P07 | Eval golden + deploy VPS + backup + cảnh báo | 🟠 | chạy dọc | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) · [OPERATIONS](specs/OPERATIONS.md) |

Thứ tự bắt buộc (Đ13, Đ15): `P01 (nền tảng + SimTransport) → P03 → P05 → P06 → P08`; P04 tối thiểu song song từ P03; `P02` (Zalo thật) sau khi agent chạy trọn trên kênh giả lập; P07 chạy dọc. P00 ngoài phạm vi build.

## 4. Checklist thực thi

- [x] Cài não brain4agent v1.13.1 (template 1.7.1), `--check` = `NÃO ĐÃ OK`
- [x] Dựng bộ SPEC (00, 01, P00, P02–P06, OPERATIONS, TESTING-ACCEPTANCE)
- [x] 🖐 Người dùng duyệt pipeline v0.2 (Đ10) — 2026-09-24
- [x] 🖐 Người dùng duyệt Đ11 (dashboard + mô phỏng) và Đ12 (slot đồng giá) — 2026-09-24
- [ ] 🖐 Người chốt: có giữ bước cư dân "Đồng ý" (SPEC-P03 §4) hay không
- [ ] 🖐 Người chốt tham số phí (Đ14, Đ15): `FREE_TRIAL_DAYS`, `SLOT_FEE_MONTHLY`, `SLOT_MIN_JOBS_PER_VENDOR`, `BQL_SHARE_PCT`, `MIN_EARNINGS_TO_FEE`, `MINUTES_PER_CASE_BASELINE`
- [x] 🖐 Người dùng duyệt Đ15 (sổ lợi ích ba bên) — 2026-09-24
- [ ] Viết SPEC-P08 (Đ15) + gate G17
- [x] 🖐 `git init` + remote riêng tư `github.com/tuanank2112-crypto/lenqclaw` — commit nền `478bf32` đã push (2026-09-24)
- [x] Viết [SPEC-P01](specs/SPEC-P01-Foundation.md) (Đ16)
- [x] P01 — nền tảng + SimTransport (G01–G03 ✅ local; phần P01 của G16 = `runScenario(echo.jsonl)`) — `2cfbbe2`, R01 ✅ 2026-09-24 23:39:41 (vòng 2 sau thẩm định R02)
- [ ] P03 — Agent cư dân bước 0–3 (G08–G10) — MÃ ĐÃ DUYỆT (R03 ✅ sau thẩm định R05 + vòng 2 H06, head `65fe108`); gate G08–G10 còn chờ máy chấm model thật (dòng dưới)
- [x] H04 — adapter Gemini theo 01-CONTRACTS §2b (Đ18, Đ19) + `MODEL_FALLBACKS` + khói golden bằng model thật (key đã ở `.env`) — thi công `390dc54..0fe11a5`, R04 🔁 (test:db đỏ 9/21 + chưa nối kiểm input, do phạm vi SO) ⇒ vá ở H06 mục 0; R04 ✅ 2026-09-25
- [x] H05 — thẩm định P03: R05 ✅ (7 chặn, 14 nên sửa) ⇒ R03 🔁 — 2026-09-25
- [x] P03 vòng 2 theo SPEC-P03 §11 (Đ20, Đ21 lớp hiểu ý) — H06 `f396bb5..65fe108` (2 vòng), R06 ✅, R03 ✅ — 2026-09-25; `npm test` 173, `test:db` 76, 0 skip
- [ ] H08 — Máy chấm model thật (Đ19-4 + Đ21): G09/G10 qua vòng agent thật, golden emergency hai lớp (≥100) + consent (≥40); vá `eval_golden` gọi `searchRegulations` thiếu `buildingId` (R06 Q3); lệch sót sau R06: `handoff_to_staff` ghi cứng 30 phút thay vì env `HUMAN_TAKEOVER_MIN` mặc định 60 (§11.6) + `.env.example` thiếu `MODEL_TRIAGE`/`TRIAGE_*`/`HUMAN_TAKEOVER_MIN` — mở khoá G08–G10 · vòng 1 bị ngắt 12:31 (khẩn cấp 100/100, đồng ý 42/44, chẩn đoán 0/40 do lỗi cột — Đ23) ⇒ vòng 2
- [x] Chốt câu hỏi mở R03 (Đ19, 2026-09-25): (1) SPEC-P03 §10.8 còn ghi `claude-opus-5` ⇒ đồng bộ theo Đ18; (2) SDK `@anthropic-ai/sdk@0.68.0` không có `fallbacks` ⇒ nhánh anthropic dùng `MODEL_FALLBACKS` phía client; (3) quy ước `jobs.window_start/end` từ khung giờ gợi ý — trước P05; (4) `eval_golden` chấm một lượt đơn, chưa chạy vòng tool của agent thật — xét lại khi thẩm định
- [x] H10 — nhánh OpenRouter trong adapter model (01-CONTRACTS §2c, Đ24) — `da8faac`, R10 ✅ 2026-09-25; `npm test` 245, `test:db` 122
- [x] 🖐 Tín dụng model cho lượt chấm vòng 3 H08 — người dùng đưa key Vyce (Đ25), 2026-09-25
- [x] H11 — nhánh `vyce` (01-CONTRACTS §2d) dùng chung phần dịch OpenAI của §2c — `ffbd609`, R11 ✅ 2026-09-25; `npm test` 251, `test:db` 122
- [x] H08 vòng 3 — chấm bằng `vyce/deepseek-v4-flash` ⇒ trượt 3 bộ, dừng (Đ26) — `c367fea`
- [ ] 🖐 Quota/billing Gemini ⇒ H08 vòng 4 chấm đủ 4 bộ bằng Gemini 3.6 flash, phán R08
- [ ] 🖐 SO duyệt Đ27 (SPEC-P05 §10 + SPEC-P04 §8) và chốt/giữ giá trị tạm Q1–Q10 (SPEC-P05 §10.16)
- [ ] P04 tối thiểu cho P05 — WP P05-E (SPEC-P04 §8, 🟠; `/jobs` 🟢): `/tickets` duyệt/từ chối, `/gate`, `/vendors` + "Đã thu phí", policy, SimBoard, `/api/dev/sim/tick` — G07
- [ ] P05-B — nền: migration 006, dịch vụ dispatch/access/slots/timers, PiiGate, seed thợ, `sim_claims.mjs`, máy đo mở rộng (SPEC-P05 §10.12, 🟠) — G11, G12, G12b, G15
- [ ] P05-C — agent thợ: triage thợ, `vendor-agent`, 9 tool, golden `vendor_intent.jsonl` + `scripts/eval/vendor-intent.mjs` (🟠 thi công, 🔴 review prompt/golden)
- [ ] P05-D — phía cư dân: `open_service_case` ISO + bằng chứng đồng ý, `publish_job_to_group`, `respond_to_quote`, mốc thời gian, prompt `resident.ts` (🟠, CHỜ H08 nhả file; chấm lại 1 lượt `eval:golden` sau khi đổi prompt) — G16a
- [ ] P05-F — thẩm định đối kháng P05 (🔴, agent khác, ≥3 cách phá)
- [ ] P06 — Bước 8 (G13, G16 trọn bước 0→8 trên kênh giả lập)
- [ ] P08 — Sổ lợi ích ba bên (G17)
- [x] P02 giai đoạn 1 — mã + test máy (SPEC-P02 §9, Đ22): H07 `a60731e..bf58e37` (2 vòng), R07 ✅ 2026-09-25; zca-js 2.2.0; `npm test` 229, `test:db` 110
- [ ] 🖐 P02 giai đoạn 1 — nghiệm thu người: QR ✅, nhận tin + `REGISTER_REPLY` ✅, tin nhóm bị bỏ ✅, `dev:link-zalo` ✅ (2026-09-25); CÒN thử agent chẩn đoán + khẩn cấp qua Zalo thật (`evidence/P02/live.txt`)
- [x] H09 — UI Zalo (SPEC-P02 §9.8): đăng xuất (G18), trạng thái QR (G19), migration 005 — `d6b8cb5..a7c3bc6` (2 vòng: vòng 1 🔁 test DB web chập chờn), R09 ✅ 2026-09-25; `npm test` 238, `test:db` 122
- [ ] 🖐 H09 — thử người trên `/zalo`: đăng nhập → đăng xuất → đăng nhập lại
- [ ] `.env.example` `PACER_*`/`ZALO_ACCOUNTS`, `PACER_MAX_PER_MINUTE` 20→10, bỏ `PACER_MIN_INTERVAL_MS` (SO, sau khi H08 nhả file)
- [ ] P02 giai đoạn 2 — `market` + nhóm thợ + ảnh (cùng P05) (G04–G06 đủ)
- [ ] P07 — deploy VPS, mọi gate cột `vps` ✅ (G14)
- [ ] Đồng bộ não (Ma Trận 6 Điểm) + changelog `0.1.0`

## 5. Bảng trỏ SPEC

| File | Nội dung |
| :-- | :-- |
| [specs/SPEC-P01-Foundation.md](specs/SPEC-P01-Foundation.md) | Công cụ, compose dev, migrate/seed, adapter, máy trạng thái, SimTransport, auth 3 vai, máy đo, test P01 |
| [specs/00-ARCHITECTURE.md](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, pipeline v0.2 (8 bước, agent điều phối), bất biến BB-01…BB-11, router thứ tự đọc |
| [specs/01-CONTRACTS.md](specs/01-CONTRACTS.md) | Layout repo, adapter, DDL, máy trạng thái cuốc, kiểu TS, tool agent, Transport, bảng lỗi |
| [specs/SPEC-P00-Concierge-Validation.md](specs/SPEC-P00-Concierge-Validation.md) | Quy trình kiểm chứng tay, mẫu tin, số đo, ngưỡng G0 |
| [specs/SPEC-P02-Zalo-Transport.md](specs/SPEC-P02-Zalo-Transport.md) | Worker, phiên, hàng đợi, pacer, watchdog, nhường người thật |
| [specs/SPEC-P03-Resident-Agent.md](specs/SPEC-P03-Resident-Agent.md) | Bước 1–4 |
| [specs/SPEC-P04-Vendor-Console.md](specs/SPEC-P04-Vendor-Console.md) | Onboarding thợ, console BQL |
| [specs/SPEC-P05-Dispatch.md](specs/SPEC-P05-Dispatch.md) | Bước 5–7 |
| [specs/SPEC-P06-Execution-Settlement.md](specs/SPEC-P06-Execution-Settlement.md) | Bước 8–10 |
| [specs/OPERATIONS.md](specs/OPERATIONS.md) | VPS, compose, tài khoản Zalo, runbook, backup, rollback |
| [specs/TESTING-ACCEPTANCE.md](specs/TESTING-ACCEPTANCE.md) | Ma trận test, golden, Exit Gates theo môi trường |
