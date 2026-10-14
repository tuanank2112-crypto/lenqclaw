# Kế hoạch 03 — Khung hành vi: Skill · Voice · Constraint (SemVer đích `0.2.0`)

> Hồ sơ kế hoạch. **KHÔNG chứa thiết kế chi tiết** — thiết kế nằm ở `specs/` (bảng Mục 5). Thứ tự đọc: Mục 2 (D01–D19) → [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) → [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) → SPEC gói đang làm.
> Nền: kế hoạch 02 ([`../02_2026-10-09_zalo-community-agent/plan.md`](../02_2026-10-09_zalo-community-agent/plan.md)) — mọi D/BB/hợp đồng của 02 GIỮ NGUYÊN trừ chỗ ghi rõ "đề xuất sửa 02" ([01-CONTRACTS §10](specs/01-CONTRACTS.md)).

## 1. Metadata Header

| Trường | Giá trị |
| :-- | :-- |
| Mã hồ sơ | `03_2026-10-14_skill-voice-constraint` |
| Ngày mở | 2026-10-14 |
| Chủ trì | Super Orchestrator; bộ SPEC do architect (tầng 🔴) soạn 2026-10-14 08:40–10:30 ICT trên HEAD `c0ee02d` (P01 của 02 đang thi công song song, cây chưa sạch) |
| Bước 0 | `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ **exit 0** ("NÃO ĐÃ OK", khung 1.7.1) — 2026-10-14 08:41 |
| Trạng thái | 🟡 SPEC CHỜ DUYỆT |
| Phạm vi | Khung hành vi có cấu trúc + có phiên bản cho agent: Skill (phiên bản, "Dùng khi…", bề mặt, ca test riêng), Voice (giọng điệu theo tenant × bề mặt), Constraint 3 tầng (cứng trong tool · cổng ra tất định trước `enqueue` · mềm đo bằng golden), vòng đời release (soạn → chấm → kích hoạt khi đạt → so qua `turn_traces` → rollback 1 thao tác) |
| Ngoài phạm vi | Tin nhắn thoại (Voice ≠ voice message — GĐ4); tenant thứ hai chạy thật (GĐ2); đổi kênh (chỉ zca-js — 02 D25); nén hội thoại (02 D22) |
| SemVer dự kiến | `0.2.0` (MINOR — tính năng mới, tương thích ngược: code 0.1.0 vẫn chạy trên DB sau migration 010, xem OPERATIONS §5) |
| Phụ thuộc kế hoạch 02 | **Thiết kế**: không chặn. **Thi công**: P00 cần 02-P01 (migration 009 trong repo) · P01/P02/P03 cần 02-P03 (`turn.ts`, `persona.ts`, `policy.ts`, tool `read_skill`) · P05 cần 02-P08 (khung dashboard, `/persona`) · P04 cần 02-P09a (máy chấm golden thật + bộ `activation`) · P06 cần 02 đóng `0.1.0` (baseline `turn_traces` thật để so) |
| Bằng chứng architect | Không chạy thử DDL 010 (Docker/DB dev đang được worker P01 dùng — CẤM chạm). ⇒ P00 BẮT BUỘC áp thử từ rỗng trên DB tạm, ghi `evidence/P00/migration-010-probe.txt`; lệch cú pháp ⇒ dừng báo, không tự sửa nghĩa |

## 2. Nhật ký quyết định

Mỗi mục: quyết định · lý do · **chỗ lật + chi phí lật**. Tất cả do architect chốt 2026-10-14 trên định hướng người dùng đã chốt cùng ngày (Voice = giọng điệu; chỉ zca-js; ưu tiên chi phí; hiểu ý bằng model, code là lưới; luật cứng trong tool). SO có thể lật trước khi phóng.

### D01 — 2026-10-14 08:50 · Phạm vi 0.2.0 = khung hành vi + vòng đời release; KHÔNG thêm năng lực nghiệp vụ mới
Năng lực cộng đồng (02 D05) giữ nguyên; 0.2.0 chỉ đổi CÁCH agent được cấu hình, kiểm và phát hành hành vi. Lý do: GĐ2 (doanh nghiệp của chủ) cần persona/skill/giọng riêng theo tenant với bằng chứng chất lượng trước khi bật. **Lật:** cắt Dashboard (P05) xuống CLI — chi phí thấp.

### D02 — 2026-10-14 08:55 · Voice = thông số giọng điệu có cấu trúc theo tenant × bề mặt (`group` | `dm` | `owner_dm`); chỉ khối của bề mặt hiện tại vào prompt
Trường đo được bằng code (độ dài, emoji, từ tránh, markdown) do cổng ra kiểm; trường cảm nhận (mức trang trọng, ghi chú giọng, xưng hô đúng ngữ cảnh) chấm golden bằng máy chấm model. Lý do: một khối giọng chung cho 3 bề mặt tốn token gấp 3 và trộn luật (chủ nhắn DM khác nhóm đông). Hợp đồng: [SPEC-P02](specs/SPEC-P02-Voice.md). **Lật:** thêm bề mặt (vd theo nhóm) — mở rộng `Surface` + validator; chi phí trung bình.

### D03 — 2026-10-14 09:00 · Tài sản hành vi MỚI khoá theo `tenant_id` (như `kb_documents` ở 009); `persona_docs` (008) giữ khoá tài khoản, được release tham chiếu bằng id
Lý do: hành vi thuộc về thương hiệu (tenant), không thuộc SIM; 009 đã đặt tiền lệ `kb_documents.tenant_id`. Không thêm `tenant_id` vào `persona_docs` (02 vùng cấm "tenant_id trên mọi bảng" — hai nguồn chân lý); `createRelease` kiểm tài khoản của doc thuộc đúng tenant (`TenantMismatchError`). **Lật:** khoá theo tài khoản — đổi 4 bảng mới trước khi có dữ liệu; chi phí thấp lúc này.

### D04 — 2026-10-14 09:05 · Đơn vị phiên bản = **release** (ảnh chụp bất biến: 4 persona doc + skill + voice + output policy); runtime chỉ đọc release active; `persona_docs.is_active` ĐÓNG BĂNG từ 0.2.0
Lý do: kích hoạt từng kind độc lập (02 SPEC-P08) tạo tổ hợp chưa ai chấm; rollback "1 thao tác" chỉ có nghĩa khi cả bộ là một đơn vị. `is_active` giữ nguyên cột (code 0.1.0 rollback vẫn chạy — OPERATIONS §5), 0.2.0 KHÔNG đọc/ghi (máy đo `check_output_gate.mjs` mục 3). **Lật:** không nên; dọn cột ở GĐ3.

### D05 — 2026-10-14 09:10 · Nội dung hành vi bất biến ở tầng DB: trigger chặn UPDATE nội dung / DELETE trên `persona_docs`, `skill_versions`, `behavior_docs`, `behavior_releases`
Lý do: attestation chấm theo `content_sha256`; sửa tại chỗ làm attestation nói dối. Trigger là luật cứng không phụ thuộc code dashboard. **Lật:** drop trigger — một migration; KHÔNG nên.

### D06 — 2026-10-14 09:20 · Skill = tên + mô tả + câu "Dùng khi …" + quy trình + bề mặt + tool khai báo + ≥ 8 ca test, có phiên bản; chỉ mục ≤ 300 ký tự/mục, ≤ 2 400 ký tự/bề mặt, ≤ 12 skill/bề mặt; vượt ⇒ TỪ CHỐI tạo release
Port Claude Code (cli-leaked `9800e58`): `src/tools/SkillTool/prompt.ts` (chỉ mục `- name: description - whenToUse`, trần mỗi mục `MAX_LISTING_DESC_CHARS`, ngân sách chỉ mục), `src/skills/loadSkillsDir.ts` (frontmatter `when_to_use`, nạp thân khi gọi). KHÁC có chủ đích: (a) Claude Code cắt mô tả ngầm khi vượt ngân sách — ta fail-closed lúc soạn (skill bị cắt = vô hình mà không ai biết); (b) `allowed-tools` của Claude Code NỚI quyền (`SkillTool.ts` ~dòng 779–798 ghi `alwaysAllowRules`) — ta CẤM: `uses_tools` chỉ là khai báo để kiểm nhất quán + chấm ca test, quyền vẫn duy nhất từ `TOOL_POLICY` (BB-16). Hợp đồng: [SPEC-P01](specs/SPEC-P01-Skill.md). **Lật:** số trần là hằng TS — chi phí thấp.

### D07 — 2026-10-14 09:30 · Cổng ra (Constraint tầng 2) = hàm THUẦN, 6 loại kiểm đóng (`max_chars`, `max_emoji`, `banned_term`, `markdown`, `link`, `phone`), áp tại MỘT điểm `sendAgentText` trước `enqueue`, theo luật của bề mặt ĐÍCH
Cấu hình chỉ là số + danh sách cụm từ literal + tên miền + số điện thoại; code tự dựng matcher (escape, ranh giới Unicode `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`, GIỮ dấu tiếng Việt); CẤM regex do người nhập (ReDoS + 02 BB-12). Template tất định đi `sendSystemText(templateId)` (không nhận chuỗi tự do). Port mẫu hook PreToolUse "deny kèm lý do cho model" — cli-leaked `src/utils/hooks.ts` (~dòng 331–369 `blockingError`, 553–616 `permissionDecision`) và thứ tự deny → kiểm riêng của tool → safety check không bypass được — `src/utils/permissions/permissions.ts` (`hasPermissionsToUseToolInner` ~dòng 1158–1299). Hợp đồng: [SPEC-P03](specs/SPEC-P03-Cong-Ra.md). **Lật:** thêm loại kiểm = thêm nhánh hàm thuần + ca test; chi phí thấp.

### D08 — 2026-10-14 09:35 · Vi phạm cổng ra ⇒ model viết lại TỐI ĐA 1 lần/lượt ⇒ vẫn vi phạm ⇒ chuyển người (`handoff_to_owner('output_blocked')` kèm bản nháp + câu tất định nếu lượt bắt buộc trả lời); lượt không bắt buộc ⇒ im; `outcome='gated'`
Nhóm: viết lại qua `tool_result is_error` trong vòng tool sẵn có (không thêm vòng ngoài). DM / host tự đăng: một lời gọi lại có lý do vi phạm. Lý do: chi phí có trần (≤ 1 lời gọi thêm/lượt, chỉ khi vi phạm) và không bao giờ gửi câu vi phạm. **CẤM** code tự sửa câu (cắt chữ, thay từ) — đổi nghĩa/ngữ pháp. **Lật:** số lần viết lại là hằng — chi phí thấp, phải đo lại S10.

### D09 — 2026-10-14 09:40 · Constraint tầng 3 (mềm) = mục "## Giới hạn" trong RULES + golden `constraints` (bộ nền trong repo + bộ riêng tenant trong DB), chấm bằng máy chấm model
Lý do: cam kết giá, tư vấn chuyên môn, hứa hành động không làm được… không bắt được bằng lưới chính xác cao; đo bằng golden, không bằng regex (02 BB-12). **Lật:** chuyển một ràng buộc lên tầng 2 khi có lưới chính xác ≥ 0,99 trên corpus sạch.

### D10 — 2026-10-14 09:45 · Máy chấm model (judge) chỉ chạy OFFLINE trong eval; tự hiệu chuẩn mỗi lượt chấm bằng ví dụ đúng/sai của chính VoiceSpec + bộ hiệu chuẩn ràng buộc; hiệu chuẩn < 0,90 ⇒ `blocked` (exit 3)
Model chấm và model agent khi đóng gate = model gate của 02 D10. CẤM judge chạy thật mỗi lượt (gấp đôi chi phí). **Lật:** ngưỡng hiệu chuẩn — hằng; chi phí thấp.

### D11 — 2026-10-14 09:50 · Eval KHÔNG BAO GIỜ chạy trên DB vận hành: DB riêng `<tên>_eval` + `TRANSPORT=sim` + `DATA_MODE=sim`; nội dung chuyển bằng bundle JSON; kết quả về DB vận hành bằng **attestation** khoá theo `content_sha256`; DB trigger chỉ cho kích hoạt release có attestation `passed` cùng hash
Lý do: (1) outbox của eval không được chạm tới worker Zalo thật; (2) `turn_traces` vận hành là thước so release — eval làm bẩn nó; (3) mỗi tiến trình một `DATABASE_URL` giữ đúng 02 BB-03. **Lật:** chạy eval trên DB vận hành — KHÔNG (vùng cấm 00 §7).

### D12 — 2026-10-14 09:55 · Chấm bù theo phần đổi (`impactedSuites`, hàm thuần); đổi CHỈ output policy ⇒ chấm lại tất định trên đầu ra đã lưu của attestation gốc, 0 lời gọi model
Kế thừa ý Đ29 kế hoạch 01 (`--set`). Chấm đủ bắt buộc khi: release đầu tiên sau bootstrap, attestation gốc > 30 ngày, `code_ref` khác MINOR, hoặc `--full`. **Lật:** luôn chấm đủ — chi phí ×2–4 lời gọi.

### D13 — 2026-10-14 10:00 · Rollback = kích hoạt lại release `previous_release_id` (đã passed/bootstrap) trong 1 transaction; hiệu lực từ LƯỢT KẾ TIẾP (mỗi lượt đọc con trỏ active — 1 hàng theo khoá chính; bundle cache theo `release_id`)
Thay cache TTL 60 s của 02 SPEC-P03 §7.1. **Lật:** cache TTL — tiết kiệm 1 truy vấn/lượt, mất "hiệu lực tức thì"; chi phí thấp.

### D14 — 2026-10-14 10:05 · Bootstrap: release #1 dựng từ trạng thái active của 0.1.0 (4 persona doc active, `skill_docs` enabled → `skill_versions` v1, voice/policy mặc định), `origin='bootstrap'`, miễn eval ĐÚNG 1 lần/tenant (index duy nhất)
Lý do: trạng thái đó đã qua golden G09 của 02; buộc chấm lại để chạy được 0.2.0 là chi phí không thêm thông tin. Skill bootstrap không có ca test ⇒ release kế tiếp có đổi skill phải bổ sung ≥ 8 ca. **Lật:** bắt chấm bootstrap — một lượt eval đủ.

### D15 — 2026-10-14 10:10 · Số đo chi phí khung: `turn_traces` thêm `release_id`, `gate_violations`, `gate_rewrites`, `skills_read`; ngưỡng input token trung bình/lượt ≤ 1,15 × release bootstrap trên cùng bộ ca; tỉ lệ lượt có viết lại ≤ 5 % khi chạy thật
Lý do: người dùng yêu cầu mỗi lời gọi model thêm phải có lý do + số đo. **Lật:** ngưỡng — sau tuần chạy thật đầu, ghi D mới.

### D16 — 2026-10-14 10:12 · Template tất định là của nền tảng, KHÔNG theo tenant ở 0.2.0; eval chạy chúng qua luật đã biên dịch và chỉ CẢNH BÁO
Lý do: câu fallback phải luôn gửi được; tenant xưng "em" sẽ thấy cảnh báo template xưng "mình" — chấp nhận ở GĐ1 (1 tenant `default`). **Lật:** template theo tenant ở GĐ2 — thêm kind `templates` vào `behavior_docs`.

### D17 — 2026-10-14 10:15 · Lúc chạy, khung KHÔNG thêm lời gọi model nào ngoài lần viết lại khi vi phạm (D08)
Không có model "kiểm giọng", không có model chọn skill, không có model tóm tắt. Chọn skill = chính model agent đọc chỉ mục rồi gọi `read_skill` (nạp lũy tiến). **Lật:** cần D mới kèm số đo chi phí.

### D18 — 2026-10-14 10:18 · Chạy eval bằng CLI (`npm run release:eval`); dashboard hiện kết quả + lệnh để chép, KHÔNG có nút "Chấm"
Lý do: runner là 1 tiến trình tuần tự (02 D08) — eval dài chặn tin vào; tiến trình eval riêng trên web là hạ tầng mới. **Lật:** Q2 — thêm tiến trình `eval-worker` thăm dò `release_eval_requests`; chi phí trung bình.

### D19 — 2026-10-14 10:20 · Phiên bản mục tiêu `0.2.0` (MINOR); tăng ở `package.json` ×4 khi đóng kế hoạch.

### Quyết định bị thay thế
| Mốc cũ | Phát biểu cũ | Thay bằng | Lý do |
| :-- | :-- | :-- | :-- |
| 02 SPEC-P08 §1 `/persona` "Kích hoạt" từng kind; `POST /api/persona/{kind}/{version}/activate` | kích hoạt độc lập 4 kind | D04 (từ 0.2.0) | tổ hợp chưa chấm; rollback cần đơn vị chung |
| 02 SPEC-P03 §7.1 cache persona 60 s | đổi trên dashboard hiệu lực tối đa 60 s | D13 | rollback phải tức thì |
| 02 01-CONTRACTS §4 `skill_docs` (sửa tại chỗ, không phiên bản) | skill sửa trực tiếp | D06 (`skill_versions`), D05 | chấm theo phiên bản cần nội dung bất biến |
| 02 01-CONTRACTS §11 khối 6 "`- <name>: <description>`" | chỉ mục không có "Dùng khi" | D06 | mô tả "dùng khi" là thứ model dùng để chọn skill |
| 02 01-CONTRACTS §4 (009) CHECK `turn_traces.outcome` (7 giá trị) | | 010 thêm `gated` (D08) | lượt bị cổng ra chặn phải đếm được riêng |
| Roadmap GĐ1 "kích hoạt phiên bản persona chỉ khi golden hồi quy đạt" | phiên bản persona | release (D04) | persona chỉ là 1 phần của hành vi |

## 3. Work Packages (Tầng · Chặn bởi · Ước lượng)

| Gói | Nội dung | Tầng | Chặn bởi | Ước lượng | SPEC |
| :-- | :-- | :-- | :-- | :-- | :-- |
| P00 | Migration 010 + probe từ rỗng; kiểu `behavior/types.ts`; `validate.ts`; kho `services/behavior/store.ts` + trigger bất biến; `content-hash.ts`; `bootstrap.ts`; seed gọi bootstrap | 🟠 | 02-P01 | 1,5 ngày | [01-CONTRACTS](specs/01-CONTRACTS.md) §3–§6 · [SPEC-P04](specs/SPEC-P04-Release-Golden.md) §2 |
| P01 | Skill: `skill_versions`, `renderSkillIndex` có trần, `read_skill` theo release + bề mặt + chống nạp lặp, kiểm `uses_tools`, `skills_read` | 🟠 | P00, 02-P03 | 1 ngày | [SPEC-P01](specs/SPEC-P01-Skill.md) |
| P02 | Voice: `renderVoiceBlock`, chèn khối vào `buildSystemPrompt`, `loadBehavior` thay `loadPersonaBundle`, voice mặc định | 🟠 | P00, 02-P03 | 1 ngày | [SPEC-P02](specs/SPEC-P02-Voice.md) |
| P03 | Cổng ra: `output-gate.ts` (thuần), `output/send.ts`, luồng viết lại/chuyển người trong `turn.ts` + `send_group_message`/`announce`/`schedule_automation`, `check_output_gate.mjs` | 🟠 thi công · 🔴 thẩm định đối kháng | P02 | 2 ngày | [SPEC-P03](specs/SPEC-P03-Cong-Ra.md) |
| P04 | Release: tạo/kích hoạt/rollback, bundle export/import, attestation, `impactedSuites`, CLI; eval: bộ `voice`/`constraints`/`skill:*`/`activation`/`recheck`/`templates`, máy chấm + hiệu chuẩn, bằng chứng đỏ; viết golden nền | 🟠 · golden nội dung 🟠 · gate 🔴 | P01–P03, 02-P09a | 3 ngày | [SPEC-P04](specs/SPEC-P04-Release-Golden.md) · [TESTING](specs/TESTING-ACCEPTANCE.md) §3 |
| P05 | Dashboard `/behavior/*`: voice, policy, skill, ca golden tenant, release, kích hoạt/rollback, so sánh release | 🟠 route · 🟢 trang đọc | P00 (khung), P04 (kích hoạt), 02-P08 | 2 ngày | [SPEC-P05](specs/SPEC-P05-Dashboard.md) |
| P06 | Golden thật (model gate 02 D10), Zalo thật 7 ngày với ≥ 2 release + 1 diễn tập rollback, VPS, bump `0.2.0`, Ma Trận 6 Điểm | 🟠 · gate 🔴 | P01–P05, 02 đóng `0.1.0` | 2 ngày + 7 ngày chạy | [TESTING](specs/TESTING-ACCEPTANCE.md) · [OPERATIONS](specs/OPERATIONS.md) |

Thứ tự bắt buộc: `P00 → (P01 ∥ P02) → P03 → P04 → P05 hoàn tất → P06`. P05 dựng khung trang đọc được ngay sau P00. Thẩm định 🔴 riêng cho P03 (agent khác, không thừa kế ngữ cảnh, ≥ 3 cách phá cổng ra — TESTING §5).

## 4. Checklist thực thi

- [x] Bước 0 `--check` exit 0; đọc 02 (plan §2, 00, 01 §4/§6/§7/§9/§11, P03 §6–§8, P08, TESTING §3) + bản đồ `repo-analysis/PHAN-TICH.md` + cli-leaked `src/skills/`, `src/tools/SkillTool/`, `permissions.ts`, `hooks.ts` — architect 2026-10-14
- [x] Dựng bộ SPEC (00, 01, P01–P05, OPERATIONS, TESTING) — architect 2026-10-14
- [ ] 🖐 SO duyệt bộ SPEC + chốt/giữ giá trị tạm Q1–Q10 (Mục 6) + quyết định nhận/không các đề xuất sửa 02 (01-CONTRACTS §10)
- [ ] P00 — migration 010 + kho + bootstrap (S01, S02 local)
- [ ] P01 — skill (S06 local)
- [ ] P02 — voice (S03 phần render, S04 local)
- [ ] P03 — cổng ra (S03, S05 local) + thẩm định 🔴 (S12)
- [ ] P04 — release + eval + golden nền (S07, S08 local)
- [ ] P05 — dashboard (S11 local)
- [ ] P06a — golden thật (S09, S10 cột local) + bằng chứng đỏ máy chấm
- [ ] P06b — Zalo thật 7 ngày ≥ 2 release + diễn tập rollback (cột `zalo-thật`)
- [ ] P06c — VPS (cột `vps`) + `0.2.0` + changelog + Ma Trận 6 Điểm (S13)
- [ ] Đóng hồ sơ: mọi H có R, mọi report ✅, evidence được trỏ tồn tại

## 5. Bảng trỏ SPEC

| File | Nội dung |
| :-- | :-- |
| [specs/00-ARCHITECTURE.md](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, luồng, 3 tầng constraint, bất biến BB-15…BB-20, vùng cấm, port từ Claude Code, rủi ro đã biết |
| [specs/01-CONTRACTS.md](specs/01-CONTRACTS.md) | Layout, DDL 010 nguyên văn, kiểu TS, chữ ký hàm, tool đổi, sự kiện audit, bảng lỗi, env, **đề xuất sửa kế hoạch 02** |
| [specs/SPEC-P01-Skill.md](specs/SPEC-P01-Skill.md) | Skill có phiên bản, chỉ mục có trần, `read_skill`, ca test riêng |
| [specs/SPEC-P02-Voice.md](specs/SPEC-P02-Voice.md) | VoiceSpec, phần đo bằng code vs chấm golden, khối prompt, mặc định |
| [specs/SPEC-P03-Cong-Ra.md](specs/SPEC-P03-Cong-Ra.md) | Constraint 3 tầng, `checkOutput`, `sendAgentText`, luồng viết lại/chuyển người, máy đo điểm nghẽn |
| [specs/SPEC-P04-Release-Golden.md](specs/SPEC-P04-Release-Golden.md) | Release, bất biến, bootstrap, bundle/attestation, `impactedSuites`, eval + máy chấm, kích hoạt/rollback, so release |
| [specs/SPEC-P05-Dashboard.md](specs/SPEC-P05-Dashboard.md) | Trang/route `/behavior/*`, vai, lỗi HTTP, nghiệm thu |
| [specs/OPERATIONS.md](specs/OPERATIONS.md) | DB eval, lệnh release, nâng cấp 0.1.0 → 0.2.0, rollback mã, runbook |
| [specs/TESTING-ACCEPTANCE.md](specs/TESTING-ACCEPTANCE.md) | Ma trận test, golden `voice`/`constraints`/skill, ngưỡng, bằng chứng đỏ, Exit Gates `local / zalo-thật / vps` |

## 6. Câu hỏi mở cho người (🖐 — giá trị TẠM để thi công không kẹt)

| # | Câu hỏi | Tạm dùng | Chỗ ghi |
| :-- | :-- | :-- | :-- |
| Q1 | Giọng mặc định tenant `default` (cộng đồng) | xưng "mình" / gọi "bạn" cả 3 bề mặt; nhóm ≤ 600 ký tự, ≤ 1 emoji; DM ≤ 900, ≤ 2 emoji; DM chủ ≤ 1800, 0 emoji; trang trọng 2/5; cấm markdown | SPEC-P02 §5 |
| Q2 | Có cần nút "Chấm" trên dashboard (tiến trình `eval-worker` riêng)? | KHÔNG — CLI `npm run release:eval` (D18) | SPEC-P04 §6, SPEC-P05 |
| Q3 | Ngưỡng golden `voice` (máy chấm) và `constraints` | voice ≥ 0,85 ca đạt; constraints vi phạm ≤ 0,05; skill recall ≥ 0,80 | TESTING §3 |
| Q4 | Cho phép "kích hoạt khẩn cấp" release CHƯA chấm? | KHÔNG — chỉ rollback về bản đã passed (D11, D13) | SPEC-P04 §5 |
| Q5 | Link trong câu trả lời ở nhóm/DM cộng đồng | `links.mode='any'` (đo số link thật ở 0.1 trước); tenant doanh nghiệp (GĐ2) nên `allowlist` | SPEC-P02 §5 |
| Q6 | Số điện thoại bot được phép nói ra | nhóm/DM: `allowlist` rỗng (mọi SĐT ⇒ vi phạm); DM chủ: `any` | SPEC-P02 §5 |
| Q7 | Ai được kích hoạt/rollback release | chỉ vai web `admin` (operator đọc) + CLI trên máy chủ | SPEC-P05 §1 |
| Q8 | DB eval ở đâu | cùng container Postgres, database `lenqclaw_eval` | OPERATIONS §1 |
| Q9 | Hiển thị chi phí USD khi so release | chỉ token (USD tính lúc đọc khi có env giá — 02 D24 chưa định nghĩa bảng giá) | SPEC-P04 §8 |
| Q10 | Nội dung golden riêng tenant `default` (voice/constraints) do ai viết | architect/worker viết bộ nền trong repo; chủ bổ sung ≥ 10 ca/bộ qua `/behavior/cases` trước P06b | TESTING §3 |
