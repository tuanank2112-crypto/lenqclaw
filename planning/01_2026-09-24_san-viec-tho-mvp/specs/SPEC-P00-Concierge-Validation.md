# SPEC-P00 — Kiểm chứng tay (concierge) · cổng G0

> ⚠️ **NGOÀI PHẠM VI BUILD (Đ13, 2026-09-24).** Giữ làm tài liệu tham khảo cho đội kinh doanh; không chặn gói kỹ thuật nào.

> Không viết code. Người làm: nhân viên BQL của tòa pilot + chủ dự án. Agent chỉ soạn mẫu và tổng hợp số đo.
> Mục đích: trả lời 3 câu hỏi trước khi tự động hoá dispatch (Đ07): **có đủ việc không · thợ có nhận nhanh không · thợ có chịu trả phí không.**

## §1. Chuẩn bị (tuần 0)

1. Chọn 1 tòa pilot. BQL đồng ý tham gia bằng văn bản ngắn (email/tin nhắn lưu lại).
2. Lập nhóm Zalo "Thợ Tòa <mã>" gồm 5–10 thợ quen của BQL/bảo vệ (thông cống, điện nước, khoá, điện lạnh). Mỗi thợ gửi ảnh CCCD cho BQL (lưu offline, không đưa lên nhóm).
3. Thông báo cư dân (bảng tin + nhóm cư dân): "Việc sửa chữa trong căn, nhắn Zalo BQL để được giới thiệu thợ đã duyệt".
4. Lập bảng tính theo §3.

## §2. Quy trình mỗi yêu cầu

1. Cư dân nhắn. Nhân viên hỏi đủ: hiện tượng, vị trí trong căn, ảnh, khung giờ.
2. Nhân viên phân định trách nhiệm theo quy chế. Việc chung ⇒ xử lý như cũ, ghi dòng `bql`.
3. Việc trong căn ⇒ đăng vào nhóm thợ **đúng mẫu** (không số căn, không SĐT):

```text
CUỐC C-<số>
<Loại việc> — <hiện tượng ngắn>
Tòa <mã> · <khung giờ>
Giá tham khảo: <khoảng> (hoặc: KHẢO SÁT)
Trả lời "nhận C-<số>" để giữ cuốc 10 phút
```

4. Người trả lời "nhận" hợp lệ đầu tiên được cuốc. Nhân viên nhắn riêng số căn + SĐT, báo bảo vệ tên thợ.
5. Sau khi làm: hỏi cư dân giá thực trả + chấm 1–5 sao.
6. Từ tuần 3: chào **slot tháng đồng giá** (Đ12) với giá thử do người chốt, số slot có trần; ghi ai mua, ai từ chối, lý do.

## §3. Bảng số đo (một dòng mỗi yêu cầu)

| Cột | Ý nghĩa |
| :-- | :-- |
| `req_at` | lúc cư dân nhắn |
| `category` | loại việc (theo `job_categories` seed) |
| `party` | `resident` / `bql` / `unclear` |
| `posted_at` | lúc đăng cuốc |
| `claimed_at` | lúc có "nhận" hợp lệ đầu tiên |
| `claims_in_10m` | số thợ trả lời "nhận" trong 10 phút |
| `no_show` | thợ nhận rồi bùng (0/1) |
| `quoted_price`, `final_price` | giá tham khảo, giá thực trả |
| `stars` | điểm cư dân |
| `slot_paid` | thợ đã mua slot thử (0/1/NA) — một dòng mỗi thợ ở bảng riêng |
| `minutes_staff` | tổng phút nhân viên bỏ ra cho yêu cầu |

## §4. Cổng G0 (ngưỡng ĐỀ XUẤT — người chốt trước khi bắt đầu)

| Chỉ số | Ngưỡng đề xuất | Ghi chú |
| :-- | :-- | :-- |
| Việc trong căn / tháng / tòa | ≥ 20 | dưới mức này sàn không nuôi được thợ |
| Trung vị `claimed_at − posted_at` | ≤ 30 phút | trong giờ hành chính |
| Tỷ lệ bùng | ≤ 10% | |
| Tỷ lệ thợ mua slot thử | ≥ 50% số thợ đã nhận ≥ 2 cuốc | giá thử và trần slot người chốt trước tuần 3 |
| Cuốc / thành viên slot / tháng (ước) | ≥ `SLOT_MIN_JOBS_PER_VENDOR` | dưới mức này thợ sẽ không gia hạn |
| Điểm trung bình | ≥ 4.0 | |
| `minutes_staff` trung vị | ghi lại | là baseline để đo agent tiết kiệm được bao nhiêu |

**Quyết định:** tất cả đạt ⇒ mở P05. Đạt số việc + tốc độ nhưng trượt phí ⇒ họp đổi mô hình thu (Đ05/Đ01). Trượt số việc ⇒ lật Đ01.

## §5. Vùng cấm

- CẤM đăng số căn/SĐT/tên cư dân lên nhóm thợ, kể cả "cho nhanh".
- CẤM mời thợ chưa gửi CCCD vào nhóm.
- CẤM tự nghĩ ra số đo nếu không ghi — ô trống để trống.

## §6. Bằng chứng

`planning/01_2026-09-24_san-viec-tho-mvp/evidence/p00/`: bảng tính xuất CSV (đã ẩn danh) + bản tổng hợp số đo do script tạo, không tự gõ.
