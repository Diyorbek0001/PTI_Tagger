import { db } from '../src/lib/database';

const connectionString=process.env.DATABASE_URL||'postgresql://postgres:postgres@localhost:5432/pti_telegram';
const hostname=new URL(connectionString).hostname;
if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','::1'].includes(hostname)){
  throw new Error('Demo seeding is allowed only against local PostgreSQL.');
}

async function main(){
const client=await db.connect();
try{
  await client.query('begin');
  const demoUnits=await client.query("select id from units where unit_number like 'DEMO-%'");
  const unitIds=demoUnits.rows.map(row=>row.id);
  if(unitIds.length){
    await client.query('delete from audit_logs where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from defects where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from pti_notifications where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from pti_compliance_exclusions where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from pti_submissions where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from driver_unit_assignments where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from unit_authorization_codes where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from registration_audit_log where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from unit_registrations where unit_id=any($1::uuid[])',[unitIds]);
    await client.query('delete from units where id=any($1::uuid[])',[unitIds]);
  }
  await client.query("delete from drivers where telegram_username like 'demo_%'");

  const definitions=[
    ['DEMO-1001','Northstar Logistics','Ava','Martinez','demo_ava','Demo 1001'],
    ['DEMO-1002','Northstar Logistics','Marcus','Johnson','demo_marcus','Demo 1002'],
    ['DEMO-2001','Atlas Freight','Elena','Petrova','demo_elena','Demo 2001'],
    ['DEMO-2002','Atlas Freight','Noah','Williams','demo_noah','Inactive - Demo 2002'],
    ['DEMO-3001','BlueLine Transport','Sophia','Brown','demo_sophia','Hometime - Demo 3001'],
    ['DEMO-3002','BlueLine Transport',null,null,null,null],
  ] as const;
  const units=new Map<string,{id:string;registrationId?:string;driverId?:string;chatId?:string}>();
  for(let index=0;index<definitions.length;index++){
    const [number,company,first,last,username,title]=definitions[index];
    const unit=await client.query('insert into units(unit_number,company) values($1,$2) returning id',[number,company]);
    const item:{id:string;registrationId?:string;driverId?:string;chatId?:string}={id:unit.rows[0].id};units.set(number,item);
    if(username&&title){
      const chatId=String(-1009000000100-index);
      const registration=await client.query(`insert into unit_registrations
        (unit_id,telegram_chat_id,telegram_chat_title,telegram_chat_type,driver_telegram_user_id,driver_username,driver_first_name,driver_last_name,registered_at,registered_by_telegram_user_id)
        values($1,$2,$3,'supergroup',$4,$5,$6,$7,now()-interval '11 weeks',$4) returning id,driver_id`,
        [item.id,chatId,title,String(800000100+index),username,first,last]);
      item.registrationId=registration.rows[0].id;item.driverId=registration.rows[0].driver_id;item.chatId=chatId;
      await client.query("update units set registration_status='registered' where id=$1",[item.id]);
    }
  }

  const first=units.get('DEMO-1001')!;
  const previousDriver=await client.query(`insert into drivers(telegram_user_id,telegram_username,first_name,last_name,created_at)
    values(800000099,'demo_liam','Liam','Davis',now()-interval '20 weeks') returning id`);
  await client.query(`update driver_unit_assignments set started_at=now()-interval '6 weeks' where unit_id=$1 and ended_at is null`,[first.id]);
  await client.query(`insert into driver_unit_assignments(unit_id,driver_id,driver_telegram_user_id,driver_username,driver_first_name,driver_last_name,telegram_group_id,telegram_group_title,started_at,ended_at,reason,source,created_by)
    values($1,$2,800000099,'demo_liam','Liam','Davis',$3,'Demo 1001',now()-interval '11 weeks',now()-interval '6 weeks','Truck swap','MANUAL_REASSIGNMENT','Demo Admin')`,[first.id,previousDriver.rows[0].id,first.chatId]);

  let messageId=4100;
  const submissions:Array<{id:string;number:string;unit:string;week:number;status:string}>=[];
  const addPti=async(unitNumber:string,weeksAgo:number,status:string,note:string|null=null)=>{
    const unit=units.get(unitNumber)!;messageId++;
    const result=await client.query(`insert into pti_submissions
      (unit_id,registration_id,source_chat_id,source_chat_title,source_message_id,submitted_by_user_id,submitted_by_username,media_type,telegram_file_id,archive_chat_id,archive_message_id,status,review_note,reviewed_by,reviewed_at,compliance_week_start,created_at)
      values($1,$2,$3,$4,$5,900000001,'demo_dispatch','photo',$6,-1007777777777,$5,$7,$8,case when $7 in ('approved','resend_requested') then 'Demo Reviewer' end,case when $7 in ('approved','resend_requested') then now() end,(date_trunc('week',now() at time zone 'America/New_York')-($9::text||' weeks')::interval)::date,now()-($9::text||' weeks')::interval+interval '2 days') returning id,pti_number`,
      [unit.id,unit.registrationId,unit.chatId,definitions.find(value=>value[0]===unitNumber)?.[5],messageId,`demo-file-${messageId}`,status,note,String(weeksAgo)]);
    submissions.push({id:result.rows[0].id,number:result.rows[0].pti_number,unit:unitNumber,week:weeksAgo,status});
  };
  for(const week of [7,6,5,4,3,2,1,0])await addPti('DEMO-1001',week,week===2?'resend_requested':'approved',week===2?'Passenger-side tire needs a clearer angle.':'Inspection accepted.');
  for(const week of [7,6,4,3,1,0])await addPti('DEMO-1002',week,week===0?'pending_review':'approved');
  for(const week of [7,5,4,2,1,0])await addPti('DEMO-2001',week,week===1?'resend_requested':'approved',week===1?'Please resend with the rear lights visible.':null);

  const ptiFor=(unit:string,week:number)=>submissions.find(item=>item.unit===unit&&item.week===week)!;
  const defects=[
    ['DEMO-1001',1,'Tire','ATTENTION','OPEN','Driver-side trailer tire shows uneven wear.'],
    ['DEMO-1001',5,'Tire','MINOR','RESOLVED','Earlier tire tread wear noted.'],
    ['DEMO-1001',0,'Light','MINOR','OPEN','Rear marker light is intermittent.'],
    ['DEMO-1002',0,'Brake','CRITICAL','IN_REPAIR','Air brake hose appears damaged near coupling.'],
    ['DEMO-2001',1,'Light','ATTENTION','ASSIGNED','Passenger-side headlight is not working.'],
    ['DEMO-2001',4,'Fluid Leak','ATTENTION','RESOLVED','Small coolant leak observed below engine bay.'],
  ] as const;
  for(const [unitNumber,week,category,severity,status,description] of defects){
    const unit=units.get(unitNumber)!;const pti=ptiFor(unitNumber,week);
    await client.query(`insert into defects(pti_submission_id,unit_id,driver_id,driver_name_snapshot,driver_username_snapshot,company_snapshot,category,description,severity,status,detected_at,created_at,created_by,assigned_to,resolved_at,resolved_by,resolution_notes)
      select $1,$2,$3,concat_ws(' ',d.first_name,d.last_name),d.telegram_username,u.company,$4,$5,$6,$7,now()-($8::text||' weeks')::interval,now()-($8::text||' weeks')::interval,'Demo Reviewer',case when $7 in ('ASSIGNED','IN_REPAIR') then 'Demo Maintenance' end,case when $7='RESOLVED' then now()-interval '1 week' end,case when $7='RESOLVED' then 'Demo Mechanic' end,case when $7='RESOLVED' then 'Repair completed and verified.' end from units u left join drivers d on d.id=$3 where u.id=$2`,
      [pti.id,unit.id,unit.driverId,category,description,severity,status,String(week)]);
  }

  for(const number of ['DEMO-1001','DEMO-1002','DEMO-2001']){const unit=units.get(number)!;await client.query(`insert into pti_notifications(unit_id,registration_id,telegram_chat_id,telegram_message_id,notification_type,sent_by,sent_at) values($1,$2,$3,$4,'manual','Demo Admin',now()-interval '4 days')`,[unit.id,unit.registrationId,unit.chatId,++messageId]);}
  const excused=units.get('DEMO-3001')!;
  await client.query(`insert into pti_compliance_exclusions(unit_id,driver_id,week_start,reason,created_by) values($1,$2,date_trunc('week',now() at time zone 'America/New_York')::date,'Driver is on approved hometime','Demo Admin')`,[excused.id,excused.driverId]);

  const actions=[
    ['PTI_SUBMITTED','PTI','PTI media submitted from Demo 1002'],['PTI_APPROVED','PTI','PTI approved for Demo 1001'],
    ['PTI_RESEND_REQUESTED','PTI','PTI resend requested for Demo 2001'],['DRIVER_REASSIGNED','ASSIGNMENT','Liam Davis → Ava Martinez on Unit DEMO-1001'],
    ['REMINDER_SENT','REMINDER','Weekly PTI reminder sent to Unit DEMO-1002'],['DEFECT_CREATED','DEFECT','Critical Brake defect created for Unit DEMO-1002'],
  ] as const;
  let minutes=actions.length*7;
  for(const [action,entityType,description] of actions){const related=[...units.values()][minutes%3];await client.query(`insert into audit_logs(occurred_at,actor_type,actor_id,actor_display_name,action,entity_type,entity_id,unit_id,driver_id,description,metadata) values(now()-($1::text||' minutes')::interval,'WEB_USER','demo-admin','Demo Admin',$2,$3,gen_random_uuid()::text,$4,$5,$6,'{"demo":true}')`,[String(minutes),action,entityType,related.id,related.driverId||null,description]);minutes-=7;}

  await client.query('commit');
  console.info(`Demo data ready: ${definitions.length} units, ${submissions.length} PTIs, ${defects.length} defects, assignment history, reminders, exclusions, and audit activity.`);
}catch(error){await client.query('rollback');throw error}finally{client.release();await db.end()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
