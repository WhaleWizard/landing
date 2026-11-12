import { normalizeWeekData, type PlannerWeekData } from './plannerModel';

export class PlannerConflictError extends Error {}

export async function readPlannerWeek(password: string, week: string) {
  const response = await fetch(`/api/admin/planner?week=${encodeURIComponent(week)}`, {
    headers: { 'X-Admin-Password': password }, credentials: 'same-origin', cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean; error?: string; data?: unknown; updatedAt?: string | null;
  } | null;
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
  return { data: normalizeWeekData(payload.data), updatedAt: payload.updatedAt ?? null };
}

export async function savePlannerWeek(password: string, week: string, data: PlannerWeekData, expectedUpdatedAt: string | null) {
  const response = await fetch('/api/admin/planner', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
    credentials: 'same-origin', body: JSON.stringify({ week, data, expectedUpdatedAt }),
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean; error?: string; code?: string; updatedAt?: string | null;
  } | null;
  if (response.status === 409 && payload?.code === 'PLANNER_CONFLICT') throw new PlannerConflictError(payload.error);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload.updatedAt ?? null;
}

export async function editPlannerWeek(password: string, week: string, update: (data: PlannerWeekData) => PlannerWeekData) {
  for (let attempt = 0; ; attempt++) {
    const snapshot = await readPlannerWeek(password, week);
    const updated = update(snapshot.data);
    try {
      await savePlannerWeek(password, week, updated, snapshot.updatedAt);
      return updated;
    } catch (error) {
      if (!(error instanceof PlannerConflictError) || attempt === 1) throw error;
    }
  }
}
