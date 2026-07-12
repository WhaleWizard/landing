import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';

interface LeadRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  telegram_username: string;
  contact_method: string;
  budget: string;
  message: string;
  service: string;
  page_path: string;
  status: string;
  telegram_delivered: number;
  created_at: string;
  submissions_count?: number;
  last_submitted_at?: string | null;
  quality?: string;
  marketing_consent?: number;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'new', label: 'новая' },
  { value: 'in_progress', label: 'в работе' },
  { value: 'closed', label: 'закрыта' },
];

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-[var(--adm-primary)]/15 text-[var(--adm-primary)] border-[var(--adm-primary)]/40',
  in_progress: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/40',
  closed: 'bg-green-500/10 text-green-500 border-green-500/40',
};

function formatDate(raw: string): string {
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function contactLink(lead: LeadRow): { href: string; label: string } | null {
  if (lead.telegram_username) {
    const username = lead.telegram_username.replace(/^@/, '');
    return { href: `https://t.me/${username}`, label: `@${username}` };
  }
  if (lead.contact_method === 'whatsapp' && lead.phone) {
    return { href: `https://wa.me/${lead.phone.replace(/\D/g, '')}`, label: 'WhatsApp' };
  }
  return null;
}

export default function AdminLeads({ password }: { password: string }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [metaNotice, setMetaNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/leads', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; leads?: LeadRow[]; counts?: Record<string, number> } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setLeads(payload.leads || []);
      setCounts(payload.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const updateLead = async (id: number, patch: { status?: string; quality?: string }) => {
    const previous = leads;
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)));
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; meta?: { status: string; reason?: string } } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      // Обратная связь по событию качества для Meta
      if (patch.quality === 'target' || patch.quality === 'nontarget') {
        const eventName = patch.quality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead';
        const meta = payload.meta;
        if (meta?.status === 'sent') setMetaNotice(`✓ Событие ${eventName} отправлено в Meta`);
        else if (meta?.status === 'failed') setMetaNotice(`Метка сохранена. ${eventName}: ${meta.reason || 'ошибка отправки'}`);
        else if (meta) setMetaNotice(`Метка сохранена, событие в Meta не отправлено: ${meta.reason || 'пропущено'}`);
        window.setTimeout(() => setMetaNotice(''), 6000);
      }
      await load();
    } catch (err) {
      setLeads(previous);
      alert('Не удалось обновить заявку: ' + (err instanceof Error ? err.message : 'ошибка'));
    }
  };

  const visible = filter === 'all'
    ? leads
    : filter === 'target' || filter === 'nontarget'
      ? leads.filter((lead) => (lead.quality || '') === filter)
      : leads.filter((lead) => lead.status === filter);

  if (loading) return <div className="p-6 text-sm text-[var(--adm-fg)]/60">Загрузка заявок…</div>;

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 space-y-3">
        <p className="text-sm text-[var(--adm-fg)]/75">{error}</p>
        <p className="text-xs text-[var(--adm-fg)]/55">Раздел работает на продакшене после применения миграции 0008. Заявки начнут сохраняться с момента деплоя; в Telegram они приходят как раньше.</p>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs hover:bg-[var(--adm-muted)]/50">
          <RefreshCw className="h-3.5 w-3.5" /> Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all', label: `Все (${leads.length})` },
            ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: `${s.label} (${counts[s.value] || 0})` })),
            { value: 'target', label: `целевые (${leads.filter((l) => l.quality === 'target').length})` },
            { value: 'nontarget', label: `нецелевые (${leads.filter((l) => l.quality === 'nontarget').length})` },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${filter === option.value ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/15 text-[var(--adm-primary)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50">
          <RefreshCw className="h-3.5 w-3.5" /> Обновить
        </button>
      </div>

      {metaNotice && (
        <div className="rounded-xl border border-[var(--adm-primary)]/30 bg-[var(--adm-primary)]/10 px-4 py-2.5 text-sm text-[var(--adm-fg)]/85">
          {metaNotice}
        </div>
      )}

      {visible.length === 0 && (
        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 text-sm text-[var(--adm-fg)]/60">
          Заявок с таким статусом нет.
        </div>
      )}

      <div className="space-y-3">
        {visible.map((lead) => {
          const link = contactLink(lead);
          const repeatCount = Number(lead.submissions_count || 1);
          return (
            <div key={lead.id} className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{lead.name || 'Без имени'}</span>
                    <span className="text-xs text-[var(--adm-fg)]/50">{formatDate(lead.last_submitted_at || lead.created_at)}</span>
                    {repeatCount > 1 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500" title={`Первая заявка: ${formatDate(lead.created_at)}`}>
                        🔁 уже оставлял ×{repeatCount} · первая {formatDate(lead.created_at)}
                      </span>
                    )}
                    {lead.telegram_delivered !== 1 && (
                      <span className="rounded-full bg-[var(--adm-danger)]/10 px-2 py-0.5 text-xs text-[var(--adm-danger)]" title="Уведомление в Telegram не подтверждено">
                        нет тг-уведомления
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--adm-fg)]/65">
                    {lead.email && <span>{lead.email}</span>}
                    {lead.phone && <span>{lead.phone}</span>}
                    {link && (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--adm-primary)] hover:underline">
                        <Send className="h-3 w-3" /> {link.label}
                      </a>
                    )}
                    {lead.budget && <span>Бюджет: {lead.budget}</span>}
                    {lead.service && <span>Услуга: {lead.service}</span>}
                    {lead.page_path && <span>Со страницы: {lead.page_path}</span>}
                  </div>
                  {lead.message && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--adm-fg)]/85">{lead.message}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <select
                    value={lead.status}
                    onChange={(e) => void updateLead(lead.id, { status: e.target.value })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${STATUS_STYLES[lead.status] || STATUS_STYLES.new} bg-[var(--adm-card)]`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => void updateLead(lead.id, { quality: lead.quality === 'target' ? '' : 'target' })}
                      className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${lead.quality === 'target' ? 'border-green-500/60 bg-green-500/15 font-semibold text-green-500' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/55 hover:bg-[var(--adm-muted)]/50'}`}
                      title="Пометить как целевую заявку — в Meta уйдёт событие QualifiedLead (повторное нажатие снимает метку)"
                    >
                      целевой
                    </button>
                    <button
                      onClick={() => void updateLead(lead.id, { quality: lead.quality === 'nontarget' ? '' : 'nontarget' })}
                      className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${lead.quality === 'nontarget' ? 'border-[var(--adm-danger)]/60 bg-[var(--adm-danger)]/15 font-semibold text-[var(--adm-danger)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/55 hover:bg-[var(--adm-muted)]/50'}`}
                      title="Пометить как нецелевую заявку — в Meta уйдёт событие UnqualifiedLead (повторное нажатие снимает метку)"
                    >
                      нецелевой
                    </button>
                  </div>
                  {lead.marketing_consent === 0 && (
                    <span className="text-[10px] text-[var(--adm-fg)]/40" title="Посетитель не дал согласие на маркетинг — событие качества в Meta не отправится">
                      без согласия — в Meta не уйдёт
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
