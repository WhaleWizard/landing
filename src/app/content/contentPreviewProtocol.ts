import type {
  EditableContent,
  EditorPage,
  EditorSection,
} from '../components/admin/AdminContentControl';

export const CONTENT_PREVIEW_MESSAGE = 'ww:content-preview';
export const CONTENT_PREVIEW_READY_MESSAGE = 'ww:content-preview-ready';

export type ContentPreviewPayload = {
  type: typeof CONTENT_PREVIEW_MESSAGE;
  page: EditorPage;
  section: EditorSection;
  content: EditableContent;
  replayKey?: number;
};
