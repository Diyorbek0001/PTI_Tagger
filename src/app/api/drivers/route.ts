import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getDriverComplianceRows } from '@/services/compliance';

export async function GET() { try {
  const [four,eight,current]=await Promise.all([getDriverComplianceRows(4),getDriverComplianceRows(8),db.query(`select distinct on (a.driver_id) a.driver_id,a.unit_id,u.unit_number,u.company,a.telegram_group_title,a.started_at
    from driver_unit_assignments a join units u on u.id=a.unit_id where a.ended_at is null order by a.driver_id,a.started_at desc`)]);
  const eightMap=new Map(eight.map(r=>[r.id,r])); const currentMap=new Map(current.rows.map(r=>[r.driver_id,r]));
  return NextResponse.json({drivers:four.map(r=>({...r,compliance_4_week:r.score,compliance_8_week:eightMap.get(r.id)?.score??null,current_assignment:currentMap.get(r.id)??null}))});
} catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load drivers'},{status:500});} }
