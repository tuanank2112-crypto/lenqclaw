# TESTING-ACCEPTANCE — Ma trận test & Exit Gates

> "Xong" = lệnh chạy ra số, số đạt ngưỡng, bằng chứng nằm trong `evidence/<gói>/`. Không có bằng chứng ⇒ chưa xong.

## §1. Cổng chạy không cần DB/LLM (mọi gói)

| Lệnh | Kỳ vọng |
| :-- | :-- |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (không cần `DATABASE_URL`) |
| `npm test` | 0 fail, 0 skip; số test không giảm so với lần trước |
| `node scripts/check_adapter_boundary.mjs` | `violations: 0` (BB-04, BB-07) |
| `node scripts/check_agent_tools.mjs` | `pii_keys_in_jobcard: 0`, `forbidden_tools: 0` (BB-01, BB-02) |

Mỗi bộ đo mới phải có bằng chứng **ĐỎ** trên hệ cố tình hỏng ít nhất một lần (lưu `evidence/<gói>/red-*.txt`).

## §2. Ma trận test theo gói

| Gói | Test bắt buộc |
| :-- | :-- |
| P01 | `SimTransport` chạy được kịch bản; migrations chạy từ rỗng; chuyển trạng thái sai `from` ⇒ `ConflictError`; audit log ghi đủ |
| P02 | chống trùng; nhận diện theo `(account, uid)`; giả mạo "[userId: …]" không đổi danh tính; pacer không vượt bảng SPEC-P02 §5; 3003 ⇒ `kicked` không tự QR; `is_self` ⇒ bot im 30 phút |
| P03 | khẩn cấp tất định; verdict không citation ⇒ `unclear`; nguồn hết hiệu lực ⇒ `unclear`; ≤3 câu hỏi; không hứa giá cố định |
| P04 | phân quyền 3 vai; thợ `pending` bị từ chối; tải quy chế tách đúng mục |
| P05 | `sim_claims` 200/50; hết hạn giữ; `dispatch_to_vendor` khi ticket cấp quyền `open`/`rejected` ⇒ `AccessNotApprovedError`; BQL từ chối ⇒ đăng lại; `PiiGateError` khi dựng tin có PII sớm |
| P06 | đầu-cuối 5 cuốc trên kênh giả lập; price_book và vendor_scores cập nhật; nhắc bảo hành |

## §3. Golden sets (`evals/golden/`)

| Bộ | Số ca | Ngưỡng | Nguồn ca |
| :-- | :-- | :-- | :-- |
| `emergency.jsonl` | 20 (10 khẩn cấp, 10 gần giống nhưng không) | 10/10 bật, ≤1 báo nhầm | tự soạn, có ca không dấu/viết tắt |
| `diagnosis.jsonl` | 40 | ≥ 85% đúng `category_code`; ≤ 3 câu hỏi | tin thật từ P00 (đã ẩn danh) + ca soạn |
| `responsibility.jsonl` | 30 | ≥ 90% đúng `party`; 100% verdict chắc chắn có citation hợp lệ; ca thiếu/mâu thuẫn quy chế ⇒ `unclear` 100% | cần quy chế thật của tòa pilot |
| `pii_probe.jsonl` | 15 (cư dân tự gửi số căn/SĐT trong mô tả) | 0 rò vào `JobCard`/tin gửi thợ trước `confirmed` | tự soạn |

Chấm bằng `scripts/eval_golden.mjs` (một bộ chấm duy nhất, mẫu từ build phase `lib/eval/score.ts`). Lỗi hạ tầng (429/5xx) ⇒ `blocked`, KHÔNG tính trượt; mã thoát 3 = chưa kết luận.

## §4. Exit Gates

| Gate | Nội dung | local | vps |
| :-- | :-- | :-- | :-- |
| G01 | Cổng §1 xanh trên cây sạch | ⬜ | ⬜ |
| G02 | Migrations từ rỗng + seed | ⬜ | ⬜ |
| G03 | Auth 3 vai + audit log | ⬜ | ⬜ |
| G04 | Transport: chống trùng, nhận diện, ảnh an toàn | ⬜ | ⬜ |
| G05 | Pacer đúng bảng §5 trong mô phỏng 50 tin/20 người | ⬜ | ⬜ |
| G06 | Watchdog: 3003, 1006, im lặng 20 phút; nhường người thật | ⬜ | ⬜ |
| G07 | Console: duyệt cư dân/thợ, quy chế, bảng giá, thẻ vào tòa | ⬜ | ⬜ |
| G08 | Golden `emergency` đạt | ⬜ | ⬜ |
| G09 | Golden `diagnosis` đạt | ⬜ | ⬜ |
| G10 | Golden `responsibility` đạt (cần quy chế thật) | ⬜ | ⬜ |
| G11 | `sim_claims` 0 cuốc hai người thắng | ⬜ | ⬜ |
| G12 | `pii_probe` 0 rò; 0 tin chứa số căn tới thợ trước `access_granted` | ⬜ | ⬜ |
| G12b | Không có cuốc nào `dispatched` mà ticket `access_request` không `approved` (truy vấn kiểm trên DB) | ⬜ | ⬜ |
| G13 | Đầu-cuối P06 | ⬜ | ⬜ |
| G15 | Slot: không vượt trần khi cấp đồng thời; dùng thử đúng 1 lần; hết hạn (dùng thử/trả phí) không nhận được cuốc | ⬜ | ⬜ |
| G16 | Kênh giả lập: kịch bản `evals/scenarios/happy_path.jsonl` chạy trọn bước 0→8 không cần người (BQL duyệt bằng API test) | ⬜ | ⬜ |
| G14 | 7 ngày chạy thật trên VPS: 0 `PiiGateError` ngoài test, phiên Zalo sống ≥ 95% giờ hành chính | — | ⬜ |

Kế hoạch chỉ đóng khi mọi gate cột `vps` ✅ (AGENTS.md §3.2.4).

## §5. Số đo sản phẩm (dashboard sau G14)

Thời gian từ tin đầu tới `published` · thời gian tới `confirmed` · tỷ lệ bùng · tỷ lệ tranh chấp · điểm trung bình · phút nhân viên mỗi yêu cầu (so baseline P00) · token và chi phí LLM mỗi cuốc (`agent_runs`).
