import { db } from '@/lib/database';
import { endOfWeekDate, ptiTimeZone, weeksAgoStart } from '@/lib/date-ranges';

export type ComplianceSummary = {
  expected: number; submitted: number; onTime: number; late: number; missing: number;
  excused: number; resends: number; approved: number; score: number|null; availableWeeks: number;
};

export function calculateCompliance(input: Omit<ComplianceSummary, 'score'|'submitted'|'availableWeeks'> & { availableWeeks?: number }): ComplianceSummary {
  const denominator = input.onTime + input.late + input.missing;
  return {
    ...input,
    submitted: input.onTime + input.late,
    availableWeeks: input.availableWeeks ?? denominator + input.excused,
    score: denominator ? Math.round(((input.onTime * 100 + input.late * 70) / denominator) * 10) / 10 : null,
  };
}

export type ComplianceScope = { unitId?: string; driverId?: string; company?: string };

export async function getCompliance(weeks = 4, scope: ComplianceScope = {}) {
  const start = weeksAgoStart(weeks);
  const end = endOfWeekDate(weeksAgoStart(1));
  return getComplianceRange(start, end, scope);
}

export async function getComplianceRange(start: string, end: string, scope: ComplianceScope = {}) {
  const timezone = ptiTimeZone();
  const { rows } = await db.query(`with week_series as (
      select generate_series($1::date, $2::date, interval '1 week')::date as week_start
    ), expected_all as (
      select distinct on (a.unit_id,w.week_start) a.unit_id,
        coalesce((select s.driver_id from pti_submissions s where s.unit_id=a.unit_id and s.compliance_week_start=w.week_start and s.status not in ('processing','failed') order by s.created_at limit 1),a.driver_id) driver_id,
        w.week_start,
        exists(select 1 from pti_compliance_exclusions e where e.unit_id=a.unit_id and e.week_start=w.week_start) as excused
      from driver_unit_assignments a
      join units u on u.id=a.unit_id
      join week_series w on (a.started_at is null or a.started_at < ((w.week_start + 7)::timestamp at time zone $3))
        and (a.ended_at is null or a.ended_at >= (w.week_start::timestamp at time zone $3))
      where ($4::uuid is null or a.unit_id=$4)
        and ($6::text is null or u.company=$6)
        and lower(coalesce(a.telegram_group_title,'')) !~ '(inactive|hometime|terminated)'
      order by a.unit_id,w.week_start,a.started_at desc nulls last,a.created_at desc
    ), expected as (
      select * from expected_all where ($5::uuid is null or driver_id=$5)
    ), classified as (
      select e.*, case when e.excused then 'EXCUSED'
        when exists(select 1 from pti_submissions s where s.unit_id=e.unit_id
          and ($5::uuid is null or s.driver_id=e.driver_id)
          and s.compliance_week_start=e.week_start and s.status not in ('processing','failed')) then 'ON_TIME'
        else 'MISSING' end as classification
      from expected e
    ) select
      count(*)::int as available_weeks,
      count(*) filter(where classification<>'EXCUSED')::int as expected,
      count(*) filter(where classification='ON_TIME')::int as on_time,
      0::int as late,
      count(*) filter(where classification='MISSING')::int as missing,
      count(*) filter(where classification='EXCUSED')::int as excused,
      (select count(*)::int from pti_submissions s join units u on u.id=s.unit_id
        where s.compliance_week_start between $1 and $2 and s.status in ('resend_requested','resubmitted')
        and ($4::uuid is null or s.unit_id=$4) and ($5::uuid is null or s.driver_id=$5)
        and ($6::text is null or u.company=$6)) as resends,
      (select count(*)::int from pti_submissions s join units u on u.id=s.unit_id
        where s.compliance_week_start between $1 and $2 and s.status='approved'
        and ($4::uuid is null or s.unit_id=$4) and ($5::uuid is null or s.driver_id=$5)
        and ($6::text is null or u.company=$6)) as approved
    from classified`, [start, end, timezone, scope.unitId ?? null, scope.driverId ?? null, scope.company ?? null]);
  const row = rows[0];
  return calculateCompliance({ expected: row.expected, onTime: row.on_time, late: row.late, missing: row.missing, excused: row.excused, resends: row.resends, approved: row.approved, availableWeeks: row.available_weeks });
}

export async function getDriverComplianceRows(weeks:number) {
  const start=weeksAgoStart(weeks), end=endOfWeekDate(weeksAgoStart(1)), timezone=ptiTimeZone();
  const {rows}=await db.query(`with weeks as (select generate_series($1::date,$2::date,interval '1 week')::date week_start),
    expected as (select distinct on (a.unit_id,w.week_start)
      coalesce((select s.driver_id from pti_submissions s where s.unit_id=a.unit_id and s.compliance_week_start=w.week_start and s.status not in ('processing','failed') order by s.created_at limit 1),a.driver_id) driver_id,
      a.unit_id,w.week_start from driver_unit_assignments a join weeks w
      on (a.started_at is null or a.started_at < ((w.week_start+7)::timestamp at time zone $3))
      and (a.ended_at is null or a.ended_at >= (w.week_start::timestamp at time zone $3))
      where a.driver_id is not null and lower(coalesce(a.telegram_group_title,'')) !~ '(inactive|hometime|terminated)'
      order by a.unit_id,w.week_start,a.started_at desc nulls last,a.created_at desc),
    scored as (select e.*,exists(select 1 from pti_submissions s where s.unit_id=e.unit_id and s.driver_id=e.driver_id
      and s.compliance_week_start=e.week_start and s.status not in ('processing','failed')) submitted,
      exists(select 1 from pti_compliance_exclusions x where x.unit_id=e.unit_id and x.week_start=e.week_start) excused from expected e)
    select d.id,d.telegram_user_id::text,d.telegram_username,d.first_name,d.last_name,
      count(s.*) filter(where not s.excused)::int expected,count(s.*) filter(where s.submitted and not s.excused)::int on_time,
      count(s.*) filter(where not s.submitted and not s.excused)::int missing,count(s.*) filter(where s.excused)::int excused,
      case when count(s.*) filter(where not s.excused)>0 then round(100.0*count(s.*) filter(where s.submitted and not s.excused)/count(s.*) filter(where not s.excused),1) end score,
      (select count(*)::int from pti_submissions p where p.driver_id=d.id and p.compliance_week_start between $1 and $2 and p.status in ('resend_requested','resubmitted')) resends,
      (select count(*)::int from defects f where f.driver_id=d.id and f.status not in ('RESOLVED','CANCELLED')) open_defects,
      (select count(*)::int from defects f where f.driver_id=d.id and f.severity='CRITICAL' and f.status not in ('RESOLVED','CANCELLED')) critical_defects
    from drivers d left join scored s on s.driver_id=d.id group by d.id order by score asc nulls last,d.last_name,d.first_name`,[start,end,timezone]);
  return rows;
}
