# Project Index Map & Navigation Router

Tệp này là **Bản Đồ Chỉ Mục Trung Tâm (Master Index Map)** của dự án. Mọi AI Agent sử dụng tệp này để định tuyến tài liệu và nắm bắt toàn bộ bản đồ cấu trúc mã nguồn, luồng giao tiếp và các điểm vào (Entry Points).

---

## 🧭 1. ĐIỀU HƯỚNG TÀI LIỆU & KẾ HOẠCH (Documentation & Planning Router)

Khi nhận nhiệm vụ, Agent tra cứu bảng này để đọc **chính xác** tài liệu chuyên sâu liên quan:

| Lĩnh vực / Nhiệm vụ | Tài liệu chuyên trách | Nội dung chính |
| :--- | :--- | :--- |
| **Ký ức nóng phiên gần nhất** | [`memory/hot/today.md`](memory/hot/today.md) & [`state.json`](memory/hot/state.json) | Trạng thái máy (JSON), nhật ký làm việc theo phiên và kết quả benchmark gần nhất. |
| **Khởi động / Quy tắc chung** | [`memory-distill.txt`](memory-distill.txt) | Kernel hiện trạng, Startup Protocol, Tech stack cốt lõi. |
| **HỒ SƠ ĐANG MỞ — đọc trước khi làm gì** | [`planning/02_2026-10-09_zalo-community-agent/plan.md`](../planning/02_2026-10-09_zalo-community-agent/plan.md) → [`specs/00-ARCHITECTURE.md`](../planning/02_2026-10-09_zalo-community-agent/specs/00-ARCHITECTURE.md) → [`specs/01-CONTRACTS.md`](../planning/02_2026-10-09_zalo-community-agent/specs/01-CONTRACTS.md) | D01–D21, Work Packages P01–P09, bất biến BB-01…BB-12, DDL 007/008 (thiết kế), router thứ tự đọc SPEC. |
| **SPEC từng gói (kế hoạch 02)** | [`SPEC-P01`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P01-Go-San-Tho.md) gỡ sàn thợ · [`P02`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P02-Transport-Nhom.md) transport nhóm · [`P03`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P03-Runtime-Agent.md) runtime agent · [`P04`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P04-Tri-Thuc.md) tri thức · [`P05`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P05-Kiem-Duyet.md) kiểm duyệt · [`P06`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P06-Lead-Tri-Nho.md) lead · [`P07`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P07-Lich-Van-Hanh.md) lịch · [`P08`](../planning/02_2026-10-09_zalo-community-agent/specs/SPEC-P08-Dashboard.md) dashboard · [`OPERATIONS`](../planning/02_2026-10-09_zalo-community-agent/specs/OPERATIONS.md) · [`TESTING-ACCEPTANCE`](../planning/02_2026-10-09_zalo-community-agent/specs/TESTING-ACCEPTANCE.md) | Mỗi gói một hợp đồng; xong khi theo TESTING-ACCEPTANCE. |
| **Kế hoạch 01 — ⛔ DỪNG (Đ32), chỉ để tra lịch sử** | [`planning/01_2026-09-24_san-viec-tho-mvp/plan.md`](../planning/01_2026-09-24_san-viec-tho-mvp/plan.md) | Sàn việc thợ (pipeline v0.2, Đ01–Đ32). Không thi công thêm; khôi phục từ tag `archive/plan-01-marketplace` (sẽ đánh ở P01). |
| **Sơ đồ/tài liệu sàn thợ (lịch sử)** | [`docs/images/08-pipeline-chuan.png`](../docs/images/08-pipeline-chuan.png) · [`09`](../docs/images/09-dashboard-bql-mockup.png) · [`10`](../docs/images/10-kinh-te-ba-ben.png) · [`docs/SYSTEM-MAP.md`](../docs/SYSTEM-MAP.md) · [`docs/DESIGN.md`](../docs/DESIGN.md) | Mô tả sàn thợ/BQL — KHÔNG phản ánh sản phẩm hiện tại (pivot 2026-10-09). |
| **Tổng quan dự án** | [`project-intro.md`](project-intro.md) | Mục tiêu, kiến trúc tổng thể. |
| **Kế hoạch nâng cấp & RFCs** | [`planning/`](../planning/) | Thư mục chứa các bản kế hoạch theo chuẩn `[STT]_[YYYY-MM-DD]_[Ten-Ngan]`. |
| **Lỗi khó / Cạm bẫy / Gotchas** | [`-known-gotchas.md`](-known-gotchas.md) | Tổng hợp các bẫy kỹ thuật và lỗi dị biệt đã gặp. |
| **Kiến trúc dữ liệu & Data Flow** | [`-data-architecture.md`](-data-architecture.md) | Cấu trúc dữ liệu, cơ chế lưu trữ và State Flow. |
| **Lộ trình nâng cấp & Ý tưởng** | [`roadmap.md`](roadmap.md) | Active tasks, Kho Ý Tưởng (Idea Vault) và các mốc đã hoàn thành. |
| **Lịch sử cập nhật** | [`changelog.md`](changelog.md) | Lịch sử Semantic Releases (vX.Y.Z). |
| **Tài liệu kỹ thuật module** | [`docs/core.md`](../docs/core.md) · [`docs/web.md`](../docs/web.md) · [`docs/zalo-worker.md`](../docs/zalo-worker.md) | 1-1 với `packages/core`, `apps/web`, `apps/zalo-worker`: cấu trúc, lệnh, luật khi sửa. |
| **Cổng kiểm tra** | `npm run gate` | typecheck → build → test → `check_adapter_boundary` → `check_agent_tools` (TESTING-ACCEPTANCE §1). Test cần DB: `npm run test:db`. |

---

### 🛠️ 1.2. Bảng Định Tuyến Kỹ Năng Chuyên Dụng (Workspace Skills Router - `.agents/skills/`)

| STT | Tên Skill (`.agents/skills/`) | File Quy Chuẩn (`SKILL.md`) | Vai Trò & Chức Năng Cốt Lõi |
| :---: | :--- | :--- | :--- |
| **1** | `nao-dong-bo` · `nao-commit` · `nao-dong-phien` · `nao-ten-phien` | `SKILL.md` | Bộ skill não do engine quản (đồng bộ não, commit, đóng phiên, đặt tên phiên). CẤM sửa tại repo. |
| **2** | `vai-dieu-phoi` · `vai-thi-cong` | `SKILL.md` | Vai Super Orchestrator / worker theo AGENTS.md Luật K. |

---

## 🗺️ 2. BẢN ĐỒ CẤU TRÚC MÃ NGUỒN (Codebase Directory Map)

```text
project-root/
├── AGENTS.md                         # [QUY TẮC TỐI THƯỢNG] Nguồn chân lý DUY NHẤT (Gemini/Codex đọc trực tiếp)
├── CLAUDE.md                         # [SHIM] Điểm nạp tự động của Claude Code — chỉ chứa @AGENTS.md
├── brain4agent-v1.7.1.md   # [MARKER] Phiên bản khung não — soi nhanh ở root
├── brain4agent/                      # [BỘ NHỚ DỰ ÁN] Single Source of Truth
│   ├── memory/hot/                   # [HOT MEMORY] Ký ức nóng phiên (today.md, state.json)
│   ├── memory-distill.txt            # [KERNEL] Bản cô đọng tối thượng (< 100 dòng)
│   ├── index.md                      # [ROUTER] Master Index Map & Codebase Navigation
│   ├── roadmap.md                    # [ROADMAP] Tiến độ, Active tasks & Idea Vault
│   ├── changelog.md                  # [CHANGELOG] Lịch sử Semantic Releases
│   ├── -known-gotchas.md             # [GOTCHAS] Tổng hợp lỗi dị biệt & bẫy kỹ thuật
│   ├── -data-architecture.md         # [DATA ARCH] Kiến trúc dữ liệu & Data Flow
│   └── project-intro.md              # [INTRO] Tổng quan dự án & Tech stack
├── planning/                         # [QUẢN LÝ KẾ HOẠCH NÂNG CẤP] Chứa các bản kế hoạch RFCs
├── .agents/skills/                   # [WORKSPACE SKILLS] Kỹ năng chuyên dụng cục bộ dự án
├── docs/                             # core.md · web.md · zalo-worker.md (module 1-1), SYSTEM-MAP.md, DESIGN.md (v0.1 cũ), images/01…10 (đều mô tả sàn thợ = lịch sử)
│                                     # Mã hiện có = NỀN CỘNG ĐỒNG sau P01 (2026-10-16, D27). Mã sàn thợ chỉ còn trong tag `archive/plan-01-marketplace` (`git show archive/plan-01-marketplace:<đường>`).
├── apps/web/                         # Next.js 15: auth 2 vai admin/operator (cookie HMAC, policy SPEC-P01 §3.1) · /login · /zalo (QR, tài khoản community) · /dev/sim (khung DM + nhóm sim-group-1) · trang dashboard ở P08
├── apps/zalo-worker/                 # zca-js 2.2.0, MỘT tài khoản `community`, phiên AES-GCM, QR, watchdog · P02: tin + sự kiện nhóm, actions.ts (10 action, kick/block chỉ khi thẻ duyệt approved), pacer + ngân sách theo nhóm
├── packages/core/src/                # adapters/{db,model,transport} · domain/{types,errors,password} · services/{audit,community-config,system-events,timers(khung),vn-time} · sim/{sim-transport,sim-actions} (nhóm giả lập, P02) · db/{migrate,seed,seed-sim}
│                                     # ĐÍCH P03 (D28): agent/community/graph/* — LangGraph pipelineGraph + turnGraph (01-CONTRACTS §12)
│                                     # agent/conversation.ts · agent/community/{router.ts (khung: DM ⇒ STUB_DM_REPLY, nhóm ⇒ audit stub), redact.ts, tools/tool-kit.ts} · retrieval/search-knowledge.ts · runner/inbound-runner.ts · dev/link-zalo.ts (--owner)
├── db/migrations/                    # 001–006 (lịch sử, CẤM sửa) · 007_drop_marketplace.sql · 008_community.sql · 009_tenant_trace.sql (tenants + turn_traces) — 01-CONTRACTS §4
├── scripts/                          # gate.mjs (typecheck→build→test→check_adapter_boundary→check_agent_tools→check_pivot_cleanup) · seed-sim-for-test.mjs
├── evals/                            # scenarios/echo.jsonl (community); 4 golden cộng đồng thêm ở P09
├── compose.yaml · compose.dev.yaml   # Postgres pgvector:pg16; dev publish 127.0.0.1:15432
└── package.json                      # npm workspaces (apps/*, packages/*), v0.0.1
```

Layout mã nguồn ĐÍCH (đầy đủ sau P09): `planning/02_2026-10-09_zalo-community-agent/specs/01-CONTRACTS.md` §1 (mới: `agent/community/*`, `services/community-config.ts`, `retrieval/*`).
