/**
 * Одноразовые коды для входа в админку (TOTP, RFC 6238).
 *
 * Совместимо с Google Authenticator и любым другим приложением: секрет
 * кодируется в base32, код считается по времени с шагом 30 секунд.
 *
 * Библиотек здесь нет намеренно — весь алгоритм это HMAC-SHA1 над номером
 * текущего 30-секундного интервала, а Web Crypto в Cloudflare умеет и это.
 * Лишняя зависимость в проверке доступа — лишний способ её сломать.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

/**
 * Допуск на расхождение часов: принимаются коды соседних интервалов.
 * Один шаг в каждую сторону — это ±30 секунд, чего хватает телефону с
 * неточным временем и не превращает код в долгоживущий пароль.
 */
const TOTP_WINDOW_STEPS = 1;

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 5;

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret: string): Uint8Array | null {
  // Приложения показывают ключ группами по четыре символа, и человек копирует
  // его вместе с пробелами и дефисами. Регистр тоже не важен.
  const normalized = secret.replace(/[\s-]+/g, '').replace(/=+$/, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) return null;

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return bytes.length ? new Uint8Array(bytes) : null;
}

function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }
  return bytes;
}

async function hotp(secretBytes: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterToBytes(counter) as BufferSource));

  // Динамическое усечение по RFC 4226: младшие четыре бита последнего байта
  // указывают, с какого места брать четыре байта результата.
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 255) << 16)
    | ((digest[offset + 2] & 255) << 8)
    | (digest[offset + 3] & 255);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** Секрет на 160 бит — размер, рекомендованный RFC 4226 для HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** Ключ группами по четыре символа: так его реально ввести руками без ошибок. */
export function formatSecretForHuman(secret: string): string {
  return (secret.match(/.{1,4}/g) || []).join(' ');
}

/**
 * Ссылка для приложения-аутентификатора.
 *
 * Google Authenticator понимает и её (через QR), и ручной ввод самого ключа.
 */
export function buildOtpAuthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function isTotpCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(String(code || '').replace(/\s+/g, ''));
}

/**
 * Проверка кода из приложения.
 *
 * Возвращает номер интервала, по которому код сошёлся, или null. Номер нужен
 * вызывающей стороне, чтобы запретить повторный вход по тому же коду: сам по
 * себе код живёт полминуты и за это время его можно было бы использовать
 * дважды.
 */
export async function verifyTotpCode(secret: string, code: string, nowMs = Date.now()): Promise<number | null> {
  const normalizedCode = String(code || '').replace(/\s+/g, '');
  if (!isTotpCodeFormat(normalizedCode)) return null;

  const secretBytes = base32Decode(secret);
  if (!secretBytes) return null;

  const currentStep = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  for (let shift = -TOTP_WINDOW_STEPS; shift <= TOTP_WINDOW_STEPS; shift += 1) {
    const step = currentStep + shift;
    // eslint-disable-next-line no-await-in-loop -- окно из трёх шагов, параллелить нечего
    const expected = await hotp(secretBytes, step);
    if (safeEqual(expected, normalizedCode)) return step;
  }

  return null;
}

/**
 * Резервные коды на случай потерянного телефона.
 *
 * Показываются один раз при включении защиты; в базе лежат только их хеши,
 * поэтому подсмотреть их в D1 нельзя, а использованный код удаляется.
 */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_BYTES));
    const raw = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeBackupCode(code: string): string {
  return String(code || '').trim().toLowerCase().replace(/\s+/g, '');
}

export async function hashBackupCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeBackupCode(code)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
