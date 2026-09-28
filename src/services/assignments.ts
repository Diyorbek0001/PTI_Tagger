import { db } from '@/lib/database';
import { logAudit, type AuditActor } from '@/services/audit';

export type ReassignInput = {
  unitId: string; telegramUserId?: string|null; username?: string|null; firstName?: string|null;
  lastName?: string|null; reason?: string|null; actor: AuditActor; ipAddress?: string|null;
};

export async function reassignDriver(input: ReassignInput) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`select r.*,u.unit_number,u.company from unit_registrations r
      join units u on u.id=r.unit_id where r.unit_id=$1 and r.is_active=true for update`, [input.unitId]);
    const current = rows[0];
    if (!current) throw new Error('This unit has no active Telegram registration.');
    const driver = await client.query(`select resolve_or_create_driver($1,$2,$3,$4) as id`, [
      input.telegramUserId || null, input.username?.replace(/^@/, '') || null,
      input.firstName || null, input.lastName || null,
    ]);
    const driverId = driver.rows[0].id as string;
    if(current.driver_id===driverId){await client.query('commit');return {driverId,name:[input.firstName,input.lastName].filter(Boolean).join(' ')||(input.username?`@${input.username.replace(/^@/,'')}`:'Unknown')};}
    const ended = await client.query(`update driver_unit_assignments set ended_at=now(),reason=coalesce($2,reason,'Driver changed')
      where unit_id=$1 and ended_at is null returning id`, [input.unitId, input.reason || null]);
    await client.query(`insert into driver_unit_assignments
      (unit_id,driver_id,registration_id,driver_telegram_user_id,driver_username,driver_first_name,driver_last_name,telegram_group_id,telegram_group_title,started_at,reason,source,created_by)
      values($1,$2,null,$3,$4,$5,$6,$7,$8,now(),$9,'MANUAL_REASSIGNMENT',$10)`, [
      input.unitId, driverId, input.telegramUserId || null, input.username?.replace(/^@/, '') || null,
      input.firstName || null, input.lastName || null, current.telegram_chat_id, current.telegram_chat_title,
      input.reason || null, input.actor.displayName || input.actor.id || 'website',
    ]);
    await client.query(`update unit_registrations set driver_id=$2,driver_telegram_user_id=$3,driver_username=$4,
      driver_first_name=$5,driver_last_name=$6 where id=$1`, [current.id, driverId, input.telegramUserId || null,
      input.username?.replace(/^@/, '') || null, input.firstName || null, input.lastName || null]);
    const oldName = [current.driver_first_name,current.driver_last_name].filter(Boolean).join(' ') || (current.driver_username ? `@${current.driver_username}` : 'Unknown');
    const newName = [input.firstName,input.lastName].filter(Boolean).join(' ') || (input.username ? `@${input.username.replace(/^@/,'')}` : 'Unknown');
    await logAudit({ actor:input.actor, action:'DRIVER_REASSIGNED', entityType:'ASSIGNMENT', entityId:ended.rows[0]?.id,
      unitId:input.unitId, driverId, description:`Unit ${current.unit_number}: ${oldName} → ${newName}`,
      metadata:{oldDriverId:current.driver_id,newDriverId:driverId,reason:input.reason || null}, ipAddress:input.ipAddress }, client);
    await client.query('commit');
    return { driverId, name:newName };
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
