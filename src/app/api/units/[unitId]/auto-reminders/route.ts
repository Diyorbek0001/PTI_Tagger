import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { logAudit, requestIp, webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try {
    const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
    if ('response' in auth) return auth.response;
    const { enabled } = schema.parse(await request.json());
    const { unitId } = await params;
    if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403});
    const { rows } = await db.query(`update units set auto_reminders_enabled=$1 where id=$2 and ($1=false or registration_status='registered') returning unit_number`, [enabled, unitId]);
    const unit = rows[0];
    if (!unit) return NextResponse.json({ error: 'Unit not found.' }, { status: 404 });
    await logAudit({ actor: webActor(auth.user), action: enabled ? 'AUTO_REMINDERS_ENABLED' : 'AUTO_REMINDERS_DISABLED', entityType: 'UNIT', entityId: unitId, unitId, description: `Automatic PTI reminders ${enabled ? 'enabled' : 'disabled'} for Unit ${unit.unit_number}`, ipAddress: requestIp(request) });
    return NextResponse.json({ ok: true, enabled });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update automatic reminders.' }, { status: 400 });
  }
}
