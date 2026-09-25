import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '../src/lib/web-auth';

describe('web admin session', () => {
  it('accepts a valid signed token', async () => {
    const token = await createSessionToken('admin', 'long-password');
    await expect(verifySessionToken(token, 'admin', 'long-password')).resolves.toBe(true);
  });

  it('rejects tampered or mismatched tokens', async () => {
    const token = await createSessionToken('admin', 'long-password');
    await expect(verifySessionToken(`${token}x`, 'admin', 'long-password')).resolves.toBe(false);
    await expect(verifySessionToken(token, 'other', 'long-password')).resolves.toBe(false);
  });
});
