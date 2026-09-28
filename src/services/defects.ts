import { z } from 'zod';
import { db } from '@/lib/database';
import { defectCategories, defectSeverities, defectStatuses, formatDefectReference } from '@/lib/fleet-constants';
import { logAudit, type AuditActor } from '@/services/audit';

export const defectInputSchema = z.object({
  category: z.enum(defectCategories),
  description: z.string().trim().min(1).max(4000),
  severity: z.enum(defectSeverities),
});

export const defectUpdateSchema = z.object({
  severity: z.enum(defectSeverities), status: z.enum(defectStatuses),
  assignedTo: z.string().trim().max(160).nullable().optional(),
  resolutionNotes: z.string().trim().max(4000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === 'RESOLVED' && !value.resolutionNotes) context.addIssue({ code:'custom', path:['resolutionNotes'], message:'Resolution notes are required when resolving a defect.' });
});

export type DefectInput = z.infer<typeof defectInputSchema>;

export async function completePtiReview(input: {
  submissionId:string; decision:'approved'|'resend_requested'; note:string; reviewedBy:string;
  defects:DefectInput[]; actor:AuditActor; ipAddress?:string|null;
  beforeCommit?:(submission:Record<string,unknown>)=>Promise<void>;
  editReviewed?:boolean;
}) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`select s.*,u.unit_number,u.company from pti_submissions s
      join units u on u.id=s.unit_id where s.id=$1 for update`, [input.submissionId]);
    const submission = rows[0];
    if (!submission) throw new Error('PTI submission not found.');
    const editingApproved=submission.status==='approved'&&input.editReviewed;
    if (submission.status!=='pending_review' && !(submission.status==='resend_requested' && input.decision==='approved') && !editingApproved) throw new Error('This PTI submission is no longer awaiting this review action.');
    if(input.beforeCommit) await input.beforeCommit(submission);
    await client.query(`update pti_submissions set status=$2,review_note=nullif($3,''),reviewed_by=$4,reviewed_at=now(),
      resend_requested_at=case when $2='resend_requested' then now() else null end where id=$1`,
      [input.submissionId,input.decision,input.note,input.reviewedBy]);
    const created=[];
    for (const defect of input.defects) {
      const inserted = await client.query(`insert into defects
        (pti_submission_id,unit_id,driver_id,driver_name_snapshot,driver_username_snapshot,company_snapshot,category,description,severity,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`, [submission.id,submission.unit_id,submission.driver_id,
        submission.driver_name_snapshot,submission.driver_username_snapshot,submission.company,defect.category,defect.description,defect.severity,input.reviewedBy]);
      const item=inserted.rows[0]; created.push(item);
      await logAudit({actor:input.actor,action:'DEFECT_CREATED',entityType:'DEFECT',entityId:item.id,unitId:submission.unit_id,
        driverId:submission.driver_id,description:`${formatDefectReference(item.defect_number)} created for Unit ${submission.unit_number}`,
        metadata:{ptiId:submission.id,category:defect.category,severity:defect.severity},ipAddress:input.ipAddress},client);
    }
    const action=editingApproved?'PTI_REVIEW_UPDATED':input.decision==='approved'?'PTI_APPROVED':'PTI_RESEND_REQUESTED';
    await logAudit({actor:input.actor,action,entityType:'PTI',entityId:submission.id,unitId:submission.unit_id,
      driverId:submission.driver_id,description:`PTI-${String(submission.pti_number).padStart(6,'0')} ${input.decision==='approved'?'approved':'resend requested'}`,
      metadata:{note:input.note,defectCount:created.length},ipAddress:input.ipAddress},client);
    await client.query('commit');
    return { submission, defects:created };
  } catch(error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

export async function updateDefect(id:string, values:z.infer<typeof defectUpdateSchema>, actor:AuditActor, ipAddress?:string|null) {
  const client=await db.connect();
  try {
    await client.query('begin');
    const priorResult=await client.query('select * from defects where id=$1 for update',[id]);
    const prior=priorResult.rows[0]; if(!prior) throw new Error('Defect not found.');
    const resolving=values.status==='RESOLVED';
    const updated=await client.query(`update defects set severity=$2,status=$3,assigned_to=$4,resolution_notes=$5,
      resolved_at=case when $3='RESOLVED' then coalesce(resolved_at,now()) else null end,
      resolved_by=case when $3='RESOLVED' then coalesce(resolved_by,$6) else null end where id=$1 returning *`,
      [id,values.severity,values.status,values.assignedTo||null,values.resolutionNotes||null,actor.displayName||actor.id||'Admin']);
    if(prior.severity!==values.severity) await logAudit({actor,action:'DEFECT_SEVERITY_CHANGED',entityType:'DEFECT',entityId:id,
      unitId:prior.unit_id,driverId:prior.driver_id,description:`${formatDefectReference(prior.defect_number)} severity changed from ${prior.severity} to ${values.severity}`,
      metadata:{from:prior.severity,to:values.severity},ipAddress},client);
    if(prior.status!==values.status) await logAudit({actor,action:resolving?'DEFECT_RESOLVED':'DEFECT_STATUS_CHANGED',entityType:'DEFECT',entityId:id,
      unitId:prior.unit_id,driverId:prior.driver_id,description:`${formatDefectReference(prior.defect_number)} status changed from ${prior.status} to ${values.status}`,
      metadata:{from:prior.status,to:values.status},ipAddress},client);
    await client.query('commit'); return updated.rows[0];
  } catch(error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
