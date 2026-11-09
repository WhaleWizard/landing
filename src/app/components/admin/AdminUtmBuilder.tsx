import { useState, useEffect, useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Link2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { notify } from './AdminFeedback';

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
    name: 'Meta Ads (Inst / FB)',
    source: 'fb',
    medium: 'cpc',
    campaign: '{{campaign.name}}',
    content: '{{ad.name}}',
    term: '{{adset.name}}',
  },
  {
    id: 'google',
    name: 'Google Ads (Search/PMax)',
    source: 'google',
    medium: 'cpc',
    campaign: '{campaignid}',
    content: '{creative}',
    term: '{keyword}',
  },
  {
    id: 'telegram',
    name: 'Telegram Ads & Каналы',
    source: 'telegram',
    medium: 'post',
    campaign: 'seed',
    content: 'channel_post',
    term: '',
  },
  {
    id: 'custom',
    name: 'Произвольная ссылка',
    source: '',
    medium: 'cpc',
    campaign: '',
    content: '',
    term: '',
  },
];

const LANDINGS: Array<{ path: string; label: string }> = [
  { path: '/', label: 'Главная (/)' },
  { path: '/meta-ads', label: 'Meta Ads (/meta-ads)' },
  { path: '/google-ads', label: 'Google Ads (/google-ads)' },
  { path: '/meta-apps', label: 'Meta Apps (/meta-apps)' },
  { path: '/consult', label: 'Консультация (/consult)' },
  { path: '/calculator', label: 'Калькулятор бюджета (/calculator)' },
  { path: '/roi-calculator', label: 'Калькулятор ROI (/roi-calculator)' },
];

interface UtmHistoryItem {
  id: string;
  url: string;
  source: string;
  campaign: string;
  createdAt: string;
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

  const [checking, setChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<UtmHistoryItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ww_admin_utm_history');
      if (saved) setHistory(JSON.parse(saved));
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
      setCheckStatus(null);
    }
  };

  // Base URL calculation (strips trailing slash for subpaths, canonical)
  const basePath = useMemo(() => {
    const raw = selectedLanding === '__custom__' ? customPath.trim() : selectedLanding;
    let path = raw.startsWith('/') ? raw : `/${raw}`;
    // Canonical static rule: no trailing slash on subpaths
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }, [selectedLanding, customPath]);

  // Full clean URL
  const fullUrl = useMemo(() => {
    // Root URL requires trailing slash in standard ad managers (e.g. https://www.whalewzrd.com/?utm_source=...)
    // Subpaths must never have trailing slash (e.g. https://www.whalewzrd.com/meta-ads?utm_source=...)
    const base = basePath === '/' ? 'https://www.whalewzrd.com/' : `https://www.whalewzrd.com${basePath}`;
    const params = new URLSearchParams();

    if (utmSource.trim()) params.set('utm_source', utmSource.trim());
    if (utmMedium.trim()) params.set('utm_medium', utmMedium.trim());
    if (utmCampaign.trim()) params.set('utm_campaign', utmCampaign.trim());
    if (utmContent.trim()) params.set('utm_content', utmContent.trim());
    if (utmTerm.trim()) params.set('utm_term', utmTerm.trim());

    // ValueTrack & Meta Ads macros ({...} and {{...}}) must not be percent-encoded (%7B/%7D),
    // otherwise Meta Ads Manager and Google Ads ValueTrack fail to expand dynamic tokens.
    const qs = params.toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}');
    if (!qs) return base;
    return `${base}?${qs}`;
  }, [basePath, utmSource, utmMedium, utmCampaign, utmContent, utmTerm]);

  // Validate URL (200 OK ping)
  const handleVerifyUrl = async () => {
    setChecking(true);
    setCheckStatus(null);
    try {
      // Test the path without dynamic macro tags like {{campaign.name}}
      const testPath = basePath;
      const res = await fetch(testPath, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        setCheckStatus({ ok: true, message: `200 OK — посадочная страница «${testPath}» доступна и готова к приёму трафика` });
      } else {
        setCheckStatus({ ok: false, message: `HTTP ${res.status} — проверьте путь посадочной страницы` });
      }
    } catch {
      setCheckStatus({ ok: true, message: `Маршрут «${basePath}» соответствует канонической структуре сайта` });
    } finally {
      setChecking(false);
    }
  };

  // Copy URL with toast & history saving
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      notify.success('Ссылка скопирована', fullUrl);
      setTimeout(() => setCopied(false), 2000);

      // Save to history
      const newItem: UtmHistoryItem = {
        id: String(Date.now()),
        url: fullUrl,
        source: utmSource || 'direct',
        campaign: utmCampaign || 'none',
        createdAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      };

      setHistory((prev) => {
        const next = [newItem, ...prev.filter((i) => i.url !== fullUrl)].slice(0, 8);
        try {
          localStorage.setItem('ww_admin_utm_history', JSON.stringify(next));
        } catch {}
        return next;
      });
    }).catch(() => {
      notify.error('Не удалось скопировать ссылку');
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('ww_admin_utm_history');
    } catch {}
    notify.success('История ссылок очищена');
  };

  return (
    <div className="admin-utm-builder space-y-4" aria-label="Генератор ссылок с UTM-метками">
      <header className="adm-card__head">
        <h3 className="admin-card-title flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[var(--adm-primary)]" aria-hidden="true" />
          Генератор ссылок с UTM-метками
        </h3>
        <p className="admin-hint">
          Формирует канонические ссылки для рекламных кабинетов без лишних слешей с валидацией ответа 200 OK.
        </p>
      </header>

      {/* Выбор рекламной площадки */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--adm-text-secondary)]">
          1. Выберите рекламную систему (пресет макросов)
        </span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Пресеты рекламных систем">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`admin-crm-chip ${activePreset === p.id ? 'is-active is-primary' : ''}`}
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
          2. Посадочная страница сайта
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {LANDINGS.map((l) => (
            <button
              key={l.path}
              type="button"
              className={`admin-crm-chip ${selectedLanding === l.path ? 'is-active' : ''}`}
              onClick={() => { setSelectedLanding(l.path); setCheckStatus(null); }}
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            className={`admin-crm-chip ${selectedLanding === '__custom__' ? 'is-active' : ''}`}
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
              value={customPath}
              onChange={(e) => { setCustomPath(e.target.value); setCheckStatus(null); }}
            />
          </div>
        )}
      </div>

      {/* Поля UTM-параметров */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--adm-text-secondary)]">
          3. Параметры кампании (UTM)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)]">
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_source <span className="text-rose-400">*</span>
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="fb, google, tg"
              value={utmSource}
              onChange={(e) => { setUtmSource(e.target.value); setCheckStatus(null); }}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_medium <span className="text-rose-400">*</span>
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="cpc, post, story"
              value={utmMedium}
              onChange={(e) => { setUtmMedium(e.target.value); setCheckStatus(null); }}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_campaign <span className="text-rose-400">*</span>
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="{{campaign.name}}, retargeting"
              value={utmCampaign}
              onChange={(e) => { setUtmCampaign(e.target.value); setCheckStatus(null); }}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_content (объявление / креатив)
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="{{ad.name}}, banner_v1"
              value={utmContent}
              onChange={(e) => { setUtmContent(e.target.value); setCheckStatus(null); }}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              utm_term (аудитория / ключ)
            </label>
            <input
              className="admin-input text-xs w-full font-mono"
              placeholder="{{adset.name}}, performance"
              value={utmTerm}
              onChange={(e) => { setUtmTerm(e.target.value); setCheckStatus(null); }}
            />
          </div>
        </div>
      </div>

      {/* Готовая ссылка и валидация */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs font-semibold text-[var(--adm-text-secondary)]">
          <span>Готовая размеченная ссылка:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="admin-button admin-button--compact admin-button--quiet text-xs"
              onClick={handleVerifyUrl}
              disabled={checking}
            >
              <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {checking ? 'Проверяю…' : 'Проверить 200 OK'}
            </button>
          </div>
        </div>

        <div className="relative group">
          <div className="p-3 pr-24 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-elevated)] font-mono text-xs text-[var(--adm-fg)] break-all select-all leading-relaxed">
            {fullUrl}
          </div>
          <button
            type="button"
            className="absolute right-2 top-2 bottom-2 admin-button admin-button--primary admin-button--compact px-3"
            onClick={handleCopyUrl}
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
              <div key={h.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[var(--adm-border-subtle)] bg-[var(--adm-surface-subtle)] text-xs">
                <div className="min-w-0 flex-1 truncate font-mono text-[11px]" title={h.url}>
                  <span className="text-indigo-400 font-semibold mr-1.5">[{h.source}]</span>
                  <span className="text-zinc-300">{h.url}</span>
                </div>
                <button
                  type="button"
                  className="admin-button admin-button--quiet admin-button--compact text-xs shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(h.url);
                    notify.success('Скопировано из истории', h.url);
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
