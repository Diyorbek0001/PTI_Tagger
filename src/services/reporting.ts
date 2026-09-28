import { db } from '@/lib/database';
import { getComplianceRange, getDriverComplianceRows } from '@/services/compliance';
import { getRepeatIssues } from '@/services/repeat-issues';
import { endOfWeekDate, startOfMondayWeek } from '@/lib/date-ranges';

export async function getWeeklyReport(weekStart=startOfMondayWeek()) {
  const weekEnd=endOfWeekDate(weekStart);
  const [compliance,summary,missing,defects,critical,reassignments,reviews,repeatIssues,driverCompliance]=await Promise.all([
    getComplianceRange(weekStart,weekEnd),
    db.query(`select count(*) filter(where registration_status='registered')::int active_units,
      (select count(*)::int from pti_submissions where compliance_week_start=$1 and status not in ('processing','failed')) submissions,
      (select count(*)::int from defects where created_at >= $1::date and created_at < ($1::date+7)) defects_opened,
      (select count(*)::int from defects where resolved_at >= $1::date and resolved_at < ($1::date+7)) defects_resolved,
      (select count(*)::int from defects where severity='CRITICAL' and created_at >= $1::date and created_at < ($1::date+7)) critical_defects
      from units`,[weekStart]),
    db.query(`select u.id,u.unit_number,u.company,r.driver_id,r.driver_username,r.driver_first_name,r.driver_last_name,r.telegram_chat_title,
      (select max(created_at) from pti_submissions where unit_id=u.id and status not in ('processing','failed')) last_pti,
      (select max(sent_at) from pti_notifications where unit_id=u.id) last_notified
      from units u join unit_registrations r on r.unit_id=u.id and r.is_active
      where lower(r.telegram_chat_title) !~ '(inactive|hometime|terminated)'
      and not exists(select 1 from pti_submissions s where s.unit_id=u.id and s.compliance_week_start=$1 and s.status not in ('processing','failed'))
      order by u.unit_number`,[weekStart]),
    db.query(`select status,severity,category,count(*)::int count from defects where created_at < ($1::date+7) group by status,severity,category`,[weekStart]),
    db.query(`select d.*,u.unit_number,s.pti_number from defects d join units u on u.id=d.unit_id join pti_submissions s on s.id=d.pti_submission_id
      where d.severity='CRITICAL' and d.created_at < ($1::date+7) and d.status not in ('RESOLVED','CANCELLED') order by d.created_at desc`,[weekStart]),
    db.query(`select a.*,u.unit_number,u.company from driver_unit_assignments a join units u on u.id=a.unit_id
      where a.source='MANUAL_REASSIGNMENT' and a.created_at >= $1::date and a.created_at < ($1::date+7) order by a.created_at desc`,[weekStart]),
    db.query(`select count(*) filter(where status='approved')::int approved,count(*) filter(where status='resend_requested')::int resend_requested,
      count(*) filter(where status='pending_review')::int pending from pti_submissions where created_at >= $1::date and created_at < ($1::date+7)`,[weekStart]),
    getRepeatIssues(undefined,8),getDriverComplianceRows(8),
  ]);
  return {weekStart,weekEnd,compliance,summary:summary.rows[0],missing:missing.rows,defectBreakdown:defects.rows,
    critical:critical.rows,reassignments:reassignments.rows,reviews:reviews.rows[0],repeatIssues,
    lowCompliance:driverCompliance.filter(row=>Number(row.expected)>0&&Number(row.score)<80)};
}

export function reportCsv(report:Awaited<ReturnType<typeof getWeeklyReport>>) {
  const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
  const lines=[['Section','Unit','Driver','Company','Status','Detail'],
    ...report.missing.map(row=>['Missing PTI',row.unit_number,[row.driver_first_name,row.driver_last_name].filter(Boolean).join(' ')||row.driver_username,row.company,'MISSING',row.telegram_chat_title]),
    ...report.critical.map(row=>['Critical Defect',row.unit_number,row.driver_name_snapshot,row.company_snapshot,row.status,`${row.category}: ${row.description}`]),
    ...report.reassignments.map(row=>['Reassignment',row.unit_number,[row.driver_first_name,row.driver_last_name].filter(Boolean).join(' ')||row.driver_username,row.company,row.source,row.reason]),
  ];
  return lines.map(row=>row.map(quote).join(',')).join('\n');
}
