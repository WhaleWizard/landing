import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceData } from "../../../../../shared/admin-workspace";
import { notify } from "../AdminFeedback";

export function useWorkspace(password: string) {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [migration, setMigration] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const pending = useRef(new Map<string, string>()),
    lock = useRef(false),
    alive = useRef(true);
  const generation = useRef(0), source = useRef(Symbol('workspace'));
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/workspace?timezone_offset=${new Date().getTimezoneOffset()}`,
        {
          headers: { "X-Admin-Password": password },
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      const p = await r.json();
      if (!r.ok || !p.success) {
        if (alive.current && current === generation.current) setMigration(p.migration || "");
        throw new Error(p.error || "Не удалось загрузить рабочее пространство");
      }
      if (!['clients','work','invoices','tasks','resources','months','activity'].every(key=>Array.isArray(p[key])) || !/^\d{4}-\d{2}-\d{2}$/.test(p.today)) {
        throw new Error('Сервер вернул неполные данные. Обновите раздел.');
      }
      if (alive.current && current === generation.current) {
        setData(p);
        setError("");
        setMigration("");
      }
    } catch (e) {
      if (alive.current && current === generation.current) setError(e instanceof Error ? e.message : "Нет связи");
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }, [password]);
  useEffect(() => {
    alive.current = true;
    void load();
    const refresh = (event: Event) => { if ((event as CustomEvent).detail !== source.current) void load(); };
    window.addEventListener("ww-workspace-changed", refresh);
    return () => {
      alive.current = false;
      generation.current += 1;
      window.removeEventListener("ww-workspace-changed", refresh);
    };
  }, [load]);
  const mutate = useCallback(
    async (payload: Record<string, unknown>, message = "Сохранено") => {
      if (lock.current) return null;
      lock.current = true;
      setBusy(true);
      const fingerprint = JSON.stringify(payload);
      const key = pending.current.get(fingerprint) || crypto.randomUUID();
      pending.current.set(fingerprint, key);
      try {
        const r = await fetch(
          `/api/admin/workspace?timezone_offset=${new Date().getTimezoneOffset()}`,
          {
            method: "POST",
            headers: {
              "X-Admin-Password": password,
              "Content-Type": "application/json",
            },
            credentials: "same-origin",
            body: JSON.stringify({ ...payload, request_key: key }),
          },
        );
        const p = await r.json();
        if (!r.ok || !p.success)
          throw new Error(p.error || "Не удалось сохранить");
        pending.current.delete(fingerprint);
        await load();
        window.dispatchEvent(new CustomEvent("ww-workspace-changed", { detail: source.current }));
        notify.success(message);
        return p as Record<string, unknown>;
      } catch (e) {
        notify.error(
          "Не удалось сохранить",
          e instanceof Error ? e.message : "Проверьте соединение",
        );
        return null;
      } finally {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [password, load],
  );
  return { data, error, migration, loading, busy: busy || loading || Boolean(error), load, mutate };
}
export type WorkspaceStore = ReturnType<typeof useWorkspace>;
