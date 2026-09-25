import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS, codeExpiry, generateAuthorizationCode, isCodeExpired } from '../src/lib/authorization';
describe('authorization codes', () => { it('is six digits', () => expect(generateAuthorizationCode()).toMatch(/^\d{6}$/)); it('expires after exactly five minutes', () => { const now = new Date('2026-09-24T12:00:00Z'); expect(codeExpiry(now).getTime()-now.getTime()).toBe(CODE_TTL_MS); expect(isCodeExpired(codeExpiry(now), new Date(now.getTime()+CODE_TTL_MS))).toBe(true); }); });
