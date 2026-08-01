import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Copy, File, FileArchive, FileText, FolderPlus, Folder, FolderOpen,
  Image as ImageIcon, Link2Off, RefreshCw, Search, Trash2, Upload, X,
} from 'lucide-react';
import { AdminButton, AdminMeta, AdminPanel, AdminSectionHeading, AdminSelect } from './AdminUI';
import type { Article } from '../hooks/useArticlesApi';

interface MediaFile {
  key: string;
  url: string;
  size: number;
  uploaded: string;
  contentType: string;
  name: string;
  folder: string;
}

interface MediaFolder {
  name: string;
  count: number;
  size: number;
}

type Collection = 'all' | 'images' | 'documents' | 'used' | 'unused';
type SortKey = 'new' | 'old' | 'name' | 'size';

const COLLECTIONS: Array<{ value: Collection; label: string; hint: string }> = [
  { value: 'all', label: 'Все', hint: 'Все файлы выбранной папки' },
  { value: 'images', label: 'Изображения', hint: 'Только картинки' },
  { value: 'documents', label: 'Документы', hint: 'PDF, архивы и офисные файлы' },
  { value: 'used', label: 'В публикациях', hint: 'Файлы, на которые ссылаются статьи и кейсы' },
  { value: 'unused', label: 'Нигде не используются', hint: 'Кандидаты на удаление' },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'old', label: 'Сначала старые' },
  { value: 'name', label: 'По имени' },
  { value: 'size', label: 'Сначала тяжёлые' },
];

const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf,application/zip,'
  + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,'
  + 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,'
  + 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<Collection>('all');
  const [sort, setSort] = useState<SortKey>('new');
  // null — «все файлы», '' — файлы вне папок, иначе имя папки.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<MediaFile | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const dropDepth = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/media', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; files?: MediaFile[]; folders?: MediaFolder[] } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setFiles(payload.files || []);
      setFolders(payload.folders || []);
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
        .filter((article) => String(article.image || '').trim() === file.url
          || String(article.content || '').includes(file.url)
          || String(article.content || '').includes(file.key))
        .map((article) => article.title || article.slug);
      usage.set(file.key, references);
    });
    return usage;
  }, [articles, files]);

  const unfiledCount = useMemo(() => files.filter((file) => !file.folder).length, [files]);

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = files.filter((file) => {
      if (activeFolder !== null && file.folder !== activeFolder) return false;
      const isImage = file.contentType.startsWith('image/');
      const used = (mediaUsage.get(file.key) || []).length > 0;
      if (collection === 'images' && !isImage) return false;
      if (collection === 'documents' && isImage) return false;
      if (collection === 'used' && !used) return false;
      if (collection === 'unused' && used) return false;
      return !normalizedQuery || `${file.name} ${file.contentType} ${file.folder}`.toLowerCase().includes(normalizedQuery);
    });
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
      if (sort === 'size') return b.size - a.size;
      if (sort === 'old') return a.uploaded < b.uploaded ? -1 : 1;
      return a.uploaded < b.uploaded ? 1 : -1;
    });
  }, [activeFolder, collection, files, mediaUsage, query, sort]);

  const post = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Действие не выполнено');
      return false;
    } finally {
      setBusy(false);
    }
  }, [password]);

  const copyUrl = async (file: MediaFile) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedKey(file.key);
      window.setTimeout(() => setCopiedKey(''), 1500);
    } catch {
      prompt('Скопируйте ссылку вручную:', file.url);
    }
  };

  const deleteFiles = async (targets: MediaFile[]) => {
    const blocked = targets.filter((file) => (mediaUsage.get(file.key) || []).length > 0);
    if (blocked.length) {
      setError(`Нельзя удалить файлы, которые используются в публикациях: ${blocked.slice(0, 3).map((file) => file.name).join(', ')}${blocked.length > 3 ? '…' : ''}`);
      return;
    }
    if (!targets.length) return;
    const label = targets.length === 1 ? `«${targets[0].name}»` : `${targets.length} файлов`;
    if (!confirm(`Удалить ${label}? Действие необратимо.`)) return;
    if (await post({ action: 'delete', keys: targets.map((file) => file.key) })) {
      setFiles((current) => current.filter((item) => !targets.some((file) => file.key === item.key)));
      setSelected([]);
      setNotice(`Удалено файлов: ${targets.length}`);
    }
  };

  const moveFile = async (file: MediaFile, folder: string) => {
    if ((mediaUsage.get(file.key) || []).length > 0) {
      setError('Файл используется в публикациях: перенос изменит ссылку и картинка там сломается.');
      return;
    }
    if (await post({ action: 'move', key: file.key, folder })) {
      setNotice(`«${file.name}» перенесён в ${folder ? `папку «${folder}»` : 'файлы без папки'}`);
      await load();
    }
  };

  const createFolder = async () => {
    const name = prompt('Название новой папки (например: banners, кейсы, иконки):', '');
    if (name === null) return;
    if (await post({ action: 'create_folder', name })) {
      setNotice('Папка создана');
      await load();
    }
  };

  const removeFolder = async (folder: MediaFolder) => {
    if (folder.count > 0) {
      setError('Сначала перенесите или удалите файлы из папки.');
      return;
    }
    if (!confirm(`Удалить пустую папку «${folder.name}»?`)) return;
    if (await post({ action: 'delete_folder', name: folder.name })) {
      if (activeFolder === folder.name) setActiveFolder(null);
      setNotice('Папка удалена');
      await load();
    }
  };

  const uploadFiles = async (list: FileList | File[] | null) => {
    const items = list ? Array.from(list) : [];
    if (!items.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of items) {
        const form = new FormData();
        form.append('file', file);
        form.append('password', password);
        if (activeFolder) form.append('folder', activeFolder);
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
      setNotice(`Загружено файлов: ${items.length}${activeFolder ? ` в папку «${activeFolder}»` : ''}`);
      await load();
    } catch (err) {
      setError('Ошибка загрузки: ' + (err instanceof Error ? err.message : 'ошибка'));
    } finally {
      setUploading(false);
    }
  };

  const toggleSelected = (key: string) => {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const selectedFiles = files.filter((file) => selected.includes(file.key));
  const folderOptions = [
    { value: '__none__', label: 'Без папки' },
    ...folders.map((folder) => ({ value: folder.name, label: folder.name })),
  ];

  if (loading && !files.length) return <div className="p-6 text-sm text-[var(--adm-fg)]/60" role="status">Загрузка медиатеки…</div>;

  if (error && !files.length) {
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
    <div className="admin-stack media-library">
      <AdminSectionHeading
        title="Медиатека"
        description={`${files.length} файлов · ${folders.length} папок`}
        action={(
          <div className="admin-media-actions flex flex-wrap gap-2">
            <label className={`admin-button admin-button--primary cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              <Upload className="h-3.5 w-3.5" /> {uploading ? 'Загрузка…' : 'Загрузить'}
              <input
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                className="hidden"
                aria-label="Выбрать файлы для загрузки"
                onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ''; }}
              />
            </label>
            <AdminButton onClick={() => void createFolder()} compact disabled={busy}>
              <FolderPlus className="h-3.5 w-3.5" /> Новая папка
            </AdminButton>
            <AdminButton onClick={() => void load()} compact aria-label="Обновить медиатеку">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Обновить
            </AdminButton>
          </div>
        )}
      />

      {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}
      {notice ? <div className="admin-notice admin-notice--success" role="status">{notice}</div> : null}

      <div className="media-layout">
        <aside className="media-folders admin-panel" aria-label="Папки медиатеки">
          <p className="media-folders__title">Папки</p>
          <button
            type="button"
            className={activeFolder === null ? 'is-active' : ''}
            onClick={() => { setActiveFolder(null); setSelected([]); }}
          >
            <FolderOpen aria-hidden="true" /> <span>Все файлы</span> <em>{files.length}</em>
          </button>
          <button
            type="button"
            className={activeFolder === '' ? 'is-active' : ''}
            onClick={() => { setActiveFolder(''); setSelected([]); }}
          >
            <Folder aria-hidden="true" /> <span>Без папки</span> <em>{unfiledCount}</em>
          </button>
          {folders.map((folder) => (
            <div className="media-folders__row" key={folder.name}>
              <button
                type="button"
                className={activeFolder === folder.name ? 'is-active' : ''}
                onClick={() => { setActiveFolder(folder.name); setSelected([]); }}
              >
                <Folder aria-hidden="true" /> <span>{folder.name}</span> <em>{folder.count}</em>
              </button>
              {folder.count === 0 ? (
                <button
                  type="button"
                  className="media-folders__delete"
                  aria-label={`Удалить пустую папку ${folder.name}`}
                  title="Удалить пустую папку"
                  disabled={busy}
                  onClick={() => void removeFolder(folder)}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          <p className="admin-hint media-folders__hint">
            Новые файлы попадают в открытую папку. Перенести можно только те, что нигде не используются: у остальных изменится ссылка.
          </p>
        </aside>

        <div className="media-main">
          <AdminPanel className="media-toolbar">
            <label className="media-search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти файл по имени или типу"
                aria-label="Поиск в медиатеке"
              />
              {query ? <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X aria-hidden="true" /></button> : null}
            </label>
            <div className="media-collections" role="group" aria-label="Подборки">
              {COLLECTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  title={item.hint}
                  aria-pressed={collection === item.value}
                  className={collection === item.value ? 'is-active' : ''}
                  onClick={() => setCollection(item.value)}
                >
                  {item.value === 'images' ? <ImageIcon aria-hidden="true" />
                    : item.value === 'documents' ? <FileArchive aria-hidden="true" />
                    : item.value === 'unused' ? <Link2Off aria-hidden="true" />
                    : <File aria-hidden="true" />}
                  {item.label}
                </button>
              ))}
            </div>
            <div className="media-sort">
              <AdminSelect
                ariaLabel="Сортировка файлов"
                value={sort}
                compact
                options={SORTS}
                onValueChange={(value) => setSort(value as SortKey)}
              />
            </div>
          </AdminPanel>

          {selected.length > 0 && (
            <div className="media-bulk" role="status">
              <span>Выбрано: {selected.length}</span>
              <AdminSelect
                ariaLabel="Перенести выбранные в папку"
                value=""
                compact
                placeholder="Перенести в…"
                options={folderOptions}
                onValueChange={(value) => {
                  const target = value === '__none__' ? '' : value;
                  void (async () => {
                    for (const file of selectedFiles) await moveFile(file, target);
                    setSelected([]);
                  })();
                }}
              />
              <button type="button" className="admin-button admin-button--danger" disabled={busy} onClick={() => void deleteFiles(selectedFiles)}>
                <Trash2 aria-hidden="true" /> Удалить
              </button>
              <button type="button" className="admin-button admin-button--quiet" onClick={() => setSelected([])}>Снять</button>
            </div>
          )}

          <div
            className={`media-drop${dropActive ? ' is-active' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); dropDepth.current += 1; setDropActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => { dropDepth.current -= 1; if (dropDepth.current <= 0) { dropDepth.current = 0; setDropActive(false); } }}
            onDrop={(event) => {
              event.preventDefault();
              dropDepth.current = 0;
              setDropActive(false);
              void uploadFiles(event.dataTransfer.files);
            }}
          >
            {files.length === 0 && (
              <AdminPanel className="p-6 text-sm text-[var(--adm-fg)]/60">
                Файлов пока нет — перетащи их сюда или загрузи кнопкой выше.
              </AdminPanel>
            )}

            {files.length > 0 && visibleFiles.length === 0 && (
              <AdminPanel className="p-6 text-center text-sm text-[var(--adm-fg)]/60">
                Ничего не найдено. Измени запрос, подборку или папку.
              </AdminPanel>
            )}

            <div className="media-grid">
              {visibleFiles.map((file) => {
                const isImage = file.contentType.startsWith('image/');
                const references = mediaUsage.get(file.key) || [];
                const isSelected = selected.includes(file.key);
                return (
                  <AdminPanel key={file.key} className={`admin-panel--interactive media-card${isSelected ? ' is-selected' : ''}`}>
                    <label className="media-card__check" title="Выбрать файл">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        aria-label={`Выбрать ${file.name}`}
                        onChange={() => toggleSelected(file.key)}
                      />
                    </label>
                    <button
                      type="button"
                      className="media-card__preview"
                      onClick={() => setPreview(file)}
                      aria-label={`Открыть ${file.name}`}
                    >
                      {isImage
                        ? <img src={file.url} alt={file.name} loading="lazy" />
                        : <FileText aria-hidden="true" />}
                    </button>
                    <div className="media-card__body">
                      <div className="media-card__name" title={file.name}>{file.name}</div>
                      <AdminMeta className="block">
                        {formatSize(file.size)} · {formatDate(file.uploaded)}{file.folder ? ` · ${file.folder}` : ''}
                      </AdminMeta>
                      {references.length > 0 ? (
                        <div className="media-card__used" title={references.join(', ')}>
                          Используется: {references.length} {references.length === 1 ? 'публикация' : 'публикации'}
                        </div>
                      ) : <div className="media-card__free">Не используется в публикациях</div>}
                      <div className="media-card__actions">
                        <button
                          type="button"
                          onClick={() => void copyUrl(file)}
                          className="admin-button admin-button--compact flex-1"
                          title="Скопировать ссылку для вставки в статью"
                          aria-label={`Скопировать ссылку на ${file.name}`}
                        >
                          {copiedKey === file.key
                            ? <><Check className="h-3 w-3 text-green-500" /> Готово</>
                            : <><Copy className="h-3 w-3" /> Ссылка</>}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteFiles([file])}
                          disabled={references.length > 0 || busy}
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
        </div>
      </div>

      {preview && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          onClick={() => setPreview(null)}
          onKeyDown={(event) => { if (event.key === 'Escape') setPreview(null); }}
        >
          <div className="media-lightbox__inner" onClick={(event) => event.stopPropagation()}>
            <div className="media-lightbox__head">
              <strong>{preview.name}</strong>
              <button type="button" className="admin-icon-button" aria-label="Закрыть просмотр" autoFocus onClick={() => setPreview(null)}>
                <X aria-hidden="true" />
              </button>
            </div>
            {preview.contentType.startsWith('image/')
              ? <img src={preview.url} alt={preview.name} />
              : <p className="admin-muted">Предпросмотр доступен только для изображений.</p>}
            <div className="media-lightbox__foot">
              <AdminMeta>{formatSize(preview.size)} · {formatDate(preview.uploaded)}{preview.folder ? ` · папка «${preview.folder}»` : ''}</AdminMeta>
              <div className="media-lightbox__actions">
                <AdminSelect
                  ariaLabel="Перенести файл в папку"
                  value={preview.folder || '__none__'}
                  compact
                  options={folderOptions}
                  onValueChange={(value) => {
                    const target = value === '__none__' ? '' : value;
                    if (target === preview.folder) return;
                    void moveFile(preview, target).then(() => setPreview(null));
                  }}
                />
                <button type="button" className="admin-button" onClick={() => void copyUrl(preview)}>
                  <Copy aria-hidden="true" /> Ссылка
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
