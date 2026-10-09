import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getCompliance } from '@/services/compliance';
import { getRepeatIssues } from '@/services/repeat-issues';
import { formatPtiReference } from '@/lib/pti-reference';
import { formatDefectReference } from '@/lib/fleet-constants';
import { currentWebUser } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';

export async function GET(request:Request,{params}:{params:Promise<{unitId:string}>}) {
  try {
    const auth=await currentWebUser(request);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
    const {unitId}=await params;
    if(!await canAccessUnit(auth.user.id,auth.user.role,unitId))return NextResponse.json({error:'Unit not found.'},{status:404});
    const [unit,assignments,ptis,defects,four,eight,repeats,exclusions]=await Promise.all([
      db.query(`select u.*,coalesce(json_agg(r order by r.registered_at desc) filter(where r.id is not null),'[]') unit_registrations from units u left join unit_registrations r on r.unit_id=u.id where u.id=$1 group by u.id`,[unitId]),
      db.query(`select a.* from driver_unit_assignments a where a.unit_id=$1 order by a.started_at desc nulls last`,[unitId]),
      db.query(`select s.*,(select count(*)::int from defects d where d.pti_submission_id=s.id) defect_count from pti_submissions s where s.unit_id=$1 order by s.created_at desc`,[unitId]),
      db.query(`select d.*,s.pti_number from defects d join pti_submissions s on s.id=d.pti_submission_id where d.unit_id=$1 order by d.created_at desc`,[unitId]),
      getCompliance(4,{unitId}),getCompliance(8,{unitId}),getRepeatIssues(unitId,8),
      db.query('select * from pti_compliance_exclusions where unit_id=$1 order by week_start desc',[unitId]),
    ]);
    if(!unit.rows[0])return NextResponse.json({error:'Unit not found.'},{status:404});
    return NextResponse.json({unit:unit.rows[0],assignments:assignments.rows,ptis:ptis.rows.map(x=>({...x,pti_reference:formatPtiReference(x.pti_number),archive_url:archiveUrl(String(x.archive_chat_id),x.archive_message_id)})),defects:defects.rows.map(x=>({...x,defect_reference:formatDefectReference(x.defect_number)})),compliance4:four,compliance8:eight,repeatIssues:repeats,exclusions:exclusions.rows});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load unit'},{status:500})}
}
function archiveUrl(chatId:string,messageId:string|number|null){return messageId&&chatId.startsWith('-100')?`https://t.me/c/${chatId.slice(4)}/${messageId}`:null}
