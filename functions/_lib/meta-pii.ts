export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  return value.trim().replace(/\D/g, '');
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLocation(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

export function isSha256Hex(value: string | undefined): boolean {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashOrValidatePrehashed(value: string | undefined, normalizeFn: (input: string) => string): Promise<{ hash?: string; valid: boolean }> {
  if (!value) return { valid: true };
  if (isSha256Hex(value)) return { hash: value.toLowerCase(), valid: true };
  return { hash: await sha256Hex(normalizeFn(value)), valid: false };
}
