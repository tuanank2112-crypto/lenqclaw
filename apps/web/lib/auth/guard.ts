// apps/web/lib/auth/guard.ts — doc phien tu cookie: mot ban cho Server
// Component/Route Handler (dung `next/headers`), mot ban cho noi da co san
// `NextRequest` (route handler nhan request truc tiep).

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionCookie, type SessionPayload } from './session';

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionCookie(raw);
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionCookie(raw);
}
