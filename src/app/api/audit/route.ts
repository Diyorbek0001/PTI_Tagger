import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { currentWebUser } from '@/services/web-users';
import { companyNamesForUser } from '@/services/company-access';

export async function GET(request:Request){try{
  const auth=await currentWebUser(request);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
  const allowed=auth.user.role==='SUPERADMIN'?undefined:await companyNamesForUser(auth.user.id,auth.user.role);
  const p=new URL(request.url).searchParams,q=p.get('search'),action=p.get('action'),type=p.get('entityType');
  const {rows}=await db.query(`select * from audit_logs where ($1::text is null or action=$1) and ($2::text is null or entity_type=$2)
    and ($3::text is null or description ilike '%'||$3||'%' or actor_display_name ilike '%'||$3||'%' or entity_id ilike '%'||$3||'%')
    and ($4::text[] is null or unit_id in (select id from units where company=any($4))) order by occurred_at desc limit 500`,[action||null,type||null,q||null,allowed??null]);
  return NextResponse.json({events:rows});
}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load audit log'},{status:500})}}
