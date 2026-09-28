import { db } from '@/lib/database';
import { getCompliance } from '@/services/compliance';
import { getRepeatIssues } from '@/services/repeat-issues';
import { startOfMondayWeek } from '@/lib/date-ranges';

export async function getDashboardData() {
  const week=startOfMondayWeek();
  const [counts, categories, recent, repeatIssues, compliance, trend] = await Promise.all([
    db.query(`select
      count(*)::int total_units,count(*) filter(where registration_status='registered')::int registered_units,
      count(*) filter(where registration_status='not_registered')::int unregistered_units,
      (select count(*)::int from unit_registrations r where r.is_active and lower(r.telegram_chat_title) ~ '(inactive|hometime|terminated)') excluded_units,
      (select count(distinct unit_id)::int from pti_submissions where compliance_week_start=$1 and status not in ('processing','failed')) pti_sent,
      (select count(*)::int from pti_submissions where status='pending_review') pending_review,
      (select count(*)::int from pti_submissions where status='resend_requested') resend_required,
      (select count(*)::int from defects where status not in ('RESOLVED','CANCELLED')) open_defects,
      (select count(*)::int from defects where severity='CRITICAL' and status not in ('RESOLVED','CANCELLED')) critical_defects
      from units`,[week]),
    db.query(`select category,count(*)::int count from defects where status not in ('RESOLVED','CANCELLED') group by category order by count desc,category`),
    db.query(`select * from audit_logs order by occurred_at desc limit 12`),
    getRepeatIssues(undefined,8), getCompliance(4),
    db.query(`select w::date week_start,
      count(distinct a.unit_id)::int expected,
      count(distinct s.unit_id)::int submitted
      from generate_series(($1::date-interval '7 weeks')::date,$1::date,interval '1 week') w
      left join driver_unit_assignments a on (a.started_at is null or a.started_at < ((w+interval '7 days') at time zone $2)) and (a.ended_at is null or a.ended_at >= (w at time zone $2))
      left join pti_submissions s on s.unit_id=a.unit_id and s.compliance_week_start=w::date and s.status not in ('processing','failed')
      group by w order by w`,[week,process.env.PTI_TIME_ZONE||'America/New_York']),
  ]);
  const kpis=counts.rows[0];
  return { kpis:{...kpis,pti_missing:Math.max(0,kpis.registered_units-kpis.pti_sent-kpis.excluded_units)}, categories:categories.rows,
    recent:recent.rows, repeatIssues, compliance, trend:trend.rows.map(row=>({...row,score:row.expected?Math.round(row.submitted/row.expected*1000)/10:null})) };
}
