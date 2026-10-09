import { db } from '@/lib/database';
import { getCompliance } from '@/services/compliance';
import { getRepeatIssues } from '@/services/repeat-issues';
import { getCurrentPtiCycle } from '@/services/reminder-settings';
import { cycleAgoStart, dateOnly } from '@/lib/date-ranges';

export async function getDashboardData(allowedCompanies?:string[]) {
  const cycle=await getCurrentPtiCycle();
  const week=cycle.start;
  const trendStart=cycleAgoStart(8,cycle.pti_cycle_days,dateOnly(cycle.pti_cycle_anchor_date));
  const [counts, categories, recent, repeatIssues, compliance, trend] = await Promise.all([
    db.query(`select
      count(*)::int total_units,count(*) filter(where registration_status='registered')::int registered_units,
      count(*) filter(where registration_status='not_registered')::int unregistered_units,
      (select count(*)::int from unit_registrations r join units ru on ru.id=r.unit_id where r.is_active and lower(r.telegram_chat_title) ~ '(inactive|hometime|terminated)' and ($2::text[] is null or ru.company=any($2))) excluded_units,
      (select count(distinct s.unit_id)::int from pti_submissions s join units su on su.id=s.unit_id where s.compliance_week_start=$1 and s.status not in ('processing','failed') and ($2::text[] is null or su.company=any($2))) pti_sent,
      (select count(*)::int from pti_submissions s join units su on su.id=s.unit_id where s.status='pending_review' and ($2::text[] is null or su.company=any($2))) pending_review,
      (select count(*)::int from pti_submissions s join units su on su.id=s.unit_id where s.status='resend_requested' and ($2::text[] is null or su.company=any($2))) resend_required,
      (select count(*)::int from defects d join units du on du.id=d.unit_id where d.status not in ('RESOLVED','CANCELLED') and ($2::text[] is null or du.company=any($2))) open_defects,
      (select count(*)::int from defects d join units du on du.id=d.unit_id where d.severity='CRITICAL' and d.status not in ('RESOLVED','CANCELLED') and ($2::text[] is null or du.company=any($2))) critical_defects
      from units u where ($2::text[] is null or u.company=any($2))`,[week,allowedCompanies??null]),
    db.query(`select d.category,count(*)::int count from defects d join units u on u.id=d.unit_id where d.status not in ('RESOLVED','CANCELLED') and ($1::text[] is null or u.company=any($1)) group by d.category order by count desc,d.category`,[allowedCompanies??null]),
    db.query(`select * from audit_logs where ($1::text[] is null or unit_id in (select id from units where company=any($1))) order by occurred_at desc limit 12`,[allowedCompanies??null]),
    getRepeatIssues(undefined,8,undefined,allowedCompanies), getCompliance(4,{allowedCompanies}),
    db.query(`select w::date week_start,
      count(distinct a.unit_id)::int expected,
      count(distinct s.unit_id)::int submitted
      from generate_series($1::date,$2::date,($4::text || ' days')::interval) w
      left join driver_unit_assignments a on (a.started_at is null or a.started_at < ((w+($4::int*interval '1 day')) at time zone $3)) and (a.ended_at is null or a.ended_at >= (w at time zone $3))
      left join units u on u.id=a.unit_id and ($5::text[] is null or u.company=any($5))
      left join pti_submissions s on s.unit_id=a.unit_id and s.compliance_week_start=w::date and s.status not in ('processing','failed')
      where a.unit_id is null or u.id is not null
      group by w order by w`,[trendStart,week,process.env.PTI_TIME_ZONE||'America/New_York',cycle.pti_cycle_days,allowedCompanies??null]),
  ]);
  const kpis=counts.rows[0];
  return { currentCycle:{start:cycle.start,end:cycle.end,days:cycle.pti_cycle_days}, kpis:{...kpis,pti_missing:Math.max(0,kpis.registered_units-kpis.pti_sent-kpis.excluded_units)}, categories:categories.rows,
    recent:recent.rows, repeatIssues, compliance, trend:trend.rows.map(row=>({...row,score:row.expected?Math.round(row.submitted/row.expected*1000)/10:null})) };
}
