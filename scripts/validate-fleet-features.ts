import { db } from '../src/lib/database';
import { completePtiReview } from '../src/services/defects';
import { reassignDriver } from '../src/services/assignments';
import { getDashboardData } from '../src/services/dashboard';
import { getWeeklyReport } from '../src/services/reporting';

async function main(){
const suffix=Date.now().toString();
let unitId:string|undefined,registrationId:string|undefined,firstDriverId:string|undefined,secondDriverId:string|undefined,ptiId:string|undefined;
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message)};
try{
  const unit=await db.query("insert into units(unit_number,company) values($1,'Validation') returning id",[`TEST-${suffix}`]);const createdUnitId=unit.rows[0].id as string;unitId=createdUnitId;
  const registration=await db.query(`insert into unit_registrations(unit_id,telegram_chat_id,telegram_chat_title,telegram_chat_type,driver_username,driver_first_name,registered_by_telegram_user_id)
    values($1,$2,'Validation Group','supergroup',$3,'Original',1) returning id,driver_id`,[createdUnitId,`-${suffix}`,`original_${suffix}`]);const createdRegistrationId=registration.rows[0].id as string;registrationId=createdRegistrationId;firstDriverId=registration.rows[0].driver_id;
  const pti=await db.query(`insert into pti_submissions(unit_id,registration_id,source_chat_id,source_chat_title,source_message_id,media_type,telegram_file_id,archive_chat_id,archive_message_id,status)
    values($1,$2,$3,'Validation Group',1,'photo','validation-file',-1000000000000,1,'pending_review') returning id,driver_id`,[createdUnitId,createdRegistrationId,`-${suffix}`]);const createdPtiId=pti.rows[0].id as string;ptiId=createdPtiId;assert(pti.rows[0].driver_id===firstDriverId,'PTI did not capture the original driver snapshot.');
  const reassigned=await reassignDriver({unitId:createdUnitId,username:`replacement_${suffix}`,firstName:'Replacement',reason:'Automated validation',actor:{type:'SYSTEM',id:'validation',displayName:'Validation'}});secondDriverId=reassigned.driverId;assert(secondDriverId!==firstDriverId,'Reassignment did not create a new driver.');
  const assignments=await db.query('select ended_at,driver_id from driver_unit_assignments where unit_id=$1 order by started_at',[createdUnitId]);assert(assignments.rows.length===2&&assignments.rows[0].ended_at&&assignments.rows[1].driver_id===secondDriverId,'Assignment history did not close and replace correctly.');
  const review=await completePtiReview({submissionId:createdPtiId,decision:'approved',note:'Validated',reviewedBy:'Validation',defects:[{category:'Tire',description:'Integration validation defect',severity:'CRITICAL'}],actor:{type:'SYSTEM',id:'validation',displayName:'Validation'}});assert(review.defects.length===1&&review.defects[0].driver_id===firstDriverId,'Defect did not retain the PTI driver context.');
  const audit=await db.query("select count(*)::int count from audit_logs where unit_id=$1 and action in ('DRIVER_REASSIGNED','PTI_APPROVED','DEFECT_CREATED')",[createdUnitId]);assert(audit.rows[0].count===3,'Expected audit events were not created.');
  const dashboard=await getDashboardData();assert(Number(dashboard.kpis.critical_defects)>=1,'Dashboard did not aggregate the critical defect.');
  const report=await getWeeklyReport();assert(report.critical.some(row=>row.unit_id===createdUnitId),'Weekly report did not include the critical defect.');
  console.info('Fleet integration validation passed: snapshots, reassignment, defects, review, and audit are connected.');
}finally{
  if(unitId){await db.query('delete from audit_logs where unit_id=$1',[unitId]);await db.query('delete from defects where unit_id=$1',[unitId]);await db.query('delete from pti_submissions where unit_id=$1',[unitId]);await db.query('delete from driver_unit_assignments where unit_id=$1',[unitId]);await db.query('delete from unit_registrations where unit_id=$1',[unitId]);await db.query('delete from units where id=$1',[unitId]);}
  if(firstDriverId||secondDriverId)await db.query('delete from drivers where id=any($1::uuid[])',[[firstDriverId,secondDriverId].filter(Boolean)]);
  await db.end();
}
}
main().catch(error=>{console.error(error);process.exitCode=1});
