import { NextResponse } from 'next/server';
import { authCookieName } from '@/lib/web-auth';
import { logAudit, requestIp, webActor } from '@/services/audit';
import { currentWebUser } from '@/services/web-users';

export async function POST(request:Request) {
  const current=await currentWebUser(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  await logAudit({actor:webActor(current?.user),action:'LOGOUT',entityType:'SETTINGS',description:'Website session ended',ipAddress:requestIp(request)}).catch(()=>undefined);
  return response;
}
