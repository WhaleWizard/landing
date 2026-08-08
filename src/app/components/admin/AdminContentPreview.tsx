import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Expand,
  Laptop,
  Maximize2,
  Monitor,
  Play,
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
  type ContentPreviewPayload,
} from '../../content/contentPreviewProtocol';
import type { EditableContent, EditorPage, EditorSection } from './AdminContentControl';

type PreviewPresetId = 'desktop' | 'laptop' | 'tablet' | 'mobile-wide' | 'mobile' | 'mobile-small';
type PreviewZoom = 'fit' | 'actual';

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

function useAvailableWidth(ref: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
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
}: {
  payload: ContentPreviewPayload;
  preset: (typeof PREVIEW_PRESETS)[number];
  zoom: PreviewZoom;
  expanded?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const availableWidth = useAvailableWidth(hostRef);
  const sidePadding = expanded ? 24 : 32;
  const scale = zoom === 'fit'
    ? Math.min(1, Math.max(0.1, (availableWidth - sidePadding) / preset.width))
    : 1;
  const scaledWidth = preset.width * scale;
  const scaledHeight = preset.height * scale;

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
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postPayload]);

  const stageHeight = expanded
    ? `min(${Math.max(480, scaledHeight)}px, calc(100vh - 190px))`
    : `${Math.min(Math.max(360, scaledHeight), 680)}px`;

  return (
    <div
      ref={hostRef}
      className={`admin-site-preview__stage${zoom === 'actual' ? ' is-actual' : ''}`}
      style={{ height: stageHeight }}
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
            height: preset.height,
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
}: {
  page: EditorPage;
  section: EditorSection;
  content: EditableContent;
}) {
  const [presetId, setPresetId] = useState<PreviewPresetId>('laptop');
  const [zoom, setZoom] = useState<PreviewZoom>('fit');
  const [expanded, setExpanded] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const preset = PREVIEW_PRESETS.find((item) => item.id === presetId) ?? PREVIEW_PRESETS[1];
  const payload = useMemo<ContentPreviewPayload>(() => ({
    type: CONTENT_PREVIEW_MESSAGE,
    page,
    section,
    content,
    replayKey,
  }), [content, page, replayKey, section]);

  return (
    <section className="admin-card admin-site-preview" aria-label="Точный предпросмотр страницы">
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
            onClick={() => setReplayKey((value) => value + 1)}
            title="Повторить эффект заголовка"
          >
            <Play aria-hidden="true" />
            <span>Повторить эффект</span>
          </button>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 aria-hidden="true" />
            <span>На весь экран</span>
          </button>
        </div>
      </div>

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
      </div>

      {!expanded ? <PreviewViewport payload={payload} preset={preset} zoom={zoom} /> : null}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="admin-site-preview-dialog">
          <DialogHeader className="admin-site-preview-dialog__header">
            <DialogTitle>Предпросмотр · {preset.label}</DialogTitle>
            <DialogDescription>{preset.width} × {preset.height} px · прокручивайте страницу внутри рамки</DialogDescription>
          </DialogHeader>
          <PreviewViewport payload={payload} preset={preset} zoom={zoom} expanded />
        </DialogContent>
      </Dialog>
    </section>
  );
}
