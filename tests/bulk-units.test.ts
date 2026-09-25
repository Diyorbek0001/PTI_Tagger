import { describe, expect, it } from 'vitest';
import { parseBulkUnits } from '../src/lib/bulk-units';

describe('parseBulkUnits', () => {
  it('parses comma, tab, and whitespace-separated rows', () => {
    expect(parseBulkUnits('6306, PTI\n6307\tFleet One\n6308 Fleet Two')).toEqual({
      units: [
        { unitNumber: '6306', company: 'PTI' },
        { unitNumber: '6307', company: 'Fleet One' },
        { unitNumber: '6308', company: 'Fleet Two' },
      ],
      errors: [],
    });
  });

  it('accepts a spreadsheet header', () => {
    expect(parseBulkUnits('Unit Number\tCompany Name\nA-12\tPTI').units).toEqual([{ unitNumber: 'A-12', company: 'PTI' }]);
  });

  it('reports malformed and duplicate rows', () => {
    const result = parseBulkUnits('6306, PTI\n6306, Other\ninvalid/unit, PTI');
    expect(result.units).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });
});
