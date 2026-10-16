import { db } from '@/lib/database';
import { logAudit } from '@/services/audit';
import { ptiCycleStart, ptiCycleEnd, todayInTimeZone, dateOnly } from '@/lib/date-ranges';

export type ReminderSettings = {
  company_name: string;
  message_template: string;
  media_type: 'photo' | 'video' | null;
  telegram_file_id: string | null;
  updated_by: string;
  updated_at: string | Date | null;
  auto_reminder_time: string;
  pti_cycle_days: number;
  pti_cycle_anchor_date: string | Date;
};

export const defaultReminderTemplate = `🔔 PTI cycle reminder

@driver — Unit @unit still needs a PTI for the current cycle.
Cycle length: @cycledays day(s)

Last PTI: @lastPTI
Last notified: @lastNotified

Please send a clear photo or video in this group, then reply directly to it with /pti.`;

export async function getReminderSettings(company?: string): Promise<ReminderSettings> {
  const { rows } = await db.query('select company_name, message_template, media_type, telegram_file_id, updated_by, updated_at, auto_reminder_time, pti_cycle_days, pti_cycle_anchor_date from pti_reminder_settings where company_name=coalesce($1, (select name from companies where is_active order by name limit 1))', [company ?? null]);
  return rows[0] as ReminderSettings | undefined ?? {
    company_name: company ?? '', message_template: defaultReminderTemplate,
    media_type: null,
    telegram_file_id: null,
    updated_by: 'default',
    updated_at: null,
    auto_reminder_time: '09:00:00',
    pti_cycle_days: 7,
    pti_cycle_anchor_date: '2026-10-05',
  };
}

export async function getCurrentPtiCycle(company?: string) {
  const settings = await getReminderSettings(company);
  const start = ptiCycleStart(todayInTimeZone(), settings.pti_cycle_days, dateOnly(settings.pti_cycle_anchor_date));
  return { start, end: ptiCycleEnd(start, settings.pti_cycle_days), ...settings };
}

export async function setOperationalSettings(input: { company: string; ptiCycleDays?: number; ptiCycleAnchorDate?: string; reminderTime?: string }, updatedBy: string) {
  if (input.ptiCycleDays !== undefined && (!Number.isInteger(input.ptiCycleDays) || input.ptiCycleDays < 1 || input.ptiCycleDays > 31)) throw new Error('PTI cycle must be between 1 and 31 days.');
  if (input.reminderTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)) throw new Error('Choose a valid reminder time.');
  if (input.ptiCycleAnchorDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(input.ptiCycleAnchorDate) || new Date(`${input.ptiCycleAnchorDate}T00:00:00Z`).toISOString().slice(0,10) !== input.ptiCycleAnchorDate)) throw new Error('Choose a valid PTI cycle start date.');
  const current = await getReminderSettings(input.company);
  const ptiCycleDays = input.ptiCycleDays ?? current.pti_cycle_days;
  const ptiCycleAnchorDate = input.ptiCycleAnchorDate ?? dateOnly(current.pti_cycle_anchor_date);
  const reminderTime = input.reminderTime ?? current.auto_reminder_time.slice(0, 5);
  await db.query(`insert into pti_reminder_settings
    (company_name,message_template,media_type,telegram_file_id,updated_by,auto_reminder_time,pti_cycle_days,pti_cycle_anchor_date)
    values($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict(company_name) do update set auto_reminder_time=excluded.auto_reminder_time,
    pti_cycle_days=excluded.pti_cycle_days,pti_cycle_anchor_date=excluded.pti_cycle_anchor_date,updated_by=excluded.updated_by,updated_at=now()`,
  [input.company,current.message_template,current.media_type,current.telegram_file_id,updatedBy,reminderTime,ptiCycleDays,ptiCycleAnchorDate]);
  await logAudit({actor:{type:'WEB_USER',id:updatedBy,displayName:updatedBy},action:'PTI_CYCLE_SETTINGS_UPDATED',entityType:'SETTINGS',entityId:input.company,description:`PTI cycle set to ${ptiCycleDays} day(s), starting ${ptiCycleAnchorDate}; daily reminder time set to ${reminderTime} New York time`,metadata:{company:input.company,ptiCycleDays,ptiCycleAnchorDate,reminderTime}});
}

export async function saveReminderSettings(input: { template: string; media?: { type: 'photo' | 'video'; fileId: string }; updatedBy: string }) {
  const template = input.template.trim();
  if (!template || template.length > 900) throw new Error('The reminder message must contain 1–900 characters.');
  const current = await getReminderSettings();
  const mediaType = input.media?.type ?? current.media_type;
  const fileId = input.media?.fileId ?? current.telegram_file_id;
  await db.query(`insert into pti_reminder_settings
    (company_name, message_template, media_type, telegram_file_id, updated_by)
    values ($1,$2,$3,$4,$5)
    on conflict (company_name) do update set message_template=excluded.message_template,
      media_type=excluded.media_type, telegram_file_id=excluded.telegram_file_id,
      updated_by=excluded.updated_by, updated_at=now()`, [current.company_name, template, mediaType, fileId, input.updatedBy]);
  await logAudit({actor:{type:'TELEGRAM_USER',id:input.updatedBy,displayName:input.updatedBy},action:'REMINDER_SETTINGS_UPDATED',entityType:'SETTINGS',entityId:'pti-reminder',description:'PTI reminder template or attachment updated',metadata:{mediaType}});
}

export async function clearReminderMedia(updatedBy: string) {
  const current = await getReminderSettings();
  await db.query(`insert into pti_reminder_settings
    (company_name, message_template, media_type, telegram_file_id, updated_by)
    values ($1,$2,null,null,$3)
    on conflict (company_name) do update set media_type=null, telegram_file_id=null,
      updated_by=excluded.updated_by, updated_at=now()`, [current.company_name, current.message_template, updatedBy]);
  await logAudit({actor:{type:'TELEGRAM_USER',id:updatedBy,displayName:updatedBy},action:'REMINDER_SETTINGS_UPDATED',entityType:'SETTINGS',entityId:'pti-reminder',description:'PTI reminder attachment removed'});
}
