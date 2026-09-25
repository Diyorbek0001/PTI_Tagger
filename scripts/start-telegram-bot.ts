import 'dotenv/config';
import { createBot } from '../src/lib/telegram/bot';
import { runAutomaticPtiReminders } from '../src/services/pti-notifications';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const bot = createBot(token);
bot.api.getMe().then(me => {
  console.info(`Telegram bot connected successfully. Bot: @${me.username}. Environment: ${process.env.NODE_ENV ?? 'development'}`);
  const checkReminders = () => void runAutomaticPtiReminders(bot.api).catch(error => {
    console.error('Automatic PTI reminder check failed:', error instanceof Error ? error.message : error);
  });
  setTimeout(checkReminders, 15_000);
  setInterval(checkReminders, 60 * 60 * 1000);
  return bot.start();
});
