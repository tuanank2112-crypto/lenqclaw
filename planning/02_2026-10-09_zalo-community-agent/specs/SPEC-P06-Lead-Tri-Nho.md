# SPEC-P06 — Kéo sang 1-1, thẻ lead, hồ sơ thành viên, ghi chú ngày (D05d, D05e, D07)

> Tầng 🟠 (hợp đồng ở 01-CONTRACTS §4 `leads/member_profiles/daily_notes`, §5.2, §7.1). Đọc SPEC-P03 §5, §8 trước. Phụ thuộc: P03 (DM), P04 (embedding — có thể chạy lexical trước).
> Mẫu port: OpenClaw memory (curated MEMORY + daily notes, hybrid vector+BM25, suy giảm 30 ngày — `docs/concepts/memory-search.md:95-101,150-155`), quy tắc "MEMORY never injected in group sessions".

## §1. Kéo việc riêng sang 1-1 — tool `invite_to_private` (G, mọi vai)
- Khi nào (prompt `rules`): câu hỏi/thảo luận mang tính cá nhân (dự án riêng, báo giá, dữ liệu khách hàng), hoặc `triage.wants_private`/`lead_intent` của tin kích hoạt.
- `run(ctx, {uid, note})`: (1) `uid` phải là thành viên nhóm (`UnknownMemberError`); (2) gửi tin nhóm (qua `send_group_message` nội bộ, ngân sách áp) `"@{tên} bạn nhắn riêng cho mình nhé, mình hỗ trợ chi tiết hơn."` với `mention_uids=[uid]`; (3) nếu đã có `conversations(account, uid, thread_type='user')` có ≥ 1 tin VÀO từ uid (người đó đã nhắn bot trước) ⇒ thêm DM `"Chào bạn, như đã nói ở nhóm {groupName}: {note}"`; chưa ⇒ KHÔNG DM (vùng cấm nhắn chủ động); (4) `member_profiles.notes` append `[{ngày}] mời riêng từ {groupName}: {note}`; audit `lead.invite_private`.
- Pacer `maxRecipients` (15/10 phút) áp cho DM — vượt ⇒ hàng chờ.

## §2. Hồ sơ thành viên — `services/memory.ts` + `member_profiles`
- `rememberMemberNote(account, uid, note, by)` ⇒ append `notes` (dòng `[YYYY-MM-DD HH:MM] (by) note`, cắt đầu khi > 4000 ký tự), cập nhật `display_name` nếu có; audit `memory.member_note`.
- Tool `remember_member_note` (G/D/O): ở G chỉ GHI; ở D chỉ cho `uid = requester.uid`; O tự do.
- Tool `recall_member_profile` (D, member): trả `{notes, interests, lead: {status, score} | null}` của CHÍNH requester — dùng để nhớ bối cảnh 1-1 giữa các phiên. Owner xem mọi hồ sơ qua `search_memory`/dashboard.
- BB-07: `loadPersonaBundle`/`buildSystemPrompt` cho lượt nhóm KHÔNG chạm bảng này (test SPEC-P03 §11 hàng 4).

## §3. Lead — `services/leads.ts`
```ts
export interface LeadFields { industry?: string; channels?: string[]; msg_volume?: string; deadline?: string; budget?: string; contact?: string; notes?: string }
export function scoreLead(f: LeadFields): number;   // THUẦN: industry 15 · channels 15 · msg_volume 15 · deadline 15 · budget 20 · contact 20 (có giá trị không rỗng ⇒ cộng) — tổng ≤ 100
export async function upsertLead(a: { account; uid; displayName; fields: LeadFields; sourceThreadId?: string; now }): Promise<{ id; status; score; missing: string[] }>;
export async function submitLead(a: { account; uid; now }): Promise<{ id; status: 'handed_off' }>;   // LeadIncompleteError nếu chưa 'qualified'
```
- `upsertLead`: lead mở của uid (index `leads_open_per_uid_idx`) ⇒ merge trường (giá trị mới không rỗng ghi đè), `score = scoreLead`; `status`: `new` ⇒ `qualifying` khi có ≥ 2 trường; ⇒ `qualified` khi `score ≥ LEAD_SCORE_HANDOFF` (60); `missing` = trường còn rỗng theo thứ tự ưu tiên `contact, budget, industry, channels, msg_volume, deadline`.
- `submitLead`: `qualified` ⇒ `handed_off`, `handed_off_at`, DM mọi owner `LEAD_DM(displayName, industry, channels, msg_volume, deadline, budget, contact)`, `owner_notified_at`; dashboard `/leads` thẻ. KHÔNG model.
- Tool `save_lead` (D, member & stranger): `run(ctx, fields)` ⇒ `upsertLead(requester…)`; trả `{status, score, missing}` để agent hỏi tiếp đúng trường thiếu (prompt: hỏi tối đa 2 trường mỗi lượt, không tra hỏi dồn). Tool `submit_lead` (D): `submitLead`; `LeadIncompleteError` kèm `missing`.
- Trong nhóm: agent KHÔNG thu thông tin lead công khai — chỉ `invite_to_private` (§1). `triage.lead_intent ∧ lead_confidence ≥ 0.7` trên tin nhóm ⇒ chỉ là gợi ý trong khối focus (`[gợi ý: có thể là khách tiềm năng]`), quyết định vẫn là model.
- Golden `lead_intent.jsonl` (TESTING §3) chấm triage `lead_intent` trên câu DM/nhóm.

## §4. Ghi chú ngày & tìm kiếm trí nhớ (chỉ O)
- `daily_notes`: `write_daily_note` (O) append dòng vào bản ghi ngày hôm nay (một dòng/lần, `thread_id` null); timers P07 ghi tự động: tóm tắt ngày từng nhóm (`thread_id = nhóm`, do lượt `daily_owner_report` sinh — ≤ 1500 ký tự) và các mốc (thẻ duyệt, lead chuyển).
- `search-memory.ts::searchMemory(account, query, limit)` ⇒ lai: lexical `daily_notes.tsv` + `member_profiles.notes` (ILIKE theo token) + vector `daily_notes.embedding` (khi có) ⇒ RRF như P04 §2 × hệ số suy giảm `0.5^(ngày_tuổi / MEMORY_HALF_LIFE_DAYS)` cho `daily_notes` (`member_profiles` không suy giảm — "curated"). Trả `{kind:'note'|'profile', date|uid, snippet, score}`. `embedPending` (P04) nhúng cả `daily_notes.embedding`.
- Tool `search_memory` (O). CẤM ở G/D (BB-07).

## §5. Vùng cấm P06
- CẤM DM người chưa từng nhắn bot (trừ khi họ là owner); CẤM gửi lời mời kết bạn.
- CẤM lưu nội dung tin nhóm vào `member_profiles` tự động (chỉ khi agent gọi `remember_member_note` có chủ đích hoặc mời riêng).
- CẤM model tự đặt `status='handed_off'` (chỉ `submit_lead` qua `submitLead`), CẤM gửi lead cho ai ngoài `account_owners`.
- CẤM hiện `contact` của lead trong bất kỳ tin nhóm nào (prompt + test: outbox nhóm không chứa `leads.contact`).

## §6. Lỗi
| Lỗi | Khi | Caller |
| :-- | :-- | :-- |
| `LeadIncompleteError {missing}` | `submit_lead` khi chưa `qualified` | agent hỏi trường trong `missing` (≤ 2/lượt) |
| `UnknownMemberError` | `invite_to_private` uid lạ | `is_error` |
| `ConflictError` | `submitLead` khi lead không `qualified`/đã `handed_off` | đọc lại, trả trạng thái |

## §7. Nghiệm thu P06
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/core` — `leads.test.ts` | `scoreLead` 8 ca (rỗng 0; đủ 100; chỉ contact+budget 40); `missing` đúng thứ tự |
| 2 | `npm run test:db -w @lenqclaw/core` — `p06-leads.db.test.ts` | `upsertLead` 3 lần ⇒ 1 dòng, `new→qualifying→qualified`; `submitLead` trước `qualified` ⇒ `LeadIncompleteError`; sau ⇒ `handed_off` + 1 outbox DM owner chứa `industry`; lead thứ 2 cùng uid khi mở ⇒ merge, không dòng mới; sau `closed` ⇒ dòng mới được tạo |
| 3 | `p06-memory.db.test.ts` | `rememberMemberNote` cắt 4000; `searchMemory('agent zalo')` ⇒ note hôm qua xếp trên note 60 ngày (suy giảm); profile khớp xuất hiện; lượt nhóm (fake model) ⇒ body fetch giả KHÔNG chứa `notes` (BB-07) |
| 4 | `p06-invite.db.test.ts` | `invite_to_private` với uid đã DM trước ⇒ 1 outbox nhóm (mention) + 1 outbox DM; uid chưa DM ⇒ chỉ 1 outbox nhóm; uid lạ ⇒ `UnknownMemberError` |
| 5 | Golden thật `lead_intent.jsonl` | `scripts/eval_community.mjs --set lead_intent` exit 0 |
