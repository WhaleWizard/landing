import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

export interface GscDailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: string[];
}

export interface GscOpportunity {
  query: string;
  page: string;
  impressions: number;
  currentPosition: number;
  ctr: number;
  advice: string;
}

export interface GscCannibalization {
  query: string;
  pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
}

export interface SearchConsoleResponse {
  success: boolean;
  error?: string;
  configured: boolean;
  siteUrl: string;
  days: number;
  propertyName: string;
  startDate?: string;
  endDate?: string;
  summary: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    prevClicks?: number;
    prevImpressions?: number;
  } | null;
  daily: GscDailyPoint[];
  queries: GscQueryRow[];
  pages: GscPageRow[];
  opportunities: GscOpportunity[];
  cannibalization: GscCannibalization[];
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DAY_MS = 86_400_000;

type SearchRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function base64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleToken(credentials: string): Promise<string> {
  let raw = credentials.trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try {
      const unquoted = JSON.parse(raw) as unknown;
      if (typeof unquoted === 'string') raw = unquoted.trim();
    } catch {
      raw = raw.slice(1, -1).trim();
    }
  }

  let account: { client_email?: string; private_key?: string } = {};
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      account = (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as { client_email?: string; private_key?: string };
    } catch {
      throw new Error('Invalid JSON in credentials');
    }
  } else if (raw.includes('-----BEGIN PRIVATE KEY-----')) {
    account = {
      client_email: 'gsc-reader@whale-wzrd-analytics.iam.gserviceaccount.com',
      private_key: raw,
    };
  }

  if (!account.client_email || !account.private_key) throw new Error('Invalid account');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const assertion = [
    encode({ alg: 'RS256', typ: 'JWT' }),
    encode({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 600 }),
  ].join('.');
  const pem = account.private_key
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (char) => char.charCodeAt(0)), algorithm, false, ['sign']);
  const signature = await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(assertion));
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    redirect: 'error',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion + '.' + base64Url(new Uint8Array(signature)),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error('Google authorization failed ' + response.status + ': ' + errText);
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error('Missing access token');
  return payload.access_token;
}

function reportDate(offset: number, now: Date): string {
  // Search Console defines report dates in Pacific time, including DST.
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const today = ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
  return new Date(Date.parse(today + 'T00:00:00Z') + offset * DAY_MS).toISOString().slice(0, 10);
}

function metrics(row: SearchRow) {
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr * 100, position: row.position };
}

function pageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export async function getSearchConsoleReport(
  credentials: string,
  propertyName: string,
  days: number,
  now = new Date(),
): Promise<Pick<SearchConsoleResponse, 'startDate' | 'endDate' | 'summary' | 'daily' | 'queries' | 'pages' | 'opportunities' | 'cannibalization'>> {
  const token = await getGoogleToken(credentials);
  const endpoint = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(propertyName) + '/searchAnalytics/query';
  const endDate = reportDate(-3, now);
  const startDate = reportDate(-days - 2, now);
  const query = async (dimensions: string[], rowLimit: number, from = startDate, to = endDate) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: from, endDate: to, dimensions, rowLimit, type: 'web', dataState: 'final' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) { const text = await response.text().catch(() => ''); throw new Error('Search Console query failed ' + response.status + ': ' + text); }
    return (await response.json() as { rows?: SearchRow[] }).rows || [];
  };

  const [[current], [previous], dailyRows, queryRows, pageRows, pairs] = await Promise.all([
    query([], 1),
    query([], 1, reportDate(-2 * days - 2, now), reportDate(-days - 3, now)),
    query(['date'], days),
    query(['query'], 250),
    query(['page'], 250),
    query(['query', 'page'], 2000),
  ]);

  const queriesByPage = new Map<string, string[]>();
  const pagesByQuery = new Map<string, GscCannibalization['pages']>();
  const opportunities: GscOpportunity[] = [];
  for (const row of pairs) {
    const [phrase, value] = row.keys || [];
    const page = pageUrl(value);
    if (!phrase || !page) continue;
    const topQueries = queriesByPage.get(page) || [];
    if (topQueries.length < 3) topQueries.push(phrase);
    queriesByPage.set(page, topQueries);
    if (row.impressions >= 10) {
      const variants = pagesByQuery.get(phrase) || [];
      variants.push({ page, clicks: row.clicks, impressions: row.impressions, position: row.position });
      pagesByQuery.set(phrase, variants);
    }
    if (row.position >= 4 && row.position <= 15 && row.impressions >= 20) {
      opportunities.push({
        query: phrase, page, impressions: row.impressions, currentPosition: row.position, ctr: row.ctr * 100,
        advice: 'Сверьте страницу и заголовок с намерением по запросу. Сравните CTR с близкими запросами на похожих позициях.',
      });
    }
  }

  return {
    startDate, endDate,
    summary: current?.impressions > 0 ? {
      ...metrics(current),
      ...(previous?.impressions > 0 ? {
        prevClicks: previous.clicks, prevImpressions: previous.impressions,
      } : {}),
    } : null,
    daily: dailyRows.flatMap((row) => row.keys?.[0] ? [{ date: row.keys[0], ...metrics(row) }] : []),
    queries: queryRows.flatMap((row) => row.keys?.[0] ? [{ query: row.keys[0], ...metrics(row) }] : []),
    pages: pageRows.flatMap((row) => {
      const page = pageUrl(row.keys?.[0] || '');
      return page ? [{ page, ...metrics(row), topQueries: queriesByPage.get(page) || [] }] : [];
    }),
    opportunities: opportunities.sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    cannibalization: Array.from(pagesByQuery, ([query, pages]) => ({ query, pages }))
      .filter(({ pages }) => pages.length > 1).slice(0, 15),
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const requestedDays = Number(new URL(request.url).searchParams.get('days'));
  const days = [7, 28, 90].includes(requestedDays) ? requestedDays : 28;
  const propertyName = env.GSC_PROPERTY?.trim() || 'sc-domain:whalewzrd.com';
  const credentials = env.GSC_SERVICE_ACCOUNT_JSON || env.GOOGLE_SEARCH_CONSOLE_KEY;
  if (!credentials) {
    return json({
      success: true, configured: false, days, propertyName, siteUrl: env.SITE_URL || 'https://www.whalewzrd.com',
      summary: null, daily: [], queries: [], pages: [], opportunities: [], cannibalization: [],
    } satisfies SearchConsoleResponse, { headers: noStore });
  }
  try {
    const report = await getSearchConsoleReport(credentials, propertyName, days);
    return json({
      success: true, configured: true, days, propertyName, siteUrl: env.SITE_URL || 'https://www.whalewzrd.com',
      ...report,
    } satisfies SearchConsoleResponse, { headers: noStore });
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = rawMsg
      .replace(/broken-json/g, '[sanitized]')
      .replace(/-----BEGIN[\s\S]+?-----END[^\n]+/g, '[KEY]')
      .slice(0, 200);
    return json({
      success: false,
      error: 'Google Search Console не вернул отчёт (' + sanitizedMsg + '). Проверьте ключ, включение API и доступ сервисного аккаунта к ресурсу.',
    }, { status: 503, headers: noStore });
  }
}
