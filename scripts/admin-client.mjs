/**
 * Клиент админки для скриптов (импорт статей, проверки прода).
 *
 * При включённой двухфакторной защите один пароль сервер отклоняет до
 * обработчика — так задумано. Поэтому скрипт входит так же, как владелец:
 * пароль плюс шестизначный код из приложения. Сервер выдаёт сессию на 12
 * часов; она сохраняется в файл ВНЕ репозитория, и повторные запуски в эти
 * 12 часов кода не требуют.
 *
 * Пароль берётся из переменной ADMIN_PASSWORD или из файла `--env-file`
 * (строки KEY=VALUE). Ни пароль, ни сессия никогда не печатаются.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const SESSION_COOKIE = 'ww_admin_session';
const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function readEnvFile(path) {
  const out = {};
  if (!path) return out;
  if (!existsSync(path)) throw new Error(`Файл окружения не найден: ${path}`);
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function insideRepo(path) {
  const rel = relative(REPO_ROOT, resolve(path));
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export function createAdminClient({ envFile, code, sessionFile } = {}) {
  const fileEnv = readEnvFile(envFile);
  const password = process.env.ADMIN_PASSWORD || fileEnv.ADMIN_PASSWORD || '';
  const siteUrl = (process.env.SITE_URL || fileEnv.SITE_URL || 'https://www.whalewzrd.com').replace(/\/$/, '');
  const totp = String(code || process.env.ADMIN_TOTP_CODE || '').trim();
  const sessionPath = sessionFile
    || (envFile ? `${envFile}.session` : join(homedir(), '.whalewzrd-admin-session'));

  if (insideRepo(sessionPath)) {
    throw new Error(`Файл сессии не может лежать внутри репозитория: ${sessionPath}`);
  }
  if (!password) {
    throw new Error('Пароль админки не найден: задайте ADMIN_PASSWORD или --env-file');
  }

  let session = existsSync(sessionPath) ? readFileSync(sessionPath, 'utf8').trim() : '';

  const headers = (extra = {}) => ({
    ...extra,
    'X-Admin-Password': password,
    ...(session ? { Cookie: `${SESSION_COOKIE}=${session}` } : {}),
  });

  async function login() {
    const res = await fetch(`${siteUrl}/api/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', password, ...(totp ? { code: totp } : {}) }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.success) {
      if (payload?.codeRequired || payload?.error === 'code_required') {
        throw new Error('Включена двухфакторная защита: запустите с --code <6 цифр из приложения> (или резервным кодом)');
      }
      throw new Error(`Вход не удался: ${payload?.error || `HTTP ${res.status}`}`);
    }
    const setCookie = res.headers.get('set-cookie') || '';
    const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (!match) throw new Error('Сервер не выдал сессию');
    session = match[1];
    writeFileSync(sessionPath, session, { encoding: 'utf8', mode: 0o600 });
  }

  /**
   * Запрос к админке. Если сессия истекла или её нет — один раз входит
   * заново (нужен код при двухфакторной защите) и повторяет запрос.
   */
  async function request(path, init = {}) {
    const run = () => fetch(`${siteUrl}${path}`, { ...init, headers: headers(init.headers || {}) });
    let res = await run();
    if (res.status === 401) {
      const body = await res.clone().json().catch(() => ({}));
      if (body?.error === 'session_required' || body?.error === 'Unauthorized') {
        if (session) {
          session = '';
          try { unlinkSync(sessionPath); } catch { /* файла могло не быть */ }
        }
        await login();
        res = await run();
      }
    }
    return res;
  }

  return { siteUrl, request, login };
}
