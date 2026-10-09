import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { logAudit, requestIp, webActor } from '@/services/audit';
import { getCurrentPtiCycle } from '@/services/reminder-settings';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';

const schema = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reason: z.string().trim().min(1).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try {
    const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']); if ('response' in auth) return auth.response;
    const actor = webActor(auth.user), { unitId } = await params, input = schema.parse(await request.json());
    if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403});
    const cycleStart = input.weekStart ?? (await getCurrentPtiCycle()).start;
    const client = await db.connect();
    try {
      await client.query('begin');
      const reg = await client.query('select driver_id from unit_registrations where unit_id=$1 and is_active', [unitId]);
      const result = await client.query(`insert into pti_compliance_exclusions(unit_id,driver_id,week_start,reason,created_by)
        values($1,$2,$3,$4,$5) on conflict(unit_id,week_start) do update set reason=excluded.reason,created_by=excluded.created_by returning *`,
      [unitId,reg.rows[0]?.driver_id||null,cycleStart,input.reason,actor.displayName]);
      await logAudit({actor,action:'PTI_CYCLE_EXCUSED',entityType:'UNIT',entityId:unitId,unitId,driverId:reg.rows[0]?.driver_id,description:`PTI cycle starting ${cycleStart} excused`,metadata:{reason:input.reason},ipAddress:requestIp(request)},client);
      await client.query('commit'); return NextResponse.json({exclusion:result.rows[0]});
    } catch(error) { await client.query('rollback'); throw error; } finally { client.release(); }
  } catch(error) {
    if(error instanceof z.ZodError) return NextResponse.json({error:error.issues[0]?.message},{status:400});
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to excuse cycle'},{status:400});
  }
}
