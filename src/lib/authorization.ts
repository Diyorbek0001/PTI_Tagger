import { randomInt } from 'node:crypto';
export const CODE_TTL_MS = 5 * 60 * 1000;
export function generateAuthorizationCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }
export function codeExpiry(now = new Date()): Date { return new Date(now.getTime() + CODE_TTL_MS); }
export function isCodeExpired(expiresAt: string | Date, now = new Date()): boolean { return new Date(expiresAt).getTime() <= now.getTime(); }
