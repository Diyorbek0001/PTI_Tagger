import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getCompliance } from '@/services/compliance';
import { formatPtiReference } from '@/lib/pti-reference';
import { formatDefectReference } from '@/lib/fleet-constants';

export async function GET(_request:Request,{params}:{params:Promise<{driverId:string}>}) { try { const {driverId}=await params;
  const [driver,assignments,ptis,defects,four,eight]=await Promise.all([
    db.query('select * from drivers where id=$1',[driverId]),
    db.query(`select a.*,u.unit_number,u.company from driver_unit_assignments a join units u on u.id=a.unit_id where a.driver_id=$1 order by a.started_at desc nulls last`,[driverId]),
    db.query(`select s.*,u.unit_number,(select count(*)::int from defects d where d.pti_submission_id=s.id) defect_count from pti_submissions s join units u on u.id=s.unit_id where s.driver_id=$1 order by s.created_at desc`,[driverId]),
    db.query(`select d.*,u.unit_number,s.pti_number from defects d join units u on u.id=d.unit_id join pti_submissions s on s.id=d.pti_submission_id where d.driver_id=$1 order by d.created_at desc`,[driverId]),
    getCompliance(4,{driverId}),getCompliance(8,{driverId}),
  ]); if(!driver.rows[0])return NextResponse.json({error:'Driver not found.'},{status:404});
  return NextResponse.json({driver:driver.rows[0],assignments:assignments.rows,ptis:ptis.rows.map(r=>({...r,pti_reference:formatPtiReference(r.pti_number),archive_url:archiveUrl(String(r.archive_chat_id),r.archive_message_id)})),defects:defects.rows.map(r=>({...r,defect_reference:formatDefectReference(r.defect_number)})),compliance4:four,compliance8:eight});
} catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load driver'},{status:500});} }
function archiveUrl(chatId:string,messageId:string|number|null){return messageId&&chatId.startsWith('-100')?`https://t.me/c/${chatId.slice(4)}/${messageId}`:null}
