# SPEC-P01 — Skill có phiên bản: "Dùng khi…", bề mặt, chỉ mục có trần, nạp lũy tiến, ca test riêng

> Tầng 🟠 (hợp đồng chốt ở 01-CONTRACTS §2 `skill_versions`, §3 `SkillVersionInput`/`SkillTestCase`, §5.1, §6 `read_skill`). Đọc 00-ARCHITECTURE §6 (BB-16), §8 trước. Phụ thuộc: P00; 02-P03 (`turn.ts`, `persona.ts`, `policy.ts`, tool `read_skill`).
> Port (CHỈ ĐỌC, viết lại — 00 §8): cli-leaked `9800e58` `src/skills/loadSkillsDir.ts`, `src/tools/SkillTool/prompt.ts`, `src/tools/SkillTool/SkillTool.ts`.

## §1. Skill là gì ở lenqclaw

Một **quy trình** agent làm theo khi gặp một loại tình huống (vd "hướng dẫn setup AI CSKH", "giới thiệu gói dịch vụ", "xử lý khiếu nại đơn hàng" ở GĐ2). Skill KHÔNG phải tool: không làm được gì mà tool không cho; chỉ là văn bản hướng dẫn model được nạp khi cần. Khác persona: persona luôn có trong prompt, skill chỉ có DÒNG CHỈ MỤC trong prompt, thân nạp khi model gọi `read_skill`.

## §2. Trường & luật soạn (`validateSkillInput`)

| Trường | Luật (vi phạm ⇒ `ValidationIssue`, code trong ngoặc) | Vì sao |
| :-- | :-- | :-- |
| `name` | `^[a-z0-9-]{2,40}$` (`name_format`); cố định qua mọi phiên bản | khoá so sánh giữa release; `skills_read` |
| `description` | 1..200 ký tự, một dòng (`desc_len`, `desc_multiline`) — "skill làm gì" | dòng chỉ mục |
| `whenToUse` | 12..200 ký tự, BẮT ĐẦU bằng `Dùng khi ` (`when_prefix`), một dòng | model chọn skill theo câu này (port `when_to_use`) |
| `body` | 1..8 000 ký tự (`body_len`); nên có các mục `## Các bước`, `## Không làm` (cảnh báo, không chặn) | quy trình |
| `surfaces` | 1..3 phần tử ⊆ `group`,`dm`,`owner_dm`, không trùng (`surface_invalid`) | skill "chốt lead" vô nghĩa ở nhóm |
| `usesTools` | ⊆ `TOOL_NAMES` (`unknown_tool`); KHÔNG chứa tên trong danh sách cấm 02 §7.2 (`forbidden_tool`) | khai báo để kiểm nhất quán + chấm ca test; **không cấp quyền** (BB-16) |
| `testCases` | 0..30 ca hợp lệ theo `SkillTestCase` (`case_invalid`), `case_id` duy nhất; `surface` ∈ `surfaces`; `tools_called`/`tools_not_called` ⊆ `TOOL_NAMES` | bộ ca test riêng của PHIÊN BẢN này |
| dòng chỉ mục | `- ${name}: ${description} — ${whenToUse}` ≤ `SKILL_INDEX_LIMITS.maxEntryChars` (300) (`index_entry_too_long`) | fail-closed (D06) |

Ca test đủ để release CHẤM ĐẠT (không chặn lưu phiên bản, chặn ở eval): ≥ 8 ca, ≥ 5 `expect_read=true`, ≥ 3 `expect_read=false` (`SKILL_INDEX_LIMITS.min*`). Thiếu ⇒ bộ `skill:<name>` trả `failed` lý do `skill_tests_missing` (SPEC-P04 §6.3). Ngoại lệ: release bootstrap (D14).

## §3. Chỉ mục trong prompt (`renderSkillIndex`, THUẦN)

```text
## Skill (đọc thân bằng read_skill khi tình huống khớp "Dùng khi")
- huong-dan-setup-cskh: Các bước dựng AI chăm sóc khách hàng trên Zalo — Dùng khi ai đó hỏi cách bắt đầu làm bot CSKH cho shop
- gioi-thieu-agent: Giới thiệu agent làm được gì — Dùng khi người mới hỏi bot là ai hoặc làm được gì
```
- Chỉ skill có `surface` của lượt hiện tại (`surfaceOfTurn`), sắp theo `name`. Không có skill ⇒ chuỗi rỗng (không in tiêu đề).
- Trần mỗi bề mặt: ≤ 12 skill, toàn khối ≤ 2 400 ký tự. Vượt ⇒ `createRelease` ném `SkillIndexOverBudgetError` (01-CONTRACTS §4.2) — KHÔNG cắt lúc chạy (vùng cấm 00 §7).
- Thay khối 6 của 02 01-CONTRACTS §11 (định dạng cũ `- <name>: <description>`).
- Mọi `<`/`>` trong mô tả thay `‹`/`›` (như 02 §11).

## §4. Nạp lũy tiến — tool `read_skill` (01-CONTRACTS §6)

```ts
// tools/read_skill.ts — input {name: string} (giữ 02)
run(ctx, {name}) ⇒
  | { name: string; version: number; body: string; uses_tools: string[] }
  | { name: string; already_loaded: true }
```
1. `s = bundle.release.content.skills.find(x => x.name === name && x.surfaces.includes(surfaceOfTurn(ctx)))`; không có ⇒ `SkillNotFoundError` (cùng thông điệp cho "không tồn tại" và "khác bề mặt").
2. `ctx.skillsRead.has(name)` ⇒ `{name, already_loaded: true}` (không gửi lại thân — tiết kiệm token; port ý "already loaded" của `SkillTool/prompt.ts`).
3. Thêm vào `ctx.skillsRead` (Set, thứ tự gọi) ⇒ `recordTurn` ghi `turn_traces.skills_read` (mảng không trùng).
4. Thân trả nguyên văn; KHÔNG rào `<<<untrusted>>>` (nội dung do admin soạn, cùng mức tin cậy persona) — nhưng thân KHÔNG thể đổi `tools[]` (BB-16).

`describe_capabilities` liệt kê `name: description` của chỉ mục bề mặt hiện tại.

## §5. Ca test riêng (`SkillTestCase`, 01-CONTRACTS §3) — cách chấm (SPEC-P04 §6.3)

| Kỳ vọng | Đo | Đạt |
| :-- | :-- | :-- |
| `expect_read=true` | `turn_traces.skills_read` của lượt chứa `name` | recall skill ≥ 0,80 |
| `expect_read=false` | không chứa `name` | ≤ 1 ca sai/skill VÀ tỉ lệ đọc nhầm gộp mọi skill ≤ 0,10 |
| `tools_called` / `tools_not_called` | `turn_traces.tools` | 100 % (tất định) |
| `rubric` | máy chấm từng tiêu chí trên text đã gửi | ≥ 0,80 ca đạt mọi tiêu chí |

Ví dụ ca (JSON trong `test_cases`):
```json
{"case_id":"setup-hoi-bat-dau","surface":"group","focus":"@Claw shop mình bán mỹ phẩm muốn làm bot trả lời inbox thì bắt đầu từ đâu?","expect_read":true,"tools_called":["send_group_message"],"rubric":["Nêu bước đầu tiên cụ thể","Gợi ý nhắn riêng nếu cần tư vấn chi tiết"]}
{"case_id":"setup-tan-gau","surface":"group","focus":"@Claw hôm nay trời nóng quá","expect_read":false}
```

## §6. Bootstrap từ `skill_docs` (D14)

`bootstrapTenantRelease`: mỗi `skill_docs` của tài khoản thuộc tenant (cả `enabled=false`) ⇒ `skill_versions` v1: `description` giữ, `whenToUse = left('Dùng khi cần: ' || description, 200)`, `surfaces = ['group','dm','owner_dm']`, `usesTools = []`, `testCases = []`, `created_by='seed:bootstrap'`. Chỉ skill `enabled` vào manifest release #1. Nếu chỉ mục bootstrap vượt trần ⇒ bootstrap vẫn tạo (miễn trừ duy nhất, ghi audit `behavior.bootstrap_over_budget`) — release kế tiếp phải sửa.

## §7. Vùng cấm P01
- CẤM `uses_tools` (hay bất cứ trường skill nào) thêm tool vào `tools[]` hoặc nới `assertToolAllowed` (BB-16) — khác Claude Code `allowed-tools`.
- CẤM nạp thân skill vào system prompt; CẤM cắt chỉ mục lúc chạy.
- CẤM model "tự tạo skill"/ghi `skill_versions` qua tool (không có tool ghi skill ở 0.2.0).
- CẤM khớp skill bằng từ khoá trong code (chọn skill là việc của model — 02 BB-12).
- CẤM đọc `skill_docs` ngoài `bootstrap.ts`.

## §8. Lỗi P01
| Lỗi | Khi | Caller |
| :-- | :-- | :-- |
| `SkillNotFoundError` (giữ 02) | tên lạ / khác bề mặt | `is_error`; model tiếp tục không có skill |
| `BehaviorSpecInvalidError` | §2 | 400 / exit 2 |
| `SkillIndexOverBudgetError` | §3 | 400 khi tạo release |

## §9. Nghiệm thu P01
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/core` — `behavior/validate.skill.test.ts` | ≥ 16 ca: mỗi code lỗi §2 ≥ 1 ca đỏ + ≥ 3 ca hợp lệ; `when_prefix` ca "dùng khi" thường ⇒ lỗi |
| 2 | `behavior/render.skill-index.test.ts` | ≥ 8 ca: lọc bề mặt, sắp tên, rỗng ⇒ '', `‹›`, 12 skill × 200 ký tự ⇒ đúng tổng; 13 skill ⇒ báo vượt (hàm `measureSkillIndex` trả `{chars, count}`) |
| 3 | `npm run test:db -w @lenqclaw/core` — `behavior-skill.db.test.ts` (fake model theo kịch bản) | (a) `read_skill` đúng bề mặt ⇒ thân + `skills_read=['x']`; (b) skill chỉ `dm` gọi từ lượt nhóm ⇒ `SkillNotFoundError`; (c) gọi 2 lần ⇒ lần 2 `already_loaded`, body fetch giả của vòng sau KHÔNG chứa thân lần 2; (d) **no-grant**: skill khai `uses_tools=['request_member_removal']` + `surfaces=['dm']` ⇒ `createRelease` ném `skill_tool_unavailable`; skill hợp lệ khai `['search_knowledge']` ⇒ `tools[]` gửi model ĐÚNG bằng `toolsFor(kind, role)` của 02 (so mảng tên); (e) UPDATE `skill_versions.body` ⇒ SQLSTATE 55000 |
| 4 | Bằng chứng đỏ | `evidence/P01/red-skill-grant.txt`: bản vá tạm cho `uses_tools` nhập vào `tools[]` ⇒ ca 3(d) ĐỎ; gỡ bản vá ⇒ xanh |
