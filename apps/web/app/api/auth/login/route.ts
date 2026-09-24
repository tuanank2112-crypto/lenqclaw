import { NextResponse } from 'next/server';
import { sql, audit, verifyPassword, type StaffRole } from '@lenqclaw/core';
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_MS } from '../../../../lib/auth/session';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface StaffRow {
  id: string;
  password_hash: string;
  role: StaffRole;
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as LoginBody | null;
  const rawEmail = body?.email;
  const rawPassword = body?.password;

  // R02-tham-dinh D10: email/password khong phai chuoi (vd so, mang, null)
  // => 400 ro rang thay vi de `.trim()`/`verifyPassword` nem TypeError => 500.
  if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
    return NextResponse.json({ error: 'invalid_credentials_type' }, { status: 400 });
  }
  const email = rawEmail.trim();
  const password = rawPassword;

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
    await audit(sql, { actorType: 'staff', actorId: null, action: 'auth.login.fail', target: email, data: { reason: 'invalid_credentials' } });
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  // R02-tham-dinh D4: tao cookie TRUOC, chi ghi `auth.login.ok` SAU khi da
  // co cookie hop le trong tay. Thieu SESSION_SECRET => `createSessionCookie`
  // nem loi; bat lai va ghi `auth.login.fail` ly do `no_session_secret`,
  // KHONG bao gio ghi "ok" cho mot lan dang nhap khong sinh duoc phien.
  let cookieValue: string;
  try {
    cookieValue = await createSessionCookie(user.id, user.role);
  } catch {
    await audit(sql, {
      actorType: 'staff',
      actorId: user.id,
      action: 'auth.login.fail',
      target: email,
      data: { reason: 'no_session_secret' },
    });
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  await audit(sql, { actorType: 'staff', actorId: user.id, action: 'auth.login.ok', target: email });

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
