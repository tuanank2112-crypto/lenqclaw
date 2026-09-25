// apps/zalo-worker/src/log.ts — log mot dong JSON. CHI nhan cac truong
// khong bi mat (tai khoan, trang thai, ma dong, id). CAM truyen cookie/imei/
// userAgent/ban ro phien vao day (SPEC-P02 §7).

type Field = string | number | boolean | null | undefined;

export function logEvent(event: string, fields: Record<string, Field> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...fields });
  process.stdout.write(`${line}\n`);
}

/** Ten + thong diep ngan cua loi (khong stack, khong du lieu dinh kem). */
export function errSummary(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 300);
  return String(err).slice(0, 300);
}
