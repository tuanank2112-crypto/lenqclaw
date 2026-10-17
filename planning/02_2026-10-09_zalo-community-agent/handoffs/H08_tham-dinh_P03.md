1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THẨM ĐỊNH (đối kháng, CHỈ ĐỌC mã — nhiệm vụ là LÀM ĐỎ, không phải xác nhận xanh).
2. Bước 0 (từ root `E:\vọc vạch\lenqclaw`): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check` ⇒ exit 0.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/specs/00-ARCHITECTURE.md` (§4, §6 BB-01…BB-20, §7) → `specs/01-CONTRACTS.md` (§3, §6, §7, §9, §10, §11, §12 toàn bộ) → `specs/SPEC-P03-Runtime-Agent.md` (toàn bộ) → `specs/SPEC-D31-Toc-Do-Giam-Sat.md` (§3–§6, §12, §14, §15) → mã trong `git diff 7273281..d8e744f`. CẤM đọc `reports/R07_*` và `evidence/P03/` (của worker — không thừa kế ngữ cảnh).

## 1. BỐI CẢNH TỰ CHỨA
- Gói P03 (runtime agent cộng đồng Zalo trên LangGraph.js: `pipelineGraph` một sự kiện, `turnGraph` một lượt; cổng nhận tin, đệm nhóm, phiên, persona, chính sách tool, host ép trả lời; runtime tốc độ D31: làn fast/rag, hạn chót + AbortSignal, runner song song theo thread + advisory lock, migration 010) vừa thi công: Base `7273281`, Head `d8e744f`. Mọi gói P04–P08 sẽ cắm vào đồ thị này.
- Rủi ro thật: bot là PHÓ NHÓM Zalo — làm theo "lệnh" giả trong nội dung tin, nói trong nhóm ngoài tool, lộ ghi chú riêng của thành viên vào nhóm, gọi tool vượt vai, im khi bị gọi tên, trả lời trùng/sai thứ tự, lượt treo vượt hạn 5 s/15 s, tốn lời gọi model thừa, lộ nội dung tin vào log/vết.
- DB dev `127.0.0.1:15432`; trước lệnh DB: `set -a; . ./.env; set +a` (CẤM in giá trị `.env`). Lệnh: `npm run gate`, `npm test`, `npm run test:db`, `npm run latency:slo -- --n 3 --fake-delay-ms 300`. Model thật KHÔNG có credit — dùng fake model trong test (`setGeminiFetchForTest`), không gọi mạng thật.

## 2. PHẠM VI
- ĐƯỢC GHI DUY NHẤT: `planning/02_2026-10-09_zalo-community-agent/reports/R08_tham-dinh_P03.md` và `.../evidence/P03-review/*` (file mới).
- Được SỬA TẠM để đột biến rồi trả lại NGAY bằng `git checkout -- <file>`; trước khi commit `git status --short` chỉ còn file report/evidence của bạn + `brain4agent/memory/hot/state.json` và `lenqclaw_presentation_transcript.pdf` (có sẵn, không đụng). CẤM commit thay đổi mã. CẤM push.

## 3. VIỆC PHẢI LÀM
Tự thiết kế ≥ 8 cách phá (ít nhất 1 cho mỗi nhóm a–g), mỗi cách: giả thuyết → lệnh/đột biến → kết quả máy → kết luận (bắt được / LỌT).
a. Danh tính & injection (BB-04, BB-10, BB-12): tên hiển thị/quote/nội dung giả `[userId: …]`, `/mode`, `duyệt <id>`, rào `<<<untrusted>>>` bị phá bằng chính chuỗi rào? Có regex injection guard bị cấm không?
b. Lời nói trong nhóm (BB-05, D21): có đường nào text cuối ambient bị đăng; mention mà 0 tin ra; lỗi/refusal/model sập/chạm trần ở mention vẫn có đúng 1 tin; ngân sách BB-08 bị lách bằng host post?
c. Vai & tool (BB-01, BB-06, BB-07, §8 policy): stranger/member gọi tool của owner; tool nguy hiểm tồn tại/đăng ký được; prompt NHÓM chứa `member_profiles.notes` hoặc ghi chú ngày; che dữ liệu §5.3 trước model.
d. Đồ thị (BB-15/16/17): hình thực tế = `PIPELINE_SHAPE`/`TURN_SHAPE`; cạnh có tác dụng phụ/đọc DB; node ghi ngoài bảng §12.3; checkpointer/LangSmith/`@langchain/core` import lọt máy quét (biến thể import động, re-export); `GraphRecursionError` chạm được ở đường xấu nhất.
e. D31: hạn chót có thật sự huỷ fetch; retry/fallback vượt hạn; tin gọi bot bị triage; runner chạy 2 tin CÙNG thread chồng nhau hoặc sai thứ tự; advisory lock lấy được 2 lần; `processInbound` (câu nhận không ép thứ tự thread) có nằm trên đường chạy thật không; migration 010 sai DDL SPEC-D31 §12.
f. Rò rỉ & lưu trữ: `turn_traces`/`agent_runs`/log/audit chứa nội dung tin, SĐT, key; SQL ghép chuỗi; tin trùng khoá `out-<id>`.
g. Chi phí/tốc độ: đếm số lời gọi model của một lượt mention trả lời bằng `send_group_message` và một lượt RAG; so với ngân sách SPEC-D31 §3 (dòng 7, 9). Ghi số đo, đề xuất cách giảm KHÔNG đổi hình đồ thị (nếu có).
Cũng chạy lại 4 lệnh ở §1 (ghi exit code nguyên văn) — nhưng số xanh KHÔNG phải kết luận. Đột biến bắt buộc: mỗi nhóm a–e ≥ 1 đột biến mã, ghi test nào đỏ (hay LỌT).

## 4. LUẬT
Không `git add -A`; stage tường minh 2 đường được ghi · kiểm mã thoát trực tiếp · commit tiếng Anh Conventional Commits + `Co-Authored-By` của model bạn · mỗi phát hiện ghi `file:line` + mức (CHẶN / NÊN SỬA / GHI CHÚ) + ca tái hiện.

## 5. TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| thẩm định đối kháng a–g | 🔴 | bảo mật + nền runtime cho mọi gói sau; cần tự ra giả thuyết |

## 6. REPORT
Mẫu `../brain4agent.release/docs/HANDOFF_PROTOCOL.md` §7: dòng 1 khai vai (vai · thẩm định · họ/model · Bước 0 exit · hiểu việc); dòng 2 `Handoff: handoffs/H08_tham-dinh_P03.md`; dòng 3 `Base: 7273281`; dòng 4 `Head: d8e744f`; bảng các cách phá; bảng đột biến; danh sách phát hiện theo mức; đề xuất phán quyết bằng lời (KHÔNG tự phán). Dòng không rỗng cuối: `⏳ Chờ phán quyết.`
