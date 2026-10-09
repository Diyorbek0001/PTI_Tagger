import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { requireWebRole } from '@/services/web-users';
import { logAudit, requestIp, webActor } from '@/services/audit';

const schema=z.object({companyAccess:z.array(z.object({companyName:z.string().trim().min(1).max(120),canView:z.boolean(),canEdit:z.boolean()}).refine(item=>!item.canEdit||item.canView,'Edit access requires view access.')).max(200)});

export async function PATCH(request:Request,{params}:{params:Promise<{userId:string}>}){
  const auth=await requireWebRole(request,['SUPERADMIN','USERADMIN']);if('response'in auth)return auth.response;
  try{
    const {userId}=await params,input=schema.parse(await request.json());
    const user=await db.query<{role:string;username:string}>('select role,username from web_users where id=$1',[userId]);
    if(!user.rows[0])return NextResponse.json({error:'User not found.'},{status:404});
    if(auth.user.role==='USERADMIN'&&['SUPERADMIN','USERADMIN'].includes(user.rows[0].role))return NextResponse.json({error:'UserAdmins cannot change Superadmin or UserAdmin access.'},{status:403});
    if(user.rows[0].role==='VIEWER'&&input.companyAccess.some(access=>access.canEdit))return NextResponse.json({error:'Viewer accounts cannot have edit access.'},{status:400});
    const unique=new Set(input.companyAccess.map(access=>access.companyName));
    if(unique.size!==input.companyAccess.length)return NextResponse.json({error:'Each company can be assigned only once.'},{status:400});
    const client=await db.connect();
    try{
      await client.query('begin');
      const valid=await client.query('select name from companies where is_active and name=any($1::text[])',[input.companyAccess.map(access=>access.companyName)]);
      if(valid.rows.length!==unique.size)throw new Error('Choose active companies from the company list only.');
      await client.query('delete from web_user_company_access where user_id=$1',[userId]);
      for(const access of input.companyAccess)await client.query('insert into web_user_company_access(user_id,company_name,can_view,can_edit) values($1,$2,$3,$4)',[userId,access.companyName,access.canView,access.canEdit]);
      await logAudit({actor:webActor(auth.user),action:'WEB_USER_COMPANY_ACCESS_UPDATED',entityType:'USER',entityId:userId,description:`Company permissions updated for ${user.rows[0].username}`,metadata:{companies:input.companyAccess.length},ipAddress:requestIp(request)},client);
      await client.query('commit');return NextResponse.json({ok:true});
    }catch(error){await client.query('rollback');throw error}finally{client.release()}
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message},{status:400});return NextResponse.json({error:error instanceof Error?error.message:'Unable to update company access.'},{status:400})}
}
