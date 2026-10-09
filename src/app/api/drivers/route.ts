import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getDriverComplianceRows } from '@/services/compliance';
import { currentWebUser } from '@/services/web-users';
import { companyNamesForUser } from '@/services/company-access';

export async function GET(request:Request) { try {
  const auth=await currentWebUser(request);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});const allowed=auth.user.role==='SUPERADMIN'?undefined:await companyNamesForUser(auth.user.id,auth.user.role);
  const [four,eight,current]=await Promise.all([getDriverComplianceRows(4,undefined,allowed),getDriverComplianceRows(8,undefined,allowed),db.query(`select distinct on (a.driver_id) a.driver_id,a.unit_id,u.unit_number,u.company,a.telegram_group_title,a.started_at
    from driver_unit_assignments a join units u on u.id=a.unit_id where a.ended_at is null and ($1::text[] is null or u.company=any($1)) order by a.driver_id,a.started_at desc`,[allowed??null])]);
  const eightMap=new Map(eight.map(r=>[r.id,r])); const currentMap=new Map(current.rows.map(r=>[r.driver_id,r]));
  return NextResponse.json({drivers:four.map(r=>({...r,compliance_4_week:r.score,compliance_8_week:eightMap.get(r.id)?.score??null,current_assignment:currentMap.get(r.id)??null}))});
} catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load drivers'},{status:500});} }
