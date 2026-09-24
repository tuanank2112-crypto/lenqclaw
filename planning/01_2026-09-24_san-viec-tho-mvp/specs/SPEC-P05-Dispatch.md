# SPEC-P05 — Job ẩn danh → nhóm thợ → chốt → cấp quyền → giao việc (bước 4–7, pipeline v0.2)

> Tầng 🔴. Thi công ngay sau P03 trên kênh giả lập (Đ13). Đọc `01-CONTRACTS.md` §4–§7, §9 và BB-02, BB-05, BB-10, BB-11.
> Agent điều phối thực hiện mọi bước qua tool (Đ10). Luật nằm trong tool; agent không chọn người thắng, không duyệt quyền vào tòa.

## §1. Bước 4 — Job ẩn danh, đăng thẳng nhóm thợ

1. Từ `case_open`, agent gọi `publish_job_to_group(job_code)`.
2. Tool dựng `JobCard` (kiểu không có trường PII — BB-02) và đưa **một tin** vào outbox nhóm "Thợ Tòa X · <nhóm nghề>" (tài khoản `market`) — nhóm chỉ gồm thợ đang giữ slot, kể cả dùng thử (Đ14):

```text
CUỐC C-24A7
Thông tắc ống nhánh bồn rửa chén — nước rút chậm, có mùi
Tòa B · 14h–17h hôm nay
Giá tham khảo: 250–350k        (hoặc: THỢ BÁO GIÁ KHI NHẬN)
Trả lời "nhận C-24A7" để giữ cuốc 10 phút
```

3. Ảnh: chỉ ảnh `intake`, đã xoá EXIF; nghi ngờ ảnh lộ số căn/giấy tờ ⇒ không gửi ảnh (agent tư vấn, tool quyết không gửi khi cờ nghi ngờ bật).
4. Không nhắn riêng thợ ở vòng 0.1 (Đ10; nhắn riêng top thợ nằm ở Idea Vault).

## §2. Bước 5 — Chốt thợ

1. Worker parse tất định tin nhóm: `nhận C-XXXX` (có/không dấu, không phân biệt hoa thường) ⇒ sự kiện `claim`.
2. Kiểm `IneligibleVendorError` (BB-10: `active`, **slot còn hạn — trả phí hoặc dùng thử — đúng (tòa × nhóm nghề)**, đúng kỹ năng, đúng tòa, không bị khoá do bùng ≥3 lần/30 ngày, không trùng khung giờ với cuốc đang giữ).
3. Một câu: `UPDATE jobs SET status='held', assigned_vendor_id=$v, hold_expires_at=now()+interval '10 min' WHERE id=$j AND status='published' RETURNING id`. `rowCount=1` ⇒ thắng; `0` ⇒ agent trả lời nhóm "C-24A7 đã có người nhận".
4. Agent nhắn riêng thợ thắng: "Bạn đang giữ C-24A7 tới HH:MM. Trả lời OK để xác nhận." (`mode='quote'` ⇒ kèm câu xin giá).
5. Thợ "OK" (kèm giá nếu `quote`) ⇒ agent gọi `confirm_assignment` ⇒ `confirmed`. Hết hạn giữ ⇒ `published` lại, `no_show_count+1`, agent đăng lại nhóm (tối đa 2 lần).
6. `mode='quote'` và giá thợ báo vượt `price_high` > 30% (nếu có khung) ⇒ agent hỏi cư dân đồng ý trước khi sang bước 6.

## §3. Bước 6 — Ticket cấp quyền vào tòa

1. Ngay sau `confirmed`, agent gọi `request_access(job_code, note)` ⇒ ticket `access_request` trên dashboard: tên thợ, SĐT thợ, điểm, số cuốc đã làm, căn, khung giờ, loại việc.
2. BQL bấm **Duyệt** ⇒ `access_granted` + tạo `access_passes` (mã 6 ký tự, hiệu lực `window_start − 30 phút` tới `window_end + 2 giờ`, hiện ở `/passes`).
3. BQL bấm **Từ chối** (bắt buộc lý do) ⇒ agent báo thợ "cuốc được chuyển người khác", gỡ gán, `published` lại, đăng lại nhóm.
4. Chưa duyệt sau 30 phút trong giờ hành chính ⇒ agent nhắc trên dashboard + báo cư dân "đang chờ BQL xác nhận thợ".

## §4. Bước 7 — Giao việc

- Agent gọi `dispatch_to_vendor(job_code)`. Tool kiểm `status='access_granted'` ∧ ticket `approved` ∧ đúng thợ được gán; sai ⇒ `AccessNotApprovedError` / `PiiGateError` (log mức cao).
- Đúng ⇒ `JobReveal` nhắn riêng thợ (số căn, tầng, SĐT cư dân, mã vào tòa) ⇒ `dispatched`.
- Agent nhắn cư dân: tên thợ, điểm, giờ đến, mã để đối chiếu với bảo vệ.

## §5. Hết giờ không ai nhận

`published` quá `DISPATCH_TIMEOUT` (mặc định 45 phút trong 7–21h; ngoài giờ giữ tới 8h sáng) ⇒ agent đăng lại một lần với "THỢ BÁO GIÁ KHI NHẬN"; vẫn không ai ⇒ `unassigned` + ticket `no_vendor` (BQL gọi thợ quen) + báo cư dân.

## §6. Vùng cấm

- CẤM agent chọn người thắng hoặc "ưu tiên" thợ quen: người thắng là câu UPDATE có điều kiện.
- CẤM agent tự duyệt / giả lập duyệt ticket cấp quyền; chỉ `staff_users` bấm trên dashboard.
- CẤM gửi số căn, SĐT, tên cư dân vào nhóm thợ hay cho thợ trước `access_granted` (BB-02, BB-11).
- CẤM đấu giá hạ giá; CẤM cho thợ này xem giá thợ khác.

## §7. Lỗi

| Tình huống | Hành vi |
| :-- | :-- |
| Hai "nhận" cùng mili-giây | câu UPDATE quyết; người thua được báo "đã có người nhận" |
| Thợ bị `suspended` khi đang `held`/`access_pending` | về `published`, huỷ ticket cấp quyền, báo cư dân "đang tìm thợ khác" |
| Gửi tin nhóm thất bại (`TransportDeadError`) | giữ `case_open`, đăng khi phiên sống lại; quá 30 phút ⇒ ticket `no_vendor` |
| BQL không duyệt trước giờ hẹn | agent đề xuất cư dân dời giờ; không bao giờ tự giao việc |

## §8. Phí vào nhóm: slot tháng đồng giá + dùng thử miễn phí (Đ14)

- **Một mức phí** `SLOT_FEE_MONTHLY` cho mọi thợ, mọi (tòa × nhóm nghề). Không hạng, không ưu tiên thời gian: trong nhóm, "nhận" hợp lệ đầu tiên thắng (BB-05); "đầu tiên" = `inbound_events.received_at` theo server, hoà ⇒ câu UPDATE có điều kiện quyết.
- **Dùng thử:** thợ `active` lần đầu xin slot tại (tòa × nhóm nghề) ⇒ nếu còn chỗ, cấp `vendor_slots(is_trial=true, fee=0)` dài `FREE_TRIAL_DAYS`; mỗi thợ chỉ dùng thử một lần mỗi (tòa × nhóm nghề) (index `one_trial_ever`). Dùng thử **chiếm chỗ** trong trần như slot trả phí.
- **Trần slot:** `capacity = max(2, ceil(cuốc_dự_kiến_tháng / SLOT_MIN_JOBS_PER_VENDOR))`, BQL admin xem lại hằng tháng trên dashboard. CẤM cấp vượt trần. Đầy ⇒ `slot_waitlist` theo thứ tự đăng ký; có chỗ trống ⇒ agent mời người đầu danh sách, giữ lời mời 48 giờ.
- **Chuyển sang trả phí / gia hạn:** agent nhắc thợ 3 ngày trước `period_end` (cả dùng thử lẫn trả phí). BQL bấm "Đã thu phí" trên dashboard ⇒ slot mới `is_trial=false` kỳ kế tiếp + `ledger_entries(slot_fee)` + `ledger_entries(bql_share = round(SLOT_FEE_MONTHLY × BQL_SHARE_PCT))`. Không thu ⇒ `expired`, dashboard nhắc "cần gỡ khỏi nhóm" (gỡ tay), mời người chờ.
- **Chất lượng** (đã có §2): bùng ≥3 lần/30 ngày ⇒ khoá nhận cuốc 7 ngày, slot vẫn tính; BQL đình chỉ ⇒ `cancelled`.
- **Agent thợ** thêm lệnh: "giữ slot <nhóm nghề>" (xin slot / vào danh sách chờ), "slot của tôi" (còn bao nhiêu ngày, dùng thử hay trả phí).
- **Ngoài phạm vi (Đ13):** bảng tin tuần, FOMO, chiến dịch kéo thợ, ưu đãi khác ngoài dùng thử.

## §9. Nghiệm thu (G11, G12, G12b, G15)

- `scripts/sim_claims.mjs`: 200 claim đồng thời trên 50 cuốc ⇒ mỗi cuốc đúng 1 người thắng.
- `pii_probe` + quét outbox: 0 tin tới thợ chứa mã căn/SĐT trước `access_granted`.
- Truy vấn kiểm: 0 cuốc `dispatched` mà ticket `access_request` không `approved`.
- Từ chối cấp quyền ⇒ cuốc về `published` và được đăng lại (test đồng hồ giả).
- G15: 50 yêu cầu slot đồng thời khi còn 1 chỗ ⇒ đúng 1 slot mới, 49 vào danh sách chờ; thợ xin dùng thử lần 2 ⇒ bị từ chối; hết dùng thử không trả phí ⇒ `expired` và "nhận" bị từ chối (đồng hồ giả).
