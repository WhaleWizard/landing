export const CHUNK_RECOVERY_QUERY = '_v';

export function isChunkRecoveryMarker(value: string | null): value is string {
  return value !== null && /^\d{13}$/.test(value);
}

export function isRecentChunkRecovery(value: string | null, now = Date.now()): boolean {
  return isChunkRecoveryMarker(value) && Math.abs(now - Number(value)) < 60_000;
}
