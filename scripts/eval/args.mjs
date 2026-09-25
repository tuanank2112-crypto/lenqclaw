// scripts/eval/args.mjs — phan tich co --set <ten>[,<ten>] dung chung cho
// scripts/eval_golden.mjs va scripts/eval/red-fake-model.mjs (H08 §10, Đ29
// trong plan.md — cham bu theo route: chi chay lai bo bi anh huong).
// Thuan tuy (KHONG goi process.exit) de test truc tiep duoc, khong DB.

export const SET_NAMES = ['emergency', 'consent', 'diagnosis', 'responsibility'];

/**
 * Phan tich `--set <ten>[,<ten>]` tu argv (KHONG bao gom node/duong dan
 * script). Khong co `--set` => `{ ok: true, sets: null }` (chay du 4 bo,
 * hanh vi cu — H08 §10 dong 1). Co `--set` hop le => `{ ok: true, sets: Set
 * <string> }`. Thieu gia tri hoac ten la => `{ ok: false, error }` — CALLER
 * (CLI) tu in loi + `process.exit(2)`, ham nay khong tu thoat.
 */
export function parseSetArg(argv) {
  const idx = argv.indexOf('--set');
  if (idx === -1) return { ok: true, sets: null };

  const raw = argv[idx + 1];
  if (!raw || raw.startsWith('--')) {
    return {
      ok: false,
      error: `--set can gia tri (vd: --set diagnosis,responsibility; hop le: ${SET_NAMES.join('|')})`,
    };
  }

  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length === 0) {
    return {
      ok: false,
      error: `--set can gia tri (vd: --set diagnosis,responsibility; hop le: ${SET_NAMES.join('|')})`,
    };
  }

  const invalid = names.filter((n) => !SET_NAMES.includes(n));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `bo khong hop le "${invalid.join(',')}" (hop le: ${SET_NAMES.join('|')})`,
    };
  }

  return { ok: true, sets: new Set(names) };
}

/** `sets` null (khong loc) hoac Set khong chua `name` => co chay khong. */
export function shouldRun(sets, name) {
  return sets === null || sets.has(name);
}

/** Nhan cho dong log dau tien: "all" khi khong loc, hoac danh sach ten. */
export function setsLabel(sets) {
  return sets ? [...sets].join(',') : 'all';
}
