import type {
  EditableContent,
  EditorPage,
  EditorSection,
} from '../components/admin/AdminContentControl';

export const CONTENT_PREVIEW_MESSAGE = 'ww:content-preview';
export const CONTENT_PREVIEW_READY_MESSAGE = 'ww:content-preview-ready';
export const CONTENT_PREVIEW_REPORT_MESSAGE = 'ww:content-preview-report';

export type ContentPreviewPayload = {
  type: typeof CONTENT_PREVIEW_MESSAGE;
  /**
   * Monotonically increasing id of the rendered editor snapshot. It keeps a
   * late report from an older iframe render from overwriting fresh feedback.
   */
  revision: number;
  page: EditorPage;
  section: EditorSection;
  content: EditableContent;
  replayKey?: number;
};

/**
 * Обратная связь из кадра предпросмотра. Заголовок сам уменьшается, пока текст
 * влезает, но у уменьшения есть предел читаемости: если строка не помещается
 * даже на минимальном кегле, посетитель увидит её обрезанной. Редактор должен
 * сказать об этом сразу, а не после публикации.
 */
export type ContentPreviewReport = {
  type: typeof CONTENT_PREVIEW_REPORT_MESSAGE;
  /** Snapshot this measurement belongs to. */
  revision: number;
  /** Тексты строк заголовка, которым не хватило ширины. */
  clippedTitleLines: string[];
  /** Полная высота настоящего блока после загрузки выбранных шрифтов. */
  contentHeight: number;
};
