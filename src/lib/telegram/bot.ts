import { Bot, type Context } from 'grammy';
import type { User } from 'grammy/types';
import { parseActivateCommand } from './parser';
import { activateRegistration } from '@/services/registration';
import { db } from '@/lib/database';
import { extractPtiMedia } from './pti-media';
import { createProcessingSubmission, findExistingSubmission, markSubmissionFailed, markSubmissionForwarded } from '@/services/pti-submissions';
import { clearReminderMedia, getReminderSettings, saveReminderSettings } from '@/services/reminder-settings';
export function createBot(token: string) {
  const bot = new Bot(token);
  bot.command('adminhelp', async ctx => {
    if (!await requireReminderAdmin(ctx)) return;
    await ctx.reply(`Reminder configuration commands

/setreminder MESSAGE — update the reminder text and keep the current attachment.

To attach a photo or video: send it here with the reminder template as its caption, then reply to it with /setreminder.

/reminderconfig — show the current template and attachment.
/clearremindermedia — remove the current photo/video.

Placeholders:
@driver — driver mention
@lastNotified — previous notification day
@lastPTI — last PTI submission day
@unit — unit number
@company — company name`);
  });
  bot.command('setreminder', async ctx => {
    if (!await requireReminderAdmin(ctx)) return;
    const replied = ctx.message?.reply_to_message;
    const media = extractPtiMedia(replied) ?? extractPtiMedia(ctx.message);
    const suppliedTemplate = messageContent(replied) || String(ctx.match ?? '').trim();
    const current = await getReminderSettings();
    const template = suppliedTemplate || (media ? current.message_template : '');
    if (!template) return void await ctx.reply('Send /setreminder followed by the message, or reply with /setreminder to a photo/video whose caption contains the message template. Use /adminhelp for examples.');
    try {
      await saveReminderSettings({ template, media: media ?? undefined, updatedBy: `@${ctx.from?.username}` });
      await ctx.reply(`✅ Reminder configuration saved.\n\nAttachment: ${media?.type ?? current.media_type ?? 'none'}\n\nUse /reminderconfig to review it.`);
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : 'Unable to save the reminder configuration.'}`);
    }
  });
  bot.command('reminderconfig', async ctx => {
    if (!await requireReminderAdmin(ctx)) return;
    const settings = await getReminderSettings();
    await ctx.reply(`Current reminder template\n\n${settings.message_template}\n\nAttachment: ${settings.media_type ?? 'none'}\nLast updated by: ${settings.updated_by}`);
    if (settings.media_type === 'photo' && settings.telegram_file_id) await ctx.api.sendPhoto(ctx.chat.id, settings.telegram_file_id, { caption: 'Current reminder attachment' });
    if (settings.media_type === 'video' && settings.telegram_file_id) await ctx.api.sendVideo(ctx.chat.id, settings.telegram_file_id, { caption: 'Current reminder attachment' });
  });
  bot.command('clearremindermedia', async ctx => {
    if (!await requireReminderAdmin(ctx)) return;
    await clearReminderMedia(`@${ctx.from?.username}`);
    await ctx.reply('✅ Reminder attachment removed. The message template was kept.');
  });
  bot.command('activate', async ctx => {
    const chat = ctx.chat;
    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return void await ctx.reply('❌ Unit activation must be performed inside the truck\'s Telegram group.');

    const message = ctx.message;
    const text = message?.text ?? '';
    const parsed = parseActivateCommand(text);
    const code = parsed?.code ?? text.trim().match(/^\/activate(?:@[A-Za-z0-9_]+)?\s+(\d{6})(?:\s+.+)?$/i)?.[1];
    if (!code) return void await ctx.reply('❌ Driver is missing.\n\nUsage:\n/activate 482731 @driverusername');

    const expectedUsername = parsed?.username.toLowerCase();
    let driver: User | undefined;
    let membershipProvenByMessage = false;
    if (ctx.from && expectedUsername && ctx.from.username?.toLowerCase() === expectedUsername) { driver = ctx.from; membershipProvenByMessage = true; }

    const repliedUser = message?.reply_to_message?.from;
    if (!driver && repliedUser) { driver = repliedUser; membershipProvenByMessage = true; }

    const textMention = message?.entities?.find(entity => entity.type === 'text_mention');
    if (!driver && textMention?.type === 'text_mention') driver = textMention.user;

    const fallbackUsername = parsed?.username;
    if (!driver && !fallbackUsername) {
      console.warn('Reply did not include a user identity', {
        messageId: message?.message_id,
        hasReply: Boolean(message?.reply_to_message),
        hasReplySenderChat: Boolean(message?.reply_to_message?.sender_chat),
      });
      return void await ctx.reply('❌ Telegram hid the replied message\'s user identity from the bot. Registration was not created.\n\nDisable Group Privacy for this bot in BotFather, then reply to a new message from the driver and try again.');
    }

    try {
      if (driver && !membershipProvenByMessage) {
        const member = await ctx.api.getChatMember(chat.id, driver.id);
        if (member.status === 'left' || member.status === 'kicked') throw new Error('The selected driver is not currently a member of this group.');
      }
      const username = driver?.username ?? fallbackUsername;
      const driverName = driver ? [driver.first_name, driver.last_name].filter(Boolean).join(' ') : `@${username}`;
      const result = await activateRegistration({ code, chatId: String(chat.id), chatTitle: chat.title ?? 'Untitled group', chatType: chat.type, driver: { id: driver ? String(driver.id) : null, username, firstName: driver?.first_name, lastName: driver?.last_name }, performedBy: String(ctx.from?.id ?? 'telegram') });
      await ctx.reply(`✅ Registration successful\n\nUnit: ${result.unit_number}\nDriver: ${driverName}\nTelegram Group: ${chat.title}\n\nThis group is now authorized for unit ${result.unit_number}.`);
    } catch (error) {
      console.error('Activation failed:', error instanceof Error ? error.message : error);
      await ctx.reply(`❌ ${error instanceof Error ? error.message : 'Registration failed.'}`);
    }
  });
  bot.command('pti', async ctx => {
    const chat = ctx.chat;
    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return void await ctx.reply('❌ PTI submissions must be sent from a registered unit group.');
    const archiveChatId = process.env.PTI_ARCHIVE_CHAT_ID;
    if (!archiveChatId || !/^-?\d+$/.test(archiveChatId)) return void await ctx.reply('❌ The PTI archive group is not configured. Add PTI_ARCHIVE_CHAT_ID to the bot environment.');

    const sourceMessage = ctx.message?.reply_to_message;
    const media = extractPtiMedia(sourceMessage);
    if (!sourceMessage || !media) return void await ctx.reply('❌ Reply directly to a photo or video with /pti.');

    const { rows } = await db.query(`select r.id as registration_id, r.driver_username, r.driver_first_name, r.driver_last_name, u.id as unit_id, u.unit_number, u.company
      from unit_registrations r join units u on u.id=r.unit_id
      where r.telegram_chat_id=$1 and r.is_active=true`, [String(chat.id)]);
    const registration = rows[0] as { registration_id: string; unit_id: string; unit_number: string; company: string; driver_username:string|null; driver_first_name:string|null; driver_last_name:string|null } | undefined;
    if (!registration) return void await ctx.reply('❌ This Telegram group is not registered to a unit.');

    const existing = await findExistingSubmission(String(chat.id), sourceMessage.message_id);
    if (existing && existing.status !== 'failed') return void await ctx.reply('ℹ️ This photo or video has already been submitted for PTI review.');

    let submissionId: string | undefined;
    try {
      const created = await createProcessingSubmission({ unitId: registration.unit_id, registrationId: registration.registration_id, sourceChatId: String(chat.id), sourceChatTitle: chat.title ?? 'Untitled group', sourceMessageId: sourceMessage.message_id, submittedByUserId: ctx.from ? String(ctx.from.id) : undefined, submittedByUsername: ctx.from?.username, mediaType: media.type, fileId: media.fileId, archiveChatId });
      submissionId = created.id;
      const archived = media.type === 'photo'
        ? await ctx.api.sendPhoto(archiveChatId, media.fileId, sourceMessage.caption ? { caption: sourceMessage.caption } : undefined)
        : await ctx.api.sendVideo(archiveChatId, media.fileId, sourceMessage.caption ? { caption: sourceMessage.caption } : undefined);
      await markSubmissionForwarded(submissionId, archived.message_id);
      const driverName = [registration.driver_first_name, registration.driver_last_name].filter(Boolean).join(' ') || (registration.driver_username ? `@${registration.driver_username}` : 'Not available');
      await ctx.api.sendMessage(archiveChatId, `PTI submission\nPTI ID: ${created.reference}\nUnit: ${registration.unit_number}\nCompany: ${registration.company}\nDriver: ${driverName}\nSource group: ${chat.title ?? 'Untitled group'}`, { reply_parameters: { message_id: archived.message_id } });
      await ctx.reply(`✅ PTI submitted for review\n\nPTI ID: ${created.reference}\nUnit: ${registration.unit_number}\nMedia: ${media.type === 'video' ? 'Video' : 'Photo'}\nStatus: Pending review`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to forward PTI media.';
      if (submissionId) await markSubmissionFailed(submissionId, message);
      console.error('PTI submission failed:', message);
      await ctx.reply(`❌ PTI submission failed. ${message}`);
    }
  });
  bot.command('chatid', async ctx => {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) return void await ctx.reply('Use /chatid inside the Telegram group you want to configure.');
    console.info('Telegram group identified:', { chatId: String(ctx.chat.id), title: ctx.chat.title, type: ctx.chat.type });
    await ctx.reply(`Telegram chat ID: ${ctx.chat.id}`);
  });
  bot.hears(/^group?id$/i, async ctx => {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) return void await ctx.reply('Send grouID inside the Telegram group you want to configure.');
    console.info('Telegram group identified:', { chatId: String(ctx.chat.id), title: ctx.chat.title, type: ctx.chat.type });
    await ctx.reply(`Telegram chat ID: ${ctx.chat.id}`);
  });
  bot.command('status', async ctx => { if (!ctx.chat) return void await ctx.reply('This command must be used in a Telegram group.'); const { rows } = await db.query('select u.unit_number, r.driver_first_name, r.driver_last_name from unit_registrations r join units u on u.id=r.unit_id where r.telegram_chat_id=$1 and r.is_active=true', [String(ctx.chat.id)]); const registration=rows[0] as {unit_number:string;driver_first_name:string|null;driver_last_name:string|null}|undefined; await ctx.reply(registration ? `✅ This group is registered.\n\nUnit: ${registration.unit_number}\nDriver: ${[registration.driver_first_name,registration.driver_last_name].filter(Boolean).join(' ')}` : 'This Telegram group is not currently registered to a unit.'); });
  bot.on('message:new_chat_title', async ctx => {
    await db.query('update unit_registrations set telegram_chat_title=$2 where telegram_chat_id=$1 and is_active=true', [String(ctx.chat.id), ctx.message.new_chat_title]);
    console.info('Registered Telegram group title updated:', { chatId: String(ctx.chat.id), title: ctx.message.new_chat_title });
  });
  bot.catch(error => console.error('Telegram bot error:', error.error));
  return bot;
}

async function requireReminderAdmin(ctx: Context) {
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('Reminder settings can only be changed in a private chat with the bot.');
    return false;
  }
  const configured = process.env.TELEGRAM_ADMIN_USERNAME?.trim().replace(/^@/, '').toLowerCase();
  if (!configured) {
    await ctx.reply('TELEGRAM_ADMIN_USERNAME is not configured for this bot.');
    return false;
  }
  if (ctx.from?.username?.toLowerCase() !== configured) {
    await ctx.reply('❌ You are not authorized to change reminder settings.');
    return false;
  }
  return true;
}

function messageContent(message: { text?: string; caption?: string } | undefined) {
  return (message?.caption ?? message?.text ?? '').trim();
}
