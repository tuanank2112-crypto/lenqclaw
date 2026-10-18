Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Anthropic / Claude Haiku 5.5 · Bước 0: exit 0 · hiểu việc: phạm vi = dọn outbox/approvals trong test DB + timeout p02-worker + scripts/check_g13.mjs; xong khi = g13 violations 0 trên DB tạm sau 2 lần test:db, test:db 315 xanh; cấm = đổi assertion, package.json, planning ngoài hồ sơ, brain4agent, push
Handoff: handoffs/H15_thi-cong_test-hygiene.md
Base: 9832a8e (parent của commit worker; base handoff = e1c2f18, giữa đó có 3 commit khác không thuộc H15: 9542d72, cf72445, 9832a8e)
Head: 1b5cb46

## 1. Lệnh + exit code (nguyên văn)
| Lệnh | Exit | Evidence |
| :-- | :-- | :-- |
| `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 | (không lưu) |
| `node --import tsx scripts/check_g13.mjs` trên DB dev `lenqclaw` (TRƯỚC khi sửa, có rác) | 1 · `{"violations":2016}` | `evidence/TEST-HYGIENE/red-g13.txt` |
| DB tạm `lenqclaw_h15` (tạo trong `lenqclaw-db-1`), `npm run test:db` lần 1 | 0 · 19/19, 8/8, 5/5 file · Tests 203 + 30 + 82 = 315 passed, 0 fail, 0 skip | `evidence/TEST-HYGIENE/test-db.txt` |
| `node --import tsx scripts/check_g13.mjs` sau lần 1 | 0 · `{"violations":0}` | `evidence/TEST-HYGIENE/g13.txt` |
| `npm run test:db` lần 2 (cùng DB tạm) | 0 · 315 passed, 0 fail, 0 skip | `evidence/TEST-HYGIENE/test-db-2.txt` |
| `check_g13` sau lần 2 | 0 · `{"violations":0}` | `evidence/TEST-HYGIENE/g13-2.txt` |
| DB tạm `lenqclaw_h15` xoá (`drop database … with (force)`) | 0 | — |
| `npm run gate` | 0 · `GATE_OK` · `violations: 0` (check_adapter_boundary) | `evidence/TEST-HYGIENE/gate.txt` |
| `npm test` | 0 · 32 + 114 + 606 = 752 passed, 0 fail, 0 skip | `evidence/TEST-HYGIENE/test.txt` |
| `git show --stat 1b5cb46` | — | `evidence/TEST-HYGIENE/diff-stat.txt` |

Ghi chú lần đo: lần chạy đầu gate = exit 1 vì `scripts/check_g13.mjs` import `pg` ngoài `adapters/db.ts` (check_adapter_boundary). Đã sửa: script dùng `packages/core/src/adapters/db.ts`, chạy bằng `node --import tsx`. Lần đo trung gian trên DB tạm (trước khi sửa `dropGroup`) cho `violations` 5 rồi 10: nguyên nhân là hàng `outbox` action của ca `approval_invalid` (thread `g-*`, `sim-act-*`, approvalId rỗng / không phải uuid / không tồn tại) không bị dọn, nên đã thêm dọn theo thread (xem §2). Đây là bằng chứng chỉ bộ đo, không phải lỗi sản phẩm: các hàng đều `failed`.

## 2. File test/helper đã sửa (bước dọn + timeout)
- `packages/core/src/dbtests/p05-fix-f11.db.test.ts`, `p05-fix.db.test.ts`, `p05-join-welcome.db.test.ts`, `p05-moderation.db.test.ts` — afterAll: xoá `outbox` action có `approvalId` thuộc approvals của thread test TRƯỚC khi xoá approvals.
- `packages/core/src/dbtests/sim-actions.db.test.ts` — 4 chỗ xoá approvals (theo id) có dọn outbox trước; `dropGroup` local dọn thêm outbox `kind='action'` của thread test.
- `apps/zalo-worker/src/dbtests/p02-fix.db.test.ts` — 7 chỗ (6 theo id + 1 theo thread-or-id) dọn outbox trước.
- `apps/zalo-worker/src/dbtests/p02-group.db.test.ts` — 1 chỗ theo id.
- `apps/zalo-worker/src/dbtests/p05-approval-event.db.test.ts` — afterAll theo thread.
- `apps/zalo-worker/src/dbtests/group-helpers.ts` (file helper ngoài danh sách §2, ghi theo quy định "file test khác nếu đo chỉ ra") — `dropGroup` dọn outbox `kind='action'` của thread test.
- `apps/zalo-worker/src/dbtests/p02-worker.db.test.ts:407` — timeout 120 000 ⇒ 300 000 ms, kèm chú thích; số tin/người/kỳ vọng giữ nguyên.
- Mới: `scripts/check_g13.mjs` — in `{"violations": n}`, exit 1 nếu n > 0, exit 2 nếu lỗi kết nối.

Mọi lệnh xoá mới đều lọc theo id thẻ hoặc thread do test sinh; không xoá dữ liệu ngoài đó. Không đổi assertion nào.

## 3. Bảng phân công
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| a (dọn outbox trước approvals) | 🟢 | Anthropic / Claude Haiku 5.5 (worker tự làm) |
| b (timeout 300 s) | 🟢 | Anthropic / Claude Haiku 5.5 |
| c (đo G13, gate, test) | 🟢 | Anthropic / Claude Haiku 5.5 |
| Mở rộng: dọn outbox theo thread trong `dropGroup` (phát hiện từ đo c) | 🟢 (vượt mức đề xuất? không — thuộc gói a/c) | Anthropic / Claude Haiku 5.5 |

Thẩm định nội bộ: đọc lại diff (11 file, 49+/1-), đối chiếu từng lệnh `delete` mới với `made`/`threads`/`ap`/`group`. Không có thẩm định độc lập.

## 4. Việc KHÔNG làm + lý do
- Không push (luật handoff). Không đụng DB dev ngoài `SELECT` của `check_g13` (dữ liệu rác dev còn nguyên: violations 2016).
- Không sửa `package.json`, `brain4agent/`, `planning/**` ngoài `reports/R15_…` và `evidence/TEST-HYGIENE/`.
- Không đo ca timeout riêng dưới tải cao; chỉ nâng trần theo handoff.
- Không xử lý ca đột biến/hỏng giữa chừng (afterAll không chạy) — ngoài phạm vi.
- File `lenqclaw_presentation_transcript.pdf` (untracked, không do worker tạo) không được stage.

## 5. Câu hỏi cần người
Không có.

⏳ Chờ phán quyết.
