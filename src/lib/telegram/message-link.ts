export function telegramMessageLink(chatId: string | number, messageId: number, username?: string | null) {
  if (!Number.isInteger(messageId) || messageId < 1) return null;
  const publicUsername = username?.replace(/^@/, '').trim();
  if (publicUsername && /^[A-Za-z0-9_]{5,32}$/.test(publicUsername)) return `https://t.me/${publicUsername}/${messageId}`;
  const id = String(chatId);
  if (/^-100\d+$/.test(id)) return `https://t.me/c/${id.slice(4)}/${messageId}`;
  return null;
}
