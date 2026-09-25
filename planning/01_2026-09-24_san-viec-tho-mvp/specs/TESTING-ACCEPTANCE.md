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
| P04 (tối thiểu cho P05 — SPEC-P04 §8, Đ27) | unit: `canAccess` đủ ô bảng §8.1 (≥12 ca); db (web): `POST /api/tickets/{id}/decision` — guard 403 · reject thiếu `note` 400 · reject ⇒ ticket `rejected` + cuốc `published` + tin nhóm "ĐĂNG LẠI" · approve ⇒ `access_granted` + đúng 1 `access_passes` (`window_start−30'`, `window_end+120'`) + đúng 1 `inbound_events` `sys-%` · approve lần 2 ⇒ 409; `POST /api/vendors/{id}/slots/paid` ⇒ slot cũ `expired`, slot mới `active` nối ngày, 2 `ledger_entries` (300000 `paid`, 30000 `due`); đầy ⇒ `waitlisted`; đình chỉ thợ đang `held` ⇒ cuốc `published`, slot `cancelled`; `/api/dev/sim/tick` ⇒ `holds_released` (tải quy chế/đăng ký thợ = P04 đầy đủ, sau) |
| P05 (SPEC-P05 §10) | unit (`npm test`): `extractJobCodes`/`parsePriceVnd`/3 danh sách cụm (≥40 ca, gồm "C-24A7 giá bao nhiêu?" KHÔNG phải claim); `computePublishExpiry` 5 ca §10.8.1; `readDispatchConfig` sai số ⇒ `ConfigError`; mẫu tin không có tham số PII; `parseVendorTriage` JSON hỏng ⇒ null; `TRANSITIONS` có `confirmed→published`. db (core): `claimJob` 7 mã lý do từ chối — 8 ca (thợ `pending` ⇒ `not_active`, không tòa, không nhóm nghề, không slot, slot hết hạn ⇒ `no_slot`, bùng 3 lần, trùng giờ, `rejected_by_bql`), mỗi ca khẳng định đúng mã ở đầu `message`; đua 20 claim/1 cuốc ⇒ 1 thắng; `confirm` sau hạn ⇒ `HoldExpiredError` + cuốc `published`; `quote` thiếu giá ⇒ `QuoteRequiredError`; giá vượt khung ⇒ vẫn `held` + tin cư dân + `respond_to_quote(true)` cần bằng chứng, `(false)` ⇒ nhả không tính bùng; `dispatch_to_vendor` khi ticket `open`/`rejected` ⇒ `AccessNotApprovedError`; PiiGate: 15 ca `pii_probe` ⇒ 0 chuỗi PII trong outbox nhóm/DM trước `access_granted`, tin cố ý chứa PII ⇒ `PiiGateError` + audit; đồng hồ giả §10.8.4 (giữ, đăng, nhắc BQL, 3 lưới fallback, slot hết hạn/nhắc/mời chờ) mỗi bước idempotent; slot: đua 50/1 chỗ ⇒ 1+49, dùng thử lần 2 ⇒ `pending_payment`, gia hạn ⇒ 1 `active`; agent thợ (client kịch bản): thắng/thua, nhóm nhiễu ⇒ 0 model, text tự do KHÔNG vào nhóm, `system` giả ⇒ audit; sự kiện hệ thống ⇒ `dispatched`; e2e bước 0→7 (G16a) |
| P06 | đầu-cuối 5 cuốc trên kênh giả lập; price_book và vendor_scores cập nhật; nhắc bảo hành |

## §3. Golden sets (`evals/golden/`)

| Bộ | Số ca | Ngưỡng | Nguồn ca |
| :-- | :-- | :-- | :-- |
| `emergency.jsonl` | 20 (10 khẩn cấp, 10 gần giống nhưng không) | 10/10 bật, ≤1 báo nhầm | tự soạn, có ca không dấu/viết tắt |
| `diagnosis.jsonl` | 40 | ≥ 85% đúng `category_code`; ≤ 3 câu hỏi | tin thật từ P00 (đã ẩn danh) + ca soạn |
| `responsibility.jsonl` | 30 | ≥ 90% đúng `party`; 100% verdict chắc chắn có citation hợp lệ; ca thiếu/mâu thuẫn quy chế ⇒ `unclear` 100% | cần quy chế thật của tòa pilot |
| `pii_probe.jsonl` | 15 (cư dân tự gửi số căn/SĐT/tên trong mô tả; `draft.symptoms`/`location_in_unit` chứa PII) | 0 rò vào `JobCard`/tin gửi thợ trước `access_granted` — chấm tất định trong `test:db` (Đ27: không cần model) | tự soạn |
| `consent.jsonl` (đã có, Đ21) | 44 | 0 đồng ý sai; ≥ 90% đồng ý thật được nhận | tự soạn |
| `vendor_intent.jsonl` (Đ27) | ≥ 60 (≥ 25 claim: có/không dấu, teencode, có/không mã, "e nhận", "cho em cuốc này"; ≥ 10 confirm; ≥ 10 quote kèm giá `350k`/`350.000`/`1tr2`; ≥ 10 decline/defer/question như "C-24A7 giá bao nhiêu?", "thôi em bận"; ≥ 5 slot) | `claim_recall ≥ 0.95`; `false_claim = 0` (không ca decline/question nào bị nhận là claim bởi model ≥ ngưỡng HOẶC cụm an toàn); `price_exact ≥ 0.90`; `code_exact = 1.0` (lưới tất định) — chấm bằng model thật `npx tsx --env-file=.env scripts/eval/vendor-intent.mjs` (exit 0 đạt / 1 trượt / 3 blocked) | tự soạn |

Chấm bằng `scripts/eval_golden.mjs` (một bộ chấm duy nhất, mẫu từ build phase `lib/eval/score.ts`). Lỗi hạ tầng (429/5xx) ⇒ `blocked`, KHÔNG tính trượt; mã thoát 3 = chưa kết luận.

## §4. Exit Gates

| Gate | Nội dung | local | vps |
| :-- | :-- | :-- | :-- |
| G01 | Cổng §1 xanh trên cây sạch | ✅ [R01](../reports/R01_thi-cong_P01.md) | ⬜ |
| G02 | Migrations từ rỗng + seed | ✅ [R01](../reports/R01_thi-cong_P01.md) | ⬜ |
| G03 | Auth 3 vai + audit log | ✅ [R01](../reports/R01_thi-cong_P01.md) | ⬜ |
| G04 | Transport: chống trùng, nhận diện, ảnh an toàn | ⬜ | ⬜ |
| G05 | Pacer đúng bảng §5 trong mô phỏng 50 tin/20 người | ⬜ | ⬜ |
| G06 | Watchdog: 3003, 1006, im lặng 20 phút; nhường người thật | ⬜ | ⬜ |
| G07 | Console tối thiểu cho P05 (SPEC-P04 §8, Đ27): `npm test` (policy ≥12 ca mới) + `npm run test:db -w @lenqclaw/web` ⇒ ≥10 ca mới xanh, 0 skip, chạy 3 lần liên tiếp đều xanh (G24); `next build && next start` ⇒ `/tickets` 200 với staff, `/vendors` 403 với staff, `/gate` 200 với guard, `/vendors` 403 với guard (curl kèm cookie) — phần P04 đầy đủ (quy chế, bảng giá, đăng ký) đo sau | ⬜ | ⬜ |
| G08 | Golden `emergency` đạt | ⬜ | ⬜ |
| G09 | Golden `diagnosis` đạt | ⬜ | ⬜ |
| G10 | Golden `responsibility` đạt (cần quy chế thật) | ⬜ | ⬜ |
| G11 | `node --import tsx scripts/sim_claims.mjs` (cần `DATABASE_URL`, tự tạo 50 cuốc `published` + 200 thợ mô phỏng có slot, gọi `claimJob` 200 lần đồng thời — 4 thợ/cuốc — qua pool ≥ 20 kết nối, xoá dữ liệu của mình khi xong) in `claims=200 won=50 lost=150 jobs_with_two_winners=0 job_events_held=50` exit 0; `--break` (bản cố ý hỏng: đọc `status` rồi UPDATE không điều kiện, trong script) ⇒ `jobs_with_two_winners>0` exit 1 = bằng chứng đỏ `evidence/P05/red-sim-claims.txt`. Số architect đo 2026-09-25 với đúng câu lệnh: 50/150/0 trong 303 ms; bản hỏng: 20 người thắng | ⬜ | ⬜ |
| G12 | `test:db`: `p05-pii-probe.db.test.ts` — 15 ca `evals/golden/pii_probe.jsonl` (mỗi ca dựng cuốc có `draft` chứa PII rồi `publishJobToGroup` + `claimJob` + `confirmAssignment` + `requestAccess`) ⇒ `select count(*)::int as leaks from outbox where zalo_account_id='market' and created_at > $1::timestamptz and (regexp_replace(body->>'text','[^0-9]','','g') like '%'||$2||'%' or body->>'text' ~* $3 or body->>'text' ilike '%'||$4||'%')` với `$2` = SĐT chỉ số, `$3` = mã căn dạng lỏng (`a[.\-\s]*0[.\-\s]*1…` như `redactKnownApartmentCodes`), `$4` = họ tên ⇒ `leaks = 0` cho cả 15 ca (đã thử 2026-09-25: 3 tin sạch có mã cuốc + 3 tin rò cố ý — SĐT có khoảng trắng, "a - 0101", tên — ⇒ `leaks=3`, tin sạch không bị bắt nhầm); ca đối chứng gọi `sendVendorMessage` với text chứa mã căn ⇒ ném `PiiGateError` + 1 dòng `audit_log action='pii.gate_blocked'` (đỏ có kiểm soát). `node scripts/check_agent_tools.mjs` in thêm `jobreveal_outside_allowed: 0` và `allow_reveal_outside_access: 0` (đỏ: bản sao tạm có `JobReveal` trong một tool ⇒ 1) | ⬜ | ⬜ |
| G12b | Sau `test:db` (và sau mọi kịch bản demo), chạy trên DB đó: `select count(*)::int as violations from jobs j left join tickets t on t.id = j.access_ticket_id where j.status in ('dispatched','in_progress','awaiting_acceptance','accepted','disputed','closed') and (t.id is null or t.kind <> 'access_request' or t.status <> 'approved')` ⇒ `violations = 0`; test `p05-dispatch.db.test.ts` chạy chính câu này sau e2e. Đã thử 2026-09-25: cài 2 dòng xấu ⇒ 2, sửa ⇒ 0 (câu lệnh biết đỏ) | ⬜ | ⬜ |
| G13 | Đầu-cuối P06 | ⬜ | ⬜ |
| G15 | `test:db`: `p05-slots.db.test.ts` — (a) trần 3, 2 slot `active`, 50 `requestSlot` đồng thời (50 thợ khác nhau, `Promise.all`) ⇒ `granted=1 waitlisted=49`, `select count(*) from vendor_slots where … status='active'` = 3 (architect đo 2026-09-25: 1/49/3); (b) thợ đã có dòng `is_trial=true` (kể cả `expired`) gọi `requestSlot` ⇒ `pending_payment`, 0 dòng mới; (c) `grantPaidSlot` cho thợ đang dùng thử ⇒ slot cũ `expired`, 1 slot `active` mới `period_start = old.period_end + 1`, 2 `ledger_entries`; chèn dùng thử lần 2 bằng SQL ⇒ lỗi unique `one_trial_ever`; (d) slot `period_end = today−1` ⇒ `runTimers` ⇒ `expired` + DM + `claimJob` của thợ đó ⇒ `IneligibleVendorError('no_slot')`; (e) `expireWaitlistInvites` sau 48 giờ ⇒ dòng bị xoá, người kế được mời | ⬜ | ⬜ |
| G16a | Kênh giả lập bước 0→7 (Đ27): `test:db` `p05-e2e.db.test.ts` (client kịch bản, SPEC-P05 §10.11) ⇒ cuốc `dispatched`; `job_events` đúng 6 chuyển sau `case_open`; outbox nhóm 0 PII; DM thợ có mã căn + mã vào 6 ký tự; cư dân nhận `ACCESS_PENDING_RESIDENT` và `DISPATCHED_RESIDENT`; `agent_runs` có route `vendor_parse` ≥ 3 dòng | ⬜ | ⬜ |
| G16 | Kênh giả lập: kịch bản `evals/scenarios/happy_path.jsonl` chạy trọn bước 0→8 không cần người (BQL duyệt bằng API test) — P06 | ⬜ | ⬜ |
| G14 | 7 ngày chạy thật trên VPS: 0 `PiiGateError` ngoài test, phiên Zalo sống ≥ 95% giờ hành chính | — | ⬜ |

Kế hoạch chỉ đóng khi mọi gate cột `vps` ✅ (AGENTS.md §3.2.4).

## §5. Số đo sản phẩm (dashboard sau G14)

Thời gian từ tin đầu tới `published` · thời gian tới `confirmed` · tỷ lệ bùng · tỷ lệ tranh chấp · điểm trung bình · phút nhân viên mỗi yêu cầu (so baseline P00) · token và chi phí LLM mỗi cuốc (`agent_runs`).

## §6. Số đo lưới an toàn P05 (Đ27 — đo tần suất agent "quên", để biết prompt/model có đủ tin cậy)

Sau mỗi lượt chạy thật trên kênh giả lập (demo hoặc máy chấm), chạy trên DB đó và ghi vào report:

```sql
select action, count(*)::int as n from audit_log
 where action in ('timer.publish_fallback','timer.request_access_fallback','system.access_approved_reemit','dispatch.stuck','claim.fallback_no_model','pii.gate_blocked','vendor.group_noise')
   and created_at > $since group by action order by action;
```

Ngưỡng nghiệm thu P05 trên kênh giả lập với model thật (≥ 20 cuốc trọn bước 0→7): `timer.publish_fallback` + `timer.request_access_fallback` ≤ 10% số cuốc; `dispatch.stuck` = 0; `pii.gate_blocked` = 0 ngoài test cố ý; `claim.fallback_no_model` chỉ khi model lỗi thật (`agent_runs.outcome='error'` cùng phút). Vượt ngưỡng ⇒ sửa prompt/tool, KHÔNG nới lưới.
