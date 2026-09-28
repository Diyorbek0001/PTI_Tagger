import { NextRequest,NextResponse } from 'next/server';
import { authCookieName,verifySessionToken,webSessionSecret } from '@/lib/web-auth';

export async function middleware(request:NextRequest){
  const {pathname,search}=request.nextUrl;
  if(pathname==='/login'||pathname==='/api/auth/login'||pathname==='/api/health')return NextResponse.next();
  const session=await verifySessionToken(request.cookies.get(authCookieName)?.value,webSessionSecret());
  if(!session||typeof session==='boolean'){if(pathname.startsWith('/api/'))return NextResponse.json({error:'Authentication required.'},{status:401});const loginUrl=new URL('/login',request.url);loginUrl.searchParams.set('next',`${pathname}${search}`);return NextResponse.redirect(loginUrl)}
  const superadminOnly=pathname==='/admin'||pathname.startsWith('/admin/')||pathname.startsWith('/api/admin/');
  if(superadminOnly&&session.role!=='SUPERADMIN'){if(pathname.startsWith('/api/'))return NextResponse.json({error:'Superadmin access is required.'},{status:403});return NextResponse.redirect(new URL('/',request.url))}
  const mutation=!['GET','HEAD','OPTIONS'].includes(request.method)&&pathname.startsWith('/api/')&&pathname!=='/api/auth/logout';
  if(mutation&&session.role==='VIEWER')return NextResponse.json({error:'Viewer accounts are read-only.'},{status:403});
  return NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
