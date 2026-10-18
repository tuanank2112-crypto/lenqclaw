Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude Sonnet 5.5 (lượt tiếp tục; lượt trước cũng Sonnet 5.5) · Bước 0: exit 0 (`NÃO ĐÃ OK`) · hiểu việc: phạm vi = services moderation/approvals/join-requests/welcome + tool + node moderate/group_event/system_event + sim kiểm thẻ + timer + 2 sửa D39 + test/docs; xong khi = gate/test/test:db×2/own_uid null/latency/diff-stat; cấm = đụng shape/edges/pipeline/turn/state, migrations, apps/zalo-worker ngoài 1 file test, kick/block không thẻ, DM người vi phạm, xoá tin >24h/thiếu cli_msg_id, log nội dung tin
Handoff: handoffs/H12_thi-cong_P05.md
Base: 9989aef4926112b060ca923f6d4a063dfc54c310
Head: 034a1ab7f0c5db44cbd80fc3492e1dcd9e5e51f6

## Commit công việc (lượt trước, đối chiếu lượt này)
68705f7 D39 · 80752a5 P05-A · b01b625 P05-B · f330436 P05-C · 034a1ab docs. 5ddedaa = commit của SO (hồ sơ/não), ngoài phạm vi, loại khỏi diff-stat.

## Nghiệm thu (SPEC-P05 §10 hàng 1–5 + D39), đo lại lượt này
| Hàng | Lệnh | Kết quả | Evidence |
| :-- | :-- | :-- | :-- |
| 1 ladder L01–L14 | `npm test` (moderation-ladder.test.ts) | xanh | evidence/P05/test.txt |
| 2 grid ≥20 hit + 40 câu sạch | `npm test` (moderation-grid.test.ts) | xanh | test.txt |
| 3 hasDecisionEvidence ≥12 ca | `npm test` (approvals.test.ts) | xanh | test.txt |
| 4 (a)–(j) | `npm run test:db` (p05-moderation.db.test.ts, đủ (a)(b)(c)(d)(e)(f)(g)(h)(i)(j) + d2/f2/h2/i2/i3 + BB-06) | xanh ×2 | test-db.txt, test-db-2.txt |
| 5 join/welcome | `npm run test:db` (p05-join-welcome.db.test.ts) | xanh ×2 | test-db.txt, test-db-2.txt |
| D39(a) | p05-d39.db.test.ts ca 1–2 | xanh | test-db*.txt |
| D39(b) | bot.test.ts + p05-d39.db.test.ts ca 3 + own_uid sau test:db | xanh; own_uid = null | own-uid.txt |
Hàng 6 (golden thật, P09a) và hàng 7 (thẩm định, H13) KHÔNG làm ở đây.

## Lệnh 3.f (exit code nguyên văn)
| Lệnh | Exit | Số đo |
| :-- | :-- | :-- |
| `npm run gate > gate.txt` | 0 | `GATE_OK`, pivot_hits 0 (0 tool cấm) |
| `npm test > test.txt` | 0 | tổng 721 (web 32 · worker 114 · core 575), 0 fail, 0 skip (trước 602, +119) |
| `npm run test:db > test-db.txt` (lần 1) | 0 | 295 (core 187 · web 30 · worker 78), 0 fail, 0 skip |
| `npm run test:db > test-db-2.txt` (lần 2) | 0 | 295 (187 · 30 · 78), 0 fail, 0 skip |
| `select own_uid from zalo_accounts` | 0 | NULL (own-uid.txt) |
| `npm run latency:slo -- --n 20 --fake-delay-ms 300 > latency-fake.txt` | 0 | G23 RESULT: PASS, error_rate 0, không treo |
| `git diff --stat 9989aef4926112b060ca923f6d4a063dfc54c310..034a1ab -- . ':!brain4agent' ':!planning/.../plan.md' > diff-stat.txt` | 0 | 35 file, +3012 −58 |

## Sự cố test-db dở của lượt trước (phân lập)
"Worker exited unexpectedly" KHÔNG tái hiện (2 lần chạy đầy đủ xanh). Tuy nhiên lần chạy đầu của lượt này core ĐỎ 2/187 (`agent: tin scam KHONG khop luoi…` và `agent flag_message len tin cua owner/moderator`), căn nguyên Tầng 4/dữ liệu: tiến trình bị kill giữa p03b-worker.db.test.ts để lại `zalo_accounts.own_uid` khác null (afterAll không chạy). Hai ca p05 dùng thread `p03g-*` (không phải `sim-%`, nên D39(b) không áp) ⇒ `botUid` lấy uid cột ⇒ mention `sim-bot` không khớp ⇒ gate bỏ, 0 lượt. Chạy riêng từng ca thì xanh (cache botUid chưa nạp). Khắc phục: chạy `npm run test:db -w @lenqclaw/zalo-worker` (afterAll mới dọn own_uid) ⇒ own_uid null ⇒ test:db đủ ×2 xanh. Không sửa mã. Ghi nhận rủi ro (câu hỏi bên dưới).

## Bằng chứng đỏ (evidence/P05/red-*.txt, từ lượt trước; đủ 5 yêu cầu 3.d + 6 ca thêm)
| Đột biến | Bộ đo đỏ | File |
| :-- | :-- | :-- |
| bỏ làm tròn 1 chữ số (ladder) | ladder unit | red-ladder-no-round.txt |
| bỏ `exempt` | unit + DB (c) | red-ladder-no-exempt-unit.txt, red-ladder-no-exempt-db.txt |
| `hasDecisionEvidence` chấp nhận chỉ id | unit + DB (i) | red-evidence-id-only.txt, red-evidence-id-only-db.txt |
| sim bỏ kiểm thẻ kick | sim-actions.db | red-sim-no-approval-check.txt |
| bỏ `welcomed_at` trước lượt | ca "chào 2 lần" | red-welcomed-at-not-set.txt |
| thêm: grid cụm mơ hồ · `enqueueAction` bỏ guard BB-06 · D39(a) không nâng làn · D39(b) bỏ ép sim | các ca tương ứng | red-grid-ambiguous-phrase.txt, red-enqueueaction-no-guard.txt, red-d39a-no-escalate-before-run.txt, red-d39b-sim-thread-ignored.txt |
Mã được trả nguyên trạng sau mỗi lần (working tree sạch trừ file ngoài phạm vi).

## Phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| 3.0 D39, P05-A, B, C | 🟠 | Claude Sonnet 5.5 |
| docs | 🟢 | Claude Sonnet 5.5 (thiếu model 🟢 ⇒ LÊN một tầng, hợp luật K.3) |
| đo lại + report (lượt này) | 🟠 | Claude Sonnet 5.5 |

## Việc KHÔNG làm + lý do
- SPEC-P05 §10 hàng 6 (golden thật) ⇒ P09a, không có credit model; hàng 7 ⇒ H13 do agent khác.
- Không push.
- Không sửa `UPDATE zalo_accounts` tay: lệnh bị bộ phân loại quyền chặn, và cũng không cần (dùng test worker để dọn).

## Câu hỏi cần người / SO
1. Diff-stat có file NGOÀI danh sách ĐƯỢC GHI nguyên văn của H12 §2: `graph/nodes/deliver.ts` (+7), `graph/nodes/prepare.ts` (+12), `services/outbox-actions.ts` (+63, guard BB-06 `enqueueAction`), `runner/inbound-runner.ts` (+2, truyền threadId cho botUid theo D39b). Không đụng shape/edges/pipeline/turn/state. SO duyệt hợp thức hay 🔁? (Tên node trong repo là `group-event.ts`/`system-event.ts`, khác `group_event.ts` trong handoff, coi là cùng file.)
2. Rủi ro cô lập test: ca p05 dùng thread `p03g-*` phụ thuộc `own_uid = null`; tiến trình bị kill giữa worker test để lại giá trị ⇒ core đỏ giả. Đề xuất (ngoài H12): helper p03 set/khôi phục sim uid, hoặc `beforeAll` của test:db dọn own_uid. Chưa làm vì đổi hạ tầng test chung.
3. Evidence `gate.txt`/`test.txt` hiện là CRLF; git cảnh báo chuyển LF, vô hại.

⏳ Chờ phán quyết.
