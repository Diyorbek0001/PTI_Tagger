export const defaultPtiTimeZone = 'America/New_York';

export function ptiTimeZone() {
  const value = process.env.PTI_TIME_ZONE?.trim() || defaultPtiTimeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value; }
  catch { return defaultPtiTimeZone; }
}

export function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export function startOfMondayWeek(date = new Date(), timeZone = ptiTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date).reduce<Record<string, string>>((all, item) => ({ ...all, [item.type]: item.value }), {});
  const local = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  local.setUTCDate(local.getUTCDate() - ((weekday + 6) % 7));
  return isoDate(local);
}

export function weeksAgoStart(weeks: number, now = new Date(), timeZone = ptiTimeZone()) {
  const start = new Date(`${startOfMondayWeek(now, timeZone)}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - Math.max(0, weeks - 1) * 7);
  return isoDate(start);
}

export function endOfWeekDate(weekStart: string) {
  const end = new Date(`${weekStart}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return isoDate(end);
}
