export type ReminderTemplateValues = {
  driverMention: string;
  unit: string;
  company: string;
  lastNotifiedAt: string | Date | null;
  lastPtiAt: string | Date | null;
};

export function renderReminderTemplate(template: string, values: ReminderTemplateValues) {
  return escapeHtml(template)
    .replaceAll('@driver', values.driverMention)
    .replaceAll('@lastNotified', formatDay(values.lastNotifiedAt))
    .replaceAll('@lastPTI', formatDay(values.lastPtiAt))
    .replaceAll('@unit', escapeHtml(values.unit))
    .replaceAll('@company', escapeHtml(values.company));
}

function formatDay(value: string | Date | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: process.env.PTI_TIME_ZONE ?? 'America/New_York',
  }).format(new Date(value));
}

export function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
