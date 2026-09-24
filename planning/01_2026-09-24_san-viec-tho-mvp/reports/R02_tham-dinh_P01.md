Vai: worker (vai-thi-cong) · loại: thẩm định · họ/model: Claude / claude-opus-5-5[1m] · Bước 0: exit 0 · hiểu việc: chỉ đọc dải `b7e907f..e585851`, được ghi đúng R02 + `evidence/P01-audit/` / xong khi đã chạy lại 6 lệnh cổng trên worktree sạch có exit code, so diff-stat với phạm vi, đối chiếu SPEC-P01 §1–§8, chạy ≥5 cách phá bắt buộc, quét bí mật, commit một lần / cấm sửa mã, push, đọc R01/H01/evidence/P01, đụng DB `lenqclaw`/`lq_verify`, tự ghi phán quyết
Handoff: handoffs/H02_tham-dinh_P01.md
Base: b7e907f
Head: e585851

## 1. Lệnh + exit code (nguyên văn)
Môi trường: worktree tách rời `e585851` trong scratchpad (ngoài repo), sạch (0 file bẩn trước và sau), Node v24.12.0, npm 11.6.2, DB riêng `lq_audit` (đã drop khi xong).

| Bước | Lệnh | Exit | Evidence |
| :-- | :-- | :-- | :-- |
| a1 | `npm ci` | 0 | [rerun](../evidence/P01-audit/rerun.txt) |
| a2 | `npm run typecheck` | 0 | [rerun](../evidence/P01-audit/rerun.txt) |
| a3 | `npm run build` (không có `DATABASE_URL`, không có `SESSION_SECRET`) | 0 | [rerun](../evidence/P01-audit/rerun.txt) |
| a4 | `npm test` | 0 | [rerun](../evidence/P01-audit/rerun.txt) |
| a5 | `npm run test:db` (không có `DATABASE_URL`) | 1, kèm thông báo `DATABASE_URL chua duoc cau hinh` (đúng SPEC §1) | [rerun](../evidence/P01-audit/rerun.txt) |
| a6 | `DATABASE_URL=…/lq_audit npm run test:db` | 0 | [rerun](../evidence/P01-audit/rerun.txt) |
| a7 | `npm run gate` | 0 (`GATE_OK`, `violations: 0`, `pii_keys_in_jobcard: 0`, `forbidden_tools: 0`) | [rerun](../evidence/P01-audit/rerun.txt) |
| a8 | `npm run gate` sau khi cài `scripts/audit_probe.mjs` = `import pg from 'pg'` (tự chứng minh đỏ) | 1 (`GATE_FAIL` ở `check_adapter_boundary`) | [red-gate-audit](../evidence/P01-audit/red-gate-audit.txt) |
| b | `git diff --stat b7e907f..e585851` + lọc phạm vi | 0 file ngoài phạm vi | [diff-stat](../evidence/P01-audit/diff-stat.txt) |
| e | `git grep` mẫu bí mật @`e585851` và @`HEAD` | chỉ có giá trị giả/placeholder | [secrets](../evidence/P01-audit/secrets.txt) |
| — | `npm audit` | 1 (7 lỗ hổng: postcss qua next 15.5.26, vitest/vite/esbuild ở dev) | [npm-audit](../evidence/P01-audit/npm-audit.txt) |

Lọc output gate: `grep -E '^(=== gate|GATE_|violations|pii_keys|forbidden_tools|.*Tests .*passed|.*Tests .*failed|.*skipped)'` (ghi trong evidence).

## 2. Test tổng/pass/fail/skip
- `npm test`: 19/19/0/0 (web 11, core 8)
- `npm run test:db`: 11/11/0/0 (core 9, web 2)
- Tổng: **30/30/0/0**. Nguồn: [rerun](../evidence/P01-audit/rerun.txt)

## 3. `git diff --stat b7e907f..e585851` + SHA từng commit
[diff-stat](../evidence/P01-audit/diff-stat.txt): 62 file, +6365 dòng, **0 file ngoài phạm vi** H02 §3b. Commit: `6404dd3` chore bootstrap · `dae4b6c` migrations+seed · `ed046b3` adapters+state machine · `fee32a8` SimTransport+/dev/sim · `b809215` auth 3 vai · `4674ffd` checks+gate · `e585851` test suites.

## 3b. Đối chiếu SPEC-P01 §1–§8 với mã thật

| Mục | Kết luận | Dẫn chứng |
| :-- | :-- | :-- |
| §1 công cụ | khớp | `package.json:6-8,9-12`, `tsconfig.base.json:5-7`; 4 package đều `0.0.1`; `.gitattributes`; đủ 8 script; gate dừng ở bước đỏ đầu tiên (a8) |
| §2 compose/.env | **lệch** | `compose.yaml:6-8` ghi user/pass/db `lenqclaw` ngay trong compose GỐC (bản dùng cho VPS), trong khi §2 đặt chúng ở `compose.dev.yaml`. Không publish cổng: khớp. `.env.example` đủ biến OPERATIONS §3: khớp |
| §3 migrations/seed | khớp phần DDL, **lệch** phần seed | [ddl-seed](../evidence/P01-audit/ddl-seed.txt): 33 bảng, 0 lệch cột, có 2 index một phần, 2 FK jobs→tickets, CHECK `jobs.status` = union TS = bảng §5 (17 trạng thái). [migrate-cli](../evidence/P01-audit/migrate-cli.txt): chạy lần 2 ra `applied: 0`, đổi checksum ⇒ exit 1, file lỗi ⇒ rollback và không ghi nhận, seed lần 2 giữ 12/20. Lệch: `seed.ts:9,22-33` mất dấu tiếng Việt (`Cong ty Van hanh Demo`, `Ro ri duong ong nuoc`) so với bảng §3 |
| §4 adapter | khớp một phần | `db.ts:15-23` pool lười (build không cần URL: a3). `model.ts`: chọn model, `cache_control`, 429/5xx ⇒ `ModelUnavailableError`, ghi `agent_runs` cả khi lỗi ([model-probe](../evidence/P01-audit/model-probe.txt) M1–M2). **Lệch:** `images` (`model.ts:40`) không được đưa vào request (`:143-149`), M4. `transport.ts:41` là nơi duy nhất ghi outbox ([independent-scan](../evidence/P01-audit/independent-scan.txt): 0 vi phạm thật) |
| §5 lỗi/máy trạng thái | khớp | `errors.ts`: đủ 8 lớp + `IllegalTransitionError`, `code` = tên lớp. `job-state.ts:29-49` khớp §5. [race-transition](../evidence/P01-audit/race-transition.txt) 4a–4e xanh |
| §6 SimTransport | khớp phần core, **lệch** phần web | test:db `runScenario` xanh. Chặn `DATA_MODE`/vai đúng ([http-nosim](../evidence/P01-audit/http-nosim.txt), [http-sim](../evidence/P01-audit/http-sim.txt) R02–R09). **Lệch:** bản build trả 404 cho `/dev/sim` với `bql_admin` dù `DATA_MODE=sim` (R01). Nút phát lại cố định `echo.jsonl` (`SimBoard.tsx:124`), không cho chọn file. Tin vọng lại mất dấu (`sim-transport.ts:50`) |
| §7 auth | khớp một phần | Định dạng scrypt và thuộc tính cookie (`login/route.ts:41-47`) khớp. `create-admin` chỉ đọc mật khẩu từ stdin và từ chối vai sai ([create-admin](../evidence/P01-audit/create-admin.txt)). **Lệch:** ghi audit `auth.login.ok` rồi mới từ chối khi thiếu secret (S02). Khớp tiền tố không theo ranh giới đoạn đường dẫn (`policy.ts:24-29`) |
| §8 máy đo | **lệch** | Chạy đúng định dạng/exit và đỏ khi có vi phạm một dòng. Mù với nhiều dạng mã hợp lệ: xem D1, D2 |

## Cách phá đã thử → kết quả
Harness (mã nguồn chép bằng `cat`): [harness](../evidence/P01-audit/harness.txt). Mọi phép HTTP chạy `next start`/`next dev` thật trên `lq_audit`, chỉ dùng cookie cấp qua `/api/auth/login` hoặc không có cookie.

| # | Cách phá | Kết quả | Evidence |
| :-- | :-- | :-- | :-- |
| 1 | Giả mạo/sửa cookie `lq_session` | **KHÔNG THỰC HIỆN**, xem §5 | — |
| 2a | `/dev/sim` + 3 API khi `DATA_MODE` chưa đặt (vai admin, guard, không cookie) | XANH 7/7: đều 404, thêm 0 dòng `inbound_events` | [http-nosim](../evidence/P01-audit/http-nosim.txt) |
| 2b | `/dev/sim` + send/replay/thread khi `DATA_MODE=sim`, vai `bql_staff`/`guard` | XANH 8/8: đều 403 | [http-sim](../evidence/P01-audit/http-sim.txt) R02–R09 |
| 2c | `/dev/sim` bằng `bql_admin`, `DATA_MODE=sim`, bản build | **ĐỎ**: 404; build đã prerender trang thành `NEXT_HTTP_ERROR_FALLBACK;404`; `next dev` thì trả 200 | [r01-rootcause](../evidence/P01-audit/r01-rootcause.txt), [r01-next-dev](../evidence/P01-audit/r01-next-dev.txt) |
| 3a | send/replay/thread/logout không cookie | XANH: 307→`/login`; ghi thêm 0 dòng `inbound_events`, 0 dòng `sim.*` | [http-sim](../evidence/P01-audit/http-sim.txt) N01–N04, W01–W02 |
| 3b | Login với `email`/`password` không phải chuỗi | **ĐỎ**: 500 (TypeError không bắt), không có dòng audit fail | N06, N07 |
| 3c | Send (admin) `threadType=bogus` / `account=evil` | **ĐỎ**: lần lượt 500 và 200; ca `account=evil` sinh 1 dòng inbound + 1 dòng outbox cho tài khoản không tồn tại | V01, V02 |
| 3d | Login đúng mật khẩu khi thiếu `SESSION_SECRET` | Từ chối đúng (không có cookie) nhưng **ĐỎ**: +1 dòng `auth.login.ok` | [http-nosecret](../evidence/P01-audit/http-nosecret.txt) |
| 3e | `/ticketsX` (staff), `/gatekeeper` (guard) | **ĐỎ** so với bảng §7 (đường khác ⇒ 403): policy cho qua, trả 404 chỉ vì chưa có route | T03, T04 |
| 4a–e | 200 `published→held` đồng thời; 60 lệnh đích khác nhau; đua ABA 90 lệnh; 9 cặp ngoài bảng (kể cả trạng thái lạ); insert event lỗi trong tx | XANH: 1 thắng/199 `ConflictError`/1 event; 1 thắng; số event = số lần thành công; 9/9 `IllegalTransitionError`, DB không đổi; rollback trọn | [race-transition](../evidence/P01-audit/race-transition.txt) |
| 4f | Truyền `sql` của pool thay cho `q` của tx rồi làm insert event lỗi | **ĐỎ** (ghi chú): trạng thái thành `held` mà 0 `job_events` | 4f |
| 4g | `jobId` không phải uuid | **ĐỎ** (ghi chú): lỗi thô 22P02, không phải lỗi có kiểu | 4g |
| 4h | 12 `processInbound({limit:1})` đồng thời | **ĐỎ**: treo quá 20 s (cạn pool, kẹt chết) | 4h |
| 5 | `check_adapter_boundary`: `require('pg')`, `import('pg')`, `INSERT  INTO` nhiều khoảng trắng/tab | XANH (B02, B03, O02, O03) | [checker-bypass](../evidence/P01-audit/checker-bypass.txt) |
| 5 | Subpath `pg/lib/*`, import/require tách dòng, re-export, import dạng template, type+value trên cùng dòng, `.mts`, thư mục `src/dist`, `pg-pool`, SDK tách dòng | **ĐỎ** 12 ca (B04–B13, B15), đều `violations: 0`; specifier nạp được ở runtime | [checker-bypass](../evidence/P01-audit/checker-bypass.txt) |
| 5 | `INSERT INTO` xuống dòng rồi `outbox`, `"outbox"`, `public.outbox`, comment xen giữa, nối chuỗi | **ĐỎ** 5 ca (O04–O08) | [checker-bypass](../evidence/P01-audit/checker-bypass.txt) |
| 5+ | `check_agent_tools`: `phone?:`, `'phone':`, kiểu object lồng trước khoá PII; tool `"name": "exec"`, tên dạng template, file `.js` | **ĐỎ** 6 ca (A02–A04, A07–A09); đối chứng A01/A05/A06 xanh | [checker-bypass](../evidence/P01-audit/checker-bypass.txt) |
| 6 | `callModel` bằng client giả: lỗi mạng; truyền `images` | **ĐỎ**: `APIConnectionError` thô (M3); ảnh không tới request (M4) | [model-probe](../evidence/P01-audit/model-probe.txt) |

Quét độc lập, bắt được dạng nhiều dòng ([independent-scan](../evidence/P01-audit/independent-scan.txt)): **mã sản phẩm hiện có 0 vi phạm BB-04/BB-07 thật**. Các ca đỏ ở mục 5 là điểm mù của máy đo, không phải vi phạm đang tồn tại.

## Danh sách lệch SPEC có mức độ

| ID | Mức | Lệch | Vị trí |
| :-- | :-- | :-- | :-- |
| D1 | **chặn** | Máy đo G01 cho BB-04/BB-07 so từng dòng. Nó bỏ lọt subpath `pg/lib/*` (H02 §3d yêu cầu thử đúng ca này), import bị formatter ngắt dòng, re-export, và `INSERT INTO` xuống dòng trước `outbox` (H02 §3d yêu cầu thử). Gate xanh cả khi mã vi phạm | `scripts/check_adapter_boundary.mjs:69-90` (so từng dòng), `:75` (bắt buộc `'pg'` đóng nháy ngay sau), `:87`, `:15` (không quét `.mts`/`.cts`), `:14` (bỏ `dist` ở mọi độ sâu) |
| D2 | **chặn** | Máy đo khoá PII của BB-02 (Đ08, "không lật") bỏ lọt khoá tuỳ chọn `phone?:`, khoá có nháy, và khoá nằm sau một kiểu object lồng | `scripts/check_agent_tools.mjs:55` (regex `\bkey\b\s*:`), `:35` (khối kết thúc ở `};` đầu tiên), `:73`, `:94` |
| D3 | nên sửa | `/dev/sim` bị quyết định lúc build, không phải lúc chạy: build khi chưa đặt `DATA_MODE=sim` ⇒ trang 404 tĩnh cho mọi vai. Mọi bản chạy từ build (demo, VPS) mất màn giả lập | `apps/web/app/dev/sim/page.tsx:8-10` (`notFound()` chạy trước `cookies()`) |
| D4 | nên sửa | Ghi audit `auth.login.ok` trước khi tạo cookie; thiếu secret ⇒ 500 nhưng sổ vẫn ghi "ok" (G03: audit ghi sai) | `apps/web/app/api/auth/login/route.ts:37` rồi mới tới `:39` |
| D5 | nên sửa (trước P03) | `processInbound` giữ một client của tx trong khi handler `enqueue` xin client khác từ pool ⇒ ≥10 lời gọi đồng thời kẹt chết, không có timeout. `enqueue` cũng nằm ngoài tx nên rollback theo lô sẽ sinh tin ra trùng | `packages/core/src/sim/sim-transport.ts:78,100`, `packages/core/src/adapters/transport.ts:41-42` |
| D6 | nên sửa | `canAccess` khớp theo tiền tố không có ranh giới đoạn: `/ticketsX`, `/gatekeeper`, `/devices` đi theo quyền của `/tickets`, `/gate`, `/dev`. Route sau này (vd `/gate-report`) sẽ lộ chéo vai | `apps/web/lib/auth/policy.ts:24-29`, `apps/web/middleware.ts:17` |
| D7 | nên sửa | `ModelCall.images` (01-CONTRACTS §2) bị bỏ lặng lẽ; P03 cần ảnh để chẩn đoán | `packages/core/src/adapters/model.ts:40`, `:143-149` |
| D8 | nên sửa | Dữ liệu seed và tin vọng lại mất dấu tiếng Việt, lệch bảng §3/§6; `name_vi` sẽ hiện trong `JobCard.category_name` | `packages/core/src/db/seed.ts:9,22-33`, `sim-transport.ts:50` |
| D9 | nên sửa | Mật khẩu DB dev ghi cứng trong compose gốc (bản dùng cho VPS) | `compose.yaml:6-8` |
| D10 | nên sửa | Route không kiểm kiểu dữ liệu vào ⇒ 500 (N06, N07, V01); `account` tuỳ ý được ghi vào inbound và outbox (V02) | `login/route.ts:18,30`, `dev/sim/send/route.ts:23-33` |
| G1 | ghi chú | `transitionJob` nhận cả `sql` của pool nên kiểu không ép "phải chạy trong tx" (4f) | `packages/core/src/services/job-state.ts:71` |
| G2 | ghi chú | `jobId` không phải uuid ⇒ lỗi pg thô (4g) | `job-state.ts:76-78` |
| G3 | ghi chú | Lỗi mạng/timeout của LLM không đổi thành `ModelUnavailableError`: đúng chữ SPEC ("429/5xx") nhưng caller §9 sẽ không xin lỗi cư dân | `model.ts:173-178` |
| G4 | ghi chú | Lỗi ghi `agent_runs` bị nuốt im lặng | `model.ts:131` |
| G5 | ghi chú | Không chọn được file kịch bản trên màn `/dev/sim` | `SimBoard.tsx:124` |
| G6 | ghi chú | `npm audit`: 7 lỗ hổng (postcss qua next ở bước build; vitest/vite/esbuild ở dev) | [npm-audit](../evidence/P01-audit/npm-audit.txt) |
| G7 | ghi chú | Điểm mù ít gặp của máy đo: B11–B13, O08, A07–A09 | [checker-bypass](../evidence/P01-audit/checker-bypass.txt) |
| G8 | ghi chú | `typecheck` của core loại file test (`packages/core/tsconfig.json:11`) nên file test không được kiểm kiểu | — |

## 4. Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| H02 thẩm định P01 (chạy lại cổng, đối chiếu SPEC, phá thử, quét bí mật) | 🔴 | Claude / claude-opus-5-5[1m], tự làm, không phóng subagent |

## 5. Việc KHÔNG làm + lý do
- **Cách phá (1), giả mạo/sửa cookie `lq_session`, KHÔNG thực hiện.** Khi tôi soạn script cho mục này, vỏ agent dừng lượt làm việc bằng bộ lọc an toàn. Tôi không tạo cookie giả hay cookie đã sửa dưới bất kỳ dạng nào. Phần auth chỉ được đo bằng cookie hợp lệ và các ca không cookie (mục 2b, 3a, 3e). Mục này cần người quyết cách kiểm.
- Không đọc `reports/R01_*`, `evidence/P01/*`, `handoffs/H01_*`: đúng luật H02 §1.
- Không sửa mã, không push. `plan.md`, `SPEC-P03-Resident-Agent.md` và `brain4agent/memory/hot/today.md` đang có thay đổi chưa commit không phải của tôi: không đụng, không stage.
- Không đo dò email qua thời gian phản hồi login, không đo DoS của `scryptSync`: ngoài danh sách bắt buộc và không cần cho phán quyết.

## 6. Câu hỏi mở (cần người)
- Mục (1) cookie: người tự chạy, giao người thẩm định khác, hay chấp nhận ca unit hiện có trong `apps/web/lib/auth/session.test.ts`?
- D1/D2 có chặn đóng G01 không, khi mã hiện tại có 0 vi phạm thật (independent-scan)?
- 01-CONTRACTS §5: `unassigned` và `disputed` chưa có đường ra nào, kể cả sang `cancelled`. Có cần thêm dòng không? (Việc của SPEC, không phải lỗi mã P01.)

## 7. Tiếp theo
🖐 Cần tay người: phán quyết R02; quyết cách kiểm mục (1) cookie và mức của D1/D2 · 🤖 Agent làm được ngay: không có (thẩm định chỉ đọc; nếu phán `🔁` thì soạn handoff sửa D1–D10) · ⭐ Nên làm trước: vá D1/D2 (máy đo G01), vì mọi gói sau (P03, P05) dựa vào nó để giữ BB-02/04/07 · ⏸ Chưa làm: cách phá (1) cookie (bị bộ lọc an toàn dừng), đo dò email/DoS login (ngoài phạm vi bắt buộc)

⏳ Chờ người duyệt.
