Vai: worker (vai-thi-cong) · loại: thi công · họ/model: Claude Sonnet 5.5 · Bước 0: exit 0 (`NÃO ĐÃ OK`) · hiểu việc: phạm vi = worker D31 (pacer, khoá, heartbeat), `/api/healthz`, migration 011 + `botUid`, adapter báo động Telegram + `ops-watch`, dọn dữ liệu §11, docs; xong khi = gate/test/test:db×2/pacer-sim/probe 011/G24/diff-stat đều có evidence; cấm = nới gap D09, sửa `graph/**`, `001…010`, `package*.json`, push, gọi mạng thật
Handoff: handoffs/H10_thi-cong_P03b.md
Base: dc7fb0e14d4a2a3fb7b0630f6b300901d7c18460
Head: 8f8c5d15f865829feb570d23ed4637d6f89c9768

## Commit
| Gói | SHA | Nội dung |
| :-- | :-- | :-- |
| P03b-A | 73a7ff0 | pacer ưu tiên tin trả lời, typing tươi, `picked_at`/`hold_reason`, khoá worker |
| P03b-B | 6581148 | heartbeat worker, `/api/healthz`, migration 011, `botUid`, `own_uid` |
| P03b-C | 04d512e | `adapters/alert.ts`, `services/ops-watch.ts` (8 kind), `opsWatch`, worker `every('ops')`, gửi `zalo_session` ngay |
| P03b-D | 3d5bf7a | `pruneBuffers` §11 + docs 3 module |
| sửa test cũ | bafe59b, 077254e, 8f8c5d1 | 3 commit `test(...)` — giải thích ở mục "Test cũ đã đổi" |

## Số đo (chạy lại ở HEAD `8f8c5d1`)
| Phép đo | Lệnh → evidence | Kết quả |
| :-- | :-- | :-- |
| gate | `npm run gate` → `gate.txt` | `GATE_OK`, exit 0 |
| npm test | `npm test` → `test.txt` | exit 0 · tổng 585 (web 32 · worker 114 · core 439) · fail 0 · skip 0 (trước 549; +36) |
| test:db lần 1 | `npm run test:db` → `test-db.txt` | exit 0 · 238 (core 130 · web 30 · worker 78) · fail 0 · skip 0 |
| test:db lần 2 | → `test-db-run2.txt` | exit 0 · 238 · fail 0 · skip 0 |
| pacer-sim | `pacer-sim.ts --group` → `pacer-group.txt` | exit 0 · `first_hour: 20` · `violations: 0` |
| migration 011 | `migration-011-probe.txt` | DB tạm: từ rỗng `applied: 11`, chạy lại `applied: 0`, cột `own_uid|text|YES`, DB tạm đã xoá |
| diff-stat | `diff-stat.txt` | 49 file; ngoài ĐƯỢC GHI: chỉ 2 file web (xem dưới) |

## G24 (local)
| Ca G24 | Test | Kết quả |
| :-- | :-- | :-- |
| thiếu `TELEGRAM_*` ⇒ `disabled`, 0 fetch, 1 audit `alert.disabled` | `adapters/alert.test.ts` | ✅ |
| token giả + fetch giả 401 ⇒ `failed` + audit `alert.failed`; token/URL/body không có trong log/audit | `alert.test.ts` | ✅ |
| runner cũ 120 s ⇒ `checkOps(now,'worker')` ĐÚNG 1 fetch; gọi lại 3 lần ⇒ vẫn 1; heartbeat mới ⇒ +1 hồi phục | `dbtests/ops-watch.db.test.ts` | ✅ |
| runner và worker CÙNG LÚC thấy `dead` ⇒ tổng 1 | `ops-watch.db.test.ts` | ✅ |
| 10 dòng `reply_latency` fast `core_ms` 7000 ⇒ 1 `slo_breach` (9 dòng ⇒ không) | `ops-watch.db.test.ts` | ✅ |
| `/api/healthz` 503 khi heartbeat cũ, 200 khi mới, body không lộ token/số liệu | `apps/web/tests/healthz.db.test.ts` | ✅ |
| boundary: file tạm có `api.telegram.org` ngoài adapter ⇒ `violations: 1` | `red-boundary-telegram.txt` | ✅ |
| đủ 8 kind (`zalo_session`, `runner_stale`, `worker_stale`, `inbound_backlog`, `model_down`, `slo_breach`, `bot_not_admin`, `db_unreachable`) | `ops-watch.db.test.ts` + `services/ops-watch.test.ts` | ✅ |
| 🖐 bot Telegram thật (tắt runner ⇒ 1 tin ≤ 2 phút; đăng xuất ⇒ 1 tin `zalo_session`) | — | ⬜ server (chưa có bot/token) |

## Bảng mục SPEC → test → kết quả → evidence
| Mục | Test | Kết quả | Evidence |
| :-- | :-- | :-- | :-- |
| D31 §7.1.1–3 (tick 250, ưu tiên trả lời, typing tươi) | `pacer-d31.test.ts` (12 ca) | ✅ | `red-pacer-priority`, `red-pacer-typing-fresh` |
| §7.1.4 `picked_at`/`hold_reason` | `pacer-d31.test.ts` + `p03b-worker.db.test.ts` | ✅ | `red-pacer-hold-reason` |
| T6 khoá worker | `p03b-worker.db.test.ts` (spawn `main.ts`, exit 1, `WORKER_ALREADY_RUNNING`, không `worker.started`) | ✅ | `red-worker-lock` |
| §9 heartbeat worker, healthz | `p03b-worker.db.test.ts`, `healthz.db.test.ts` | ✅ | `red-healthz-stale`, `red-healthz-leak`, `red-healthz-policy` |
| D37 migration 011, `botUid`, ghi `own_uid` | `bot.test.ts`, `p03b-bot-uid.db.test.ts`, `p03b-worker.db.test.ts` | ✅ | `migration-011-probe`, `red-bot-uid-order`, `red-own-uid-write` |
| §10.1 adapter | `alert.test.ts` | ✅ | `red-alert-dedupe` |
| §10.2 `checkOps`, `opsWatch`, worker gửi ngay | `ops-watch.db.test.ts`, `p03b-worker.db.test.ts` | ✅ | `red-ops-throttle`, `red-ops-watch-no-worker-check`, `red-worker-zalo-session` |
| §11 dọn dữ liệu | `p03b-prune.db.test.ts` (180/365 ngày; 5000 dòng/tick/bảng) | ✅ | `red-prune-batch`, `red-prune-retention` |

## Bằng chứng đỏ (mã cố tình hỏng → test ĐỎ → trả mã)
| Bộ đo | Hỏng bằng | Kết quả | File |
| :-- | :-- | :-- | :-- |
| G24 dedupe (BẮT BUỘC) | CAS `alert_state`: thay mệnh đề `where` bằng `where $3::int >= 0` | ca "gọi lại 3 lần" ra **4** fetch (`expected … length 1 but got 4`); `zalo_session` đồng thời ra 2 | `red-alert-dedupe.txt` |
| G24 boundary (BẮT BUỘC) | file tạm `packages/core/src/zz-tmp-boundary-red.ts` chứa `api.telegram.org` | `violations: 1`, exit 1 (file đã xoá, lại `violations: 0`) | `red-boundary-telegram.txt` |
| ưu tiên trả lời | vòng 1 `pickNext` rỗng | 2 ca đỏ | `red-pacer-priority.txt` |
| typing tươi | điều kiện tươi = `false` | 5 ca đỏ | `red-pacer-typing-fresh.txt` |
| hold_reason | `noteHold` không ghi | 2 ca đỏ | `red-pacer-hold-reason.txt` |
| khoá worker | bỏ nhánh `lock === null` | đỏ (worker không thoát sau 25 s) | `red-worker-lock.txt` |
| healthz | bỏ điều kiện runner cũ / thêm `host` vào body / bỏ ngoại lệ policy | đỏ 1 / 2 / 1 ca | `red-healthz-stale.txt`, `red-healthz-leak.txt`, `red-healthz-policy.txt` |
| `botUid` | đảo thứ tự nguồn (env trước cột) | 3 ca đỏ | `red-bot-uid-order.txt` |
| ghi `own_uid` | bỏ lời gọi `setOwnUid` | 1 ca đỏ | `red-own-uid-write.txt` |
| chống chồng ops | bỏ throttle `opsWatch` | 1 ca đỏ | `red-ops-throttle.txt` |
| canh chéo | bỏ nhánh worker canh runner | 4 ca đỏ | `red-ops-watch-no-worker-check.txt` |
| gửi `zalo_session` ngay | tắt nhánh gửi trong `store.alert` | 1 ca đỏ | `red-worker-zalo-session.txt` |
| dọn dữ liệu | bỏ `limit` / dùng hạn 180 cho `audit_log` | 1 / 1 ca đỏ | `red-prune-batch.txt`, `red-prune-retention.txt` |

## Test cũ đã đổi (giải thích từng ca)
| Ca | Đổi | Vì sao |
| :-- | :-- | :-- |
| `config.test.ts` "mặc định = bảng §5": `tickMs` 1000 → 250 | giá trị mặc định | SPEC-D31 §7.1.1/T9 và plan "Quyết định bị thay thế" dòng pacer |
| `p02-worker.db.test.ts` "giả lập 50 tin / 20 người": `typings ≥ 50` → mỗi người nhận ≥ 1 typing, tổng ≤ 50, và MỖI text có typing cùng thread ≤ `typingFreshMs` trước đó | số typing | D31 T7: thread có typing tươi thì KHÔNG gửi typing lại (đo: 41 < 50 sau thay đổi) — số tin gửi 50/50 và `verifySendLog` = [] không đổi |
| `sim-replay-group.db.test.ts`: số lần gọi model `6` → `3`, kèm bước đẩy tin cũ của `sim-group-%` lùi 2 giờ | kỳ vọng + setup | ĐO: test này không tất định theo ngân sách giờ nhóm (BB-08): `sim-group-1` còn ngân sách ⇒ tool `answers` thành công ⇒ D35.4 bỏ lượt chốt ⇒ 3 lần gọi; hết ngân sách (≥ 20 tin/giờ do các lần chạy test trước) ⇒ tool lỗi ⇒ có lượt chốt ⇒ 6. Lỗi có từ trước (đỏ ở Base `dc7fb0e` trên DB mới, đã thử DB tạm); không do gói này. Làm tất định bằng đẩy lùi outbox mô phỏng rồi đo 3 |

## File ngoài danh sách ĐƯỢC GHI
| File | Lý do |
| :-- | :-- |
| `apps/web/lib/auth/policy.ts` | `/api/healthz` KHÔNG cần đăng nhập (D37) nhưng `middleware` chuyển mọi đường khác về `/login`; thêm ngoại lệ chỉ GET/HEAD đúng đường `/api/healthz` |
| `apps/web/lib/auth/policy.test.ts` | ca kiểm ngoại lệ trên (GET/HEAD mở, POST/đường con/`/api/healthzz` vẫn chặn); `apps/web/tests/**` bị loại khỏi `npm test` nên không đặt ở đó |

## Lệch SPEC / quyết định nhỏ (ghi để SO duyệt)
1. SPEC-D31 §10.1 "gửi thất bại ⇒ `last_sent_at = null`": với `last_sent_at < now() - …` NULL làm CAS không bao giờ thắng ⇒ không gửi lại. Thực hiện: đặt mốc đã HẾT hạn lặp (`now() - (ALERT_REPEAT_MIN+1) phút`), giữ `open`, giảm `sent_count`. Cùng ý đồ (vòng sau gửi lại).
2. `resolveBotUid()` đồng bộ (node đồ thị không sửa được) trả `BOT_UID_UNKNOWN = 'bot-uid-unknown'` thay `null` khi không có nguồn nào (kiểu `string`); `botUid(account)` async trả `null` đúng SPEC. Runner `await botUid()` trước mỗi lượt để làm mới ảnh chụp.
3. `opsWatch` trong `runTimers` chỉ chạy khi `ctx.opsWatch` (runner bật) — `sim tick` có test cũ so `steps` bằng đúng `{flushAmbient, pruneBuffers}`.
4. `checkOps` thêm tham số tuỳ chọn `{cfg?, startedAt?}` (cho ca "chưa có dòng heartbeat sau `HEARTBEAT_STALE_MS` kể từ khi khởi động").
5. `healthz`: thêm `cache-control: no-store`; `zalo` trả `session_state` (chuỗi trạng thái, không phải số liệu/tên).

## Sự cố trong phiên (khai thật)
- Một lần chạy thử `pruneBuffers` với `now` năm 2031 trong test (sai, đã sửa sang ngày thật) đã xoá tối đa 5000 dòng/bảng cũ nhất của `turn_traces`, `agent_runs`, `audit_log` và các `group_messages` cũ trong DB dev. Chỉ là dữ liệu test/sim; `npm run test:db` seed lại và xanh. Không chạm DB khác.
- Docker Desktop đã tắt giữa phiên; tôi khởi động lại Docker Desktop để chạy DB dev (container `lenqclaw-db-1`).

## Bảng phân công thực tế
| Gói | Tầng yêu cầu | Họ/model đã dùng |
| :-- | :-- | :-- |
| P03b-A | 🟠 | Claude Sonnet 5.5 |
| P03b-B | 🟠 | Claude Sonnet 5.5 |
| P03b-C | 🟠 | Claude Sonnet 5.5 |
| P03b-D | 🟠 | Claude Sonnet 5.5 |
| docs | 🟢 | Claude Sonnet 5.5 (không có model 🟢 riêng; làm tại tầng 🟠 — cao hơn yêu cầu) |

## Việc KHÔNG làm + lý do
- Không push (luật). Không sửa `graph/**`, `001…010`, `package*.json`, `brain4agent/`, `planning/**` ngoài hồ sơ.
- Không đồng bộ `brain4agent/` (ngoài phạm vi ĐƯỢC GHI của handoff) — phải làm ở bước duyệt.
- Không đánh dấu G24 ✅ trong TESTING-ACCEPTANCE (ngoài phạm vi); không kiểm Telegram thật (chưa có bot/token).
- `.env.example` chưa liệt kê biến D31/D32/`TELEGRAM_*` (ngoài phạm vi).

## Câu hỏi cần người
1. Chấp nhận lệch SPEC #1 (mốc gửi hết hạn thay `null`) và #2 (sentinel `BOT_UID_UNKNOWN`)?
2. Chấp nhận đổi kỳ vọng `sim-replay-group` (6 → 3 có setup tất định) và `p02-worker` typing? Nếu muốn giữ 6, cần quyết định lại D35.4 hay ngân sách giờ nhóm sim.
3. Khi nào có bot Telegram thật để chạy ca 🖐 của G24?

⏳ Chờ phán quyết.
