// apps/web/middleware.ts — canh moi request theo bang phan quyen
// (SPEC-P01 §3.1) + chan `/dev/*` va `/api/dev/*` khi `DATA_MODE != sim`.

import { NextResponse, type NextRequest } from 'next/server';
import { canAccess } from './lib/auth/policy';
import { SESSION_COOKIE_NAME, verifySessionCookie } from './lib/auth/session';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (
    (pathname.startsWith('/dev') || pathname.startsWith('/api/dev')) &&
    process.env.DATA_MODE !== 'sim'
  ) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionCookie(cookie);
  const role = payload?.role ?? null;

  if (canAccess(role, pathname, req.method)) {
    return NextResponse.next();
  }

  if (role === null) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return new NextResponse('Forbidden', { status: 403 });
}
