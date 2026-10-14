# SPEC-P08 — Dashboard (apps/web): nhóm, persona có phiên bản, thẻ duyệt, lead, kiểm duyệt, tri thức, lịch, dòng thời gian agent

> Tầng 🟠 (route/logic) · 🟢 (trang đọc). Đọc SPEC-P01 §3.1 (phân quyền), 01-CONTRACTS §4, §5, §9. Mọi route gọi dịch vụ `@lenqclaw/core/services/*` qua subpath export (không đuôi `.js`); CẤM route tự SQL đổi trạng thái `approvals/leads/join_requests/automations` (chỉ đọc bằng SQL).
> Phụ thuộc: P01 (auth/policy); từng trang mở khi dịch vụ tương ứng xong (P03–P07). Có thể làm song song từ sau P01 với dữ liệu seed.

## §1. Trang & route

| Trang / API | Vai (SPEC-P01 §3.1) | Nội dung / hành vi |
| :-- | :-- | :-- |
| `/` | mọi vai | Thẻ tổng: phiên Zalo (`zalo_accounts.session_state`), nhóm enabled, thẻ duyệt chờ, lead mới, lỗi 24 giờ (`audit action like '%error%'`), token 24 giờ |
| `/groups`, `/groups/{thread}` · `GET/POST /api/groups`, `POST /api/groups/{thread}` | admin ghi · operator đọc | Danh sách `zalo_groups` (tên, mode, enabled, bot_is_admin, ngân sách, đồng bộ lần cuối); form: `enabled`, `mode`, `join_policy`, `welcome_enabled`, `moderation_enabled`, `budget_per_hour`, `ambient_turns_per_hour`, `system_prompt` (≤ 4000), `allow_users`, `deny_users`; thêm nhóm tay (`thread_id` số Zalo); nút "Đồng bộ ngay" ⇒ `enqueueAction sync_group_info`; bảng thành viên (`group_members`, vai, đặt/bỏ `moderator`, điểm kiểm duyệt); mọi POST ⇒ `audit group.updated {fields}` |
| `/persona` · `GET /api/persona`, `POST /api/persona/{kind}` (tạo phiên bản), `POST /api/persona/{kind}/{version}/activate` | admin ghi · operator đọc | 4 kind: hiện bản active + lịch sử phiên bản (diff đơn giản theo dòng); "Lưu thành phiên bản mới" (version = max+1, `created_by`), "Kích hoạt" (tx: tắt active cũ, bật mới — unique index canh); kiểm ≤ 8000 ký tự + tổng ≤ 24000 (400 `persona_too_large`); skill: CRUD `skill_docs` (tên regex), bật/tắt |
| `/approvals` · `GET /api/approvals?status=`, `POST /api/approvals/{id}/decision {decision, note}` | admin, operator | Thẻ: kind, nhóm, đối tượng (uid + tên untrusted + 3 event kiểm duyệt gần nhất), lý do, người đề nghị, hạn; Duyệt / Từ chối (lý do bắt buộc — 400 `note_required` trước khi vào core); `decideApproval(decidedBy:'staff:<uid>')`; `ConflictError` ⇒ 409; hiện kết quả thi hành (`result`) |
| `/leads` · `GET /api/leads`, `POST /api/leads/{id}` `{status: 'closed'\|'discarded', notes?}` | admin, operator | Bảng theo trạng thái; thẻ chi tiết (trường lead, hồ sơ `member_profiles.notes`, hội thoại DM 20 tin gần nhất); đổi trạng thái qua `services/leads.ts::setLeadStatus` |
| `/moderation` · `GET /api/moderation?thread=` | admin, operator | `moderation_events` 7 ngày (verdict, source, action, tin đã xoá hiển thị rút gọn), `moderation_scores` top; nút "Xoá điểm" (admin) ⇒ `resetModerationScore` + audit |
| `/knowledge` · `GET/POST /api/knowledge`, `POST /api/knowledge/{id}/reembed`, `GET /api/knowledge/search?q=` | admin ghi · operator đọc | SPEC-P04 §6 |
| `/automations` · CRUD `/api/automations` | admin ghi · operator đọc | bảng + form (`kind`, giờ VN, nhóm, action, payload JSON); kiểm bằng `computeNextRun`; bật/tắt; `automation_runs` 20 dòng |
| `/agent` · `GET /api/agent/timeline?thread=&since=` | admin, operator | (D24) Bảng `turn_traces` (kind, trigger, outcome, tools, rounds, token, latency, phiên bản persona) + thẻ tổng 24 giờ: số lượt theo `outcome`, token trung bình/lượt theo `kind`; bấm một lượt ⇒ các `agent_runs` cùng `turn_id`. Dòng thời gian: `agent_runs` (route, model, token, latency), `audit` (`turn.*`, `tool.*`, `zalo.*`, `timer.*`, `moderation.*`, `approval.*`), `messages private:true` (text riêng tư của lượt ambient — để người hiểu vì sao agent im) |
| `/zalo` (giữ) | admin | như P02 cũ: QR, trạng thái, đăng xuất; tài khoản `community` |
| `/dev/sim` (giữ, mở rộng P02 §7.3) | admin, `DATA_MODE=sim` | |

## §2. Luật chung
- Mọi route handler dùng `requireRole(req, roles)` (`app/api/_auth.ts`); POST ở trang "admin ghi" ⇒ operator 403 (test).
- Input kiểm kiểu như R02 D10 (giá trị lạ ⇒ 400, không TypeError 500).
- Trang đọc env lúc chạy ⇒ `export const dynamic = 'force-dynamic'` (G09).
- Tên hiển thị thành viên/nhóm render qua React (escape mặc định); KHÔNG `dangerouslySetInnerHTML`.
- Mọi hành động ghi ⇒ `audit` với `actorType:'staff', actorId: session.uid`.
- Nhãn "MÔ PHỎNG" trên mọi trang khi `DATA_MODE=sim`.

## §3. Vùng cấm P08
- CẤM thêm thư viện UI (giữ style inline/CSS đơn giản như hiện có — Đ11 cũ "tinh gọn sau").
- CẤM route tự gọi zca-js hay ghi `outbox` trực tiếp (qua dịch vụ core ⇒ `enqueue`/`enqueueAction`).
- CẤM hiển thị `session_enc`, API key.
- CẤM trang nào cho phép đổi `zalo_accounts.id`.

## §4. Lỗi
| Mã HTTP | Khi |
| :-- | :-- |
| 400 `invalid_body` / `note_required` / `persona_too_large` / `automation_invalid` | input |
| 401 / 403 | chưa đăng nhập / sai vai hoặc operator POST trang admin |
| 404 | thẻ/lead/nhóm không tồn tại (đọc trước, không đổi trạng thái) |
| 409 `conflict` | `ConflictError` từ core |

## §5. Nghiệm thu P08
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/web` — `policy.test.ts` | ≥ 14 ca bảng SPEC-P01 §3.1 kể cả `method` |
| 2 | `npm run test:db -w @lenqclaw/web` | `approvals-decision.db.test.ts`: operator duyệt ⇒ 200 + outbox action; reject thiếu note ⇒ 400; lần 2 ⇒ 409; `groups.db.test.ts`: operator POST ⇒ 403, admin POST `mode=ambient` ⇒ DB đổi + audit; `persona.db.test.ts`: tạo v2 + activate ⇒ đúng 1 active, 8001 ký tự ⇒ 400; `leads.db.test.ts`: đổi `closed`; chạy 3 lần liên tiếp xanh (`fileParallelism: false` — G24) |
| 3 | `next build && next start` + curl kèm cookie | `/groups` 200 admin; `/groups` 200 operator; `POST /api/groups/x` 403 operator; `/dev/sim` 404 khi `DATA_MODE=real` |
