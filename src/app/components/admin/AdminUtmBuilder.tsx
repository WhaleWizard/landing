import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { notify } from './AdminFeedback';
import { toCanonicalUrl } from '../SEO';

export interface UtmPreset {
  id: 'meta' | 'google' | 'telegram' | 'custom';
  name: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}

const PRESETS: UtmPreset[] = [
  {
    id: 'meta',
    name: 'Meta Ads',
    source: 'fb',
    medium: 'cpc',
    campaign: '{{campaign.name}}',
    content: '{{ad.name}}',
    term: '{{adset.name}}',
  },
  {
    id: 'google',
    name: 'Google Ads',
    source: 'google',
    medium: 'cpc',
    campaign: '{campaignid}',
    content: '{creative}',
    term: '{keyword}',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    source: 'telegram',
    medium: 'post',
    campaign: 'seed',
    content: 'channel_post',
    term: '',
  },
  {
    id: 'custom',
    name: 'Свой шаблон',
    source: '',
    medium: 'cpc',
    campaign: '',
    content: '',
    term: '',
  },
];

const LANDINGS: Array<{ path: string; label: string }> = [
  { path: '/', label: 'Главная' },
  { path: '/meta-ads', label: 'Meta Ads' },
  { path: '/google-ads', label: 'Google Ads' },
  { path: '/meta-apps', label: 'Meta Apps' },
  { path: '/consult', label: 'Консультация' },
  { path: '/calculator', label: 'Калькулятор бюджета' },
  { path: '/roi-calculator', label: 'Калькулятор ROI' },
];

interface UtmHistoryItem {
  id: string;
  url: string;
  source: string;
  campaign: string;
  createdAt: string;
}

const UTM_HISTORY_KEY = 'ww_admin_utm_history';
const UTM_HISTORY_LIMIT = 8;

export function readUtmHistory(raw: string | null): UtmHistoryItem[] {
  let saved: unknown;
  try {
    saved = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(saved)) return [];

  const recent = new Map<string, UtmHistoryItem>();
  for (const item of saved) {
    if (!item || typeof item.url !== 'string' || typeof item.id !== 'string' || recent.has(item.url)) continue;
    try {
      const url = new URL(item.url);
      if (!['https://www.whalewzrd.com', 'https://whalewzrd.com'].includes(url.origin) || url.username || url.password) continue;
      recent.set(item.url, {
        id: item.id,
        url: item.url,
        source: typeof item.source === 'string' ? item.source : url.searchParams.get('utm_source') || 'direct',
        campaign: typeof item.campaign === 'string' ? item.campaign : url.searchParams.get('utm_campaign') || 'none',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      });
      if (recent.size === UTM_HISTORY_LIMIT) break;
    } catch {
      // A damaged entry does not hide the other links.
    }
  }
  return [...recent.values()];
}

export default function AdminUtmBuilder() {
  const [selectedLanding, setSelectedLanding] = useState<string>('/meta-ads');
  const [customPath, setCustomPath] = useState<string>('');
  const [activePreset, setActivePreset] = useState<string>('meta');

  const [utmSource, setUtmSource] = useState('fb');
  const [utmMedium, setUtmMedium] = useState('cpc');
  const [utmCampaign, setUtmCampaign] = useState('{{campaign.name}}');
  const [utmContent, setUtmContent] = useState('{{ad.name}}');
  const [utmTerm, setUtmTerm] = useState('{{adset.name}}');

  const [checkingTarget, setCheckingTarget] = useState<string | null>(null);
  const activeCheck = useRef<{ target: string; controller: AbortController } | null>(null);
  const [lastCheck, setCheckStatus] = useState<{ url: string; ok: boolean; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<{ url: string } | null>(null);
  const [history, setHistory] = useState<UtmHistoryItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      setHistory(readUtmHistory(localStorage.getItem(UTM_HISTORY_KEY)));
    } catch {}
  }, []);

  // Apply preset
  const handleApplyPreset = (presetId: string) => {
    setActivePreset(presetId);
    const p = PRESETS.find((x) => x.id === presetId);
    if (p) {
      setUtmSource(p.source);
      setUtmMedium(p.medium);
      setUtmCampaign(p.campaign);
      setUtmContent(p.content);
      setUtmTerm(p.term);
    }
  };

  const baseUrl = useMemo(() => {
    const raw = selectedLanding === '__custom__' ? customPath.trim() : selectedLanding;
    if (!raw || raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || /[\\\u0000-\u001f]/.test(raw)) return '';
    try {
      const url = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://www.whalewzrd.com');
      if (/^\/(blog|cases)\/[^/]+\/$/.test(url.pathname)) url.pathname = url.pathname.slice(0, -1);
      return toCanonicalUrl(url.href);
    } catch {
      return '';
    }
  }, [selectedLanding, customPath]);

  // Full clean URL
  const fullUrl = useMemo(() => {
    if (!baseUrl) return '';
    const url = new URL(baseUrl);
    const params = url.searchParams;

    if (utmSource.trim()) params.set('utm_source', utmSource.trim());
    if (utmMedium.trim()) params.set('utm_medium', utmMedium.trim());
    if (utmCampaign.trim()) params.set('utm_campaign', utmCampaign.trim());
    if (utmContent.trim()) params.set('utm_content', utmContent.trim());
    if (utmTerm.trim()) params.set('utm_term', utmTerm.trim());

    // ValueTrack & Meta Ads macros ({...} and {{...}}) must not be percent-encoded (%7B/%7D),
    // otherwise Meta Ads Manager and Google Ads ValueTrack fail to expand dynamic tokens.
    const qs = params.toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}');
    return `${url.origin}${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`;
  }, [baseUrl, utmSource, utmMedium, utmCampaign, utmContent, utmTerm]);

  const checkTarget = useMemo(() => {
    if (!baseUrl) return '';
    const url = new URL(baseUrl);
    return url.pathname + url.search;
  }, [baseUrl]);
  const checking = checkingTarget === checkTarget;
  const checkStatus = lastCheck?.url === checkTarget ? lastCheck : null;
  const copied = copiedLink?.url === fullUrl;

  useEffect(() => {
    setCheckingTarget((current) => current === checkTarget ? current : null);
    return () => {
      const request = activeCheck.current;
      if (request?.target !== checkTarget) return;
      activeCheck.current = null;
      request.controller.abort();
    };
  }, [checkTarget]);

  useEffect(() => {
    if (!copiedLink) return;
    const timer = window.setTimeout(() => setCopiedLink(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);

  // Validate URL (200 OK ping)
  const handleVerifyUrl = async () => {
    if (!checkTarget || activeCheck.current?.target === checkTarget) return;
    activeCheck.current?.controller.abort();
    const controller = new AbortController();
    const request = { target: checkTarget, controller };
    activeCheck.current = request;
    setCheckingTarget(checkTarget);
    setCheckStatus(null);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(checkTarget, {
        method: 'HEAD', cache: 'no-store', redirect: 'manual', signal: controller.signal,
      });
      if (activeCheck.current !== request) return;
      const message = res.type === 'opaqueredirect'
        ? 'Посадочная страница перенаправляет на другой адрес'
        : `HTTP ${res.status} — ${res.status === 200 ? 'посадочная страница доступна' : 'проверьте путь посадочной страницы'}`;
      setCheckStatus({ url: checkTarget, ok: res.status === 200, message });
    } catch {
      if (activeCheck.current === request) {
        setCheckStatus({ url: checkTarget, ok: false, message: 'Не удалось проверить доступность страницы. Повторите попытку.' });
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeCheck.current === request) {
        activeCheck.current = null;
        setCheckingTarget(null);
      }
    }
  };

  // Copy URL with toast & history saving
  const handleCopyUrl = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink({ url: fullUrl });
      notify.success('Ссылка скопирована', fullUrl);

      // Save to history
      const newItem: UtmHistoryItem = {
        id: String(Date.now()),
        url: fullUrl,
        source: utmSource || 'direct',
        campaign: utmCampaign || 'none',
        createdAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      };

      setHistory((prev) => {
        const next = [newItem, ...prev.filter((i) => i.url !== fullUrl)].slice(0, UTM_HISTORY_LIMIT);
        try {
          localStorage.setItem(UTM_HISTORY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch {
      notify.error('Не удалось скопировать ссылку');
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(UTM_HISTORY_KEY);
    } catch {}
    notify.success('История ссылок очищена');
  };

  return (
    <div className="admin-utm-builder space-y-4" aria-label="Генератор ссылок с UTM-метками">
      {/* Выбор рекламной площадки */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--adm-text-secondary)]">
          1. Рекламная система
        </span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Пресеты рекламных систем">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`admin-crm-chip ${activePreset === p.id ? 'is-active is-primary' : ''}`}
              aria-pressed={activePreset === p.id}
              onClick={() => handleApplyPreset(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Выбор посадочной страницы */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--adm-text-secondary)]">
          2. Посадочная страница
        </span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Посадочные страницы">
          {LANDINGS.map((l) => (
            <button
              key={l.path}
              type="button"
              className={`admin-crm-chip ${selectedLanding === l.path ? 'is-active' : ''}`}
              aria-pressed={selectedLanding === l.path}
              onClick={() => { setSelectedLanding(l.path); setCheckStatus(null); }}
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            className={`admin-crm-chip ${selectedLanding === '__custom__' ? 'is-active' : ''}`}
            aria-pressed={selectedLanding === '__custom__'}
            onClick={() => { setSelectedLanding('__custom__'); setCheckStatus(null); }}
          >
            Свой путь…
          </button>
        </div>

        {selectedLanding === '__custom__' && (
          <div className="mt-2">
            <input
              className="admin-input text-xs w-full max-w-md"
              placeholder="/blog/kak-nastroit-conversions-api"
              aria-label="Свой путь к странице"
              value={customPath}
              onChange={(e) => { setCustomPath(e.target.value); setCheckStatus(null); }}
            />
          </div>
        )}
      </div>

      {/* Поля UTM-параметров */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--adm-text-secondary)]">
          3. Параметры кампании
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)]">
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_source <span className="text-rose-400">*</span>
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="fb, google, tg"
              aria-label="utm_source"
              value={utmSource}
              onChange={(e) => setUtmSource(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_medium <span className="text-rose-400">*</span>
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="cpc, post, story"
              aria-label="utm_medium"
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_campaign <span className="text-rose-400">*</span>
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="{{campaign.name}}, retargeting"
              aria-label="utm_campaign"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_content (объявление / креатив)
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="{{ad.name}}, banner_v1"
              aria-label="utm_content"
              value={utmContent}
              onChange={(e) => setUtmContent(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_term (аудитория / ключ)
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="{{adset.name}}, performance"
              aria-label="utm_term"
              value={utmTerm}
              onChange={(e) => setUtmTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Готовая ссылка и валидация */}
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--adm-text-secondary)]">
          <span>Готовая ссылка</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="admin-button admin-button--compact admin-button--quiet text-xs"
              onClick={handleVerifyUrl}
              disabled={checking || !baseUrl}
            >
              <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {checking ? 'Проверяю…' : 'Проверить страницу'}
            </button>
          </div>
        </div>

        <div className="admin-utm-result">
          <div className="min-w-0 font-mono text-xs text-[var(--adm-text-primary)] select-all leading-relaxed">
            {fullUrl || 'Укажите путь к странице сайта'}
          </div>
          <button
            type="button"
            className="admin-button admin-button--primary admin-button--compact px-3"
            onClick={handleCopyUrl}
            disabled={!fullUrl}
            title="Скопировать ссылку"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
          </button>
        </div>

        {checkStatus && (
          <div className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${checkStatus.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`} role="status">
            {checkStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{checkStatus.message}</span>
          </div>
        )}
      </div>

      {/* История сформированных ссылок */}
      {history.length > 0 && (
        <div className="pt-3 border-t border-[var(--adm-border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--adm-text-secondary)]">Недавние ссылки ({history.length}):</span>
            <button
              type="button"
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={handleClearHistory}
            >
              Очистить историю
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {history.map((h) => (
              <div key={h.url} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[var(--adm-border-subtle)] bg-[var(--adm-surface-subtle)] text-xs">
                <div className="min-w-0 flex-1 truncate font-mono text-[11px]" title={h.url}>
                  <span className="text-indigo-400 font-semibold mr-1.5">[{h.source}]</span>
                  <span className="text-zinc-300">{h.url}</span>
                </div>
                <button
                  type="button"
                  className="admin-button admin-button--quiet admin-button--compact text-xs shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(h.url);
                      notify.success('Скопировано из истории', h.url);
                    } catch {
                      notify.error('Не удалось скопировать ссылку');
                    }
                  }}
                  title="Скопировать эту ссылку"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
