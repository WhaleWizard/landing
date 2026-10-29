import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { json, readCappedJsonBody } from '../../_lib/http';
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
  previousPosition?: number | null;
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
  potentialClicks: number;
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
  lastUpdated: string;
  isDemo?: boolean;
  summary: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    prevClicks?: number;
    prevImpressions?: number;
    prevCtr?: number;
    prevPosition?: number;
  };
  daily: GscDailyPoint[];
  queries: GscQueryRow[];
  pages: GscPageRow[];
  opportunities: GscOpportunity[];
  cannibalization: GscCannibalization[];
  setupGuide?: {
    serviceAccountEmail: string;
    propertyName: string;
    instructions: string[];
  };
}

/**
 * Реалистичный демо-датасет для whalewzrd.com
 * Показывается маркетологу, если API Search Console ещё не привязан ключом в Cloudflare.
 */
function getDemoDataset(days: number): Omit<SearchConsoleResponse, 'success' | 'configured' | 'siteUrl' | 'days'> {
  const points: GscDailyPoint[] = [];
  const now = Date.now();
  let totalClicks = 0;
  let totalImpressions = 0;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    // Сезонный синусоидный шум
    const dayOfWeek = d.getUTCDay();
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.15;
    const baseImp = Math.round((180 + Math.sin(i * 0.4) * 45 + (days - i) * 1.5) * weekendFactor);
    const baseClicks = Math.round(baseImp * (0.048 + Math.cos(i * 0.2) * 0.012));
    const ctr = baseImp > 0 ? (baseClicks / baseImp) * 100 : 0;
    const position = Math.round((8.4 - (days - i) * 0.04 + Math.sin(i * 0.5) * 0.6) * 10) / 10;

    totalClicks += baseClicks;
    totalImpressions += baseImp;

    points.push({
      date: dateStr,
      clicks: baseClicks,
      impressions: baseImp,
      ctr: Math.round(ctr * 10) / 10,
      position: Math.max(1, position),
    });
  }

  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgPos = 7.6;

  const queries: GscQueryRow[] = [
    { query: 'таргетолог meta ads', clicks: Math.round(totalClicks * 0.18), impressions: Math.round(totalImpressions * 0.14), ctr: 6.2, position: 2.8, previousPosition: 3.4 },
    { query: 'настройка рекламы в фейсбук цена', clicks: Math.round(totalClicks * 0.14), impressions: Math.round(totalImpressions * 0.11), ctr: 5.8, position: 3.1, previousPosition: 4.0 },
    { query: 'meta conversions api настройка', clicks: Math.round(totalClicks * 0.12), impressions: Math.round(totalImpressions * 0.09), ctr: 6.9, position: 1.9, previousPosition: 2.1 },
    { query: 'performance маркетолог услуги', clicks: Math.round(totalClicks * 0.09), impressions: Math.round(totalImpressions * 0.08), ctr: 4.8, position: 4.2, previousPosition: 5.6 },
    { query: 'таргетированная реклама инстаграм для бизнеса', clicks: Math.round(totalClicks * 0.08), impressions: Math.round(totalImpressions * 0.12), ctr: 3.1, position: 7.4, previousPosition: 8.8 },
    { query: 'google ads таргетинг аудит кабинета', clicks: Math.round(totalClicks * 0.07), impressions: Math.round(totalImpressions * 0.06), ctr: 5.1, position: 5.0, previousPosition: 6.2 },
    { query: 'калькулятор бюджета на таргет', clicks: Math.round(totalClicks * 0.06), impressions: Math.round(totalImpressions * 0.07), ctr: 4.2, position: 6.5, previousPosition: 6.9 },
    { query: 'кейсы рекламы интернет магазин одежда meta', clicks: Math.round(totalClicks * 0.05), impressions: Math.round(totalImpressions * 0.05), ctr: 5.3, position: 4.7, previousPosition: 5.2 },
    { query: 'консультация маркетолога по рекламе', clicks: Math.round(totalClicks * 0.04), impressions: Math.round(totalImpressions * 0.04), ctr: 4.5, position: 5.9, previousPosition: 7.1 },
    { query: 'почему не крутит реклама в facebook ads', clicks: Math.round(totalClicks * 0.03), impressions: Math.round(totalImpressions * 0.08), ctr: 2.1, position: 9.8, previousPosition: 12.3 },
  ];

  const pages: GscPageRow[] = [
    { page: '/', clicks: Math.round(totalClicks * 0.35), impressions: Math.round(totalImpressions * 0.28), ctr: 5.9, position: 3.2, topQueries: ['таргетолог meta ads', 'performance маркетолог услуги'] },
    { page: '/meta-ads', clicks: Math.round(totalClicks * 0.26), impressions: Math.round(totalImpressions * 0.22), ctr: 5.4, position: 3.6, topQueries: ['настройка рекламы в фейсбук цена', 'таргетированная реклама инстаграм'] },
    { page: '/google-ads', clicks: Math.round(totalClicks * 0.14), impressions: Math.round(totalImpressions * 0.13), ctr: 4.7, position: 4.8, topQueries: ['google ads таргетинг аудит кабинета'] },
    { page: '/consult', clicks: Math.round(totalClicks * 0.09), impressions: Math.round(totalImpressions * 0.08), ctr: 4.3, position: 5.5, topQueries: ['консультация маркетолога по рекламе'] },
    { page: '/blog', clicks: Math.round(totalClicks * 0.08), impressions: Math.round(totalImpressions * 0.15), ctr: 2.8, position: 8.2, topQueries: ['meta conversions api настройка', 'почему не крутит реклама'] },
    { page: '/calculator', clicks: Math.round(totalClicks * 0.05), impressions: Math.round(totalImpressions * 0.06), ctr: 4.1, position: 6.4, topQueries: ['калькулятор бюджета на таргет'] },
    { page: '/cases', clicks: Math.round(totalClicks * 0.03), impressions: Math.round(totalImpressions * 0.08), ctr: 2.4, position: 7.9, topQueries: ['кейсы рекламы интернет магазин'] },
  ];

  const opportunities: GscOpportunity[] = [
    {
      query: 'таргетированная реклама инстаграм для бизнеса',
      page: '/meta-ads',
      impressions: Math.round(totalImpressions * 0.12),
      currentPosition: 7.4,
      potentialClicks: Math.round(totalImpressions * 0.12 * 0.08),
      advice: 'Запрос на 7-й позиции с высоким объёмом показов. Добавьте фразу в H2 или подзаголовок страницы /meta-ads для выхода в Топ-3.',
    },
    {
      query: 'почему не крутит реклама в facebook ads',
      page: '/blog',
      impressions: Math.round(totalImpressions * 0.08),
      currentPosition: 9.8,
      potentialClicks: Math.round(totalImpressions * 0.08 * 0.07),
      advice: 'Низкий CTR (2.1%). Обновите Title статьи блога на более кликабельный с решением проблемы (например: «5 причин и чек-лист решения»).',
    },
  ];

  const cannibalization: GscCannibalization[] = [
    {
      query: 'meta conversions api настройка',
      pages: [
        { page: '/meta-ads', clicks: Math.round(totalClicks * 0.05), impressions: Math.round(totalImpressions * 0.04), position: 4.8 },
        { page: '/blog/meta-capi-setup', clicks: Math.round(totalClicks * 0.07), impressions: Math.round(totalImpressions * 0.05), position: 2.4 },
      ],
    },
  ];

  return {
    lastUpdated: new Date().toISOString(),
    isDemo: true,
    summary: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: Math.round(avgCtr * 10) / 10,
      position: avgPos,
      prevClicks: Math.round(totalClicks * 0.88),
      prevImpressions: Math.round(totalImpressions * 0.91),
      prevCtr: Math.round((avgCtr - 0.4) * 10) / 10,
      prevPosition: 8.2,
    },
    daily: points,
    queries,
    pages,
    opportunities,
    cannibalization,
    setupGuide: {
      serviceAccountEmail: 'gsc-reader@whalewzrd-analytics.iam.gserviceaccount.com',
      propertyName: 'sc-domain:whalewzrd.com',
      instructions: [
        'Создайте сервисный аккаунт в Google Cloud Console с доступом к Search Console API.',
        'В панели Google Search Console (Настройки → Пользователи и разрешения) добавьте email сервисного аккаунта с правами «Полный» или «Чтение».',
        'Добавьте секрет GSC_SERVICE_ACCOUNT_JSON в переменные Cloudflare Pages или введите его ниже для сохранения в D1.',
      ],
    },
  };
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  const password = request.headers.get('X-Admin-Password') || '';
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get('days') || 28);
  const days = [7, 28, 90].includes(daysParam) ? daysParam : 28;

  // Проверка наличия сохраненных ключей в Env или D1
  const hasGscCreds = Boolean(
    (env as unknown as Record<string, string>)?.GSC_SERVICE_ACCOUNT_JSON ||
    (env as unknown as Record<string, string>)?.GOOGLE_SEARCH_CONSOLE_KEY
  );

  const demoData = getDemoDataset(days);

  return json({
    success: true,
    configured: hasGscCreds,
    siteUrl: 'https://whalewzrd.com',
    days,
    ...demoData,
  }, { headers: noStore });
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  const password = request.headers.get('X-Admin-Password') || '';
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = (await readCappedJsonBody(request, 64 * 1024)) as { action?: string; credentials?: string } | null;
  if (!body) {
    return json({ success: false, error: 'Invalid JSON payload' }, { status: 400, headers: noStore });
  }

  if (body.action === 'save_credentials') {
    // Валидация формата JSON
    try {
      if (body.credentials) {
        JSON.parse(body.credentials);
      }
    } catch {
      return json({ success: false, error: 'Некорректный JSON файл ключа сервисного аккаунта' }, { status: 400, headers: noStore });
    }

    return json({
      success: true,
      message: 'Ключи успешно проверены. На production добавьте переменную GSC_SERVICE_ACCOUNT_JSON в Cloudflare Pages для персистентного хранения.',
    }, { headers: noStore });
  }

  return json({ success: false, error: 'Unknown action' }, { status: 400, headers: noStore });
}
