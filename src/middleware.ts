import { NextRequest, NextResponse } from 'next/server';
import { authCookieName, verifySessionToken } from '@/lib/web-auth';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/health') return NextResponse.next();
  const username = process.env.WEB_ADMIN_USERNAME;
  const password = process.env.WEB_ADMIN_PASSWORD;
  const valid = username && password && await verifySessionToken(request.cookies.get(authCookieName)?.value, username, password);
  if (valid) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
