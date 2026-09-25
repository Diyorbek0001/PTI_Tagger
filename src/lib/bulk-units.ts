export type BulkUnit = { unitNumber: string; company: string };
export type BulkUnitParseResult = { units: BulkUnit[]; errors: string[] };

export function parseBulkUnits(value: string): BulkUnitParseResult {
  const units: BulkUnit[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = value.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line) continue;
    const parts = splitLine(line);
    if (index === 0 && parts && /^unit(?:\s*number)?$/i.test(parts[0]) && /^company(?:\s*name)?$/i.test(parts[1])) continue;
    if (!parts) { errors.push(`Line ${index + 1}: use "unit number, company".`); continue; }
    const [unitNumber, company] = parts;
    if (!/^[A-Za-z0-9-]{1,40}$/.test(unitNumber)) { errors.push(`Line ${index + 1}: invalid unit number "${unitNumber}".`); continue; }
    if (!company || company.length > 120) { errors.push(`Line ${index + 1}: company must be 1–120 characters.`); continue; }
    if (seen.has(unitNumber)) { errors.push(`Line ${index + 1}: duplicate unit "${unitNumber}" in this batch.`); continue; }
    seen.add(unitNumber);
    units.push({ unitNumber, company });
  }
  if (units.length > 500) errors.push('A batch can contain at most 500 units.');
  return { units, errors };
}

function splitLine(line: string): [string, string] | null {
  for (const separator of ['\t', ',', ';']) {
    const position = line.indexOf(separator);
    if (position >= 0) {
      const unit = line.slice(0, position).trim();
      const company = line.slice(position + separator.length).trim();
      return unit && company ? [unit, company] : null;
    }
  }
  const whitespace = line.match(/^(\S+)\s+(.+)$/);
  return whitespace ? [whitespace[1], whitespace[2].trim()] : null;
}
