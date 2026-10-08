import { db } from '@/lib/database';

export async function getRepeatIssues(unitId?: string, weeks = 8, company?: string) {
  const { rows } = await db.query(`select d.unit_id, u.unit_number, u.company, d.category, count(*)::int as occurrences,
      min(d.detected_at) as first_occurrence, max(d.detected_at) as latest_occurrence,
      json_agg(json_build_object('id',d.id,'defect_number',d.defect_number) order by d.detected_at) as defects
    from defects d join units u on u.id=d.unit_id
    where d.detected_at >= now() - ($1::text || ' weeks')::interval and ($2::uuid is null or d.unit_id=$2)
      and ($3::text is null or u.company=$3)
    group by d.unit_id,u.unit_number,u.company,d.category having count(*) >= 2
    order by count(*) desc,max(d.detected_at) desc`, [String(weeks), unitId ?? null, company || null]);
  return rows;
}
