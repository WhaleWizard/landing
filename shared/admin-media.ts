export const MAX_MEDIA_DELETE_KEYS = 50;
export const MAX_MEDIA_MOVE_KEYS = 50;

export interface MediaMoveResult {
  key: string;
  previousKey: string;
  moved: boolean;
  url: string;
  folder: string;
}
