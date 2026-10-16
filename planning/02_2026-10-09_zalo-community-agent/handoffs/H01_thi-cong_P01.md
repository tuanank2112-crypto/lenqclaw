1. Bạn là worker của repo này. Vai + luật hành xử: đọc `.agents/skills/vai-thi-cong/SKILL.md`. Loại handoff: THI CÔNG.
2. Bước 0 (từ root repo `E:\vọc vạch\lenqclaw`; hub là junction ⇒ BẮT BUỘC cờ): `node --preserve-symlinks-main ../brain4agent.release/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js --check`. `CẦN NÂNG CẤP` ⇒ chạy lại KHÔNG `--check` (vẫn giữ cờ) đúng một lần → `--check` phải 0. Mã 2 ⇒ dừng, báo.
3. Đọc theo thứ tự: `planning/02_2026-10-09_zalo-community-agent/plan.md §2` (D01–D26) → `specs/00-ARCHITECTURE.md` → `specs/01-CONTRACTS.md` (§1–§4, §9, §10) → `specs/SPEC-P01-Go-San-Tho.md` (toàn bộ). Không đọc gì khác trước khi ghi dòng "hiểu việc".

## 1. BỐI CẢNH TỰ CHỨA
- Repo lenqclaw (TypeScript Node 22, npm workspaces `apps/web`, `apps/zalo-worker`, `packages/core`), nhánh `main`. Base: tự đo `git rev-parse HEAD` ngay trước lần sửa đầu tiên, ghi vào report dòng 3.
- Sản phẩm đã pivot từ "sàn việc thợ" sang "agent chăm sóc cộng đồng Zalo". Gói P01 = gỡ mã sàn thợ + đặt nền schema/kiểu/khung cho các gói sau; KHÔNG viết tính năng.
- Đã có sẵn (SO làm, D26): tag `archive/plan-01-marketplace` = `d7f50eb`, đã push, đủ 94/94 file cần gỡ — bằng chứng `planning/02_2026-10-09_zalo-community-agent/evidence/P01/archive-tag.txt`. Gỡ file an toàn vì mọi file còn trong tag.
- DB dev: container `lenqclaw-db-1` (Postgres 16 + pgvector) ở `127.0.0.1:55432`, thông tin kết nối trong `.env`. DB dev hiện có schema cũ 001–004 + dữ liệu thử.
- Số đo nền (2026-10-09): `npm test` 317 (core 244 · web 36 · worker 37), `test:db` 196.

## 2. PHẠM VI
- ĐƯỢC GHI: mọi file nêu ở SPEC-P01 §2 (gỡ), §3 (sửa/tạo mới), §4 (seed), §5 (`.env.example`), §6 (máy đo), `db/migrations/007_drop_marketplace.sql`, `008_community.sql`, `009_tenant_trace.sql`, root `package.json` (CHỈ trường `description`), `docs/core.md`, `docs/web.md`, `docs/zalo-worker.md`; trong hồ sơ: `planning/02_2026-10-09_zalo-community-agent/reports/R01_thi-cong_P01.md` và `.../evidence/P01/` (file MỚI; CẤM sửa `archive-tag.txt`, `resident-ts-wip-diff.txt`).
- CẤM ĐỤNG: `db/migrations/001–006`; mọi thứ trong `planning/01_*`; `planning/02_*/plan.md` và `specs/` (SO sửa); `planning/03_*` (người khác đang soạn song song); `brain4agent/` (SO đồng bộ sau phán quyết); 5 file lạ chưa theo dõi (`lenqclaw_presentation_transcript.pdf`, `docs/presentation-transcript.html`, `docs/progress-dashboard.html`, `docs/lenqclaw_presentation_transcript.pdf`, `docs/images/11-tien-do-du-an.png`); tag `archive/plan-01-marketplace` (CẤM đánh lại/xoá).
- VÙNG CẤM + LÝ DO: SPEC-P01 §8 và 00-ARCHITECTURE §3, §7 (không viết tính năng cộng đồng, không đổi `version`, không giữ lại file "để sau").

## 3. VIỆC PHẢI LÀM (theo thứ tự SPEC-P01 §1; evidence ghi bằng redirect, Git Bash, LF)
a. Kiểm tag: `git rev-parse archive/plan-01-marketplace^{commit}` → `d7f50eb…`.
b. Sao lưu DB dev TRƯỚC khi migrate (dữ liệu thật có thể có phiên Zalo): `pg_dump` qua `docker exec lenqclaw-db-1 …` ra file NGOÀI repo `~/lenqclaw-backups/pre-007-2026-10-14.sql` (CẤM để trong repo — có thể chứa phiên/PII). Xong khi: file tồn tại, > 0 byte (ghi `ls -l` vào `evidence/P01/backup.txt`, KHÔNG ghi nội dung).
c. Bằng chứng ĐỎ trước khi gỡ: `node scripts/check_pivot_cleanup.mjs > evidence/P01/red-pivot-before.txt` (script viết theo §6.2) → `pivot_hits` > 1000, exit 1.
d. Migration 007/008 nguyên văn 01-CONTRACTS §4, so sha256 với `evidence/ARCH/migration-draft-sha256.txt` (sau chuẩn hoá LF) — lệch ⇒ dừng báo. 009 nguyên văn 01-CONTRACTS §4. Áp thử 009 trên DATABASE TẠM (vd `createdb lenqclaw_probe` trong cùng container, xoá sau), KHÔNG trên DB dev: 001–009 từ rỗng `applied 9`, chạy lại `applied 0`, `tenants` có `default`, `zalo_accounts.tenant_id='default'`, insert `turn_traces` với `outcome='xyz'` bị CHECK từ chối. Xong khi: `evidence/P01/migration-009-probe.txt` có đủ 5 dòng kết quả, `FAILS 0`.
e. Gỡ 94 file §2 bằng `git rm` (rename `search-regulations.ts`→`search-knowledge.ts` bằng `git mv`); sửa §3; seed §4; `.env.example` §5; máy đo §6 (+ bằng chứng đỏ `evidence/P01/red-check-agent-tools.txt`: bản sao tạm có `name: 'exec'` ⇒ `forbidden_tools: 1`, exit 1); docs §1.5.
f. Xong khi (SPEC-P01 §10, chạy lại tất cả ở cuối, ghi evidence):
   - `npm run gate > evidence/P01/gate.txt` → `GATE_OK`, exit 0
   - `node scripts/check_pivot_cleanup.mjs` → `pivot_hits: 0`
   - `npm run test:db > evidence/P01/test-db.txt` → exit 0, 0 skip, `applied: 9` trong p01
   - `npm test > evidence/P01/test.txt` → core ≥ 60, web ≥ 30, worker ≥ 37, 0 fail, 0 skip
   - `git diff --stat --diff-filter=D <Base>..HEAD | tail -1 > evidence/P01/deleted-count.txt` → `94 files changed` (lệch ⇒ giải thích từng file trong report)
   - `git diff --stat <Base>..HEAD > evidence/P01/diff-stat.txt`; tập đường dẫn ⊆ ĐƯỢC GHI (mục 2)
   - SPEC-P01 §10 hàng 7 → `0`; hàng 8 → `11`

## 4. LUẬT
Không `git add -A`/`git add .` (stage TƯỜNG MINH từng đường — cây có file lạ và file của người khác) · không push · mã thoát 2 = dừng hỏi · không "sửa cho tốt hơn" ngoài SPEC · commit tiếng Anh Conventional Commits, kết bằng dòng `Co-Authored-By` của model bạn · SPEC mâu thuẫn hoặc thiếu ⇒ ghi vào mục 6 report, làm phần độc lập, KHÔNG tự đổi SPEC · kiểm mã thoát trực tiếp (`$?`), không qua `| tail`.

## 5. BẢNG GÓI VIỆC → TẦNG
| Gói | Tầng | Vì sao |
| :-- | :-- | :-- |
| a–c, e (gỡ/sửa theo danh sách, máy đo) | 🟠 | có SPEC + test tự biết đúng/sai |
| d (migration nguyên văn + probe) | 🟠 | có DDL nguyên văn + sha256 |
| docs §1.5 | 🟢 | có mẫu, chép theo thực tế |

## 6. REPORT PHẢI CÓ
Mẫu `docs/HANDOFF_PROTOCOL.md` §7 của hub (`../brain4agent.release/docs/HANDOFF_PROTOCOL.md`): dòng 1 khai vai (vai · thi công · họ/model · Bước 0 exit · hiểu việc), dòng 2 `Handoff: handoffs/H01_thi-cong_P01.md`, dòng 3 `Base:`, dòng 4 `Head:` (commit CÔNG VIỆC cuối, không phải commit chứa report); 7 mục; khối mã ≤ 30 dòng, trỏ evidence bằng link `../evidence/P01/<ten>.txt`. Report commit RIÊNG sau commit công việc. Dòng không rỗng cuối cùng: `⏳ Chờ phán quyết.` — CẤM tự ghi phán quyết, CẤM để trống.

Report: `planning/02_2026-10-09_zalo-community-agent/reports/R01_thi-cong_P01.md` · Evidence: `planning/02_2026-10-09_zalo-community-agent/evidence/P01/gate.txt`

## 7. PHỤ LỤC 2026-10-16 (SO) — TIẾP PHẦN DỞ
- Phần dở đã commit WIP `601aac7` trên `main`; HEAD lúc giao = `a589539`. **Base GIỮ `b356f07`** (mọi đo `<Base>..HEAD` tính từ đây). Bước a–d ĐÃ XONG (evidence có sẵn: `archive-tag.txt`, `backup.txt`, `red-pivot-before.txt`, `migration-009-probe.txt`, `red-check-agent-tools.txt`, `tag-check.txt`) — KHÔNG làm lại, KHÔNG sao lưu lại. `evidence/P01/test-db.txt` là số DỞ ⇒ ghi đè bằng lần chạy cuối.
- SO đo 2026-10-16: `npm run gate` exit 0 `GATE_OK` (core 82 · web 31 · worker 37), `pivot_hits: 0`. `npm run test:db` exit 1: `p01.db.test.ts` ca 4 (`duplicates` 6≠1 — DB dev còn dòng của lần chạy trước) và ca 5 (outbox 8≠12 — tin nhóm không sinh outbox vì router khung). Các file test DB của web/worker CHƯA chạy tới (dừng ở core).
- DB dev nay ở **`127.0.0.1:15432`** (G31). Repo KHÔNG tự nạp `.env` ⇒ mọi lệnh DB chạy sau `set -a; . ./.env; set +a`. CẤM in/ghi giá trị `.env` vào evidence.
- Việc còn lại = bước e (phần chưa xong) + f đủ 8 hàng §10. Sửa test cho đúng SPEC (ca 4: test phải tự cô lập dữ liệu — xem gotcha G29 trong `brain4agent/-known-gotchas.md`; ca 5: kỳ vọng theo hành vi router khung SPEC-P01 §3), KHÔNG nới kỳ vọng tuỳ tiện. Kiểm cả kỳ vọng §10 hàng 7 (`grep bql|market` = 0).
- Commit công việc tách theo nhóm hợp lý (stage tường minh), rồi commit RIÊNG report. KHÔNG push. Được phép đọc `brain4agent/-known-gotchas.md` (chỉ đọc).
