import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { defectUpdateSchema, updateDefect } from '@/services/defects';
import { formatDefectReference } from '@/lib/fleet-constants';
import { getRepeatIssues } from '@/services/repeat-issues';
import { requestIp, webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';

export async function GET(_request:Request,{params}:{params:Promise<{defectId:string}>}) {
  try { const {defectId}=await params; const {rows}=await db.query(`select d.*,u.unit_number,s.pti_number,s.archive_chat_id::text,s.archive_message_id
    from defects d join units u on u.id=d.unit_id join pti_submissions s on s.id=d.pti_submission_id where d.id=$1`,[defectId]);
    if(!rows[0]) return NextResponse.json({error:'Defect not found.'},{status:404});
    const [timeline,repeats]=await Promise.all([db.query(`select * from audit_logs where entity_type='DEFECT' and entity_id=$1 order by occurred_at desc`,[defectId]),getRepeatIssues(rows[0].unit_id,8)]);
    return NextResponse.json({defect:{...rows[0],defect_reference:formatDefectReference(rows[0].defect_number)},timeline:timeline.rows,repeatIssues:repeats.filter(r=>r.category===rows[0].category)});
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load defect'},{status:500});}
}

export async function PATCH(request:Request,{params}:{params:Promise<{defectId:string}>}) {
  try { const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;const {defectId}=await params; const input=defectUpdateSchema.parse(await request.json());
    return NextResponse.json({defect:await updateDefect(defectId,input,webActor(auth.user),requestIp(request))});
  } catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message},{status:400});return NextResponse.json({error:error instanceof Error?error.message:'Unable to update defect'},{status:400});}
}
