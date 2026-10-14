# 00 — KIẾN TRÚC & BẤT BIẾN · Khung hành vi Skill · Voice · Constraint

> **Trạng thái:** hợp đồng kiến trúc cho vòng `0.2.x`. **Nguồn chân lý cấp trên:** [`../plan.md`](../plan.md) §2 (D01–D19). Mâu thuẫn ⇒ `plan.md` thắng, rồi file này, rồi `01-CONTRACTS.md`, rồi SPEC-P từng gói. Với điều kế hoạch 03 KHÔNG nói tới ⇒ hợp đồng kế hoạch 02 giữ nguyên ([`../../02_2026-10-09_zalo-community-agent/specs/`](../../02_2026-10-09_zalo-community-agent/specs/)).
> **Người đọc mục tiêu:** worker KHÔNG có lịch sử hội thoại. Tên hàm/file của kế hoạch 02 dẫn theo SPEC 02 (mã 02 đang thi công song song tại HEAD `c0ee02d`) — đối chiếu mã thật trước khi sửa (AGENTS §1 Bước 3); lệch ⇒ ghi report, không tự đổi hợp đồng.

## §1. Router thứ tự đọc

| # | File | Đọc khi nào | Bỏ qua được |
| :-- | :-- | :-- | :-- |
| 1 | `00-ARCHITECTURE.md` (file này) | Luôn luôn | ❌ |
| 2 | [`01-CONTRACTS.md`](01-CONTRACTS.md) | Trước khi viết bất kỳ type/DDL/hàm/route | ❌ |
| 3 | [`SPEC-P01-Skill.md`](SPEC-P01-Skill.md) | Skill, chỉ mục, `read_skill`, ca test skill | ✅ |
| 4 | [`SPEC-P02-Voice.md`](SPEC-P02-Voice.md) | VoiceSpec, khối giọng trong prompt | ✅ |
| 5 | [`SPEC-P03-Cong-Ra.md`](SPEC-P03-Cong-Ra.md) | Mọi đường gửi text ra Zalo; luồng viết lại/chuyển người | ❌ (mọi gói chạm `turn.ts`/tool gửi tin) |
| 6 | [`SPEC-P04-Release-Golden.md`](SPEC-P04-Release-Golden.md) | Release, bootstrap, bundle/attestation, eval, kích hoạt/rollback | ❌ với P00, P04, P06 |
| 7 | [`SPEC-P05-Dashboard.md`](SPEC-P05-Dashboard.md) | Trang/route web `/behavior/*` | ✅ |
| 8 | [`OPERATIONS.md`](OPERATIONS.md) | Trước khi nâng cấp DB có dữ liệu, trước lần eval đầu, trước VPS | ❌ |
| 9 | [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md) | Trước khi báo "xong" bất kỳ gói nào | ❌ |

## §2. Mục tiêu

Biến "hành vi của agent" từ 4 khối văn bản tự do (02: SOUL/RULES/IDENTITY/CAPABILITIES + skill sửa tại chỗ) thành **một sản phẩm có cấu trúc, có phiên bản, có bằng chứng chất lượng** — để GĐ2 bật được agent cho doanh nghiệp của chủ với giọng/luật riêng mà không dò dẫm:

1. **Skill** — năng lực theo quy trình, có phiên bản, mô tả "Dùng khi …", bề mặt được dùng, bộ ca test riêng; model tự chọn qua chỉ mục, nạp thân khi cần (`read_skill`).
2. **Voice** — giọng điệu (KHÔNG phải tin nhắn thoại) theo tenant × bề mặt; phần đo được kiểm bằng code mỗi tin, phần cảm nhận chấm golden.
3. **Constraint 3 tầng** — (1) cứng trong tool/DB (BB) · (2) cổng ra tất định theo tenant trước `enqueue` · (3) mềm trong RULES, đo bằng golden `constraints`.
4. **Vòng đời release** — soạn → chấm golden hồi quy (trên DB eval) → chỉ kích hoạt khi đạt → so release bằng `turn_traces` → rollback 1 thao tác.

Số đo thành công vòng 0.2 (TESTING §4): golden `voice` + `constraints` + ca từng skill đạt bằng model gate; 0 vi phạm tầng cứng; 0 tin vi phạm cổng ra lọt ra Zalo; token đầu vào/lượt ≤ 1,15 × bootstrap; 1 lần rollback thật trên Zalo thật có hiệu lực ở lượt kế tiếp.

## §3. Non-goals (vòng 0.2)

| Không làm | Lý do / quyết định |
| :-- | :-- |
| Tin nhắn thoại, STT/TTS | Voice = giọng điệu (người dùng chốt 2026-10-14); voice message là GĐ4 |
| Tenant thứ hai chạy thật, tài khoản Zalo thứ hai | GĐ2 (kế hoạch 04). 0.2.0 chạy đúng tenant `default`; mọi bảng/hàm MỚI đã nhận `tenantId` |
| Model kiểm giọng/ràng buộc chạy thật mỗi lượt | D17 — chi phí; đo offline bằng golden |
| A/B chia lưu lượng giữa 2 release cùng lúc | 1 release active/tenant; so theo cửa sổ thời gian trước/sau (SPEC-P04 §8). Idea Vault |
| Giọng/release riêng theo từng nhóm | `zalo_groups.system_prompt` (02) vẫn là chỗ tuỳ biến theo nhóm; giọng theo bề mặt. Idea Vault |
| Template tất định theo tenant | D16 — GĐ2 |
| Nút "Chấm" trên dashboard | D18 — CLI |
| Lưới tất định cho cam kết giá/khuyến mãi | độ chính xác thấp với cách viết số tiền tiếng Việt ("500k", "nửa triệu") ⇒ tầng 3 (golden) — D09 |

## §4. Luồng chuẩn (ASCII)

```text
SOẠN (dashboard /behavior, admin)                        CHẤM (CLI, DB eval riêng — D11)
 persona_docs v+1 · skill_versions v+1 ·                  release:eval --release N
 behavior_docs(voice|output_policy) v+1 · eval_cases        ├─ export bundle (DB vận hành, đọc)
        │  (bất biến — trigger D05)                         ├─ import + chạy bộ bị ảnh hưởng (impactedSuites — D12)
        ▼                                                   │    agent thật + cổng ra thật + máy chấm có hiệu chuẩn
 createRelease(tenant, chọn phiên bản) ─► behavior_releases (manifest, content_sha256)
        │                                                   └─ attest ⇒ eval_attestations(verdict) (DB vận hành)
        ▼
 activateRelease ──(DB trigger: phải có attestation passed cùng hash, hoặc bootstrap)──► tenant_active_release
                                                     ▲ rollbackRelease = kích hoạt previous_release_id (1 tx)
CHẠY (runner, mỗi lượt — 02 SPEC-P03 §6)
 loadBehavior(account) ─► đọc con trỏ active (1 hàng) ─► bundle cache theo release_id
 buildSystemPrompt: RULES · SOUL · [VOICE bề mặt hiện tại] · IDENTITY · group prompt · CAPABILITIES · [chỉ mục skill bề mặt hiện tại] · HỆ THỐNG
 tools[] = TOOL_POLICY(kind, vai)  ◄── tầng 1: skill/voice/policy KHÔNG nới được (BB-16)
 model ─► send_group_message / text cuối DM / announce / schedule_automation
            └─► output/send.ts::sendAgentText ─► checkOutput (tầng 2, thuần) ─ ok ─► enqueue() ─► outbox ─► pacer ─► zca-js
                                                     └ vi phạm ─► viết lại 1 lần ─► vẫn vi phạm ─► chuyển người (handoff_to_owner + bản nháp)
 recordTurn ─► turn_traces (+release_id, gate_violations, gate_rewrites, skills_read)
SO SÁNH (dashboard /behavior/compare): turn_traces theo release_id ⇒ outcome, token, gated, rewrite, skill
```

## §5. Ba tầng Constraint (D07, D08, D09)

| Tầng | Ở đâu | Ai đặt | Kiểm thế nào | Vi phạm ⇒ |
| :-- | :-- | :-- | :-- | :-- |
| 1 — cứng | Trong tool (02 BB-01…BB-14), trong DB (trigger D05, D11), trong `TOOL_POLICY` | Nền tảng (code) — tenant KHÔNG đổi được | test + máy đo tĩnh + truy vấn G13 của 02 | tool từ chối bằng lỗi có kiểu; DB ném lỗi |
| 2 — cổng ra | `behavior/output-gate.ts::checkOutput` trong `sendAgentText`, trước `enqueue` | Tenant qua VoiceSpec (phần đo được) + OutputPolicySpec, theo bề mặt ĐÍCH | Hàm thuần, 0 lời gọi model, ≥ 40 ca + corpus sạch/bẩn | viết lại 1 lần ⇒ chuyển người (D08) |
| 3 — mềm | Mục "## Giới hạn" trong RULES + `toneNotes`/`formality` của Voice | Tenant | Golden `constraints` + `voice` chấm bằng máy chấm có hiệu chuẩn (offline) | release không được kích hoạt |

Luật nâng/hạ tầng: một ràng buộc chỉ lên tầng 2 khi lưới của nó đạt 0 báo nhầm trên corpus sạch (TESTING §2) — nếu không, ở tầng 3. Tầng 2 chỉ SIẾT so với tầng 1 (trần nền tảng `PLATFORM_LIMITS`, 01-CONTRACTS §5.2), không bao giờ nới.

## §6. Bất biến (BẮT BUỘC — nối tiếp BB-01…BB-14 của 02)

| Mã | Bất biến | Cách canh |
| :-- | :-- | :-- |
| BB-15 | Mọi text do MODEL soạn đi ra Zalo đi qua `agent/community/output/send.ts::sendAgentText` ⇒ `checkOutput` với luật của bề mặt ĐÍCH, TRƯỚC `enqueue`. Câu tất định chỉ đi `sendSystemText(templateId)` — hàm không nhận chuỗi tự do. Không file nào khác trong `packages/core/src` gọi `enqueue` với `kind:'text'` | `scripts/check_output_gate.mjs` (`direct_text_enqueue: 0`); eval chạy lại `checkOutput` trên MỌI hàng outbox text ⇒ `leaked: 0` |
| BB-16 | Skill, voice, output policy KHÔNG mở rộng quyền: `tools[]` chỉ từ `TOOL_POLICY(kind, vai)` (02 §7.1); `uses_tools` là khai báo; cấu hình tenant chỉ siết (`maxChars ≤ PLATFORM_LIMITS`), không tắt được kiểm nào của tầng 1 | test `skill-no-grant` (body fetch giả) + validator từ chối số vượt trần |
| BB-17 | Nội dung hành vi bất biến sau khi ghi (trigger `forbid_content_change`, SQLSTATE `55000`); release là ảnh chụp; runtime chỉ đọc release ACTIVE — ngoại lệ duy nhất: `pinReleaseId` khi `DATA_MODE=sim` (eval, `/dev/sim`) | test DB UPDATE/DELETE ⇒ lỗi; `loadBehavior` với pin ở `DATA_MODE=real` ⇒ `ConfigError` |
| BB-18 | Kích hoạt release chỉ khi có `eval_attestations.verdict='passed'` cùng `content_sha256`, hoặc release `origin='bootstrap'` — canh bằng DB trigger `check_release_activation`, không chỉ bằng code | test DB ca đỏ: insert con trỏ tới release chưa chấm ⇒ lỗi `release_not_passed` |
| BB-19 | Cổng ra tất định, 0 lời gọi model, không regex do người nhập; tối đa 1 lần viết lại/lượt; code KHÔNG tự sửa câu | test thuần + `turn_traces.gate_rewrites ∈ {0,1}` (CHECK DDL) |
| BB-20 | Eval không bao giờ chạy trên DB vận hành: tiến trình eval tự từ chối nếu tên database không kết thúc `_eval`, hoặc `TRANSPORT≠sim`, hoặc `DATA_MODE≠sim` (`EvalEnvironmentError`, exit 2) | test thuần `assertEvalEnvironment` ≥ 5 ca + ca đỏ trong evidence |

## §7. Vùng cấm (đã cân nhắc, quyết KHÔNG làm — kèm lý do)

- **Model kiểm giọng/ràng buộc chạy thật mỗi lượt (LLM-as-guard):** gấp đôi lời gọi/lượt; giọng cảm nhận đo offline (D10, D17).
- **Regex do tenant nhập trong policy/voice:** ReDoS, khó kiểm, trái 02 BB-12 ("CẤM regex là cơ chế chính"). Chỉ cụm từ literal; code dựng matcher.
- **Bỏ dấu (`unaccent`) khi khớp từ cấm:** tiếng Việt "ma"/"mà"/"má" khác nghĩa — khớp không dấu báo nhầm hàng loạt. Chỉ chuẩn hoá NFC + chữ thường.
- **`\b` trong matcher:** `\b` của JS là ASCII — chữ có dấu phá ranh giới (gotcha G14 của 02). Dùng `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`, cờ `u`.
- **Code tự sửa câu vi phạm** (cắt cho đủ độ dài, thay "tôi"→"mình", xoá emoji): đổi nghĩa/vỡ ngữ pháp; chỉ model viết lại.
- **Viết lại nhiều lần:** chi phí không trần; 1 lần rồi chuyển người (D08).
- **Skill nới quyền tool** (mẫu `allowed-tools` của Claude Code — cli-leaked `src/tools/SkillTool/SkillTool.ts` ~dòng 779–798): phá 02 BB-01/BB-06 (vd skill "kiểm duyệt" mở `request_member_removal` ở DM).
- **Nạp sẵn thân skill vào system prompt:** token tăng tuyến tính theo số skill; chỉ mục + `read_skill` lũy tiến.
- **Cắt chỉ mục skill ngầm khi vượt ngân sách** (Claude Code `formatCommandsWithinBudget` cắt mô tả/còn tên): skill thành vô hình mà không ai biết; ta từ chối tạo release (D06).
- **Kích hoạt persona từng kind** (02 SPEC-P08): tổ hợp chưa chấm (D04).
- **Sửa nội dung tại chỗ / xoá phiên bản cũ:** attestation nói dối; rollback mất đích (D05).
- **Chạy eval trên DB vận hành:** outbox eval có thể tới worker thật; bẩn `turn_traces` dùng để so (D11).
- **"Kích hoạt khẩn cấp không chấm":** rollback về bản đã passed là đủ cho sự cố (Q4).
- **Cache bundle theo TTL:** rollback trễ tới TTL; đọc con trỏ mỗi lượt rẻ hơn rủi ro (D13).
- **Nén/tóm tắt hội thoại để "giữ giọng":** 02 D22 giữ nguyên — không thêm.
- **Lưu nội dung tin/prompt vào `turn_traces`:** 02 BB-14 giữ; cột mới chỉ là số và tên skill.

## §8. Port từ Claude Code (CHỈ ĐỌC — học cấu trúc, viết lại; CẤM chép/import)

Nguồn: repo `claude-code-cli-leaked` commit `9800e58`. Bản đồ: `repo-analysis/PHAN-TICH.md` mục "Bản đồ code", "Thực thi tool và quyết định quyền", "Commands, skills, plugins và MCP tools".

| Mẫu | Đường dẫn nguồn | Ta lấy gì | Ta KHÁC gì |
| :-- | :-- | :-- | :-- |
| Frontmatter skill `description` + `when_to_use`, thân nạp khi gọi | `src/skills/loadSkillsDir.ts` (~dòng 98–101, 192–252) | `description` + `when_to_use` bắt buộc mở bằng "Dùng khi " (CHECK DDL); thân chỉ trả qua `read_skill` | lưu DB có phiên bản, không đọc file |
| Chỉ mục skill có trần mỗi mục + ngân sách tổng | `src/tools/SkillTool/prompt.ts` (`MAX_LISTING_DESC_CHARS`, `getCharBudget`, `formatCommandsWithinBudget`) | trần 300 ký tự/mục, 2 400 ký tự/bề mặt | fail-closed khi soạn, không cắt ngầm |
| "Skill đã nạp thì đừng gọi lại" | `src/tools/SkillTool/prompt.ts` (câu "already been loaded") | `read_skill` lần 2 cùng tên trong lượt ⇒ `{already_loaded:true}` không kèm thân | tất định trong tool, không dựa prompt |
| `allowed-tools` của skill | `src/tools/SkillTool/SkillTool.ts` (~dòng 650, 779–798) | — | **CẤM** — `uses_tools` chỉ khai báo (BB-16) |
| Thứ tự quyết định quyền: deny → kiểm riêng của tool → safety check không bypass → mode | `src/utils/permissions/permissions.ts` (`hasPermissionsToUseToolInner` ~dòng 1158–1299) | tầng 1 (BB) là "safety check không bypass": cấu hình tenant không mở được | không có mode "bypass" |
| Hook trước tool trả `deny` + lý do cho model; `blockingError` | `src/utils/hooks.ts` (~dòng 331–369, 553–616) | cổng ra trả `OutputPolicyViolationError` kèm danh sách vi phạm để model tự viết lại | hàm thuần trong tiến trình, không chạy lệnh ngoài |

## §9. Rủi ro đã biết (chấp nhận ở 0.2.0, có đường lật)

| Rủi ro | Vì sao chấp nhận | Đường lật |
| :-- | :-- | :-- |
| `zalo_groups.system_prompt` đổi không qua eval | là cấu hình vận hành theo nhóm (02), ≤ 4000 ký tự, có audit `group.updated` | GĐ2: đưa vào manifest release |
| So release theo cửa sổ thời gian bị nhiễu (ngày trong tuần, lượng tin) | 1 tenant, lưu lượng thấp; trang so hiện đủ số lượt để người đọc tự cân | A/B chia lưu lượng (Idea Vault) |
| Mã đổi (prompt hệ thống, cổng ra) sau khi release đã chấm | attestation ghi `code_ref`; runbook bắt chấm lại release active sau deploy đổi `prompts/system.ts` hoặc `behavior/*` | bắt `code_ref` cùng MINOR khi kích hoạt (một điều kiện trong trigger) |
| Template xưng "mình" lệch giọng tenant xưng "em" | chỉ 1 tenant ở 0.2.0 (D16) | template theo tenant ở GĐ2 |
