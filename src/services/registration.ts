import { db } from '@/lib/database';
import { logAudit } from '@/services/audit';
export type ActivationInput = { code: string; chatId: string; chatTitle: string; chatType: 'group' | 'supergroup'; driver: { id: string | null; username?: string; firstName?: string; lastName?: string }; performedBy: string };
export async function activateRegistration(input: ActivationInput) {
  const { rows } = await db.query('select * from activate_unit_registration($1,$2,$3,$4,$5,$6,$7,$8,$9)', [input.code, input.chatId, input.chatTitle, input.chatType, input.driver.id, input.driver.username ?? null, input.driver.firstName ?? null, input.driver.lastName ?? null, input.performedBy]);
  const result=rows[0] as { unit_number: string };
  const registered=await db.query(`select u.id unit_id,r.driver_id from units u join unit_registrations r on r.unit_id=u.id and r.is_active where u.unit_number=$1`,[result.unit_number]);
  if(registered.rows[0]) { const actor={type:'TELEGRAM_USER' as const,id:input.performedBy,displayName:input.performedBy};
    await logAudit({actor,action:'UNIT_REGISTERED',entityType:'UNIT',entityId:registered.rows[0].unit_id,unitId:registered.rows[0].unit_id,driverId:registered.rows[0].driver_id,description:`Unit ${result.unit_number} registered to ${input.chatTitle}`});
    await logAudit({actor,action:'DRIVER_ASSIGNED',entityType:'ASSIGNMENT',unitId:registered.rows[0].unit_id,driverId:registered.rows[0].driver_id,description:`Driver assigned to Unit ${result.unit_number} during Telegram activation`});
  }
  return result;
}
