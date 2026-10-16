import { Api } from 'grammy';
import { db } from '@/lib/database';
import { groupNeedsReassignment } from '@/lib/unit-status';
import { renderReminderTemplate, escapeHtml } from '@/lib/reminder-template';
import { getReminderSettings, type ReminderSettings } from '@/services/reminder-settings';
import { logAudit } from '@/services/audit';
import { dateOnlyInTimeZone, timeInTimeZone, todayInTimeZone } from '@/lib/date-ranges';

type NotificationType = 'manual' | 'automatic';

type ReminderTarget = {
  unit_id: string;
  unit_number: string;
  company: string;
  registration_id: string;
  telegram_chat_id: string;
  telegram_chat_title: string;
  driver_telegram_user_id: string | null;
  driver_first_name: string | null;
  driver_last_name: string | null;
  driver_username: string | null;
  last_pti_at: string | Date | null;
  last_notified_at: string | Date | null;
};

const targetQuery = `select u.id as unit_id, u.unit_number, u.company, r.id as registration_id,
  r.telegram_chat_id::text, r.telegram_chat_title, r.driver_telegram_user_id::text,
  r.driver_first_name,
  r.driver_last_name, r.driver_username,
  (select max(s.created_at) from pti_submissions s where s.unit_id=u.id and s.status not in ('processing','failed')) as last_pti_at,
  (select max(n.sent_at) from pti_notifications n where n.registration_id=r.id) as last_notified_at
  from units u join unit_registrations r on r.unit_id=u.id and r.is_active=true`;

function reminderText(target: ReminderTarget, template: string, cycleDays: number) {
  const name = [target.driver_first_name, target.driver_last_name].filter(Boolean).join(' ') || 'Driver';
  const mention = target.driver_username
    ? `@${target.driver_username.replace(/^@/, '')}`
    : target.driver_telegram_user_id
      ? `<a href="tg://user?id=${target.driver_telegram_user_id}">${escapeHtml(name)}</a>`
      : escapeHtml(name);
  return renderReminderTemplate(template, {
    driverMention: mention,
    unit: target.unit_number,
    company: target.company,
    cycleDays,
    lastNotifiedAt: target.last_notified_at,
    lastPtiAt: target.last_pti_at,
  });
}

export async function notifyTarget(api: Api, target: ReminderTarget, type: NotificationType, sentBy: string, configured?: ReminderSettings) {
  if (groupNeedsReassignment(target.telegram_chat_title)) throw new Error('This group is marked for reassignment and was not notified.');
  const settings = configured ?? await getReminderSettings();
  const text = reminderText(target, settings.message_template, settings.pti_cycle_days);
  const message = settings.media_type === 'photo' && settings.telegram_file_id
    ? await api.sendPhoto(target.telegram_chat_id, settings.telegram_file_id, { caption: text, parse_mode: 'HTML' })
    : settings.media_type === 'video' && settings.telegram_file_id
      ? await api.sendVideo(target.telegram_chat_id, settings.telegram_file_id, { caption: text, parse_mode: 'HTML' })
      : await api.sendMessage(target.telegram_chat_id, text, { parse_mode: 'HTML' });
  await db.query(`insert into pti_notifications
    (unit_id, registration_id, telegram_chat_id, telegram_message_id, notification_type, sent_by)
    values ($1,$2,$3,$4,$5,$6)`, [target.unit_id, target.registration_id, target.telegram_chat_id, message.message_id, type, sentBy]);
  await logAudit({actor:{type:type==='automatic'?'SYSTEM':'WEB_USER',id:sentBy,displayName:sentBy},action:type==='automatic'?'AUTO_REMINDER_SENT':'REMINDER_SENT',entityType:'REMINDER',entityId:String(message.message_id),unitId:target.unit_id,description:`PTI reminder sent to Unit ${target.unit_number}`,metadata:{registrationId:target.registration_id,notificationType:type}});
  return message;
}

export async function notifyUnit(unitId: string, type: NotificationType, sentBy: string, api = new Api(requiredToken())) {
  const { rows } = await db.query(`${targetQuery} where u.id=$1`, [unitId]);
  const target = rows[0] as ReminderTarget | undefined;
  if (!target) throw new Error('This unit does not have an active Telegram registration.');
  await notifyTarget(api, target, type, sentBy, await getReminderSettings(target.company));
}

export async function runAutomaticPtiReminders(api: Api) {
  const { rows: companies } = await db.query<{ company: string }>('select distinct company from units where company is not null and btrim(company) <> \'\' order by company');
  for (const { company } of companies) {
    const settings = await getReminderSettings(company);
    if (timeInTimeZone().slice(0, 5) !== settings.auto_reminder_time.slice(0, 5)) continue;
    const { rows } = await db.query(`${targetQuery}
      where u.company=$1 and u.auto_reminders_enabled=true
      and not exists (
        select 1 from pti_notifications n where n.registration_id=r.id
        and n.sent_at > now() - interval '20 hours'
      ) order by u.unit_number`,[company]);
    for (const target of rows as ReminderTarget[]) {
    const today = todayInTimeZone();
    if (target.last_pti_at) {
      const dueDate = new Date(`${dateOnlyInTimeZone(target.last_pti_at)}T12:00:00Z`);
      dueDate.setUTCDate(dueDate.getUTCDate() + settings.pti_cycle_days);
      if (today < dueDate.toISOString().slice(0, 10)) continue;
    }
    if (groupNeedsReassignment(target.telegram_chat_title)) continue;
    try {
      await notifyTarget(api, target, 'automatic', 'scheduler', settings);
    } catch (error) {
      console.error(`Automatic PTI reminder failed for Unit ${target.unit_number}:`, error instanceof Error ? error.message : error);
    }
    }
  }
}

function requiredToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required.');
  return token;
}
