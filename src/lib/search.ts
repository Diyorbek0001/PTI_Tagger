function searchableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(searchableValue).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(searchableValue).join(' ');
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    const date = dateOnly ? new Date(`${text}T12:00:00`) : new Date(text);
    if (!Number.isNaN(date.getTime())) return `${text} ${date.toLocaleDateString('en-US')} ${date.toLocaleString('en-US')}`;
  }
  return text;
}

export function matchesSearch(value: unknown, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = searchableValue(value).toLocaleLowerCase();
  return haystack.includes(needle) || haystack.replace(/[^\p{L}\p{N}]/gu, '').includes(needle.replace(/[^\p{L}\p{N}]/gu, ''));
}
