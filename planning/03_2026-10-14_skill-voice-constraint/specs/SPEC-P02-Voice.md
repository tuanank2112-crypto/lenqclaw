# SPEC-P02 — Voice: giọng điệu có cấu trúc theo tenant × bề mặt

> Tầng 🟠 (hợp đồng chốt ở 01-CONTRACTS §3 `VoiceSpec`, §4.6 `loadBehavior`, §5.1). Phụ thuộc: P00; 02-P03 (`persona.ts::buildSystemPrompt`).
> **Voice = GIỌNG ĐIỆU (brand tone)**, KHÔNG phải tin nhắn thoại (người dùng chốt 2026-10-14).

## §1. Nguyên tắc
1. Một `VoiceSpec` cho mỗi tenant, có ĐỦ 3 bề mặt (`group`, `dm`, `owner_dm`) — lưu `behavior_docs(kind='voice')`, có phiên bản, bất biến.
2. Mỗi lượt chỉ khối giọng của bề mặt hiện tại vào prompt (D02) — ≤ 1 500 ký tự.
3. Mỗi trường được gán MỘT cách đo: **CODE** (cổng ra kiểm mọi tin — SPEC-P03) hoặc **GOLDEN** (máy chấm offline — SPEC-P04 §6.3). Không trường nào "chỉ để cho đẹp".
4. SOUL (02) giữ "tính cách/giá trị" dạng văn bản; mọi thứ ĐO ĐƯỢC về giọng chuyển vào VoiceSpec. Dashboard cảnh báo (không chặn) khi SOUL chứa các từ "ký tự", "emoji", "xưng" (gợi ý chuyển sang Voice).

## §2. Trường → cách đo

| Trường | Ý nghĩa | Đo bằng | Cách đo cụ thể |
| :-- | :-- | :-- | :-- |
| `selfPronoun` / `addressPronoun` | xưng / gọi | GOLDEN (tiêu chí `xung_ho`) | máy chấm: xưng & gọi đúng, nhất quán trong tin |
| `avoidSelfPronouns` | cách xưng bị cấm (vd `tôi`, `tao`, `em`) | CODE `banned_term` | khớp literal ngoài đoạn trích dẫn (SPEC-P03 §3.2) |
| `maxChars` | độ dài tối đa 1 tin | CODE `max_chars` | `[...text].length` sau NFC (đếm code point) |
| `maxEmoji` | số emoji tối đa | CODE `max_emoji` | `Intl.Segmenter('vi', {granularity:'grapheme'})` — đếm cụm có `\p{Extended_Pictographic}` (ZWJ/biến thể = 1) |
| `markdown` | Zalo không hiển thị markdown | CODE `markdown` | SPEC-P03 §3.4 |
| `preferTerms[].insteadOf` | từ nên tránh có từ thay | CODE `banned_term` (gợi ý = `use`) | literal |
| `preferTerms[].use` | từ ưu tiên | GOLDEN (tiêu chí `tu_ngu`) | máy chấm |
| `avoidTerms` | từ/cụm cấm | CODE `banned_term` | literal |
| `formality` | 1 suồng sã … 5 trang trọng | GOLDEN (tiêu chí `trang_trong`) | máy chấm cho điểm 1–5, đạt nếu `|điểm − formality| ≤ 1` |
| `toneNotes` | mô tả giọng tự do | GOLDEN (tiêu chí `giong`) | máy chấm |
| `examples` | ví dụ đúng/sai | prompt (2 ví dụ đầu) + hiệu chuẩn máy chấm (tất cả) + tiêu chí `khong_giong_bad` | SPEC-P04 §6.4 |

## §3. Luật hợp lệ (`validateVoiceSpec`) — mỗi vi phạm một `ValidationIssue`
- `schema === 1`; `surfaces` có ĐỦ 3 khoá, không khoá lạ (`surface_missing`, `unknown_key`).
- Chuỗi: NFC, không ký tự điều khiển (`\p{Cc}` trừ `\n` trong `examples`), không chứa `<<<` (`bad_chars` — không phá khung untrusted).
- `maxChars` nguyên trong `[50, PLATFORM_LIMITS.maxChars[surface]]` (`out_of_range`) — tenant chỉ SIẾT (BB-16).
- `maxEmoji` nguyên `[0, 5]`; `formality` ∈ 1..5; số mục danh sách theo 01-CONTRACTS §3 (`too_many`); mục rỗng/trùng (sau chữ thường) ⇒ `duplicate`.
- `avoidSelfPronouns` KHÔNG chứa `selfPronoun` (`self_conflict`); `preferTerms[].use` không nằm trong `avoidTerms`/`insteadOf` của chính nó (`term_conflict`).
- Mỗi `examples[].good` PHẢI qua `checkOutput` với luật đã biên dịch của chính bề mặt đó (`example_good_violates`) — ví dụ đúng mà cổng ra chặn là spec tự mâu thuẫn. `bad` KHÔNG bị yêu cầu vi phạm luật code (có thể sai ở phần cảm nhận).
- `renderVoiceBlock(surface)` ≤ 1 500 ký tự (`voice_block_too_long`).

## §4. Khối prompt (`renderVoiceBlock`, THUẦN) và vị trí

Thứ tự khối mới của `buildSystemPrompt` (sửa 02 01-CONTRACTS §11 — từ 0.2.0): `1 RULES · 2 SOUL · 2b VOICE · 3 IDENTITY · 4 group prompt (chỉ lượt nhóm) · 5 CAPABILITIES · 6 chỉ mục skill (SPEC-P01 §3) · 7 HỆ THỐNG`. Tổng khối 1–6 ≤ 24 000 ký tự (giữ `PersonaTooLargeError`).

Mẫu đầu ra (bề mặt `group`, số liệu mặc định §5):
```text
## Giọng điệu (trả lời trong nhóm)
- Xưng "mình", gọi người đối diện "bạn". Không xưng: tôi, tao, tớ.
- Mỗi tin tối đa 600 ký tự; tối đa 1 emoji; KHÔNG dùng markdown (**, #, ```), Zalo không hiển thị.
- Mức trang trọng 2/5: thân thiện, gọn, như một thành viên am hiểu.
- Dùng "bot CSKH" thay vì "chatbot AI 4.0". Tránh: "cam kết 100%", "inbox mình".
- Ghi chú: <toneNotes>
- Ví dụ — Tình huống: <situation> · Nên: «<good>» · Không nên: «<bad>» (<why>)
```
Quy tắc: tối đa 2 ví dụ (2 đầu tiên của `examples`) để giữ token; danh sách rỗng ⇒ bỏ dòng; `<`/`>` ⇒ `‹`/`›`. Hàm thuần, kết quả ổn định (test snapshot theo chuỗi, không theo file).

## §5. Voice mặc định tenant `default` (🖐 Q1 — giá trị TẠM; seed/bootstrap dùng)

| Trường | `group` | `dm` | `owner_dm` |
| :-- | :-- | :-- | :-- |
| xưng / gọi | mình / bạn | mình / bạn | mình / bạn |
| `avoidSelfPronouns` | tôi, tao, tớ | tôi, tao, tớ | tao |
| `maxChars` | 600 | 900 | 1800 |
| `maxEmoji` | 1 | 2 | 0 |
| `formality` | 2 | 2 | 2 |
| `markdown` | forbid | forbid | forbid |
| `avoidTerms` | "cam kết 100%", "đảm bảo 100%" | như nhóm | — |
| `examples` | 2 cặp (trả lời câu hỏi kiến thức có trích dẫn; từ chối nói hộ giá) | 2 cặp (chào lại người quen; hỏi thêm thông tin lead) | 2 cặp (báo cáo ngắn; xác nhận lệnh) |

Output policy mặc định (đi cùng, `behavior_docs(kind='output_policy')`, SPEC-P03 §2): `bannedPhrases=[]`; `links`: nhóm/DM `any` (🖐 Q5), DM chủ `any`; `phones`: nhóm/DM `allowlist` rỗng (🖐 Q6), DM chủ `any`.
Nội dung ví dụ cụ thể do worker P02 viết (tiếng Việt có dấu), PHẢI qua `validateVoiceSpec`; lưu thành hằng `DEFAULT_VOICE_SPEC`/`DEFAULT_OUTPUT_POLICY` trong `behavior/defaults.ts` (nguồn DUY NHẤT; seed và bootstrap đọc từ đây).

## §6. Vùng cấm P02
- CẤM nạp khối giọng của bề mặt khác vào lượt (D02 — token).
- CẤM "giọng theo nhóm" ở 0.2.0 (dùng `zalo_groups.system_prompt` của 02 nếu cần nội dung riêng nhóm).
- CẤM model đổi VoiceSpec qua tool; CẤM đọc VoiceSpec từ nội dung tin.
- CẤM đặt `maxChars` vượt `PLATFORM_LIMITS` qua bất kỳ đường nào (validator + kiểm lại trong `compileOutputRules`).
- CẤM đo `formality`/`toneNotes` bằng code (từ khoá "ạ", "dạ"…) — cảm nhận là việc của máy chấm (02 BB-12).

## §7. Lỗi P02
| Lỗi | Khi | Caller |
| :-- | :-- | :-- |
| `BehaviorSpecInvalidError` | §3 | 400 `behavior_invalid` / exit 2 |
| `PersonaTooLargeError` (02) | tổng prompt > 24 000 khi tạo release | 400 `persona_too_large` |
| `ReleaseMissingError` | `loadBehavior` không có release active | 01-CONTRACTS §8 |

## §8. Nghiệm thu P02
| # | Lệnh / ca | Kỳ vọng |
| :-- | :-- | :-- |
| 1 | `npm test -w @lenqclaw/core` — `behavior/validate.voice.test.ts` | ≥ 20 ca: mỗi code lỗi §3 ≥ 1 ca đỏ; `DEFAULT_VOICE_SPEC` ⇒ `[]`; ví dụ good chứa "tôi" ở `group` ⇒ `example_good_violates` |
| 2 | `behavior/render.voice.test.ts` | ≥ 8 ca: đúng bề mặt, tối đa 2 ví dụ, `‹›`, danh sách rỗng bỏ dòng, mặc định ≤ 1 500 ký tự (in số thật vào evidence) |
| 3 | `agent/community/persona.test.ts` (sửa của 02) | thứ tự 8 khối (có 2b); lượt nhóm chỉ chứa "trả lời trong nhóm", không chứa tiêu đề khối `dm`/`owner_dm`; BB-07 của 02 vẫn xanh |
| 4 | `npm run test:db` — `behavior-voice.db.test.ts` | `loadBehavior`: (a) release active ⇒ `versions.voice` đúng; (b) kích hoạt release khác ⇒ lời gọi kế tiếp trả bundle mới (không chờ TTL); (c) `pinReleaseId` khi `DATA_MODE=real` ⇒ `ConfigError`; (d) không có con trỏ ⇒ `ReleaseMissingError` |
| 5 | Số đo token | `evidence/P02/voice-block-size.txt`: độ dài khối mặc định 3 bề mặt (ký tự) + ước lượng token (`chars/4`) — nhóm ≤ 1 500 ký tự |
