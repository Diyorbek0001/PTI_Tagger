export const authCookieName = 'pti_admin_session';
export const authSessionMaxAge = 60 * 60 * 12;

export async function createSessionToken(username: string, password: string) {
  const signature = await sign(username, password);
  return `${encodeBase64Url(username)}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, username: string, password: string) {
  if (!token) return false;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;
  try {
    const tokenUsername = decodeBase64Url(token.slice(0, separator));
    if (tokenUsername !== username) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, decodeBytes(token.slice(separator + 1)), new TextEncoder().encode(tokenUsername));
  } catch {
    return false;
  }
}

async function sign(value: string, password: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBytes(new Uint8Array(signature));
}

function encodeBase64Url(value: string) {
  return encodeBytes(new TextEncoder().encode(value));
}

function decodeBase64Url(value: string) {
  return new TextDecoder().decode(decodeBytes(value));
}

function encodeBytes(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
