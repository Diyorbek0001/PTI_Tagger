import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { hashPassword, requireWebRole } from '@/services/web-users';
import { logAudit, requestIp, webActor } from '@/services/audit';

const accessSchema = z.array(z.object({ companyName: z.string().trim().min(1).max(120), canView: z.boolean(), canEdit: z.boolean() }).refine(item => !item.canEdit || item.canView, 'Edit access requires view access.')).max(200);
const schema = z.object({ username:z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/), displayName:z.string().trim().min(1).max(120), password:z.string().min(10).max(200), role:z.enum(['VIEWER','ADMIN','SUPERADMIN','USERADMIN']), companyAccess:accessSchema.default([]) });

export async function GET(request:Request) {
  const auth=await requireWebRole(request,['SUPERADMIN','USERADMIN']); if('response'in auth)return auth.response;
  const {rows}=await db.query(`select u.id,u.username,u.display_name,u.role,u.is_active,u.last_login_at,u.created_at,
    coalesce((select json_agg(json_build_object('companyName',a.company_name,'canView',a.can_view,'canEdit',a.can_edit) order by lower(a.company_name)) from web_user_company_access a where a.user_id=u.id),'[]'::json) company_access
    from web_users u order by u.is_active desc,u.role desc,lower(u.username)`);
  return NextResponse.json({users:rows});
}

export async function POST(request:Request) {
  const auth=await requireWebRole(request,['SUPERADMIN','USERADMIN']); if('response'in auth)return auth.response;
  try {
    const input=schema.parse(await request.json());
    if(auth.user.role==='USERADMIN' && ['SUPERADMIN','USERADMIN'].includes(input.role)) return NextResponse.json({error:'UserAdmins may create Viewer or Admin accounts only.'},{status:403});
    if(input.role==='VIEWER' && input.companyAccess.some(access=>access.canEdit)) return NextResponse.json({error:'Viewer accounts cannot have edit access.'},{status:400});
    const client=await db.connect();
    try {
      await client.query('begin');
      const valid=await client.query('select name from companies where is_active and name=any($1::text[])',[input.companyAccess.map(access=>access.companyName)]);
      if(valid.rows.length!==new Set(input.companyAccess.map(access=>access.companyName)).size) throw new Error('Choose active companies from the company list only.');
      const {rows}=await client.query(`insert into web_users(username,display_name,password_hash,role,created_by) values($1,$2,$3,$4,$5)
        returning id,username,display_name,role,is_active,last_login_at,created_at`,[input.username,input.displayName,hashPassword(input.password),input.role,auth.user.id]);
      for(const access of input.companyAccess) await client.query(`insert into web_user_company_access(user_id,company_name,can_view,can_edit) values($1,$2,$3,$4)`,[rows[0].id,access.companyName,access.canView,access.canEdit]);
      await logAudit({actor:webActor(auth.user),action:'WEB_USER_CREATED',entityType:'USER',entityId:rows[0].id,description:`${input.role} account ${input.username} created`,metadata:{role:input.role,companies:input.companyAccess.length},ipAddress:requestIp(request)},client);
      await client.query('commit'); return NextResponse.json({user:rows[0]},{status:201});
    } catch(error) { await client.query('rollback'); throw error; } finally { client.release(); }
  } catch(error) {
    if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message},{status:400});
    if(typeof error==='object'&&error&&'code'in error&&error.code==='23505')return NextResponse.json({error:'That username already exists.'},{status:409});
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to create user.'},{status:400});
  }
}
