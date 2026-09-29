import { db } from '@/lib/database';
import { logAudit } from '@/services/audit';

export type ReminderSettings = {
  message_template: string;
  media_type: 'photo' | 'video' | null;
  telegram_file_id: string | null;
  updated_by: string;
  updated_at: string | Date | null;
  auto_reminder_interval_days: number;
};

export const defaultReminderTemplate = `🔔 Weekly PTI reminder

@driver — Unit @unit still needs a PTI for this week.

Last PTI: @lastPTI
Last notified: @lastNotified

Please send a clear photo or video in this group, then reply directly to it with /pti.`;

export async function getReminderSettings(): Promise<ReminderSettings> {
  const { rows } = await db.query('select message_template, media_type, telegram_file_id, updated_by, updated_at, auto_reminder_interval_days from pti_reminder_settings where singleton=true');
  return rows[0] as ReminderSettings | undefined ?? {
    message_template: defaultReminderTemplate,
    media_type: null,
    telegram_file_id: null,
    updated_by: 'default',
    updated_at: null,
    auto_reminder_interval_days: 2,
  };
}

export async function setAutomaticReminderInterval(intervalDays: number, updatedBy: string) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 14) throw new Error('Automatic reminder interval must be between 1 and 14 days.');
  const current = await getReminderSettings();
  await db.query(`insert into pti_reminder_settings
    (singleton, message_template, media_type, telegram_file_id, updated_by, auto_reminder_interval_days)
    values (true,$1,$2,$3,$4,$5)
    on conflict (singleton) do update set auto_reminder_interval_days=excluded.auto_reminder_interval_days,
      updated_by=excluded.updated_by, updated_at=now()`, [current.message_template, current.media_type, current.telegram_file_id, updatedBy, intervalDays]);
  await logAudit({actor:{type:'WEB_USER',id:updatedBy,displayName:updatedBy},action:'AUTO_REMINDER_INTERVAL_UPDATED',entityType:'SETTINGS',entityId:'pti-reminder',description:`Automatic PTI reminder interval set to ${intervalDays} day(s)`,metadata:{intervalDays}});
}

export async function saveReminderSettings(input: { template: string; media?: { type: 'photo' | 'video'; fileId: string }; updatedBy: string }) {
  const template = input.template.trim();
  if (!template || template.length > 900) throw new Error('The reminder message must contain 1–900 characters.');
  const current = await getReminderSettings();
  const mediaType = input.media?.type ?? current.media_type;
  const fileId = input.media?.fileId ?? current.telegram_file_id;
  await db.query(`insert into pti_reminder_settings
    (singleton, message_template, media_type, telegram_file_id, updated_by)
    values (true,$1,$2,$3,$4)
    on conflict (singleton) do update set message_template=excluded.message_template,
      media_type=excluded.media_type, telegram_file_id=excluded.telegram_file_id,
      updated_by=excluded.updated_by, updated_at=now()`, [template, mediaType, fileId, input.updatedBy]);
  await logAudit({actor:{type:'TELEGRAM_USER',id:input.updatedBy,displayName:input.updatedBy},action:'REMINDER_SETTINGS_UPDATED',entityType:'SETTINGS',entityId:'pti-reminder',description:'PTI reminder template or attachment updated',metadata:{mediaType}});
}

export async function clearReminderMedia(updatedBy: string) {
  const current = await getReminderSettings();
  await db.query(`insert into pti_reminder_settings
    (singleton, message_template, media_type, telegram_file_id, updated_by)
    values (true,$1,null,null,$2)
    on conflict (singleton) do update set media_type=null, telegram_file_id=null,
      updated_by=excluded.updated_by, updated_at=now()`, [current.message_template, updatedBy]);
  await logAudit({actor:{type:'TELEGRAM_USER',id:updatedBy,displayName:updatedBy},action:'REMINDER_SETTINGS_UPDATED',entityType:'SETTINGS',entityId:'pti-reminder',description:'PTI reminder attachment removed'});
}
