import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Copy, Trash2, Upload, Check, FileText } from 'lucide-react';

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

export default function AdminMedia({ password }: { password: string }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

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

  if (loading) return <div className="p-6 text-sm text-[var(--adm-fg)]/60">Загрузка медиатеки…</div>;

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 space-y-3">
        <p className="text-sm text-[var(--adm-fg)]/75">{error}</p>
        <p className="text-xs text-[var(--adm-fg)]/55">Медиатека работает на продакшене, где подключено хранилище R2.</p>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs hover:bg-[var(--adm-muted)]/50">
          <RefreshCw className="h-3.5 w-3.5" /> Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-[var(--adm-fg)]/70">{files.length} файлов в хранилище</span>
        <div className="flex gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs hover:bg-[var(--adm-primary)]/10 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <Upload className="h-3.5 w-3.5" /> {uploading ? 'Загрузка…' : 'Загрузить файлы'}
            <input type="file" multiple className="hidden" onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50">
            <RefreshCw className="h-3.5 w-3.5" /> Обновить
          </button>
        </div>
      </div>

      {files.length === 0 && (
        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 text-sm text-[var(--adm-fg)]/60">
          Файлов пока нет — загрузите первый через кнопку выше или из редактора статьи.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => {
          const isImage = file.contentType.startsWith('image/');
          return (
            <div key={file.key} className="overflow-hidden rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)]">
              <div className="flex h-28 items-center justify-center bg-[var(--adm-muted)]/40">
                {isImage ? (
                  <img src={file.url} alt={file.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-8 w-8 text-[var(--adm-fg)]/35" />
                )}
              </div>
              <div className="space-y-1.5 p-2.5">
                <div className="truncate text-xs font-medium" title={file.name}>{file.name}</div>
                <div className="text-[10px] text-[var(--adm-fg)]/50">{formatSize(file.size)} · {formatDate(file.uploaded)}</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => void copyUrl(file)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--adm-border)] px-2 py-1 text-[11px] hover:bg-[var(--adm-primary)]/10"
                    title="Скопировать ссылку для вставки в статью"
                  >
                    {copiedKey === file.key ? <><Check className="h-3 w-3 text-green-500" /> Готово</> : <><Copy className="h-3 w-3" /> Ссылка</>}
                  </button>
                  <button
                    onClick={() => void deleteFile(file)}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--adm-border)] px-2 py-1 text-[var(--adm-danger)] hover:bg-[var(--adm-danger)]/10"
                    title="Удалить файл"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
