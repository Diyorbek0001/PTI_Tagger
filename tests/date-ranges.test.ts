import { describe, expect, it } from 'vitest';
import { dateOnly, dateOnlyInTimeZone, ptiCycleEnd, ptiCycleStart, submissionCycleExpired } from '@/lib/date-ranges';

describe('configurable PTI cycle boundaries', () => {
  it('keeps the default seven-day schedule aligned to Monday through Sunday', () => {
    const start = ptiCycleStart('2026-10-08', 7, '2026-10-05');
    expect(start).toBe('2026-10-05');
    expect(ptiCycleEnd(start, 7)).toBe('2026-10-11');
  });

  it('calculates longer configured cycles from the selected anchor date', () => {
    expect(ptiCycleStart('2026-10-08', 14, '2026-10-05')).toBe('2026-10-05');
    expect(ptiCycleStart('2026-10-20', 14, '2026-10-05')).toBe('2026-10-19');
  });

  it('normalizes PostgreSQL date values returned as JavaScript Date objects', () => {
    expect(dateOnly(new Date('2026-10-05T04:00:00.000Z'))).toBe('2026-10-05');
    expect(ptiCycleStart('2026-10-08', 7, dateOnly(new Date('2026-10-05T04:00:00.000Z')))).toBe('2026-10-05');
  });

  it('starts the reminder grace period from the most recent PTI submission', () => {
    const lastPti = '2026-10-08T16:00:00.000Z';
    expect(dateOnlyInTimeZone(lastPti, 'America/New_York')).toBe('2026-10-08');
    expect(submissionCycleExpired(lastPti, 2, '2026-10-10', '2026-10-05')).toBe(false);
    expect(submissionCycleExpired(lastPti, 2, '2026-10-11', '2026-10-05')).toBe(true);
  });

  it('resets the next due date after a newer PTI, regardless of the old anchor', () => {
    expect(submissionCycleExpired('2026-10-10T16:00:00.000Z', 2, '2026-10-12', '2026-10-05')).toBe(false);
    expect(submissionCycleExpired('2026-10-10T16:00:00.000Z', 2, '2026-10-13', '2026-10-05')).toBe(true);
  });

  it('uses the configured anchor to start a cycle before the first submission', () => {
    expect(submissionCycleExpired(null, 2, '2026-10-07', '2026-10-05')).toBe(false);
    expect(submissionCycleExpired(null, 2, '2026-10-08', '2026-10-05')).toBe(true);
  });
});
