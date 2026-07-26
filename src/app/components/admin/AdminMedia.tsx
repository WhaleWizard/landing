import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Copy, Trash2, Upload, Check, FileText, Search, Image as ImageIcon, FileArchive, File } from 'lucide-react';
import { AdminButton, AdminMeta, AdminPanel, AdminSectionHeading } from './AdminUI';
import type { Article } from '../hooks/useArticlesApi';

interface MediaFile {
  key: string;
  url: string;
  size: number;
  uploaded: string;
  contentType: string;
  name: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('ru-RU');
}

export default function AdminMedia({ password, articles }: { password: string; articles: Article[] }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'document'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/media', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; files?: MediaFile[] } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setFiles(payload.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список файлов');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const mediaUsage = useMemo(() => {
    const usage = new Map<string, string[]>();
    files.forEach((file) => {
      const references = articles
        .filter((article) => String(article.image || '').trim() === file.url || String(article.content || '').includes(file.url) || String(article.content || '').includes(file.key))
        .map((article) => article.title || article.slug);
      usage.set(file.key, references);
    });
    return usage;
  }, [articles, files]);

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return files.filter((file) => {
      const isImage = file.contentType.startsWith('image/');
      if (kind === 'image' && !isImage) return false;
      if (kind === 'document' && isImage) return false;
      return !normalizedQuery || `${file.name} ${file.contentType}`.toLowerCase().includes(normalizedQuery);
    });
  }, [files, kind, query]);

  const copyUrl = async (file: MediaFile) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedKey(file.key);
      window.setTimeout(() => setCopiedKey(''), 1500);
    } catch {
      prompt('Скопируйте ссылку вручную:', file.url);
    }
  };

  const deleteFile = async (file: MediaFile) => {
    const references = mediaUsage.get(file.key) || [];
    if (references.length > 0) {
      alert(`Файл используется в публикациях: ${references.slice(0, 3).join(', ')}${references.length > 3 ? '…' : ''}. Сначала замените или удалите его из контента.`);
      return;
    }
    if (!confirm(`Удалить файл «${file.name}»? Если он используется в статье, картинка там сломается.`)) return;
    try {
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'delete', key: file.key }),
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setFiles((current) => current.filter((item) => item.key !== file.key));
    } catch (err) {
      alert('Не удалось удалить файл: ' + (err instanceof Error ? err.message : 'ошибка'));
    }
  };

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const form = new FormData();
        form.append('file', file);
        form.append('password', password);
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'X-Admin-Password': password },
          credentials: 'same-origin',
          body: form,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      }
      await load();
    } catch (err) {
      alert('Ошибка загрузки: ' + (err instanceof Error ? err.message : 'ошибка'));
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-[var(--adm-fg)]/60" role="status">Загрузка медиатеки…</div>;

  if (error) {
    return (
      <AdminPanel className="p-6 space-y-3" role="alert">
        <p className="text-sm text-[var(--adm-fg)]/75">{error}</p>
        <p className="admin-meta">Медиатека работает на продакшене, где подключено хранилище R2.</p>
        <AdminButton onClick={() => void load()} compact>
          <RefreshCw className="h-3.5 w-3.5" /> Повторить
        </AdminButton>
      </AdminPanel>
    );
  }

  return (
    <div className="admin-stack">
      <AdminSectionHeading
        title="Медиатека"
        description={`${files.length} файлов в хранилище`}
        action={<div className="admin-media-actions flex gap-2">
          <label className={`admin-button cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <Upload className="h-3.5 w-3.5" /> {uploading ? 'Загрузка…' : 'Загрузить файлы'}
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" aria-label="Выбрать файлы для загрузки" onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <AdminButton onClick={() => void load()} compact aria-label="Обновить медиатеку">
            <RefreshCw className="h-3.5 w-3.5" /> Обновить
          </AdminButton>
        </div>}
      />

      <AdminPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--adm-fg)]/40" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти файл по имени или типу" aria-label="Поиск в медиатеке" className="w-full rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-[var(--adm-primary)]/45" />
        </label>
        <div className="flex rounded-xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/35 p-1 text-xs">
          {[
            ['all', 'Все', File],
            ['image', 'Изображения', ImageIcon],
            ['document', 'Файлы', FileArchive],
          ].map(([value, label, Icon]) => (
            <button key={value} type="button" onClick={() => setKind(value as 'all' | 'image' | 'document')} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition ${kind === value ? 'bg-[var(--adm-card)] text-[var(--adm-primary)] shadow-sm' : 'text-[var(--adm-fg)]/60 hover:text-[var(--adm-fg)]'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </AdminPanel>

      {files.length === 0 && (
        <AdminPanel className="p-6 text-sm text-[var(--adm-fg)]/60">
          Файлов пока нет — загрузите первый через кнопку выше или из редактора статьи.
        </AdminPanel>
      )}

      {files.length > 0 && visibleFiles.length === 0 && (
        <AdminPanel className="p-6 text-center text-sm text-[var(--adm-fg)]/60">Ничего не найдено. Измените запрос или фильтр.</AdminPanel>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visibleFiles.map((file) => {
          const isImage = file.contentType.startsWith('image/');
          const references = mediaUsage.get(file.key) || [];
          return (
            <AdminPanel key={file.key} className="admin-panel--interactive admin-media-card">
              <div className="admin-media-card__preview flex h-36 items-center justify-center sm:h-32">
                {isImage ? (
                  <img src={file.url} alt={file.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-8 w-8 text-[var(--adm-fg)]/35" />
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="truncate text-sm font-semibold" title={file.name}>{file.name}</div>
                <AdminMeta className="block">{formatSize(file.size)} · {formatDate(file.uploaded)}</AdminMeta>
                {references.length > 0 ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400" title={references.join(', ')}>
                    Используется: {references.length} {references.length === 1 ? 'публикация' : 'публикации'}
                  </div>
                ) : <div className="text-xs text-[var(--adm-fg)]/45">Не используется в публикациях</div>}
                <div className="admin-media-card__actions flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyUrl(file)}
                    className="admin-button admin-button--compact flex-1"
                    title="Скопировать ссылку для вставки в статью"
                    aria-label={`Скопировать ссылку на ${file.name}`}
                  >
                    {copiedKey === file.key ? <><Check className="h-3 w-3 text-green-500" /> Готово</> : <><Copy className="h-3 w-3" /> Ссылка</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteFile(file)}
                    disabled={references.length > 0}
                    className="admin-button admin-button--danger w-10 p-0 disabled:cursor-not-allowed disabled:opacity-35"
                    title={references.length > 0 ? 'Сначала уберите файл из публикаций' : 'Удалить файл'}
                    aria-label={`Удалить ${file.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </AdminPanel>
          );
        })}
      </div>
    </div>
  );
}
