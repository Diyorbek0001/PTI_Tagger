import { NextResponse } from 'next/server';
import { authCookieName,authSessionMaxAge,createSessionToken } from '@/lib/web-auth';
import { db } from '@/lib/database';
import { ensureBootstrapSuperadmin,findUserByUsername,verifyPassword } from '@/services/web-users';
import { logAudit,requestIp } from '@/services/audit';

export async function POST(request:Request){
  try{
    await ensureBootstrapSuperadmin();
    const input=await request.json().catch(()=>({})) as {username?:unknown;password?:unknown};
    const username=typeof input.username==='string'?input.username.trim():'',password=typeof input.password==='string'?input.password:'';
    const user=await findUserByUsername(username);
    if(!user||!user.is_active||!verifyPassword(password,user.password_hash)){await logAudit({actor:{type:'WEB_USER',id:username||null,displayName:username||'Unknown'},action:'LOGIN_FAILURE',entityType:'SETTINGS',description:'Website login failed',ipAddress:requestIp(request)}).catch(()=>undefined);return NextResponse.json({error:'Incorrect username or password.'},{status:401})}
    await db.query('update web_users set last_login_at=now() where id=$1',[user.id]);
    const token=await createSessionToken({userId:user.id,username:user.username,displayName:user.display_name,role:user.role,sessionVersion:user.session_version});
    const response=NextResponse.json({ok:true,user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role}});
    response.cookies.set(authCookieName,token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:authSessionMaxAge});
    await logAudit({actor:{type:'WEB_USER',id:user.id,displayName:user.display_name},action:'LOGIN_SUCCESS',entityType:'SETTINGS',entityId:user.id,description:'Website login succeeded',ipAddress:requestIp(request)}).catch(()=>undefined);
    return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to sign in.'},{status:500})}
}
