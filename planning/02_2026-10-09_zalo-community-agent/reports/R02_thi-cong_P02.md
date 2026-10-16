Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude / Sonnet 5.5 (🟠) · Bước 0: exit 0 · hiểu việc: dựng đường ống NHÓM của worker (nhận tin + 8 loại sự kiện nhóm, thi hành `outbox` action/react, text nhóm có quote/mention qua pacer có ngân sách theo nhóm) + kênh giả lập nhóm (`sim-actions.ts`, `/dev/sim`) + docs / xong khi gate `GATE_OK`, `npm test` worker ≥ 51 + core ≥ 82 + web ≥ 31 (0 fail, 0 skip), `test:db` exit 0 hai lần liên tiếp với đủ ca §10 hàng 2–4, `pacer-sim --group` ra `violations: 0` + `first_hour: 20`, `git diff --stat` ⊆ ĐƯỢC GHI / cấm đụng `db/migrations/**`, `agent/**`, `planning/**` ngoài R02+evidence, `brain4agent/`, version; cấm seen nhóm, react tự động, `getGroupChatHistory`, action nguy hiểm, đoán `cliMsgId`, tự xin QR lại; không viết logic agent, không push.
Handoff: handoffs/H02_thi-cong_P02.md
Base: 5f233d8504d2757052e894bc0444fbefd856691b
Head: d2b385be83e4aed333158aa1cd65ab6e5e38b003

## 1. Lệnh + exit code (nguyên văn)
| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| 0 | `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` | 0 (`NÃO ĐÃ OK`) | (in thẳng stdout, chạy trước mọi sửa) |
| a (ĐỎ, cây cũ) | `npx vitest run --config vitest.db.config.ts src/dbtests/p02-group.db.test.ts` (test `delete_message` khẳng định `uidFrom` = người gửi gốc, chạy trên Base) | 1 (`Cannot read properties of undefined (reading 'find')` — chưa có `FakeSession.actions`) | [red-delete-uid](../evidence/P02/red-delete-uid.txt) |
| a (ĐỎ, đối chứng §10.1) | `P02_RED_BOT_UID=1 npx vitest run --config vitest.db.config.ts src/dbtests/p02-group.db.test.ts -t "NGUOI GUI GOC"` (core cố tình đưa uid bot) | 1 (`expected 'community-self-uid' to be 'sender-goc-1'`) | [red-delete-uid-bot](../evidence/P02/red-delete-uid-bot.txt) |
| (ĐỎ, đột biến) | `pacer.ts` sửa 2 chỗ (bỏ kiểm ngân sách, bỏ giới hạn quote part 0) rồi `npx vitest run src/pacer.test.ts` ⇒ 2 ca đỏ; đã `git checkout` lại | 1 | [red-pacer-mutation](../evidence/P02/red-pacer-mutation.txt) |
| §3.f | `npm run gate` | 0 (`GATE_OK`; `forbidden_tools: 0`, `forbidden_actions: 0`, `unlisted_tools: 0`, `pivot_hits: 0`) | [gate](../evidence/P02/gate.txt) |
| §3.f | `npm test` | 0 | [test](../evidence/P02/test.txt) · [danh sách ca worker](../evidence/P02/worker-tests-verbose.txt) |
| §3.f | `set -a; . ./.env; set +a; npm run test:db` (lần 1) | 0 | [test-db](../evidence/P02/test-db.txt) |
| §3.f | `npm run test:db` (lần 2, liền sau) | 0 | [test-db-run2](../evidence/P02/test-db-run2.txt) |
| §10.5 | `node --import tsx apps/zalo-worker/src/tools/pacer-sim.ts --group` | 0 (`violations: 0`, `first_hour: 20`, `min_gap_ms: 9000`, `second_hour: 20`, xong 4.06 h) | [pacer-group](../evidence/P02/pacer-group.txt) |
| §3.f | `git diff --stat 5f233d8..d2b385b` | 0 (34 file, +4016/−326, mọi đường ⊆ ĐƯỢC GHI) | [diff-stat](../evidence/P02/diff-stat.txt) |

## 2. Test tổng/pass/fail/skip
- `npm test` (đo trên Head): web 31 · worker 93 · core 85 = 209 / 209 / 0 / 0. So nền: worker 37 → 93 (+56, đòi ≥ +14), core 82 → 85 (+3), web 31 → 31.
- `npm run test:db` (hai lần liên tiếp, cùng số): core 29 (nền 16, +13) · web 21 (nền 14, +7) · worker 44 (nền 27, +17) = 94 / 94 / 0 / 0; không dòng `skipped` nào.
- Dòng gate cuối: [gate](../evidence/P02/gate.txt) = `GATE_OK: tat ca cac buoc deu xanh.`

Ca mới (đối chiếu SPEC-P02 §10):
- **Hàng 1 — `npm test` worker, +56 ca** (tên đầy đủ ở [worker-tests-verbose](../evidence/P02/worker-tests-verbose.txt)):
  - `inbound.test.ts` +13: tin nhóm text ⇒ payload §8.2 (mentions/quote/cli_msg_id/d_name) · sticker nhóm ⇒ `unsupported` nhãn "thành viên" · 8 ca `group_event` (`join`, `join_request`, `leave`, `remove_member`, `add_admin`, `remove_admin`, `update_setting`, `update` ⇒ đúng `payload.event`, `zalo_msg_id` dạng `gev-<nhóm>-<loại>-<time>`) · không `sourceId` ⇒ `sender_uid='zalo'` · `NEW_LINK`/pin/board/remind/avatar/`block_member`/`unknown` ⇒ KHÔNG ghi (15 loại) · `is_self` + chống trùng khi reconnect.
  - `zca-normalize.test.ts` +3: `GroupEvent` JOIN / JOIN_REQUEST / thiếu `time`.
  - `actions.test.ts` +12: `delete_message` gọi `deleteMessage` với `uidFrom` = người gửi gốc (không phải uid bot), type=group, onlyMe=false · thiếu `cliMsgId`/`uidFrom` ⇒ `cli_msg_id_missing`, 0 lần gọi Zalo · `status≠0` ⇒ failed · `review_join` 166 ⇒ `botNotAdmin` · 170/178 ⇒ xong · `remove_member` `errorMembers` · block/unblock/lock_poll/remove_reminder/update_group_settings · create_poll/reminder/note · body sai ⇒ `invalid_action_body` · `sync_group_info` với `memberIds=[]` ⇒ lấy từ `memVerList` · `memberIds` có sẵn ⇒ bỏ `memVerList` · hành động cấm/lạ ⇒ `unknown_action`.
  - `pacer.test.ts` +17 (store giả `vi.mock`, 0 DB): `typing` trước text nhóm · `linkSentGroupMessage` · tin dài 2 phần chỉ part 0 có quote + mention chỉ ở phần chứa nó · `buildSplitBodies/buildOutboundText` · `group_unknown` · hết ngân sách giữ `queued` note `group_budget` + quá TTL ⇒ `budget_expired` + audit · còn ngân sách ⇒ gửi · nhóm không gửi `seen` · delete_message sent+result+audit `zalo.action`+`completeApproval` · thiếu cliMsgId ⇒ failed · 166 ⇒ `bot_is_admin=false` + alert `deputy_missing` + approval failed · review_join 166 / 170,178 · 221 ⇒ requeue+backoff · action TRƯỚC text, ≤3 action/tick · action tính `maxPerMinute` · hành động lạ ⇒ failed · `react`.
  - `pacer-policy.test.ts` +9: `simulatePacer` 100 tin/1 nhóm × 4 seed ⇒ `first_hour=20`, `min_gap ≥ 8000`, 0 vi phạm `verifySendLog` · bộ đo đỏ khi không giới hạn (`group_gap` + `group_budget`) · giãn cách nhóm 8 s + jitter vs DM 3 s · nhóm không tính `recipients` · action tính `maxPerMinute` · `mentionsForFirstChunk`.
  - `config.test.ts` +2: mặc định + env nhóm (`PACER_GROUP_GAP_MS`, `PACER_GROUP_JITTER_MS`, `GROUP_TEXT_TTL_MIN`, `PACER_ACTIONS_PER_TICK`).
- core unit +3 (`sim-mentions.test.ts`): `buildMentions` (không mention · `@bot` có sẵn · chèn đầu text + `@uid`).
- **Hàng 2 — `test:db` worker, +17 ca** (`p02-group.db.test.ts`): `markSent` ghi `sent_at` · `linkSentGroupMessage` đổi `out-<id>` ⇒ msgId (idempotent) · `groupTextSentLastHour` = 20 với 20 hàng sent trong giờ + 1 hàng 2 giờ trước · gửi thật nhóm `typing→text` + link · hết ngân sách giữ `queued` rồi gửi khi cửa sổ trượt · `budget_expired` + audit · `group_unknown` + audit · `delete_message` uid gốc + audit đếm 1 · thiếu cliMsgId · 166 ⇒ `bot_is_admin=false` + `deputy_missing` · 170/178 · `approvals` approved→executed/failed + audit · `sync_group_info` (upsert nhóm mới `enabled=false`, memVerList, admin⇒moderator không hạ vai, vắng mặt ⇒ `left_at`) · tin nhóm payload §8.2 + không `seen` · chủ gõ tay trong nhóm không tiếp quản · 4 `group_event` + `new_link` không ghi + trùng ⇒ 1 dòng · undo. Ba ca cũ của `p02-worker.db.test.ts` được sửa theo hợp đồng mới (tin nhóm ⇒ lưu; outbox nhóm chưa khai ⇒ `group_unknown`; nhãn "thành viên").
- **Hàng 3 — `test:db` core, +13 ca** (`sim-actions.db.test.ts`): delete đúng uid ⇒ `deleted_at` · sai uid ⇒ `failed` `uidFrom_mismatch` (tin không bị xoá) · tin không tồn tại / thiếu cliMsgId · `review_join` approve ⇒ `group_members` + `join_requests` · remove/block/unblock ⇒ `left_at`/`deny_users` · `approvalId` ⇒ executed/failed · text nhóm ⇒ `sim-out-<id>` + `sent_at` + đổi dòng đệm · `sync_group_info`/poll/hành động lạ · `simInbound`: mentionBot, chèn `@bot` + `@uid`, quote (group_messages / outbox bot / không thấy ⇒ `SimQuoteNotFoundError`), `event` ⇒ `group_event`, sticker ⇒ `unsupported`, `system` bị từ chối.
- **Hàng 4 — `test:db` web, +7 ca** (`sim-send.db.test.ts`): `mentionBot:true` ⇒ `payload.mentions[0].uid='sim-bot'` · `event:'join_request'` ⇒ `payload.kind='group_event'` · `senderUid:'system'` ⇒ 400 `reserved_sender` · sticker không cần text + quote owner đúng · 6 dạng body sai ⇒ 400 `invalid_body` + `quote_not_found` · 404/403/403 · `GET /thread` ⇒ `{messages, actions}` với `deleted`.
- **Hàng 6 (Zalo thật): hoãn tới P09** — không làm, không có `evidence/P02/live.txt`.

## 3. `git diff --stat 5f233d8..d2b385b` + SHA từng commit
[diff-stat](../evidence/P02/diff-stat.txt) (34 file, +4016/−326)
- c1177bd `feat(worker): group transport, admin actions and per-group pacer budget` (`apps/zalo-worker/src/**`, `.env.example`)
- 32c0132 `feat(sim): group channel with actions on the simulated DB and /dev/sim group board` (`packages/core/src/sim/**`, `sim-actions.db.test.ts`, `apps/web/app/{dev,api/dev}/sim/**`, `sim-send.db.test.ts`)
- d2b385b `docs(p02): document group transport, sim actions and /dev/sim group board` (`docs/zalo-worker.md`, `docs/web.md`, `docs/core.md`)
- Commit report (riêng, sau Head): ghi ở dòng trả về của worker.

## 4. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| b, c (worker inbound/action/pacer, `pacer-sim --group`) | 🟠 | Claude / Sonnet 5.5 |
| d (sim + `/dev/sim` + test DB core/web) | 🟠 | Claude / Sonnet 5.5 |
| e (docs module) | 🟢 | Claude / Sonnet 5.5 (cao hơn tầng yêu cầu một bậc — không có model 🟢 trong phiên; không làm việc 🔴) |
| Thẩm định nội bộ | — | Không phóng auditor; tự đo đột biến (`red-pacer-mutation`, `red-delete-uid-bot`). KHÔNG tuyên bố đạt cổng. |

## 5. Việc KHÔNG làm + lý do
- §10 hàng 6 (Zalo thật, bot phó nhóm, `evidence/P02/live.txt`): hoãn tới P09 theo handoff.
- Không đổi `db/migrations/**` (đủ cột; không thiếu gì), `packages/core/src/agent/**`, `brain4agent/`, `package.json` version, `plan.md`/`specs/`. `packages/core/src/index.ts` KHÔNG sửa: web lấy `SimQuoteNotFoundError`/`SimMsgType`/… qua namespace `sim` đã export; `applySimOutbox` được `simDeliver` gọi nên web không cần export riêng.
- Không enqueue `react` (Q5 tạm tắt, vùng cấm §8): worker CHỈ biết thi hành nếu có hàng `react`; core không tạo. Không gọi `getGroupChatHistory`, không `seen` nhóm, không action nguy hiểm — gate `forbidden_actions: 0`.
- Không ghi `group_messages` từ worker (ranh giới nghiệp vụ, SPEC-P02 §2.1): chỉ đổi `out-<id>` ⇒ msgId thật khi core đã chèn.
- Không đọc/sửa 2 file chưa theo dõi ở root (`lenqclaw_presentation_transcript.pdf`; `repomix-output.xml` không có trong cây lúc này).

## 6. Câu hỏi mở (cần người)
1. Tên audit khi action thất bại: SPEC-P02 §4.2 viết `zalo.action` (kèm `ok`), 01-CONTRACTS §8.3 viết `zalo.action_failed`. Đã chọn: thành công ⇒ `zalo.action`, thất bại ⇒ `zalo.action_failed`, cùng `data {action, thread, ok, code}`, đúng 1 audit/hành động (BB-09). Đổi một dòng ở `store.auditAction` nếu muốn gộp.
2. `ZaloActionError`: SPEC §3 nói "`code` số", nhưng 01-CONTRACTS §9 quy ước `code` = tên lớp (mọi lớp lỗi worker khác dùng chuỗi). Đã chọn: `code='ZaloActionError'` + `apiCode: number | null` (số Zalo). Test dùng `apiCode`.
3. Chữ ký lệch nhẹ so với SPEC (mở rộng, không đổi nghĩa): `store.groupBudget(account, threadId)` (SPEC viết `(threadId)`), `store.applyGroupSync(account, groupId, result, ownUid)` (SPEC không đưa `ownUid` vào `result`), `PacerConfig` thêm `groupTextTtlMin` + `actionsPerTick`, `.env.example` thêm `PACER_ACTIONS_PER_TICK=3` (SPEC §4.1 dùng tên này nhưng bảng §10 không liệt kê).
4. `sync_group_info` cho nhóm CHƯA có trong `zalo_groups` hiện tạo dòng mới `enabled=false` (SPEC "upsert"); allowlist vẫn giữ (nhóm tắt không đệm/trả lời). Nếu muốn "chỉ cập nhật nhóm đã khai" thì đổi `applyGroupSync` thành `update`.
5. Chủ gõ tay trong NHÓM (tin `is_self` không khớp outbox): lưu vết (`processed_at=now()`, `staff_manual=true`), outcome `group_inserted`, KHÔNG tiếp quản (SPEC-P02 §2.1, Q4 giá trị tạm).
6. Kênh giả lập: `quoteMsgId` tra `group_messages` → `outbox` (owner = `sim-bot`) → `inbound_events` vì ở P02 core chưa ghi `group_messages` (P03); `review_join` chỉ giải quyết `join_requests` đang `pending` (không tự bịa dòng). Hành động lạ ở sim ⇒ `failed unknown_action`.
7. Ba test cũ bị sửa vì hợp đồng đổi có chủ đích (tin nhóm trước đây "chưa lưu"/outbox nhóm trước đây `group_forbidden_phase1`; nhãn "cư dân" ⇒ "thành viên") — không phải làm yếu test.

## 7. Tiếp theo
🖐 Cần tay người: duyệt R02 theo bảng cổng (đo lại gate / `npm test` / `test:db` ×2 / `pacer-sim --group`); trả lời 4 câu hỏi mục 6 (nhất là 1, 2, 4) · 🤖 Agent làm được ngay: sửa theo phán quyết, hoặc nhận handoff P03 (runtime agent: cổng nhận tin, chèn đệm `group_messages` + dòng `out-<id>`, `completeApproval` phía core) · ⭐ Nên làm trước: phóng thẩm định đối kháng cho P02 (🔴 bảo mật + rủi ro khoá tài khoản: thử phá `uidFrom`, ngân sách trượt, `maxPerMinute` với action, vùng cấm) trước khi P03 dựa vào đường ống này · ⏸ Chưa làm: §10 hàng 6 (Zalo thật, tới P09), enqueue `react` (Q5), ghi `group_messages` phía core (P03).

## Phán quyết SO (2026-10-16, Claude Opus 5.5)
SO đo lại trên `d2b385b`: gate exit 0 (31/93/85), test:db exit 0 ×2 (29/21/44), `pacer-sim --group` `first_hour: 20`, `min_gap_ms: 9000`, `violations: 0`, diff ⊆ phạm vi — KHỚP report. Nhưng thẩm định đối kháng [R03](R03_tham-dinh_P02.md) tìm mục CHẶN (kick/block không cần thẻ duyệt hợp lệ — SO xác minh tại `apps/zalo-worker/src/actions.ts:86-96`) + 6 bộ đo lọt đột biến. 4 điểm lệch worker tự nêu ở mục 6: chấp nhận (SO đồng bộ SPEC sau). Cách sửa: plan D29 ⇒ [H05](../handoffs/H05_thi-cong_P02-fix.md).

🔁 SỬA: D29 điểm 1–8 (R03 mục 1–7, 8, 11, 12, 13, 15)
