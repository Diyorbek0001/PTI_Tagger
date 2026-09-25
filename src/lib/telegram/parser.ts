export type ActivateCommand = { code: string; username: string };
export function parseActivateCommand(text: string): ActivateCommand | null {
  const match = text.trim().match(/^\/activate(?:@[A-Za-z0-9_]+)?\s+(\d{6})\s+@([A-Za-z0-9_]{5,32})\s*$/i);
  return match ? { code: match[1], username: match[2] } : null;
}
