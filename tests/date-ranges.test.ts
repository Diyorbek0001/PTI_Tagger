import { describe, expect, it } from 'vitest';
import { dateOnly, ptiCycleEnd, ptiCycleStart } from '@/lib/date-ranges';

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
});
