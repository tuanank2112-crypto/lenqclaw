# TESTING-ACCEPTANCE — Ma trận test, golden thật, Exit Gates

> "Xong" = lệnh chạy ra số, số đạt ngưỡng, bằng chứng nằm trong `evidence/<gói>/*.txt` (stdout máy, CẤM sửa tay). Không có bằng chứng ⇒ chưa xong. Mọi bộ đo MỚI phải có bằng chứng ĐỎ trên hệ cố tình hỏng ít nhất một lần (`evidence/<gói>/red-*.txt`).
> Số nền đo 2026-10-09 (HEAD `eada365`): `npm test` 317 (core 244 · web 36 · worker 37); bộ kiểm của architect: `evidence/ARCH/{gate-ref,ladder-ref,budget-ref,db-checks,migration-probe}.txt` đều exit 0.

## §1. Cổng không cần DB/LLM (mọi gói) — `npm run gate`
| Bước | Kỳ vọng |
| :-- | :-- |
| `npm run typecheck` · `npm run build` | exit 0 (build không cần `DATABASE_URL`) |
| `npm test` | 0 fail, 0 skip; số test từng workspace không giảm so với report gói trước (P01 đặt sàn mới: core ≥ 60, web ≥ 30, worker ≥ 37) |
| `node scripts/check_adapter_boundary.mjs` | `violations: 0` (BB-02, BB-03) |
| `node scripts/check_agent_tools.mjs` | `forbidden_tools: 0`, `forbidden_actions: 0`, `unlisted_tools: 0` (BB-01, BB-06) |
| `node scripts/check_pivot_cleanup.mjs` | `pivot_hits: 0` (D03) |
Kiểm mã thoát trực tiếp (`$?`), không qua `| tail` (G08).

## §2. Ma trận test theo gói (chi tiết "xong khi" nằm ở mục nghiệm thu từng SPEC)
| Gói | Test bắt buộc (tóm tắt) |
| :-- | :-- |
| P01 | SPEC-P01 §10: tag, gate + `check_pivot_cleanup`, `test:db` từ rỗng `applied: 9`, 94 file xoá, grep `bql|market` = 0 |
| P02 | SPEC-P02 §10: ≥ 14 ca worker (nhóm, sự kiện, action với `uidFrom` đúng, 166 ⇒ `bot_is_admin=false`, chunk/quote, `simulatePacer` 20/giờ), `sim-actions`, `/api/dev/sim/send` nhóm |
| P03 | SPEC-P03 §11: 28 ca cổng (nguyên văn `gate-ref`), policy ≥ 30, persona/BB-07, 14 ca DB lượt nhóm/DM (gồm D22 ngữ cảnh DM, D24 vết lượt), 0 model cho tin thường mode `mention` |
| P04 | SPEC-P04 §8: token/RRF, embed dịch đúng, DB lai, 5 ca câu hỏi bỏ trống (`db-checks (b)`) |
| P05 | SPEC-P05 §10: 14 ca thang (`ladder-ref`), lưới 0 báo nhầm/40, bằng chứng duyệt ≥ 12 ca, 10 ca DB kiểm duyệt, join/welcome, thẩm định đối kháng ≥ 3 cách phá |
| P06 | SPEC-P06 §7: điểm lead, trạng thái lead, trí nhớ không rò vào nhóm, mời riêng |
| P07 | SPEC-P07 §8: `computeNextRun` 12 ca, timers idempotent, automations skip-locked, báo cáo ngày |
| P08 | SPEC-P08 §5: policy ≥ 14, 4 bộ DB web chạy 3 lần xanh, `next build && next start` + curl |
| P09 | §3 golden thật + §4 cột `zalo-thật`/`vps` |

## §3. Golden thật với model thật (D10) — `evals/golden/community/`
Chấm bằng `npx tsx --env-file=.env scripts/eval_community.mjs [--set a,b]` (mẫu `eval_golden.mjs`/`score.mjs` cũ: thiếu credential của provider đang chọn ⇒ `BLOCKED` exit 3; >10% ca lỗi 429/5xx ⇒ bộ đó `blocked` exit 3; trượt ⇒ 1; đạt ⇒ 0; `--set` tên lạ ⇒ exit 2). Cần DB migrate+seed+seed:sim, `npm run build -w @lenqclaw/core` trước. **Gate chỉ đóng khi chấm bằng `gemini-3.6-flash`** (Đ26 cũ giữ; model khác chỉ để chạy dev). Mỗi ca dùng nhóm/uid mô phỏng riêng (mẫu `provisionEvalResident` cũ), đánh dấu `processed_at` dọn hàng đợi trước mỗi ca (G29).

| Bộ | Số ca | Định dạng dòng JSONL | Cách chấm | Ngưỡng |
| :-- | :-- | :-- | :-- | :-- |
| `activation.jsonl` | ≥ 60 (≥ 25 "nên nói", ≥ 35 "nên im") | `{case_id, group_mode:'ambient', transcript:[{uid, name, text, minutes_ago}], focus_index, expect_speak: boolean, expect_cite?: boolean}` | nạp transcript vào `group_messages` nhóm mô phỏng `ambient`, chạy `flushAmbient` thật qua `routeInboundEvent` với model thật; `spoke = outbox text nhóm > 0` | `silent_precision = (ca im đúng)/(ca kỳ vọng im) ≥ 0.90`; `speak_recall ≥ 0.80`; trong ca `expect_cite` ⇒ ≥ 80% tin có `(theo ` |
| `moderation.jsonl` | ≥ 80 (≥ 25 scam, ≥ 15 spam/ad, ≥ 40 ok — ok gồm câu bàn prompt/jailbreak/giá/mua gói) | `{case_id, text, sender_role:'member', expect_verdict:'ok'\|'spam'\|'scam'\|'ad'\|'harass'}` | `moderateGroupMessage` với triage thật + lưới; so `verdict` (spam/ad gộp) | `scam_recall ≥ 0.95`; `false_delete_rate` (ca ok ⇒ action delete) ≤ 0.02; `ok_precision ≥ 0.90` |
| `lead_intent.jsonl` | ≥ 40 (≥ 15 có ý định, ≥ 25 không — gồm hỏi giá chung, bàn công nghệ) | `{case_id, surface:'dm'\|'group', text, expect_lead: boolean}` | `triageCommunityMessage` thật ⇒ `lead_intent ∧ lead_confidence ≥ 0.7` | `recall ≥ 0.85`; `false_positive ≤ 0.05` |
| `unanswered.jsonl` | ≥ 40 (≥ 20 là câu hỏi thật, ≥ 20 không: cảm thán, "ai cũng biết", câu hỏi tu từ) | `{case_id, text, expect_question: boolean}` | triage `is_question ∧ question_confidence ≥ 0.6` | `F1 ≥ 0.80` |
Bằng chứng đỏ bắt buộc cho máy chấm: `scripts/eval/community/red-fake-model.mjs` (model giả luôn nói / luôn `ok`) ⇒ exit 1 với số đúng chiều (`evidence/P09/red-eval.txt`). Mọi ca golden KHÔNG được trùng nguyên văn với ví dụ trong prompt (`prompt-golden-leak.test.ts`, mẫu G28).

## §4. Exit Gates (đánh dấu theo môi trường — kế hoạch chỉ đóng khi cột `vps` ✅)
| Gate | Nội dung | local | zalo-thật | vps |
| :-- | :-- | :-- | :-- | :-- |
| G01 | Cổng §1 xanh trên cây sạch sau P01; tag `archive/plan-01-marketplace`; `pivot_hits: 0` | ✅ 2026-10-16 (R01) | — | ⬜ |
| G02 | Migration 001–009 từ DB rỗng `applied: 9`; chạy lại `applied: 0`; `pre-007.sql` tồn tại trước khi áp lên DB có dữ liệu | ✅ 2026-10-16 (R01) | — | ⬜ |
| G03 | Auth 2 vai + policy ≥ 14 ca + audit | ✅ 2026-10-16 (15 ca) | — | ⬜ |
| G04 | Transport nhóm: tin/sự kiện nhóm ghi đúng payload; `delete_message` dùng `uidFrom` người gửi (ca đỏ: uid bot); 166 ⇒ `bot_is_admin=false` | ⬜ | ⬜ (bot là phó nhóm thật, `sync_group_info` ⇒ `bot_is_admin=true`) | ⬜ |
| G05 | Pacer: `simulatePacer` 100 tin/1 nhóm ⇒ `first_hour=20`, `min_gap≥8000`, `violations: 0`; DM 50 tin/20 người ⇒ 0 vi phạm (giữ) | ⬜ | ⬜ (24 giờ chạy thật: 0 lần backoff 221/no-msgId) | ⬜ |
| G06 | Watchdog 3003/1006/im 20 phút (giữ test cũ, tài khoản `community`) | ⬜ | ⬜ | ⬜ |
| G07 | Cổng nhận tin 28/28 + BB-04 giả mạo; 0 `agent_runs` cho 20 tin thường mode `mention` | ⬜ | ⬜ (nhóm thử: 1 ngày tin thường ⇒ 0 lượt model, đo `agent_runs`) | ⬜ |
| G08 | Ambient: text cuối không đăng (BB-05), ngân sách 12 lượt/giờ, host ép trả lời khi mention (fallback 1 tin) | ⬜ | ⬜ | ⬜ |
| G09 | Golden `activation` đạt (§3) bằng `gemini-3.6-flash` | ⬜ | — | ⬜ |
| G10 | Golden `moderation` đạt | ⬜ | — | ⬜ |
| G11 | Golden `lead_intent` đạt | ⬜ | — | ⬜ |
| G12 | Golden `unanswered` đạt | ⬜ | — | ⬜ |
| G13 | Kiểm duyệt DB 10 ca + thẻ duyệt: `select count(*)::int as violations from outbox o where o.kind='action' and (o.body->>'action') in ('remove_member','block_member') and not exists (select 1 from approvals a where a.id::text = o.body->>'approvalId' and a.status in ('approved','executed','failed'))` ⇒ `0` (chạy sau mọi test:db và sau demo); ca đỏ: chèn 1 hàng action tay ⇒ `1` | ⬜ | ⬜ (sau 7 ngày: `0`) | ⬜ |
| G14 | BB-07: prompt lượt nhóm không chứa `member_profiles.notes` (test fetch giả) + `grep -c "member_profiles" packages/core/src/agent/community/persona.ts` = `0` | ⬜ | — | ⬜ |
| G15 | Đệm: `select max(c) from (select count(*) c from group_messages group by zalo_account_id, thread_id) t` ≤ 200 và `min(received_at) > now() - interval '8 days'` sau `runTimers` | ⬜ | ⬜ | ⬜ |
| G16 | Thẩm định đối kháng P05 (🔴, agent khác, ≥ 3 cách phá, 0 hành động trái phép) | ⬜ | — | — |
| G17 | Timers idempotent + automations skip-locked + báo cáo ngày DM owner | ⬜ | ⬜ (nhận 1 báo cáo/ngày trong 3 ngày) | ⬜ |
| G18 | Dashboard: 4 bộ DB web xanh 3 lần + `next build && next start` curl | ⬜ | — | ⬜ |
| G19 | 7 ngày chạy Zalo thật ≥ 2 nhóm (≥ 1 ambient): tài khoản không bị khoá, phiên `connected` ≥ 95% giờ 7–22h, 0 `approvals.status='failed'` do 166 sau khi đặt phó nhóm, than phiền "bot nói nhiều" = 0 (chủ ghi `daily_notes`) | — | ⬜ | ⬜ |
| G20 | `package.json` ×4 `0.1.0`, `changelog.md` mục `0.1.0`, Ma Trận 6 Điểm đồng bộ (SO) | — | — | ⬜ |
| G21 | D22/D24 (BB-13, BB-14): SPEC-P03 §11 hàng 5(m)(n) xanh; sau `runTimers` với `now` +31 ngày: `select count(*) from messages where created_at < $now - interval '30 days'` = `0`, `member_profiles`/`leads` không đổi số dòng; `select count(*) from turn_traces` = số lượt agent của bộ test; ca đỏ: `DM_HISTORY_TURNS` bị bỏ qua (nạp 30 tin) ⇒ hàng 5(m) ĐỎ | ⬜ | ⬜ (7 ngày: `avg(input_tokens)` lượt `dm` theo `turn_traces` ổn định, không tăng theo số ngày) | ⬜ |

## §5. Số đo lưới an toàn (sau mỗi lượt chạy thật, ghi vào report)
```sql
select action, count(*)::int as n from audit_log
 where action in ('turn.fallback_reply','turn.auto_posted_final','ambient.budget_skip','pacer.budget_expired','moderation.need_deputy','tool.denied','router.forged_system_event','agent.model_error','timer.error','kb.embed_unavailable')
   and created_at > $since group by action order by action;
```
Ngưỡng (≥ 100 lượt nhóm với model thật): `turn.fallback_reply` ≤ 3%; `tool.denied` = 0 (nếu > 0 ⇒ bảng policy hoặc prompt sai); `router.forged_system_event` = 0 ngoài test; `pacer.budget_expired` ≤ 5% số tin nhóm; `moderation.need_deputy` = 0 khi bot là phó nhóm. Vượt ⇒ sửa prompt/tool/ngân sách, KHÔNG nới lưới.
