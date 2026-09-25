import { db } from '@/lib/database';

export type ReminderSettings = {
  message_template: string;
  media_type: 'photo' | 'video' | null;
  telegram_file_id: string | null;
  updated_by: string;
  updated_at: string | Date | null;
};

export const defaultReminderTemplate = `🔔 Weekly PTI reminder

@driver — Unit @unit still needs a PTI for this week.

Last PTI: @lastPTI
Last notified: @lastNotified

Please send a clear photo or video in this group, then reply directly to it with /pti.`;

export async function getReminderSettings(): Promise<ReminderSettings> {
  const { rows } = await db.query('select message_template, media_type, telegram_file_id, updated_by, updated_at from pti_reminder_settings where singleton=true');
  return rows[0] as ReminderSettings | undefined ?? {
    message_template: defaultReminderTemplate,
    media_type: null,
    telegram_file_id: null,
    updated_by: 'default',
    updated_at: null,
  };
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
}

export async function clearReminderMedia(updatedBy: string) {
  const current = await getReminderSettings();
  await db.query(`insert into pti_reminder_settings
    (singleton, message_template, media_type, telegram_file_id, updated_by)
    values (true,$1,null,null,$2)
    on conflict (singleton) do update set media_type=null, telegram_file_id=null,
      updated_by=excluded.updated_by, updated_at=now()`, [current.message_template, updatedBy]);
}
