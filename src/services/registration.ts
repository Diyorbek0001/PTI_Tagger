import { db } from '@/lib/database';
export type ActivationInput = { code: string; chatId: string; chatTitle: string; chatType: 'group' | 'supergroup'; driver: { id: string | null; username?: string; firstName?: string; lastName?: string }; performedBy: string };
export async function activateRegistration(input: ActivationInput) {
  const { rows } = await db.query('select * from activate_unit_registration($1,$2,$3,$4,$5,$6,$7,$8,$9)', [input.code, input.chatId, input.chatTitle, input.chatType, input.driver.id, input.driver.username ?? null, input.driver.firstName ?? null, input.driver.lastName ?? null, input.performedBy]);
  return rows[0] as { unit_number: string };
}
