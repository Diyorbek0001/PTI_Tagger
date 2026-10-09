export const defaultPtiTimeZone = 'America/New_York';

export function ptiTimeZone() {
  const value = process.env.PTI_TIME_ZONE?.trim() || defaultPtiTimeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value; }
  catch { return defaultPtiTimeZone; }
}

export function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
export function dateOnly(value: string | Date) { return value instanceof Date ? isoDate(value) : value.slice(0, 10); }

export function dateOnlyInTimeZone(value: string | Date, timeZone = ptiTimeZone()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce<Record<string, string>>((all, item) => ({ ...all, [item.type]: item.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function submissionCycleExpired(latestSubmission: string | Date | null, cycleDays: number, today: string, anchorDate: string) {
  const lastSubmissionDay = latestSubmission ? dateOnlyInTimeZone(latestSubmission) : anchorDate;
  const lastCoveredDay = new Date(`${lastSubmissionDay}T12:00:00Z`);
  lastCoveredDay.setUTCDate(lastCoveredDay.getUTCDate() + cycleDays);
  return today > isoDate(lastCoveredDay);
}

export function todayInTimeZone(now = new Date(), timeZone = ptiTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce<Record<string, string>>((all, item) => ({ ...all, [item.type]: item.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function ptiCycleStart(date: string, cycleDays: number, anchorDate = '1970-01-05') {
  const day = (value: string) => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
  const anchor = day(anchorDate), current = day(date);
  const index = Math.floor((current - anchor) / cycleDays);
  return isoDate(new Date((anchor + index * cycleDays) * 86_400_000));
}

export function ptiCycleEnd(start: string, cycleDays: number) {
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + cycleDays - 1);
  return isoDate(end);
}

export function cycleAgoStart(cycles: number, cycleDays: number, anchorDate = '1970-01-05', now = new Date(), timeZone = ptiTimeZone()) {
  const start = new Date(`${ptiCycleStart(todayInTimeZone(now, timeZone), cycleDays, anchorDate)}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - Math.max(0, cycles - 1) * cycleDays);
  return isoDate(start);
}

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
