import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ChevronDown,
  ChevronUp,
  Expand,
  Laptop,
  Maximize2,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  CONTENT_PREVIEW_MESSAGE,
  CONTENT_PREVIEW_READY_MESSAGE,
  CONTENT_PREVIEW_REPORT_MESSAGE,
  type ContentPreviewPayload,
  type ContentPreviewReport,
} from '../../content/contentPreviewProtocol';
import type { EditableContent, EditorPage, EditorSection } from './AdminContentControl';

type PreviewPresetId = 'desktop' | 'laptop' | 'tablet' | 'mobile-wide' | 'mobile' | 'mobile-small';
type PreviewZoom = 'fit' | 'actual';

const PREVIEW_COLLAPSED_KEY = 'ww_admin_preview_collapsed_v1';

const PREVIEW_PRESETS: Array<{
  id: PreviewPresetId;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  icon: typeof Monitor;
}> = [
  { id: 'desktop', label: 'ПК · 1440', shortLabel: 'ПК', width: 1440, height: 900, icon: Monitor },
  { id: 'laptop', label: 'Ноутбук · 1280', shortLabel: 'Ноутбук', width: 1280, height: 800, icon: Laptop },
  { id: 'tablet', label: 'Планшет · 768', shortLabel: 'Планшет', width: 768, height: 900, icon: Tablet },
  { id: 'mobile-wide', label: 'Телефон · 453', shortLabel: '453', width: 453, height: 900, icon: Smartphone },
  { id: 'mobile', label: 'Телефон · 390', shortLabel: 'Телефон', width: 390, height: 844, icon: Smartphone },
  { id: 'mobile-small', label: 'Телефон · 320', shortLabel: '320', width: 320, height: 700, icon: Smartphone },
];

/**
 * Держит предпросмотр на шаг позади набора текста. Без этого каждая нажатая
 * клавиша перерисовывала внутри iframe целую страницу — отсюда и лаг.
 */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

function useAvailableWidth(ref: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function PreviewViewport({
  payload,
  preset,
  zoom,
  expanded = false,
  onReport,
}: {
  payload: ContentPreviewPayload;
  preset: (typeof PREVIEW_PRESETS)[number];
  zoom: PreviewZoom;
  expanded?: boolean;
  onReport?: (report: ContentPreviewReport) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const availableWidth = useAvailableWidth(hostRef);
  const [contentHeight, setContentHeight] = useState(preset.height);
  const measured = availableWidth > 0;
  const sidePadding = expanded ? 24 : 32;
  const scale = zoom === 'fit'
    ? measured ? Math.min(1, Math.max(0.1, (availableWidth - sidePadding) / preset.width)) : 1
    : 1;
  const iframeHeight = Math.max(preset.height, Math.min(6000, contentHeight));
  const scaledWidth = preset.width * scale;
  const scaledHeight = iframeHeight * scale;

  /**
   * Высота рамки сбрасывается только при смене страницы, блока или устройства.
   * Раньше сброс шёл на каждую правку текста: кадр схлопывался до размера
   * устройства и через мгновение вырастал обратно — блок дёргался под руками.
   *
   * Вместе с высотой возвращаем и прокрутку кадра: она оставалась от прошлого
   * блока, и новый открывался с середины — выглядело так, будто предпросмотр
   * показывает не то, что выбрали.
   */
  useLayoutEffect(() => {
    setContentHeight(preset.height);
    if (hostRef.current) hostRef.current.scrollTop = 0;
  }, [payload.page, payload.section, preset.height, preset.id]);

  const postPayload = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(payload, window.location.origin);
  }, [payload]);

  useEffect(() => {
    postPayload();
  }, [postPayload]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === CONTENT_PREVIEW_READY_MESSAGE) postPayload();
      if (event.data?.type === CONTENT_PREVIEW_REPORT_MESSAGE) {
        const report = event.data as ContentPreviewReport;
        if (report.revision !== payload.revision) return;
        if (Number.isFinite(report.contentHeight) && report.contentHeight > 0) {
          setContentHeight((current) => {
            const next = Math.ceil(report.contentHeight);
            return current === next ? current : next;
          });
        }
        onReport?.(report);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [payload.revision, postPayload, onReport]);

  const stageHeight = expanded
    ? `min(${Math.max(480, scaledHeight)}px, calc(100vh - 190px))`
    : `${Math.min(Math.max(360, scaledHeight), 680)}px`;

  return (
    <div
      ref={hostRef}
      className={`admin-site-preview__stage${zoom === 'actual' ? ' is-actual' : ''}`}
      style={{ height: stageHeight, visibility: measured ? 'visible' : 'hidden' }}
    >
      <div
        className="admin-site-preview__scaled-frame"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <iframe
          ref={iframeRef}
          title={`Предпросмотр страницы, ${preset.width} на ${preset.height}`}
          tabIndex={-1}
          aria-hidden="true"
          src="/admin/content-preview"
          className="admin-site-preview__iframe"
          onLoad={postPayload}
          style={{
            width: preset.width,
            height: iframeHeight,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}

export default function AdminContentPreview({
  page,
  section,
  content,
  replayKey,
}: {
  page: EditorPage;
  section: EditorSection;
  content: EditableContent;
  /** Растёт по кнопке «Показать ещё раз» в настройках эффекта. */
  replayKey: number;
}) {
  const [presetId, setPresetId] = useState<PreviewPresetId>('laptop');
  const [zoom, setZoom] = useState<PreviewZoom>('fit');
  const [expanded, setExpanded] = useState(false);
  const preset = PREVIEW_PRESETS.find((item) => item.id === presetId) ?? PREVIEW_PRESETS[1];
  // Свёрнутое состояние переживает перезагрузку: длинные тексты правят без
  // предпросмотра, и каждый раз сворачивать его заново — лишний шаг.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(PREVIEW_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    window.localStorage.setItem(PREVIEW_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);
  const [clippedLines, setClippedLines] = useState<string[]>([]);
  const settledContent = useDebounced(content, 220);
  const pending = settledContent !== content;
  const revisionRef = useRef(0);
  const handleReport = useCallback((report: ContentPreviewReport) => {
    setClippedLines(report.clippedTitleLines);
  }, []);
  // Предупреждение относится к конкретному блоку и конкретной ширине: при
  // смене любого из них оно недействительно, пока кадр не отчитается заново.
  useEffect(() => { setClippedLines([]); }, [page, section, presetId]);
  const payload = useMemo<ContentPreviewPayload>(() => {
    revisionRef.current += 1;
    return {
      type: CONTENT_PREVIEW_MESSAGE,
      revision: revisionRef.current,
      page,
      section,
      content: settledContent,
      replayKey,
    };
  }, [settledContent, page, replayKey, section]);

  return (
    <section
      className={`admin-card admin-site-preview${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Точный предпросмотр страницы"
    >
      <div className="admin-site-preview__header">
        <div>
          <p className="admin-eyebrow">Так увидит посетитель</p>
          <h3 className="admin-card-title">Точный предпросмотр</h3>
          <p className="admin-meta">Реальная вёрстка и переносы страницы. Ничего публиковать для проверки не нужно.</p>
        </div>
        <div className="admin-site-preview__actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 aria-hidden="true" />
            <span>На весь экран</span>
          </button>
          <button
            type="button"
            className="admin-button admin-button--quiet"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            <span>{collapsed ? 'Показать' : 'Свернуть'}</span>
          </button>
        </div>
      </div>

      {collapsed ? null : (
      <div className="admin-site-preview__toolbar">
        <div className="admin-icon-toggle admin-site-preview__devices" role="group" aria-label="Ширина предпросмотра">
          {PREVIEW_PRESETS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={presetId === item.id}
                onClick={() => setPresetId(item.id)}
                title={`${item.label} × ${item.height}`}
              >
                <Icon aria-hidden="true" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
        <div className="admin-segmented admin-site-preview__zoom" role="group" aria-label="Масштаб предпросмотра">
          <button type="button" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
            <Expand aria-hidden="true" /> Вписать
          </button>
          <button type="button" aria-pressed={zoom === 'actual'} onClick={() => setZoom('actual')}>
            100%
          </button>
        </div>
        <span className="admin-site-preview__resolution" aria-live="polite">
          {preset.width} × {preset.height} px
        </span>
        <span className={`admin-site-preview__sync${pending ? ' is-pending' : ''}`} role="status" aria-live="polite">
          {pending ? 'Обновляю…' : 'Показан текущий текст'}
        </span>
      </div>
      )}

      {clippedLines.length > 0 ? (
        <div className="admin-notice admin-notice--warning" role="status">
          <strong>Не помещается на ширине {preset.width} px:</strong>{' '}
          {clippedLines.map((line) => `«${line}»`).join(', ')}. Сайт уже уменьшил заголовок до предела
          читаемости — сократите строку или разбейте её на две.
        </div>
      ) : null}

      {!expanded && !collapsed ? <PreviewViewport payload={payload} preset={preset} zoom={zoom} onReport={handleReport} /> : null}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="admin-site-preview-dialog">
          <DialogHeader className="admin-site-preview-dialog__header">
            <DialogTitle>Предпросмотр · {preset.label}</DialogTitle>
            <DialogDescription>{preset.width} × {preset.height} px · прокручивайте страницу внутри рамки</DialogDescription>
          </DialogHeader>
          <PreviewViewport payload={payload} preset={preset} zoom={zoom} expanded onReport={handleReport} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
