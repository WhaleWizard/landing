import type { Env } from './types';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyAdminPassword(inputPassword: string, env: Env): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  return timingSafeEqual(String(inputPassword || ''), String(env.ADMIN_PASSWORD));
}
