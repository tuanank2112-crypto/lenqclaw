// packages/core/src/services/vn-time.ts — gio Viet Nam (Asia/Ho_Chi_Minh,
// UTC+7, khong DST) thuan, khong goi DB (SPEC-P05-Dispatch.md §10.8.1).
// Moi ham nhan `Date` tham so — CAM `now()` cua Postgres / dong ho he thong
// tien trinh trong cac dich vu dung ham nay (đồng ho la tham so).

const VN_OFFSET_MIN = 7 * 60;

/** Gio (0-23) va phut theo VN cua mot thoi diem UTC. */
function vnHourMinute(at: Date): { hour: number; minute: number } {
  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  const vnMinutes = ((utcMinutes + VN_OFFSET_MIN) % (24 * 60) + 24 * 60) % (24 * 60);
  return { hour: Math.floor(vnMinutes / 60), minute: vnMinutes % 60 };
}

/** true khi `at` roi vao [07:00, 21:00) gio VN. */
export function isBusinessHours(at: Date): boolean {
  const { hour } = vnHourMinute(at);
  return hour >= 7 && hour < 21;
}

/** true khi `at` roi vao [08:00, 18:00) gio VN, MOI ngay (khac
 * `isBusinessHours` — dung cho nhac BQL §10.8.1(3)). */
export function isOfficeHours(at: Date): boolean {
  const { hour } = vnHourMinute(at);
  return hour >= 8 && hour < 18;
}

/** Ngay VN cua `at`, dang 'YYYY-MM-DD' — dung de so voi cot kieu `date`. */
export function vnDateString(at: Date): string {
  const vnMs = at.getTime() + VN_OFFSET_MIN * 60_000;
  const d = new Date(vnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 08:00 VN cua ngay VN CHUA "at" (cung ngay neu at truoc 07:00, ngay sau
 * neu at tu 21:00 tro di) — quy uoc §10.8.1(2): "ngoai gio giu toi 8h sang". */
function nextEightAmVn(at: Date): Date {
  const { hour } = vnHourMinute(at);
  const vnMs = at.getTime() + VN_OFFSET_MIN * 60_000;
  const d = new Date(vnMs);
  // "Ngay VN" cua at, tinh theo moc UTC da dich +7h — chi lay Y/M/D.
  const baseUtcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // hour>=21 => sang hom SAU; hour<7 (bao gom <7) => VAN cung ngay VN do
  // (dang ky tra ve 08:00 cung "ngay VN" hien tai — vd 05:00 => 08:00 cung ngay).
  const dayOffsetMs = hour >= 21 ? 24 * 60 * 60_000 : 0;
  const eightAmVnUtcMs = baseUtcMidnight + dayOffsetMs + 8 * 60 * 60_000;
  // eightAmVnUtcMs dang la "gio VN" bieu dien qua moc UTC da dich +7h —
  // dich nguoc lai -7h de ra thoi diem UTC that.
  return new Date(eightAmVnUtcMs - VN_OFFSET_MIN * 60_000);
}

/**
 * `computePublishExpiry(at, timeoutMin)` (SPEC-P05-Dispatch.md §10.8.1(2)):
 * gio VN cua `at` trong [07:00,21:00) => `at + timeoutMin` phut; ngoai gio
 * => 08:00 VN ke tiep (truoc 07:00 => cung ngay; tu 21:00 => ngay sau).
 * Da thu (SPEC-P05 §10.8.1): 10:00=>10:45 · 20:30=>21:15 · 21:30=>08:00 hom
 * sau · 05:00=>08:00 cung ngay · 00:00 1/10=>08:00 1/10.
 */
export function computePublishExpiry(at: Date, timeoutMin: number): Date {
  if (isBusinessHours(at)) {
    return new Date(at.getTime() + timeoutMin * 60_000);
  }
  return nextEightAmVn(at);
}

/** `HH:mm dd/MM` gio VN cua mot cot `timestamptz` (chuoi ISO) — SPEC-P05
 * §10.2.2 (`JobCard.window`). `null` => chuoi rong. */
export function fmtWindowVn(iso: string | null): string {
  if (!iso) return '';
  const vnMs = new Date(iso).getTime() + VN_OFFSET_MIN * 60_000;
  const d = new Date(vnMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} ${dd}/${mo}`;
}

/** `HH:mm` gio VN cua mot `Date` — dung trong cac mau tin (vd
 * `CLAIM_WON_GROUP`, `HOLD_DM`). */
export function fmtHhmmVn(at: Date): string {
  const { hour, minute } = vnHourMinute(at);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
