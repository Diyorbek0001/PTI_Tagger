import 'dotenv/config';
import { createBot } from '../src/lib/telegram/bot';
import { runAutomaticPtiReminders } from '../src/services/pti-notifications';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const bot = createBot(token);
bot.api.getMe().then(me => {
  console.info(`Telegram bot connected successfully. Bot: @${me.username}. Environment: ${process.env.NODE_ENV ?? 'development'}`);
  let reminderCheckInProgress = false;
  const checkReminders = () => {
    if (reminderCheckInProgress) return;
    reminderCheckInProgress = true;
    void runAutomaticPtiReminders(bot.api)
      .catch(error => {
        console.error('Automatic PTI reminder check failed:', error instanceof Error ? error.message : error);
      })
      .finally(() => {
        reminderCheckInProgress = false;
      });
  };
  setTimeout(checkReminders, 15_000);
  // Check frequently enough to catch the configured minute regardless of
  // when the process started. The database query in runAutomaticPtiReminders
  // prevents duplicate sends within the same reminder window.
  setInterval(checkReminders, 15 * 1000);
  return bot.start();
});
