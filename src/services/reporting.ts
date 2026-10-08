import { db } from '@/lib/database';
import { getDriverComplianceRows } from '@/services/compliance';
import { getRepeatIssues } from '@/services/repeat-issues';
import { getCurrentPtiCycle } from '@/services/reminder-settings';
import { ptiCycleEnd } from '@/lib/date-ranges';

export async function getWeeklyReport(startDate?: string) {
  const cycle = await getCurrentPtiCycle();
  const start = startDate ?? cycle.start;
  return getRangeReport(start, startDate ? ptiCycleEnd(startDate, cycle.pti_cycle_days) : cycle.end);
}

export async function getRangeReport(startDate: string, endDate: string, company?: string) {
  const [counts, missing, defectBreakdown, critical, reassignments, reviews,repeatIssues,driverCompliance,companies] = await Promise.all([
    db.query(`select
      (select count(*)::int from units where registration_status='registered' and ($3::text is null or company=$3)) active_units,
      (select count(*)::int from pti_submissions s join units u on u.id=s.unit_id where s.created_at >= $1::date and s.created_at < ($2::date + 1) and s.status not in ('processing','failed') and ($3::text is null or u.company=$3)) submissions,
      (select count(*)::int from defects d join units u on u.id=d.unit_id where d.created_at >= $1::date and d.created_at < ($2::date + 1) and ($3::text is null or u.company=$3)) defects_opened,
      (select count(*)::int from defects d join units u on u.id=d.unit_id where d.resolved_at >= $1::date and d.resolved_at < ($2::date + 1) and ($3::text is null or u.company=$3)) defects_resolved,
      (select count(*)::int from defects d join units u on u.id=d.unit_id where d.severity='CRITICAL' and d.created_at >= $1::date and d.created_at < ($2::date + 1) and ($3::text is null or u.company=$3)) critical_defects`,[startDate,endDate,company||null]),
    db.query(`select u.id,u.unit_number,u.company,r.driver_id,r.driver_username,r.driver_first_name,r.driver_last_name,r.telegram_chat_title,
      (select max(created_at) from pti_submissions where unit_id=u.id and status not in ('processing','failed')) last_pti,
      (select max(sent_at) from pti_notifications where unit_id=u.id) last_notified
      from units u join unit_registrations r on r.unit_id=u.id and r.is_active
      where lower(r.telegram_chat_title) !~ '(inactive|hometime|terminated)' and ($3::text is null or u.company=$3)
      and not exists(select 1 from pti_submissions s where s.unit_id=u.id and s.created_at >= $1::date and s.created_at < ($2::date + 1) and s.status not in ('processing','failed'))
      order by u.unit_number`,[startDate,endDate,company||null]),
    db.query(`select d.status,d.severity,d.category,count(*)::int count from defects d join units u on u.id=d.unit_id where d.created_at >= $1::date and d.created_at < ($2::date + 1) and ($3::text is null or u.company=$3) group by d.status,d.severity,d.category`,[startDate,endDate,company||null]),
    db.query(`select d.*,u.unit_number,s.pti_number from defects d join units u on u.id=d.unit_id join pti_submissions s on s.id=d.pti_submission_id
      where d.severity='CRITICAL' and d.created_at >= $1::date and d.created_at < ($2::date + 1) and d.status not in ('RESOLVED','CANCELLED') and ($3::text is null or u.company=$3) order by d.created_at desc`,[startDate,endDate,company||null]),
    db.query(`select a.*,u.unit_number,u.company from driver_unit_assignments a join units u on u.id=a.unit_id
      where a.source='MANUAL_REASSIGNMENT' and a.created_at >= $1::date and a.created_at < ($2::date + 1) and ($3::text is null or u.company=$3) order by a.created_at desc`,[startDate,endDate,company||null]),
    db.query(`select count(*) filter(where status='approved')::int approved,count(*) filter(where status='resend_requested')::int resend_requested,
      count(*) filter(where s.status='pending_review')::int pending from pti_submissions s join units u on u.id=s.unit_id where s.created_at >= $1::date and s.created_at < ($2::date + 1) and ($3::text is null or u.company=$3)`,[startDate,endDate,company||null]),
    getRepeatIssues(undefined,8,company),getDriverComplianceRows(8,company),
    db.query('select distinct company from units where nullif(trim(company),\'\') is not null order by company'),
  ]);
  const summary = counts.rows[0];
  const expected = Number(summary.active_units);
  const submittedUnits = new Set<string>();
  const submissions = await db.query(`select distinct s.unit_id from pti_submissions s join units u on u.id=s.unit_id
    where s.created_at >= $1::date and s.created_at < ($2::date + 1) and s.status not in ('processing','failed') and ($3::text is null or u.company=$3)`,[startDate,endDate,company||null]);
  for (const row of submissions.rows) submittedUnits.add(row.unit_id);
  const compliance = { expected, submitted: submittedUnits.size, missing: Math.max(0,expected-submittedUnits.size), score: expected ? Math.round(submittedUnits.size/expected*1000)/10 : null };
  return {startDate,endDate,selectedCompany:company||'',companies:companies.rows.map(row=>row.company),compliance,summary,missing:missing.rows,defectBreakdown:defectBreakdown.rows,
    critical:critical.rows,reassignments:reassignments.rows,reviews:reviews.rows[0],repeatIssues,
    lowCompliance:driverCompliance.filter(row=>Number(row.expected)>0&&Number(row.score)<80)};
}

export function reportCsv(report:Awaited<ReturnType<typeof getRangeReport>>) {
  const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
  const lines=[['Section','Unit','Driver','Company','Status','Detail'],
    ...report.missing.map(row=>['Missing PTI',row.unit_number,[row.driver_first_name,row.driver_last_name].filter(Boolean).join(' ')||row.driver_username,row.company,'MISSING',row.telegram_chat_title]),
    ...report.critical.map(row=>['Critical Defect',row.unit_number,row.driver_name_snapshot,row.company_snapshot,row.status,`${row.category}: ${row.description}`]),
    ...report.reassignments.map(row=>['Reassignment',row.unit_number,[row.driver_first_name,row.driver_last_name].filter(Boolean).join(' ')||row.driver_username,row.company,row.source,row.reason]),
  ];
  return lines.map(row=>row.map(quote).join(',')).join('\n');
}
