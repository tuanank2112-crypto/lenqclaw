Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude / Sonnet 5.5 · Bước 0: exit 0 · hiểu việc: sửa P03 theo D35 điểm 1–12 (điểm 13 hoãn), mỗi điểm 1–11 test đỏ trước rồi xanh; ghi chỉ trong phạm vi H09 (core, boundary script, web tests/sim, docs, hồ sơ); không push, không đổi node/cạnh đồ thị.
Handoff: handoffs/H09_thi-cong_P03-fix.md
Base: 4247719e0372e88ad9d61d7fd17b142e38f50011
Head: c39e0c9b03264605ff2ce91f608718daa9fb3f1e

## 1. Bảng D35 điểm → test mới → đỏ trước → xanh sau
| D35 | Test mới | Đỏ trước (evidence/P03-fix/) | Xanh sau |
| :-- | :-- | :-- | :-- |
| 1 C1 | edges.test `D35.1` (7); DB B3, B3b, B4, B4b | red-1.unit.txt (3 đỏ/7), red-1.db.txt (4 đỏ/4: 2 tin thay vì 1) | edges 116→pass; DB 4/4 |
| 2 C2 | model.body-errors.test (8: Gemini + OpenRouter × stall_body/bad_json/retry); DB B5 stall_body + bad_json | red-2.unit.txt (8 đỏ), red-2.db.txt (2 đỏ: 0 tin) | 8/8, DB 2/2 |
| 3 C3 | DB B1, B1b | red-3.db.txt (2 đỏ: takeover trên DM chủ) | 2/2 |
| 4 N6 | edges `skipFinalCall` (8); DB 6 ca đếm lời gọi | red-4.unit.txt (8 đỏ), red-4.db.txt (3 đỏ/6; 3 ca "VẪN gọi model" xanh từ trước = ràng buộc giữ) | 6/6 |
| 5 N1,N2,N3,G3,G8 | persona.test `D35.5` (9); DB A1, A2, C1, F1 | red-5.unit.txt (9 đỏ), red-5.db.txt (4 đỏ) | 9/9, 4/4 |
| 6 N4 | DB B2 (auto_post) + fallback | red-6.db.txt (2 đỏ: 0 tin, handler_error) | 2/2 |
| 7 N5 | DB E1 (tin cũ bị khoá), claimNextInbound([g]); P01 "12 processInbound" đổi sang 12 thread | red-7.db.txt (1 đỏ) | 2/2 |
| 8 N7 | boundary.test (16 ca trên cây giả; env `BOUNDARY_ROOT`) | red-8.unit.txt (9 đỏ/16) | 16/16; `check_adapter_boundary` repo thật violations 0 |
| 9 N8 | DB budget host-post §6.4.4; DB mốc `received_at` | tests xanh trên mã đúng; ĐỎ khi đột biến M5/M17 (red-9.txt; red-8.db.txt = xanh trước sửa) | 2/2 |
| 10 G7 | DB remember_member_note A→B | red-10.db.txt (1 đỏ) | 1/1 |
| 11 G5 | db-lock.test (2) | red-11.unit.txt (2 đỏ) | 2/2 |
| 12 SPEC | sửa tên/ghi chú; DB gate chỉ đọc (0 audit), prepare ghi conversations | không đỏ (không đổi hành vi) | 2/2 |

## 2. Số lời gọi model (fetch giả; model-calls.txt)
| Lượt | agent_runs | Kỳ vọng D35.4 |
| :-- | :-- | :-- |
| mention → send_group_message | 1 (trước: 2) | 1 ✓ |
| RAG: search_knowledge → send_group_message | 2 (trước: 3) | 2 ✓ |
| mention auto_post / RAG auto_post | 1 / 2 | không đổi ✓ |
| tool answers LỖI (GroupBudgetExceeded) | 2 | VẪN gọi ✓ |
| vòng trộn answers + describe_capabilities | 2 | VẪN gọi ✓ |
| nudge → send_group_message | 2 | không gọi chốt ✓ |

## 3. Đột biến sau sửa (mutations-after.txt; script ngoài repo, trả `git checkout` → status "")
| Mã | Kết | Mã | Kết |
| :-- | :-- | :-- | :-- |
| M5 | ĐỎ | X1 (bỏ D8 sớm) | ĐỎ |
| M10 | ĐỎ | X2/X3 (lỗi thân không retryable) | ĐỎ/ĐỎ |
| M11 | ĐỎ | X4 (owner_dm takeover) | ĐỎ |
| M12 | ĐỎ | X5 (bỏ skip chốt) | ĐỎ |
| M14 | ĐỎ | X6 (skip bỏ qua answers lỗi) | ĐỎ |
| M17 | ĐỎ | X7/X8 (thoát dòng / rào DM) | ĐỎ/ĐỎ |
| | | X9 (auto_post ném khi xoá) · X10 (bỏ ép thứ tự) · X11 (G7) · X12 (keepAlive) | ĐỎ ×4 |
0 đột biến lọt (6/6 của R08 + 12 bổ sung).

## 4. Lệnh (exit nguyên văn)
| Lệnh | Exit | Số đo |
| :-- | :-- | :-- |
| Bước 0 `--preserve-symlinks-main … --check` | 0 | NÃO ĐÃ OK |
| `npm run gate` (gate.txt) | 0 | GATE_OK; boundary violations 0 |
| `npm test` (test.txt) | 0 | web 31 + worker 102 + core 416 = 549 (trước 499; +50), 0 fail, 0 skip |
| `npm run test:db` ×2 (test-db.txt, test-db-run2.txt) | 0, 0 | core 111 + web 25 + worker 73 = 209 (trước 182; +27), 0 skip, 2 lần xanh |
| `npm run latency:slo -- --n 20 --fake-delay-ms 300` | 0 | G23 PASS |
| 3 ca đỏ G23 (latency-red1/2/3.txt) | 1,1,1 | G23 FAIL ×3 |
| `git diff --stat 4247719..HEAD` (diff-stat.txt) | — | 26 file, +1070/−80, toàn bộ trong ĐƯỢC GHI |

## 5. Test cũ đã đổi (giải thích)
- p03-group-turn (a)(n): `agent_runs` 2→1 (cả theo turn_id); (s): `modelCalls` 3→2 — hệ quả D35.4, SPEC §11 5(a) vốn ghi 1. Đầu file đổi chú thích.
- p01 "12 processInbound": 12 tin ở 12 thread (D35.7); mục đích giữ (không xử lý trùng, <5 s).
- p03-group-turn/p03-fix `afterAll` thêm dọn nhóm `p03g-%` (không nới kỳ vọng): DB để lại ~1340 nhóm làm `list_groups` chậm, ca "owner DM list_groups" chạm hạn fast 3500 ms và lúc chạy lúc đỏ (gặp 3/6 lượt full-suite trước khi dọn; sau dọn 4/4 xanh). Phát hiện của tôi, ngoài R08.

## 6. Việc KHÔNG làm
- D35.13 (hoãn theo handoff). Không đo model thật (không credit). Không sửa route `/api/dev/sim/send` (không cần).
- Không cập nhật `brain4agent/` (cấm ghi theo H09); SO đồng bộ não.

## 7. Bảng phân công
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| D35 1–12 | 🟠 | Claude / Sonnet 5.5 |
| docs | 🟢 | Claude / Sonnet 5.5 (không có model 🟢; làm tại tầng mình, không xuống) |

## 8. Câu hỏi cần người
1. D35.7 nói route sim "không phá thứ tự" nhưng ca E1 gốc của R08 (dispatcher đang chạy A1 ĐÃ đánh `processed_at`, route nhận A2 cùng thread) vẫn xảy ra vì `claimNextInbound([])` không biết thread đang chạy; ép thứ tự chỉ chặn trường hợp tin cũ chưa xong/đang khoá. Chấp nhận (chỉ `DATA_MODE=sim`, đã ghi vào docs/web.md) hay muốn route sim gọi cùng tập `exclude` với runner (cần cơ chế chia sẻ, đổi thiết kế)?
2. D35.1 áp D8 chỉ cho nhóm (`!dm`); bảng §12.5 ghi `answered > 0` không phân biệt DM — DM không có tool `answers` nên khác biệt chỉ trên giấy. Cần SO xác nhận câu chữ bảng.
3. Probe B1 của R08 ghi "tin chủ sau đó model_calls 0" một phần do khoá kịch bản giả trùng độ dài (lịch sử DM chứa khoá m1) — không ảnh hưởng kết luận C3 (đã đo có `takeover_on_owner_dm`).

## Tiếp theo
🖐 Cần tay người: phán quyết R09 + trả lời câu 1–2.
🤖 Agent làm được ngay: thẩm định lại độc lập (đo lại đột biến M5/M10–M12/M14/M17), đồng bộ não sau phán quyết.
⭐ Nên làm trước: thẩm định lại R09 bằng agent khác họ model.
⏸ Chưa làm: D35.13 (botUid thật ở P03b, G1/G2 vào Idea Vault); đồng bộ `brain4agent/`.

⏳ Chờ phán quyết.
