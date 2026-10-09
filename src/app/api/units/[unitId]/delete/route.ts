import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { logAudit, requestIp, webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';

const historyTables = [
  ['unit_registrations', 'unit_id'],
  ['registration_audit_log', 'unit_id'],
  ['pti_submissions', 'unit_id'],
  ['driver_unit_assignments', 'unit_id'],
  ['pti_compliance_exclusions', 'unit_id'],
  ['defects', 'unit_id'],
] as const;

export async function DELETE(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
  if ('response' in auth) return auth.response;

  const { unitId } = await params;
  if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403});
  const input = await request.json().catch(() => ({})) as { cascade?: unknown };
  const cascade = input.cascade === true;
  const client = await db.connect();
  try {
    await client.query('begin');
    const unitResult = await client.query<{ unit_number: string; registration_status: string }>(
      'select unit_number, registration_status from units where id=$1 for update',
      [unitId],
    );
    const unit = unitResult.rows[0];
    if (!unit) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Unit not found.' }, { status: 404 });
    }
    if (unit.registration_status === 'registered') {
      await client.query('rollback');
      return NextResponse.json({ error: 'Unregister this unit before deleting it.' }, { status: 409 });
    }

    const counts = await Promise.all(historyTables.map(async ([table, column]) => {
      const result = await client.query<{ count: string }>(`select count(*)::text as count from ${table} where ${column}=$1`, [unitId]);
      return { table, count: Number(result.rows[0]?.count || 0) };
    }));
    const history = counts.filter(item => item.count > 0);
    if (history.length && !cascade) {
      await client.query('rollback');
      return NextResponse.json({ error: `Unit ${unit.unit_number} has history. A second confirmation is required to delete it permanently.`, canCascade: true, history: history.map(item => item.table) }, { status: 409 });
    }

    // Authorization codes, reminder delivery rows, and (when explicitly
    // confirmed) the unit's historical records are removed transactionally.
    if (cascade) {
      await client.query('delete from defects where unit_id=$1', [unitId]);
      await client.query('update pti_submissions set resubmission_for_id=null where resubmission_for_id in (select id from pti_submissions where unit_id=$1)', [unitId]);
      await client.query('delete from pti_submissions where unit_id=$1', [unitId]);
      await client.query('delete from pti_notifications where unit_id=$1', [unitId]);
      await client.query('delete from driver_unit_assignments where unit_id=$1', [unitId]);
      await client.query('delete from pti_compliance_exclusions where unit_id=$1', [unitId]);
      await client.query('delete from registration_audit_log where unit_id=$1', [unitId]);
      await client.query('delete from unit_registrations where unit_id=$1', [unitId]);
    }
    await client.query('delete from unit_authorization_codes where unit_id=$1', [unitId]);
    await client.query('delete from pti_notifications where unit_id=$1', [unitId]);
    // Keep the central audit trail, but detach rows whose optional foreign
    // key points at this unit so deletion does not erase audit history.
    await client.query('update audit_logs set unit_id=null where unit_id=$1', [unitId]);
    await client.query('delete from units where id=$1', [unitId]);
    await logAudit({
      actor: webActor(auth.user),
      action: 'UNIT_DELETED',
      entityType: 'UNIT',
      entityId: unitId,
      description: `Unit ${unit.unit_number} deleted`,
      metadata: { unitNumber: unit.unit_number },
      ipAddress: requestIp(request),
    }, client);
    await client.query('commit');
    return NextResponse.json({ ok: true, unitNumber: unit.unit_number });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete unit.' }, { status: 400 });
  } finally {
    client.release();
  }
}
