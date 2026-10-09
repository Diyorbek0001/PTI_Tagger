import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { formatDefectReference } from '@/lib/fleet-constants';
import { getRepeatIssues } from '@/services/repeat-issues';
import { currentWebUser } from '@/services/web-users';
import { companyNamesForUser } from '@/services/company-access';

export async function GET(request:Request) {
  try {
    const auth=await currentWebUser(request);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
    const companies=await companyNamesForUser(auth.user.id,auth.user.role);
    const p=new URL(request.url).searchParams;
    const values=[p.get('status'),p.get('severity'),p.get('category'),p.get('company'),p.get('unitId'),p.get('driverId'),p.get('search')];
    const {rows}=await db.query(`select d.*,u.unit_number,s.pti_number,s.archive_chat_id::text,s.archive_message_id,
      coalesce(nullif(d.driver_name_snapshot,''),nullif('@'||d.driver_username_snapshot,'@'),'Unknown') driver_name
      from defects d join units u on u.id=d.unit_id join pti_submissions s on s.id=d.pti_submission_id
      where ($1::text is null or d.status=$1) and ($2::text is null or d.severity=$2) and ($3::text is null or d.category=$3)
      and ($4::text is null or d.company_snapshot=$4) and ($5::uuid is null or d.unit_id=$5) and ($6::uuid is null or d.driver_id=$6)
      and ($7::text is null or u.unit_number ilike '%'||$7||'%' or d.description ilike '%'||$7||'%' or ('DEF-'||lpad(d.defect_number::text,6,'0')) ilike '%'||$7||'%')
      and ($8::boolean or u.company=any($9::text[]))
      order by case d.severity when 'CRITICAL' then 1 when 'ATTENTION' then 2 else 3 end,d.created_at desc`,[...values.map(v=>v||null),auth.user.role==='SUPERADMIN',companies]);
    const repeats=await getRepeatIssues(undefined,8,undefined,companies); const repeatKeys=new Set(repeats.map(r=>`${r.unit_id}:${r.category}`));
    return NextResponse.json({defects:rows.map(row=>({...row,defect_reference:formatDefectReference(row.defect_number),repeat_issue:repeatKeys.has(`${row.unit_id}:${row.category}`)}))});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Unable to load defects'},{status:500}); }
}
