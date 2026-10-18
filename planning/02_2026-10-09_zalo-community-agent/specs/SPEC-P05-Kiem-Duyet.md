# SPEC-P05 — Kiểm duyệt, thang cảnh cáo, thẻ duyệt, duyệt vào nhóm, chào mừng (D05b, D05c, D06)

> Tầng 🔴 hợp đồng (file này) · 🟠 thi công · thẩm định 🔴 (bảo mật: hành động quản trị). Đọc 01-CONTRACTS §5.1, §5.3, §7.1, §8.3, §9 và SPEC-P03 §4, §6. Phụ thuộc: P02 (action), P03 (lượt).
> D28: kiểm duyệt là node `moderate` của `pipelineGraph` (sau `triage`, trước `gate`; tin bị xoá ⇒ cạnh `afterModerate` ⇒ END); sự kiện nhóm là node `group_event`; `welcome_flush`/`join_request` ⇒ node `system_event` ⇒ `turnGraph`; đường lùi khi model im/sập là node `deliver` (`hostText`, `join_default` — 01-CONTRACTS §12.5). P03 dựng KHUNG các node này; P05 điền thân, KHÔNG đổi node/cạnh.
> Mẫu port: thang cảnh cáo suy giảm theo (nhóm, người) (findings zaloclaw "escalating warn ladder with decay" — tự thiết kế lại, bản tham chiếu `evidence/ARCH/ladder-ref.txt`); thẻ duyệt OpenClaw (approval cards with scope summary).

## §1. Phạm vi
`services/{moderation,moderation-ladder,approvals,join-requests,welcome}.ts`, tool `flag_message`, `delete_message`, `warn_member`, `request_member_removal`, `decide_approval`, `review_join_request`, lệnh `/approve`, `/reject`; web `/approvals` (P08). Mọi tin nhóm đã đệm ở nhóm `moderation_enabled` đi qua §3 TRƯỚC cổng nhận tin (P03 §2 — D28: node `moderate`, cạnh `triage ⇒ moderate ⇒ gate`).

## §2. Lưới tất định — `moderation-grid.ts::classifyGrid(text, ctx)` (THUẦN, ưu tiên CHÍNH XÁC)
Trả `{ hits: GridHit[]; hard: boolean }`. `GridHit` ∈:
| Hit | Luật (trên `normalizeVi(text)` + bản gốc) | `hard`? |
| :-- | :-- | :-- |
| `mass_mention` | `mentions.length ≥ 8` | ✗ |
| `repeat_burst` | người gửi đã gửi ≥ 5 tin GIỐNG HỆT (sau chuẩn hoá) trong 10 phút (đếm từ đệm, KHÔNG tính tin đang xét ⇒ tin giống hệt thứ 6 mới hit — D41) | ✓ |
| `link_flood` | ≥ 3 URL trong một tin | ✗ |
| `scam_phrase` | khớp BẰNG NHAU theo ranh giới từ một cụm trong danh sách `SCAM_PHRASES` (≥ 20 cụm không nhập nhằng, vd "nhan tien thuong khi dang ky", "chuyen khoan truoc de nhan", "viec nhe luong cao", "link rut tien", "ung dung kiem tien moi ngay") — danh sách là hằng TS, test sinh từ chính mảng (G14) | ✓ |
| `contact_spam` | ≥ 2 SĐT (PHONE_RE) + từ "lh"/"liên hệ"/"zalo" trong tin của người có `< 3` tin trong đệm | ✗ |
| `invite_link` | chứa `zalo.me/g/` hoặc `t.me/` từ người không phải owner/moderator | ✗ |
CẤM từ đơn, CẤM cụm nhập nhằng ("đầu tư", "kiếm tiền" đơn lẻ). Test: 40 câu bình thường của cộng đồng AI (có "prompt", "jailbreak", "token", "mua gói", "giá bao nhiêu") ⇒ 0 hit.

## §3. Lớp model + hợp nhất — `moderation.ts::moderateGroupMessage(row, triage, ctx)`
Input: `triage: CommunityTriage | null` (từ P03 §5.2 — cùng MỘT lời gọi với `is_question`/`lead_intent`), `grid = classifyGrid(...)`, vai người gửi.
D31 (SPEC-D31 T3): tin GỌI BOT (mention/quote tin bot/tên bot/lệnh) KHÔNG triage ⇒ `triage=null` ⇒ dòng "triage null" của bảng §9 (lưới quyết); lớp model cho tin đó là chính agent: prompt `rules` thêm "tin gọi bạn có dấu hiệu lừa đảo/spam ⇒ gọi `flag_message` rồi trả lời một câu từ chối ngắn". Thẩm định đối kháng P05 (G16) BẮT BUỘC có ca "scam kèm @bot".
```text
verdict, confidence =
  grid.hard && triage && triage.verdict == 'ok' ⇒ hạ lưới thành hit MỀM (model bác lưới — câu cảnh báo/giáo dục; D41) + audit `moderation.grid_overruled {hit}` ⇒ xét tiếp các dòng dưới
  grid.hard                                  ⇒ ('scam' nếu scam_phrase, 'spam' nếu repeat_burst), 0.95, source 'grid'
  triage && triage.verdict in {scam} && conf ≥ MOD_SCAM_MIN (0.85)        ⇒ scam, source 'model'
  triage && triage.verdict in {spam, ad, harass} && conf ≥ MOD_SPAM_MIN (0.75) ⇒ verdict đó, source 'model'
  grid.hits non-empty (không hard) && triage && triage.verdict != 'ok' && conf ≥ 0.5 ⇒ verdict triage, source 'model'
  else ⇒ 'ok' (không ghi event) | triage null & grid.hits non-empty ⇒ 'unsure' (ghi event, action none)
```
Người gửi `owner`/`moderator` ⇒ `exempt`: ghi `moderation_events(action='none')`, KHÔNG đổi điểm, KHÔNG hành động. Ghi `moderation_events` mọi verdict ≠ ok.

## §4. Thang cảnh cáo — `moderation-ladder.ts` (THUẦN; bản tham chiếu `ladder-ref.mjs`, 14 ca)
```ts
export const LADDER = { halfLifeHours: 168, warn: 1, delete: 2, kick: 3, block: 4 };
export const INCREMENT = { ok: 0, unsure: 0, spam: 1, ad: 1, harass: 1.5, scam: 2 };
export function decayScore(score, lastUpdatedAt, now, halfLifeHours = LADDER.halfLifeHours): number;   // score × 0.5^(giờ/halfLife), giờ ≥ 0
export function nextLadderStep(a: { prevScore; lastUpdatedAt; now; verdict; senderRole }): { score: number; action: 'none'|'warn'|'delete'|'kick_requested'|'block_requested'; exempt: boolean };
```
**Làm tròn 1 chữ số thập phân TRƯỚC khi so ngưỡng** (đo 2026-10-09: 1 + 1 sau 1 giờ suy giảm = 1,996 < 2 ⇒ "spam lần 2 trong ngày" không bị xoá; sau khi làm tròn ⇒ 2,0 ⇒ delete). Hành động theo điểm mới: ≥ 4 `block_requested` · ≥ 3 `kick_requested` · ≥ 2 `delete` · ≥ 1 `warn` · tăng 0 ⇒ `none`. Scam lần đầu ⇒ 2 ⇒ xoá ngay. `moderation_scores` upsert `(score, strikes+1 nếu tăng > 0, updated_at=now)`.

### §4.1 Thi hành (`moderation.ts::applyLadderAction`)
| action | Làm |
| :-- | :-- |
| `warn` | ngân sách `MOD_WARN_PER_HOUR` (10/nhóm, đếm `moderation_events action='warn'` 1 giờ) còn ⇒ `enqueue` text nhóm `WARN_GROUP_TEXT(verdict)` quote tin vi phạm (hằng TS, không model); hết ⇒ chỉ ghi event |
| `delete` | `zalo_groups.bot_is_admin` ⇒ `enqueueAction({action:'delete_message', msgId, cliMsgId, uidFrom: row.sender_uid, onlyMe:false})` + `group_messages.deleted_at=now(), delete_reason=verdict` (đặt trước; nếu action `failed` thì timer `reconcileDeletes` bỏ dấu) + DM owner `MOD_DELETE_DM` (gộp ≤ 1 DM/10 phút/nhóm); không là admin ⇒ hạ về `warn` + audit `moderation.need_deputy` |
| `kick_requested` | `delete` (như trên) + `createApproval({kind:'kick_member', threadId, targetUid, reason, requestedBy:'moderation', payload:{events: 3 id gần nhất}})` |
| `block_requested` | `delete` + `createApproval({kind:'block_member', …})` |
Tin bị xoá **hoặc bị xử lý kiểm duyệt** (`!exempt && action != 'none'` — kể cả khi bot không là phó nhóm nên chỉ cảnh cáo) ⇒ node `moderate` đặt `stop='deleted'` ⇒ P03 không chạy cổng/lượt cho tin đó (spam/scam không được trả lời, kể cả khi kèm @bot — D41/F3). Giá trị `'deleted'` giữ nguyên (cấm đổi `state.ts`/`edges.ts`); nghĩa = "tin đã bị kiểm duyệt lấy khỏi luồng". Lỗi trong `moderateGroupMessage` SAU khi đã xếp `delete_message` cho tin ⇒ vẫn `stop='deleted'` (F11).

### §4.2 Tool trong lượt (agent phán xét thêm)
`flag_message(msg_id, verdict, reason)` ⇒ `moderation_events(source='agent', confidence=0.8)` ⇒ cùng `nextLadderStep`/`applyLadderAction`. `delete_message(msg_id, reason)` ⇒ như `delete` (không qua thang; `strikes` không tăng) — điều kiện 01-CONTRACTS §7.1. `warn_member(uid, reason)` ⇒ text nhóm mention uid + event `warn`. `request_member_removal(uid, kind, reason)` ⇒ `createApproval(requestedBy:'agent')`.

## §5. Thẻ duyệt — `approvals.ts`
```ts
export async function createApproval(a: { account; kind: ApprovalKind; threadId; targetUid?: string; reason; payload?; requestedBy; requesterUid?: string; now: Date }): Promise<{ id: string }>;
export async function decideApproval(a: { id; decision: 'approve'|'reject'; decidedBy: string /* 'staff:<uuid>' | 'zalo:<uid>' */; note?: string; now }): Promise<{ status: 'approved'|'rejected'; outboxId: number | null }>;
export async function completeApproval(id, ok: boolean, result: unknown): Promise<void>;     // pacer/sim gọi sau action
export async function expireApprovals(now): Promise<number>;                                 // timer
```
### §5.1 Tạo: `expires_at = now + APPROVAL_TTL_HOURS`; DM owner (mọi `account_owners`) `APPROVAL_DM(idShort, kind, groupName, targetName, reason)` — kèm hướng dẫn "trả lời `duyệt <idShort>` hoặc `từ chối <idShort>`"; `idShort` = 8 ký tự đầu uuid. Trùng (cùng kind, thread, target, `pending`) ⇒ trả thẻ cũ, không tạo mới.
### §5.2 Quyết: trạng thái máy 01-CONTRACTS §5.1; approve ⇒ cùng tx `enqueueAction` theo kind: `kick_member`⇒`remove_member`, `block_member`⇒`block_member`, `approve_join`⇒`review_join approve:true`, `reject_join`⇒`review_join approve:false`, `announce`⇒ outbox text; `outbox_id` ghi vào thẻ; `audit approval.approved {by}`. Reject từ web thiếu `note` ⇒ 400 `note_required` (route), từ tool ⇒ `note` tuỳ chọn.
### §5.3 Ai được quyết: web `admin`/`operator`; Zalo: `owner` (DM owner, tool `decide_approval`) hoặc `moderator` của ĐÚNG nhóm của thẻ (qua lệnh `/approve <id>` trong nhóm hoặc DM). Member ⇒ `ToolNotAllowedError`.
### §5.4 Bằng chứng tất định cho `decide_approval` (port `IntentNotConfirmedError`): `latestText` của requester PHẢI chứa `idShort` (hoặc uuid đầy đủ) và một từ trong `{duyệt, duyet, ok, đồng ý, approve, /approve}` (approve) hoặc `{từ chối, tu choi, không, reject, /reject}` (reject), so BẰNG NHAU sau `normalizeVi` theo ranh giới từ; thiếu ⇒ `IntentNotConfirmedError` (caller: "bạn trả lời `duyệt <id>` nhé"). Model không tự quyết thay người.
**Thứ tự xét (D41/F1 — thay luật "có từ reject ở bất kỳ đâu ⇒ reject"):** (1) cụm từ chối TƯỜNG MINH `{tu choi, reject, khong duyet, khong dong y}` ⇒ `'reject'`; (2) còn lại, có token do dự/phủ định `{khong, dung, chua, khoan, doi, tu tu, huy}` ⇒ `null` (KHÔNG approve, KHÔNG reject — thẻ giữ `pending`, hỏi lại; "dung" trùng "dùng/đúng" sau `normalizeVi` ⇒ chấp nhận hỏi lại thừa, vì reject `approve_join` cũng là hành động lên người thật); (3) có từ approve ⇒ `'approve'`; (4) ⇒ `null`. Ca bắt buộc: "đừng duyệt <id>", "chưa duyệt <id>", "khoan duyệt <id>" ⇒ `null`; "không duyệt <id>" ⇒ `reject`; "duyệt <id>" ⇒ `approve`.
### §5.5 Kết quả: `completeApproval` ⇒ `executed`/`failed` + `enqueueSystemEvent({event:'approval_executed', approvalId, threadId})` ⇒ router DM owner `APPROVAL_RESULT_DM` (không lượt model). Hết hạn ⇒ `expired` + DM owner 1 lần. **Áp cho CẢ hai đường báo kết quả** (D41/F4): sim (`applySimOutbox`) VÀ worker thật (`apps/zalo-worker` `completeApproval` sau pacer) — chuyển trạng thái thắng CAS ⇒ đúng 1 sự kiện `approval_executed`; thua CAS ⇒ 0. `APPROVAL_RESULT_DM` dùng `idShort` 8 ký tự như `APPROVAL_DM` (F10).

## §6. Duyệt vào nhóm — `join-requests.ts`
Sự kiện `join_request` (uids[]) ở nhóm `enabled`:
| `join_policy` | Làm |
| :-- | :-- |
| `auto_approve` | `join_requests(decision='approved', decided_by='policy')` + `enqueueAction({action:'review_join', uids, approve:true})` — 0 model |
| `manual` | `join_requests pending` + `createApproval(kind:'approve_join', requestedBy:'moderation')` một thẻ cho MỖI uid (ghi `payload.display_name`); owner duyệt ⇒ `review_join approve:true`, từ chối ⇒ `approve:false` |
| `agent_review` | `join_requests pending` + `enqueueSystemEvent({event:'join_request', threadId, uid})` ⇒ lượt `group_join_review` (P03 §4.3): context = tên hiển thị (untrusted), số lần xin vào trước, `zalo_groups.system_prompt` (có thể chứa tiêu chí); tool DUY NHẤT `review_join_request(uid, decision, reason)` (cờ `answers`) ⇒ approve: `review_join approve:true` ngay; reject: cần `reason` ≥ 10 ký tự ⇒ `review_join approve:false` ngay + audit; model không gọi tool thành công (im / sập / refusal / chạm trần — D28 `decideDelivery` D3) ⇒ node `deliver` = `join_default`: host `approve` mặc định (🖐 Q9 giá trị tạm: mặc định CHO VÀO) |
Mọi quyết định ghi `join_requests.decision/decided_by/decided_at/reason` + audit `join.<decision>`. `pending` quá `JOIN_REQUEST_TTL_HOURS` ⇒ `expired` (timer). Nhóm chưa khai ⇒ bỏ qua (audit).

## §7. Chào mừng — `welcome.ts`
### §7.1 Gom: sự kiện `join` ⇒ upsert `group_members(joined_at=now, welcomed_at=null)`; nếu `zalo_groups.welcome_enabled` ⇒ `group_sessions.welcome_pending_since = coalesce(welcome_pending_since, now)`. Timer `flushWelcomes(now)`: phiên `welcome_pending_since <= now - WELCOME_DEBOUNCE_SEC` ⇒ `uids = group_members where welcomed_at is null and joined_at > now - WELCOME_WINDOW_MIN and left_at is null` ⇒ `enqueueSystemEvent({event:'welcome_flush', threadId, uids})`, đặt `welcomed_at=now()` cho các uid đó (trước lượt — tránh chào hai lần), `welcome_pending_since=null`.
### §7.2 Lượt `group_welcome` (P03 §6.1; D28: `system_event` dựng `TurnRequest{kind:'group_welcome', mustReply:true, joinedUids}`): `joinedUids`, tên hiển thị; agent `send_group_message` với `mention_uids = joinedUids` (≤ 5; >5 ⇒ nêu số người, mention 5 đầu). `mustReply=true` ⇒ nudge 1 lần như mention (SPEC-P03 §6.4), ngân sách nhóm áp.
### §7.3 Đường lùi (D28: node `deliver`, `hostText` nhánh `group_welcome`): model sập / không gọi tool sau nudge ⇒ host gửi `WELCOME_TEMPLATE(names)` = `"Chào mừng {names} đã tham gia {groupName}! Bạn cứ hỏi mình về AI agent hoặc gõ @{botName} nhé."` (hằng TS).

## §8. Vùng cấm P05
- CẤM kick/block/review-reject (policy `manual`) mà không có `approvals.status='approved'` — `ApprovalRequiredError` là bug.
- CẤM thang cảnh cáo áp lên owner/moderator (`exempt`).
- CẤM xoá tin quá 24 giờ, tin không có trong đệm, tin thiếu `cli_msg_id`.
- CẤM dùng danh sách cụm scam làm cơ chế chính: lưới chỉ `hard` cho 2 loại (`scam_phrase` bằng-nhau, `repeat_burst`); còn lại model quyết.
- CẤM gửi quá `MOD_WARN_PER_HOUR` cảnh cáo công khai/nhóm/giờ (tránh bot spam ngược).
- CẤM DM người vi phạm (chỉ cảnh cáo trong nhóm bằng quote/mention — tránh "nhắn chủ động người lạ").
- CẤM tự xin quyền phó nhóm; thiếu quyền ⇒ hạ về cảnh cáo + báo owner.

## §9. Lỗi & hành vi (bổ sung)
| Lỗi/tình huống | Hành vi |
| :-- | :-- |
| `ActionNotPermittedError` (`delete_message` khi `!bot_is_admin`) | tool_result lỗi; dịch vụ §4.1 tự hạ `delete`→`warn` |
| action `delete_message` `failed` (zca-js) | timer `reconcileDeletes(now)`: `group_messages.deleted_at=null, delete_reason='delete_failed'` + audit |
| `review_join` 166 | `bot_is_admin=false`; thẻ `failed`; DM owner `NEED_DEPUTY_DM` |
| `IntentNotConfirmedError` | hỏi lại mẫu `duyệt <id>` |
| triage `null` (quá hạn) | lưới quyết (`hard` ⇒ hành động; mềm ⇒ `unsure`, không hành động) |

## §11. Vòng sửa sau thẩm định R13 + SO đo lại (D40, D41)
| Mã | Hợp đồng | Đo bằng (phải ĐỎ trên mã hỏng tương ứng) |
| :-- | :-- | :-- |
| M2 | `applyModeration` đường PIPELINE: tin `received_at` > 24 h ⇒ 0 `delete_message`, audit `moderation.cannot_delete {reason:'too_old'}` | ca DB mới; đột biến bỏ `ageMs > DELETE_MAX_AGE_MS` ⇒ đỏ |
| F1 | §5.4 thứ tự xét mới | `approvals.test.ts` + ca DB "đừng duyệt <id>" ⇒ thẻ `pending`, 0 outbox |
| F2 | `resolveBotUid(env, account, threadId)` tự tính sim theo `threadId` của CHÍNH lượt (`isSimThread`); cache chỉ giữ `own_uid` — CẤM cờ `sim` dùng chung giữa các thread | test: 2 lượt xen kẽ (thread `sim-*` và thread thật) với cache đã nạp ⇒ mỗi lượt đúng uid của mình |
| F3 | §4.1 câu `stop='deleted'` mở rộng | ca DB: `!bot_is_admin` + scam kèm @bot ⇒ đúng 1 tin ra (cảnh cáo), 0 `agent_runs` |
| F4 | §5.5 đường worker | test worker: `completeApproval` thắng CAS ⇒ 1 `inbound_events` `approval_executed`; gọi lại ⇒ không thêm |
| F6 | ca "tin bị xoá + @bot ⇒ 0 lượt" (bot là phó nhóm) | đột biến bỏ `stop='deleted'` ở `moderate.ts` ⇒ đỏ |
| F5 | §3 dòng "model bác lưới" | ca DB: scam_phrase + triage giả `ok` ⇒ 0 outbox, audit `moderation.grid_overruled`; triage `null` ⇒ vẫn xoá (lưới an toàn) |
| F7 | `enqueueAction` `review_join approve:false` CHỈ khi có `approvalId` thẻ `approved` (`reject_join`) / thẻ `approve_join` vừa bị từ chối, HOẶC nhóm `join_policy='agent_review'` | thiếu ⇒ `ApprovalRequiredError`; test thuần + DB |
| F8 | §2 `repeat_burst` không tính tin đang xét | tin giống hệt thứ 5 ⇒ không hit, thứ 6 ⇒ hit |
| F10 | `idShort` = 8 ký tự ở MỌI chuỗi (DM, kết quả, lệnh) | grep `slice(0, 6)` trên mã thẻ = 0 |
| F11 | §4.1 câu lỗi sau khi đã xếp delete | test: `createApproval` ném ⇒ vẫn `stop='deleted'` |
| F13 | `WELCOME_TEMPLATE(names)`: mỗi tên qua `redactPhones` + một dòng + ≤ 40 ký tự; > 5 người ⇒ 5 tên + "và N bạn khác" | test thuần |
| F16 | `flushWelcomes` xoá `welcome_pending_since` bằng CAS theo giá trị đã đọc; `join` đến giữa chừng ⇒ lần flush sau vẫn chào | ca DB |
| G35 | ca P05 phụ thuộc mention không giả định `own_uid` null | đặt `own_uid='rac-g35'` rồi chạy `p05-*.db.test.ts` ⇒ xanh; trả null sau |
**Chấp nhận, KHÔNG sửa (vùng cấm "sửa cho tốt hơn"):** F9 (CAS và enqueue khác tx — có bù trừ, crash để thẻ `approved` không outbox là hướng an toàn); F12 (24 h đo theo giờ ingest — chênh với giờ Zalo chỉ vài giây ở đường bình thường); F14 (`!bot_is_admin` ⇒ hạ `warn`, không tạo thẻ kick — không phó nhóm thì không kick được; owner đã nhận `NEED_DEPUTY_DM`); F15 (`decidedBy='staff:<x>'` — route P08 BẮT BUỘC dựng từ phiên đăng nhập, ghi SPEC-P08).
🖐 **Câu hỏi người (giá trị TẠM = như hiện tại):** tin GỌI BOT không có triage (D31 T3) ⇒ câu cảnh báo kiểu "@bot 'việc nhẹ lương cao' có phải lừa không?" vẫn bị lưới xoá + cộng điểm. Giữ (ưu tiên chặn scam) hay để agent tự `flag_message` cho tin gọi bot (ưu tiên không xoá nhầm)?

## §10. Nghiệm thu P05
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/core` — `moderation-ladder.test.ts` | 14 ca L01–L14 nguyên văn `evidence/ARCH/ladder-ref.txt` |
| 2 | `moderation-grid.test.ts` | ≥ 20 ca hit (mỗi loại ≥ 3, sinh từ mảng `SCAM_PHRASES`, đặt GIỮA câu có dấu) + 40 câu cộng đồng AI bình thường ⇒ 0 hit (false-positive = 0) |
| 3 | `approvals.test.ts` (thuần) | `hasDecisionEvidence(text, idShort)` ≥ 12 ca: "duyệt 1a2b3c4d" ✓, "ok 1a2b3c4d nhé" ✓, "1a2b3c4d" ✗, "duyệt" ✗, "từ chối 1a2b3c4d" ⇒ reject, "không duyệt 1a2b3c4d" ⇒ reject |
| 4 | `npm run test:db -w @lenqclaw/core` — `p05-moderation.db.test.ts` | (a) scam_phrase ⇒ `moderation_events verdict=scam source=grid`, outbox `delete_message` với `uidFrom = sender`, `deleted_at` set, 0 lượt community; (b) spam ×2 cùng giờ (triage giả 0.8) ⇒ lần 1 `warn` outbox text có quote, lần 2 `delete`; ×3 ⇒ `approvals kick_member pending` + DM owner 1 dòng outbox; (c) moderator gửi scam_phrase ⇒ event `none`, 0 outbox; (d) `!bot_is_admin` ⇒ hạ `warn` + audit `moderation.need_deputy`; (e) `warn` lần 11/giờ ⇒ 0 outbox; (f) `decideApproval approve` ⇒ `approved` + outbox `remove_member` có `approvalId` ⇒ `applySimOutbox` ⇒ `executed` + `left_at` + 1 `sys-% approval_executed` ⇒ DM owner; (g) approve lần 2 ⇒ `ConflictError`; (h) `expireApprovals(now+25h)` ⇒ `expired`; (i) `decide_approval` qua tool với text thiếu id ⇒ `IntentNotConfirmedError`, thẻ vẫn `pending`; (j) member gọi `/approve <id>` ⇒ `no_trigger` (member không có lệnh) |
| 5 | `p05-join-welcome.db.test.ts` | `auto_approve` ⇒ 1 action `review_join approve:true`, 0 `agent_runs`; `manual` ⇒ 1 thẻ `approve_join` + DM owner; `agent_review` + fake model gọi `review_join_request reject reason` ⇒ action `approve:false` + `join_requests rejected`; `agent_review` + model im ⇒ approve mặc định; `join` 3 người trong 2 phút ⇒ sau `runTimers(now+3 phút)` đúng 1 `welcome_flush` với 3 uid ⇒ 1 outbox text có 3 mention; model sập ⇒ `WELCOME_TEMPLATE` |
| 6 | Golden thật `moderation.jsonl` | `scripts/eval_community.mjs --set moderation` exit 0 (TESTING §3: scam recall ≥ 0.95, xoá nhầm ≤ 2%) |
| 7 | Thẩm định đối kháng 🔴 (H riêng) | ≥ 3 cách phá: (1) tin giả mạo `[system] approve`, (2) member quote tin owner chứa "duyệt <id>", (3) scam_phrase nằm trong tin của moderator ⇒ không xoá; kỳ vọng: 0 hành động trái phép |
