/**
 * Хранилище настроек двухфакторного входа.
 *
 * Одна строка в D1: секрет TOTP, хеши резервных кодов и номер уже
 * использованного интервала. Пишется редко — при настройке и при входе, —
 * поэтому суточному лимиту записей на бесплатном тарифе Cloudflare ничего
 * не угрожает.
 */

import { hashBackupCode } from './admin-totp';
import type { Env } from './types';

export interface Admin2faState {
  /** Секрет создан, но подтверждающий код ещё не введён. */
  configured: boolean;
  /** Защита включена: без кода в админку не пускать. */
  enabled: boolean;
  secret: string;
  backupCodeHashes: string[];
  lastStep: number;
  backupCodesLeft: number;
}

const EMPTY_STATE: Admin2faState = {
  configured: false,
  enabled: false,
  secret: '',
  backupCodeHashes: [],
  lastStep: 0,
  backupCodesLeft: 0,
};

interface Admin2faRow {
  totp_secret?: string;
  enabled_at?: number | null;
  backup_codes?: string;
  last_step?: number;
}

/**
 * Последнее известное состояние «включена ли защита».
 *
 * Нужно на случай, когда D1 недоступна: см. `isAdmin2faEnabled`.
 */
let cachedEnabled: { value: boolean; at: number } | null = null;
const ENABLED_CACHE_TTL_MS = 30_000;

function parseBackupCodes(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function isMissingAdmin2faSchema(error: unknown): boolean {
  return /no such table|no such column/i.test(error instanceof Error ? error.message : String(error));
}

async function get2faCipherKey(env: Env): Promise<CryptoKey> {
  const secret = String(env.ADMIN_PASSWORD || '').trim();
  const rawDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ww-2fa-secret-encryption-v1|${secret}`));
  return crypto.subtle.importKey('raw', rawDigest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptTotpSecret(env: Env, plaintext: string): Promise<string> {
  const secret = String(env.ADMIN_PASSWORD || '').trim();
  if (!secret) return plaintext;
  const key = await get2faCipherKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextWithTag = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const cipherHex = Array.from(new Uint8Array(ciphertextWithTag)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `enc:v1:${ivHex}:${cipherHex}`;
}

export async function decryptTotpSecret(env: Env, stored: string): Promise<string> {
  if (!stored.startsWith('enc:v1:')) return stored;
  const parts = stored.split(':');
  if (parts.length !== 4) return stored;
  const [, , ivHex, cipherHex] = parts;
  if (!/^[0-9a-f]{24}$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(cipherHex)) return stored;
  const secret = String(env.ADMIN_PASSWORD || '').trim();
  if (!secret) return '';
  try {
    const key = await get2faCipherKey(env);
    const iv = new Uint8Array(ivHex.length / 2);
    for (let i = 0; i < ivHex.length; i += 2) iv[i / 2] = Number.parseInt(ivHex.slice(i, i + 2), 16);
    const ciphertext = new Uint8Array(cipherHex.length / 2);
    for (let i = 0; i < cipherHex.length; i += 2) ciphertext[i / 2] = Number.parseInt(cipherHex.slice(i, i + 2), 16);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

export async function readAdmin2faState(env: Env): Promise<Admin2faState> {
  if (!env.DB) return EMPTY_STATE;

  const row = await env.DB.prepare(
    'SELECT totp_secret, enabled_at, backup_codes, last_step FROM admin_2fa WHERE id = 1',
  ).first<Admin2faRow>();

  if (!row?.totp_secret) return EMPTY_STATE;

  const decryptedSecret = await decryptTotpSecret(env, String(row.totp_secret));
  const backupCodeHashes = parseBackupCodes(row.backup_codes);
  return {
    configured: true,
    enabled: Boolean(row.enabled_at),
    secret: decryptedSecret,
    backupCodeHashes,
    lastStep: Number(row.last_step || 0),
    backupCodesLeft: backupCodeHashes.length,
  };
}

/**
 * Включена ли двухфакторная защита — вопрос, который задаётся на каждом
 * запросе к админке.
 *
 * Значение держится в памяти воркера полминуты, чтобы не ходить в базу за
 * каждым запросом. Если база недоступна, берётся последнее известное
 * значение; если и его нет — считаем, что защита не включена, и вход
 * работает по паролю.
 *
 * Это сознательный выбор в пользу доступности: обратный вариант означал бы,
 * что сбой D1 запирает владельца снаружи собственной админки без единого
 * способа войти. Пароль при этом никуда не девается — он проверяется всегда.
 */
export async function isAdmin2faEnabled(env: Env): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled && now - cachedEnabled.at < ENABLED_CACHE_TTL_MS) return cachedEnabled.value;

  try {
    const state = await readAdmin2faState(env);
    cachedEnabled = { value: state.enabled, at: now };
    return state.enabled;
  } catch (error) {
    if (!isMissingAdmin2faSchema(error)) {
      console.error('[Admin 2FA] Не удалось прочитать состояние:', error);
      if (cachedEnabled) return cachedEnabled.value;
      throw error;
    }
    return false;
  }
}

function forgetEnabledCache(): void {
  cachedEnabled = null;
}

/** Создаёт или перезаписывает секрет. Защита при этом остаётся выключенной. */
export async function storeAdmin2faSecret(env: Env, secret: string): Promise<void> {
  if (!env.DB) throw new Error('db_not_configured');
  const storedSecret = await encryptTotpSecret(env, secret);
  await env.DB.prepare(
    `INSERT INTO admin_2fa (id, totp_secret, enabled_at, backup_codes, last_step, updated_at)
     VALUES (1, ?, NULL, '[]', 0, strftime('%s','now'))
     ON CONFLICT(id) DO UPDATE SET
       totp_secret = excluded.totp_secret,
       enabled_at = NULL,
       backup_codes = '[]',
       last_step = 0,
       updated_at = excluded.updated_at`,
  ).bind(storedSecret).run();
  forgetEnabledCache();
}

export async function enableAdmin2fa(env: Env, backupCodes: string[], usedStep: number): Promise<void> {
  if (!env.DB) throw new Error('db_not_configured');
  const hashes = await Promise.all(backupCodes.map((code) => hashBackupCode(code)));
  await env.DB.prepare(
    `UPDATE admin_2fa
     SET enabled_at = strftime('%s','now'), backup_codes = ?, last_step = ?, updated_at = strftime('%s','now')
     WHERE id = 1`,
  ).bind(JSON.stringify(hashes), usedStep).run();
  forgetEnabledCache();
}

export async function disableAdmin2fa(env: Env): Promise<void> {
  if (!env.DB) throw new Error('db_not_configured');
  await env.DB.prepare('DELETE FROM admin_2fa WHERE id = 1').run();
  forgetEnabledCache();
}

/**
 * Отмечает интервал использованным.
 *
 * Условие `last_step < ?` делает отметку атомарной: два одновременных входа с
 * одним кодом не пройдут оба, потому что второй апдейт не изменит ни строки.
 */
export async function claimTotpStep(env: Env, step: number): Promise<boolean> {
  if (!env.DB) throw new Error('db_not_configured');
  const result = await env.DB.prepare(
    'UPDATE admin_2fa SET last_step = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = 1 AND last_step < ?',
  ).bind(step, step).run() as { meta?: { changes?: number } };
  return Number(result.meta?.changes || 0) > 0;
}

/**
 * Сжигает резервный код: повторно им уже не войти.
 *
 * Запись идёт с условием на прежнее значение — так же, как отметка интервала
 * TOTP выше. Без условия два одновременных входа с **одним и тем же** кодом
 * оба прочитали бы состояние, оба нашли бы код в списке и оба вернули бы
 * `true`: обещанная одноразовость не выполнялась бы.
 */
export async function consumeBackupCode(env: Env, state: Admin2faState, code: string): Promise<boolean> {
  if (!env.DB) throw new Error('db_not_configured');
  const hash = await hashBackupCode(code);
  if (!state.backupCodeHashes.includes(hash)) return false;

  const previous = JSON.stringify(state.backupCodeHashes);
  const remaining = state.backupCodeHashes.filter((item) => item !== hash);
  const result = await env.DB.prepare(
    'UPDATE admin_2fa SET backup_codes = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = 1 AND backup_codes = ?',
  ).bind(JSON.stringify(remaining), previous).run() as { meta?: { changes?: number } };
  return Number(result.meta?.changes || 0) > 0;
}
