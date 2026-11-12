import { normalizeWeekData, type PlannerWeekData } from './plannerModel';

const PREFIX = 'ww-admin-planner-draft-v1:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlannerDraft {
  key: string;
  data: PlannerWeekData;
  version: string | null;
  savedAt: number;
}

export function plannerDraftKey(week: string, editor: string): string {
  return `${PREFIX}${week}:${editor}`;
}

export function storePlannerDraft(key: string, data: PlannerWeekData, version: string | null): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ data, version, savedAt: Date.now() }));
    return true;
  } catch {
    // The in-memory save queue still works without browser storage.
    return false;
  }
}

export function removePlannerDraft(key: string, savedAt?: number): void {
  try {
    if (savedAt !== undefined && JSON.parse(localStorage.getItem(key) ?? 'null')?.savedAt !== savedAt) return;
    localStorage.removeItem(key);
  } catch {
    // Storage may be blocked.
  }
}

export function findPlannerDraft(week: string, serverData: PlannerWeekData, ownKey: string): PlannerDraft | null {
  let newest: PlannerDraft | null = null;
  try {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX) && key !== ownKey);
    const storedData = JSON.stringify(serverData);
    for (const key of keys) {
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (!value?.data || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > MAX_AGE_MS) {
          removePlannerDraft(key);
          continue;
        }
        if (!key.startsWith(`${PREFIX}${week}:`)) continue;
        const data = normalizeWeekData(value.data);
        if (JSON.stringify(data) === storedData) {
          removePlannerDraft(key, value.savedAt);
          continue;
        }
        if ((value.version === null || typeof value.version === 'string') && (!newest || newest.savedAt < value.savedAt)) {
          newest = { key, data, version: value.version, savedAt: value.savedAt };
        }
      } catch {
        removePlannerDraft(key);
      }
    }
  } catch {
    // Storage may be blocked.
  }
  return newest;
}
