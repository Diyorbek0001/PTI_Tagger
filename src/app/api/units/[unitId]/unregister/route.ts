import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { logAudit,requestIp,webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';
export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try { const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;const actor=webActor(auth.user);const { unitId } = await params;if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403}); const client=await db.connect(); try{await client.query('begin');const info=await client.query(`select u.unit_number,r.driver_id from units u left join unit_registrations r on r.unit_id=u.id and r.is_active where u.id=$1`,[unitId]);await client.query('select unregister_unit($1,$2)', [unitId, actor.displayName]);await logAudit({actor,action:'UNIT_UNREGISTERED',entityType:'UNIT',entityId:unitId,unitId,driverId:info.rows[0]?.driver_id,description:`Unit ${info.rows[0]?.unit_number??unitId} unregistered`,ipAddress:requestIp(request)},client);await logAudit({actor,action:'DRIVER_UNASSIGNED',entityType:'ASSIGNMENT',unitId,driverId:info.rows[0]?.driver_id,description:`Driver assignment closed for Unit ${info.rows[0]?.unit_number??unitId}`,ipAddress:requestIp(request)},client);await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to unregister' }, { status: 400 }); }
}
