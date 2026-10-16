1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG — vai architect (ghi SPEC, KHÔNG ghi mã sản phẩm).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md` §2 (D01–D28, ĐẶC BIỆT D22, D24, D28 + bảng "Quyết định bị thay thế") → `specs/00-ARCHITECTURE.md` → `specs/01-CONTRACTS.md` → `specs/SPEC-P03-Runtime-Agent.md` → lướt `SPEC-P04`…`P08` (chỗ gọi lượt agent) → `specs/TESTING-ACCEPTANCE.md` → mã hiện có `packages/core/src/{agent,adapters,runner,sim}/`.

## 1. BỐI CẢNH TỰ CHỨA
- lenqclaw: agent chăm sóc cộng đồng Zalo (bot phó nhóm, zca-js), TypeScript Node 22 ESM, npm workspaces, Postgres 16 + pgvector. P01 (nền) và P02 (worker nhóm + outbox + pacer + sim nhóm) đã thi công; P03 (runtime agent) CHƯA.
- **D28 (người dùng chốt):** runtime agent dựng trên **LangGraph (LangGraph.js)**; pipeline xử lý một sự kiện vào là **đồ thị tường minh** — nền cho mọi phát triển sau (kế hoạch 03 Skill · Voice · Constraint, giai đoạn doanh nghiệp). Bộ SPEC cũ thiết kế vòng tool tự viết (SPEC-P03 §6) ⇒ phải thiết kế lại. Người dùng sẽ DUYỆT SƠ ĐỒ trước khi thi công.

## 2. PHẠM VI
- ĐƯỢC GHI: `planning/02_2026-10-09_zalo-community-agent/specs/*.md` (sửa) · `.../reports/R04_kien-truc_LangGraph.md` · `.../evidence/ARCH-D28/*` (file mới). Thử nghiệm (spike) chạy NGOÀI repo trong thư mục tạm `C:/Users/lenku/AppData/Local/Temp/claude/e--v-c-v-ch/47801419-0844-4205-81a0-b1d3481c9616/scratchpad/lg-spike/` — chỉ chép output máy vào evidence.
- CẤM ĐỤNG: mọi mã (`apps/`, `packages/`, `scripts/`, `db/`), `package.json`, `plan.md` (SO ghi), `planning/01_*`, `planning/03_*`, `brain4agent/`, `reports/R02_*`, `reports/R03_*`, `evidence/P02*` (gói khác đang thẩm định). CẤM `npm install` trong repo.

## 3. VIỆC PHẢI LÀM
a. Đo thật (không nhớ): `npm view @langchain/langgraph version time --json` (+ gói checkpoint Postgres nếu dùng, + `@langchain/core` peer) ⇒ chọn phiên bản CHÍNH XÁC đã phát hành ≥ 14 ngày, pin; ghi `evidence/ARCH-D28/versions.txt`.
b. Spike trong thư mục tạm: Node 22 ESM, đồ thị nhỏ có state có kiểu + node gọi một hàm model GIẢ (không mạng) + node tool + cạnh điều kiện + (nếu chọn) checkpointer Postgres trên DB tạm `lg_spike` của container `lenqclaw-db-1` (`127.0.0.1:15432`, xoá DB sau). Ghi output vào `evidence/ARCH-D28/spike.txt`. Chứng minh: chạy được, đếm số vòng tool, dừng đúng `MAX_TOOL_ROUNDS`.
c. Sửa bộ SPEC:
   - `00-ARCHITECTURE.md` §4: sơ đồ pipeline MỚI — **Mermaid** (`flowchart`) + bản ASCII — mọi node, cạnh điều kiện, chỗ ghi DB/outbox, chỗ timers đi vào; §5 thành phần (thêm LangGraph + phiên bản); §6 BB: giữ hết, ghi rõ BB nào được hiện thực ở node nào; thêm BB mới nếu cần (vd "chỉ node X được gọi `enqueue`"); §7 vùng cấm (vd những gì KHÔNG dùng của hệ LangChain và vì sao).
   - `01-CONTRACTS.md`: state đồ thị (kiểu TS chính xác), chữ ký từng node, layout file mới (`agent/community/graph/*`), nơi checkpoint (hoặc vì sao không), quan hệ với `adapters/model.ts` (BB-03: chỉ adapter gọi model — giữ hay thay, nói rõ), `turn_traces` (D24), ngữ cảnh có trần (D22, BB-13: KHÔNG nén, KHÔNG nạp lịch sử dài kể cả khi có checkpointer).
   - `SPEC-P03-Runtime-Agent.md`: viết lại §2, §6 (và mục bị ảnh hưởng) thành node/subgraph; giữ cổng §3 là hàm thuần; mustReply/model sập/refusal thành cạnh của đồ thị; nghiệm thu §11 đo được.
   - `SPEC-P04…P08`, `TESTING-ACCEPTANCE.md`, `OPERATIONS.md`: chỉ sửa chỗ gọi lượt/agent cho khớp; mỗi SPEC sửa phải có dòng "D28: …".
   - Mọi chỗ cũ bị thay ⇒ ghi trong report mục "đề xuất dòng cho bảng Quyết định bị thay thế" (SO chép vào `plan.md`).
d. Xong khi: `grep -n "runCommunityTurn" specs/*.md` chỉ còn trong câu "thay bởi D28"; Mermaid ở §4 có ≥ 1 node cho mỗi bước: ingest, moderation, gate, agent(model), tools, mustReply/fallback, outbox, trace; spike exit 0; versions pin chính xác.

## 4. LUẬT
Thiết kế ĐƠN GIẢN NHẤT đủ dùng — không thêm tầng chỉ vì LangGraph có · luật cứng nằm TRONG tool (BB-01) · ý định nhận bằng model, code là lưới (BB-12) · không chép mã từ repo khác (port thiết kế) · stage tường minh, commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · không push · mâu thuẫn không tự giải ⇒ ghi câu hỏi trong report.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a, b, c | 🔴 | đổi nền kiến trúc + hợp đồng |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai; dòng 2 `Handoff: handoffs/H04_kien-truc_LangGraph.md`; dòng 3 `Base:`; dòng 4 `Head:`; danh sách quyết định thiết kế (mỗi cái: chọn gì · bỏ gì · vì sao); sơ đồ Mermaid chép lại; đề xuất dòng bảng thay thế; câu hỏi cho người. Dòng cuối `⏳ Chờ phán quyết.`
