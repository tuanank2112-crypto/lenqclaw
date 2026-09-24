import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../lib/auth/guard';
import { SESSION_COOKIE_NAME } from '../../../../lib/auth/session';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (session) {
    await audit(sql, { actorType: 'staff', actorId: session.uid, action: 'auth.logout' });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
