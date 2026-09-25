import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authCookieName, authSessionMaxAge, createSessionToken } from '@/lib/web-auth';

export async function POST(request: Request) {
  const configuredUsername = process.env.WEB_ADMIN_USERNAME;
  const configuredPassword = process.env.WEB_ADMIN_PASSWORD;
  if (!configuredUsername || !configuredPassword) return NextResponse.json({ error: 'Website login is not configured.' }, { status: 503 });

  const input = await request.json().catch(() => ({})) as { username?: unknown; password?: unknown };
  const username = typeof input.username === 'string' ? input.username : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!safeEqual(username, configuredUsername) || !safeEqual(password, configuredPassword)) {
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, await createSessionToken(configuredUsername, configuredPassword), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: authSessionMaxAge,
  });
  return response;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
