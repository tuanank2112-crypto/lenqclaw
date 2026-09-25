# Project Index Map & Navigation Router

Tệp này là **Bản Đồ Chỉ Mục Trung Tâm (Master Index Map)** của dự án. Mọi AI Agent sử dụng tệp này để định tuyến tài liệu và nắm bắt toàn bộ bản đồ cấu trúc mã nguồn, luồng giao tiếp và các điểm vào (Entry Points).

---

## 🧭 1. ĐIỀU HƯỚNG TÀI LIỆU & KẾ HOẠCH (Documentation & Planning Router)

Khi nhận nhiệm vụ, Agent tra cứu bảng này để đọc **chính xác** tài liệu chuyên sâu liên quan:

| Lĩnh vực / Nhiệm vụ | Tài liệu chuyên trách | Nội dung chính |
| :--- | :--- | :--- |
| **Ký ức nóng phiên gần nhất** | [`memory/hot/today.md`](memory/hot/today.md) & [`state.json`](memory/hot/state.json) | Trạng thái máy (JSON), nhật ký làm việc theo phiên và kết quả benchmark gần nhất. |
| **Khởi động / Quy tắc chung** | [`memory-distill.txt`](memory-distill.txt) | Kernel hiện trạng, Startup Protocol, Tech stack cốt lõi. |
| **HỒ SƠ ĐANG MỞ — đọc trước khi làm gì** | [`planning/01_2026-09-24_san-viec-tho-mvp/plan.md`](../planning/01_2026-09-24_san-viec-tho-mvp/plan.md) → [`specs/00-ARCHITECTURE.md`](../planning/01_2026-09-24_san-viec-tho-mvp/specs/00-ARCHITECTURE.md) | Quyết định Đ01–Đ09, Work Packages P00–P07, router thứ tự đọc SPEC. |
| **Pipeline chuẩn (ảnh)** | [`docs/images/08-pipeline-chuan.png`](../docs/images/08-pipeline-chuan.png) | Pipeline v0.2 (đã duyệt): agent điều phối 8 bước giữa cư dân, dashboard BQL, nhóm thợ; bản ASCII ở `docs/SYSTEM-MAP.md` §10. |
| **Mockup dashboard BQL** | [`docs/images/09-dashboard-bql-mockup.png`](../docs/images/09-dashboard-bql-mockup.png) | Đ11 — tham chiếu P04 (UI còn rối, tinh gọn sau). |
| **Kinh tế ba bên (ảnh)** | [`docs/images/10-kinh-te-ba-ben.png`](../docs/images/10-kinh-te-ba-ben.png) | Đ15 — dòng tiền, 3 bề mặt lợi ích, luật cân bằng slot. |
| **Bối cảnh chiến lược + sơ đồ** | [`docs/SYSTEM-MAP.md`](../docs/SYSTEM-MAP.md) | Kiến trúc 6 tầng, nhân rộng, vòng quay dữ liệu, ngách sàn việc thợ, agent tạo giá trị ở đâu. |
| **Thiết kế cũ (đã thu hẹp)** | [`docs/DESIGN.md`](../docs/DESIGN.md) | v0.1 trợ lý BQL tổng quát — chỉ tham khảo, bị thay bởi Đ01. |
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
├── docs/                             # core.md · web.md · zalo-worker.md (module 1-1), SYSTEM-MAP.md, DESIGN.md (v0.1 cũ), images/01…10
├── apps/web/                         # Next.js 15: auth 3 vai (cookie HMAC), /dev/sim, trang tạm /tickets /gate — P01
├── apps/zalo-worker/                 # khung rỗng, chờ P02
├── packages/core/src/                # adapters/{db,model,transport} · domain/{types,errors,password} · services/{job-state,audit} · sim/ · db/{migrate,seed,seed-sim}
│                                     # agent/{resident-agent,emergency,triage,pii,job-code,tool-context,prompts/{resident,triage}.ts,tools/*} · retrieval/search-regulations.ts (P03)
├── db/migrations/                    # 001_init.sql (DDL 01-CONTRACTS §4) · 002_search.sql (unaccent + tsv) · 003_kb_building.sql (quy chế theo tòa, Đ20)
├── scripts/                          # check_adapter_boundary.mjs · check_agent_tools.mjs · gate.mjs · eval_golden.mjs (exit 3 = blocked) · seed-sim-for-test.mjs
├── evals/                            # scenarios/echo.jsonl · golden/{emergency(100),consent(44),diagnosis,responsibility}.jsonl
├── compose.yaml · compose.dev.yaml   # Postgres pgvector:pg16; dev publish 127.0.0.1:55432
└── package.json                      # npm workspaces (apps/*, packages/*), v0.0.1
```

Layout mã nguồn dự kiến: `planning/01_2026-09-24_san-viec-tho-mvp/specs/01-CONTRACTS.md` §1.
