import { describe, expect, it } from 'vitest';
import { formatPtiReference } from '../src/lib/pti-reference';

describe('PTI reference', () => {
  it('formats a stable human-readable ID', () => expect(formatPtiReference(42)).toBe('PTI-000042'));
});
