# SPEC-P04 — Kho tri thức cộng đồng, truy hồi lai, trích dẫn, câu hỏi bỏ trống (D05a, D07)

> Tầng 🟠 (hợp đồng đã chốt ở 01-CONTRACTS §2.2, §4 `kb_*`, §7.1 `search_knowledge`). Đọc SPEC-P03 §4, §6 trước. Phụ thuộc: P03.
> Port: `retrieval/search-regulations.ts:45-63` (token an toàn, N14), build-phase "retrieval + citation" (00-ARCH §8 kế hoạch 01).

## §1. Kho tri thức (`services/knowledge.ts`)
- `kb_documents(id text, title, version, status approved|draft|deprecated, effective_from, effective_to, source, tags[], updated_at)` + `kb_sections(document_id, section_id, heading, body, tsv generated, embedding vector(1024), embedded_at, embedding_model)` — giữ DDL 001/002/007.
- `upsertDocument({id, title, version, status, effectiveFrom, effectiveTo, source, tags, sections: Array<{sectionId, heading, body}>})`: transaction; section không còn trong danh sách ⇒ xoá; mục thay đổi `body/heading` ⇒ `embedding=null, embedded_at=null`. Mỗi `body` ≤ 4000 ký tự (dashboard tách mục).
- `embedPending(limit=50)` (timer P07 §2): mục `embedding is null and d.status='approved'` ⇒ `embedTexts(bodies, {taskType:'RETRIEVAL_DOCUMENT'})` ⇒ ghi `embedding`, `embedded_at`, `embedding_model`. `EmbeddingUnavailableError` ⇒ audit `kb.embed_unavailable` (≤ 1/giờ) + dừng bước, KHÔNG ném.
- Chỉ `status='approved'` và còn hiệu lực (`effective_from <= today` và (`effective_to` null hoặc `>= today`), ngày VN) được truy hồi.

## §2. Truy hồi lai — `retrieval/search-knowledge.ts::searchKnowledge(queryVi, opts)`
```ts
export interface KnowledgeHit { documentId: string; title: string; sectionId: string; heading: string | null; body: string; score: number; lexicalRank: number | null; vectorRank: number | null }
export async function searchKnowledge(queryVi: string, opts?: { topK?: number /* KB_TOP_K 8 */; useVector?: boolean /* mặc định true */ }): Promise<KnowledgeHit[]>;
```
1. Lexical: `buildTsQueryExpr(queryVi)` (giữ `buildQueryTokens`: NFD, bỏ dấu, `đ→d`, chỉ `[a-z0-9]`, ≤ 12 token, OR) ⇒ `ts_rank_cd(tsv, to_tsquery('simple', $1), 32)` top 20 trong `kb_sections` join `kb_documents` hợp lệ. Chuỗi rỗng ⇒ `[]` không chạm DB (giữ).
2. Vector (nếu `useVector` và embedding khả dụng): `embedTexts([queryVi], {taskType:'RETRIEVAL_QUERY'})` ⇒ `order by embedding <=> $1::vector limit 20` (pgvector 0.8.5, toán tử cosine `<=>`), chỉ mục có `embedding not null`. `EmbeddingUnavailableError`/timeout 3 s ⇒ bỏ bước, `vectorRank=null`.
3. Hợp nhất RRF: `score = Σ 1/(60 + rank)` trên hai danh sách; sắp giảm; cắt `topK`. Không có vector ⇒ score = RRF lexical thuần. Trả `body` nguyên văn (≤ 4000) — model tự trích.
Lỗi DB ⇒ `KnowledgeUnavailableError` (01-CONTRACTS §9 bổ sung: caller — tool trả `is_error`, agent nói "mình chưa tra được tài liệu").

## §3. Tool `search_knowledge` (G/D/O, mọi vai)
`run(ctx, {query, top_k?})` ⇒ `{hits: KnowledgeHit[] (rút `body` còn 600 ký tự quanh token khớp đầu tiên + `heading`), note: 'Trích dẫn dạng: (Tài liệu <title> · mục <heading>)'}`. Ghi `audit 'kb.search' {hits: n, vector: boolean}`.

## §4. Luật trích dẫn (prompt `rules` + khối hệ thống)
- Khi trả lời câu hỏi kiến thức: gọi `search_knowledge` TRƯỚC; có hit liên quan ⇒ trả lời kèm "(theo <title> · <heading>)"; không có ⇒ nói rõ "mình chưa có tài liệu về …" và có thể trả lời từ hiểu biết chung nhưng GHI RÕ là ý kiến; CẤM bịa tên tài liệu.
- Code không ép citation (khác BB-03 cũ — cộng đồng không có "trách nhiệm pháp lý"); golden `unanswered`/`activation` chấm chất lượng trích dẫn theo mẫu chuỗi `(theo ` khi có hit (TESTING §3).

## §5. Câu hỏi bỏ trống (`services/knowledge.ts::findUnansweredQuestions` + timer)
- `is_question` do triage đặt (`question_confidence ≥ 0.6`) khi ingest (P03 §5.2); nhóm `mode='mention'` + `moderation_enabled=false` ⇒ không có triage ⇒ không nhặt (🖐 Q7: giá trị tạm — chỉ nhóm có triage).
- Câu SQL (đã đo `db-checks (b)`): câu hỏi `received_at <= now - UNANSWERED_AFTER_MIN` và `> now - UNANSWERED_MAX_AGE_HOURS`, chưa `answered_at`, chưa `deleted_at`, không `is_self`, và KHÔNG tồn tại tin sau đó (cùng nhóm, người gửi khác) quote nó hoặc mention người hỏi; `limit UNANSWERED_MAX_PER_TICK`. Chỉ nhóm `enabled` và `mode='ambient'` (nhóm `mention` không tự lên tiếng — 🖐 Q8 giá trị tạm).
- Với mỗi câu: `update group_messages set answered_at = now()` (đánh dấu "đã xử lý" — tránh nhặt lại dù agent im) + `enqueueSystemEvent({event:'unanswered_question', threadId, groupMessageId})`. Lượt `group_unanswered` (P03 §6.1): agent `search_knowledge` ⇒ có căn cứ ⇒ `send_group_message` quote câu hỏi; không ⇒ im. Ngân sách ambient áp (`turns_in_window++`).
- Audit `unanswered.picked {thread, groupMessageId}` và `turn.done`.

## §6. Dashboard (P08) — `/knowledge`: danh sách tài liệu, trạng thái nhúng (`embedded/total`), dán văn bản ⇒ tách mục theo dòng trống hoặc `## `, nút "Nhúng lại", tìm thử (`searchKnowledge`) hiển thị hit + score.

## §7. Vùng cấm P04
- CẤM tải URL/crawl web làm nguồn tri thức ở 0.1 (SSRF — Idea Vault); nguồn = dán tay / import JSON qua dashboard.
- CẤM nhúng `daily_notes`/`member_profiles` chung bảng với KB (tách — BB-07).
- CẤM đổi số chiều cột `embedding` trong vòng này (Q3 ở 01-CONTRACTS §2.2).
- CẤM để model nhận toàn văn tài liệu (chỉ top K mục, mỗi mục ≤ 600 ký tự trong tool_result).

## §8. Nghiệm thu P04
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/core` — `search-knowledge.test.ts` | `buildQueryTokens` giữ 8 ca N14 cũ (chuỗi lạ, `'`, token > 12); RRF: 2 danh sách giả ⇒ thứ tự đúng (≥ 5 ca) |
| 2 | `model.gemini.test.ts` bổ sung | `embedTexts` dịch body `batchEmbedContents` đúng (`outputDimensionality: 1024`), chia batch 100, 503 ⇒ retry 2 ⇒ `EmbeddingUnavailableError`; nhánh `openrouter` ⇒ ném ngay, 0 fetch |
| 3 | `npm run test:db -w @lenqclaw/core` — `p04-knowledge.db.test.ts` | seed 10 mục; `searchKnowledge('agent Zalo là gì', {useVector:false})` ⇒ hit đầu đúng mục mong đợi; `upsertDocument` đổi body ⇒ `embedding=null`; `embedPending` với fetch giả trả vector 1024 ⇒ `embedded_at` set; vector giả cho truy vấn ⇒ `vectorRank` không null và RRF đưa mục chỉ-vector lên top K; tài liệu `draft`/hết hạn ⇒ 0 hit |
| 4 | `p04-unanswered.db.test.ts` | 5 ca `db-checks (b)` (q1 bắt; q2 quote; q3 mention; q4 mới; q5 bot trả lời) + `runTimers` ⇒ đúng 1 `sys-%` event, lần 2 ⇒ 0 (đã `answered_at`) |
| 5 | Golden thật `unanswered.jsonl` (TESTING §3) | `npx tsx --env-file=.env scripts/eval_community.mjs --set unanswered` exit 0 |
