import { NextResponse } from 'next/server';
import { sql, audit, verifyPassword, type StaffRole } from '@lenqclaw/core';
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_MS } from '../../../../lib/auth/session';

interface LoginBody {
  email?: string;
  password?: string;
}

interface StaffRow {
  id: string;
  password_hash: string;
  role: StaffRole;
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as LoginBody | null;
  const email = body?.email?.trim();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 400 });
  }

  const rows = await sql<StaffRow>(
    `select id, password_hash, role from staff_users where email = $1`,
    [email]
  );
  const user = rows[0];
  const ok = user ? await verifyPassword(password, user.password_hash) : false;

  if (!ok || !user) {
    await audit(sql, { actorType: 'staff', actorId: null, action: 'auth.login.fail', target: email });
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  await audit(sql, { actorType: 'staff', actorId: user.id, action: 'auth.login.ok', target: email });

  const cookieValue = await createSessionCookie(user.id, user.role);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
