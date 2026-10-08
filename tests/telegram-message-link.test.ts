import { describe, expect, it } from 'vitest';
import { telegramMessageLink } from '@/lib/telegram/message-link';

describe('telegram source message links', () => {
  it('creates a public group link from its username', () => {
    expect(telegramMessageLink(-1001234567890, 456, 'pti_drivers')).toBe('https://t.me/pti_drivers/456');
  });

  it('creates a private supergroup link from its Telegram chat id', () => {
    expect(telegramMessageLink(-1001234567890, 456)).toBe('https://t.me/c/1234567890/456');
  });

  it('returns null if the chat cannot have a shareable message link', () => {
    expect(telegramMessageLink(-123456789, 456)).toBeNull();
    expect(telegramMessageLink(-1001234567890, 0)).toBeNull();
  });
});
