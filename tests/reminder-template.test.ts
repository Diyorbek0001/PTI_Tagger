import { describe, expect, it } from 'vitest';
import { renderReminderTemplate } from '../src/lib/reminder-template';

describe('renderReminderTemplate', () => {
  it('replaces supported placeholders and escapes custom text', () => {
    const rendered = renderReminderTemplate('@driver | @lastNotified | @lastPTI | @unit | @company <test>', {
      driverMention: '@driver_name', unit: '6304', company: 'PTI & Co',
      lastNotifiedAt: null, lastPtiAt: '2026-09-24T12:00:00Z',
    });
    expect(rendered).toContain('@driver_name | Never | Sep 24, 2026 | 6304 | PTI &amp; Co &lt;test&gt;');
  });
});
