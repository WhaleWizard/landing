import { createContext, useContext, useEffect, useRef } from "react";
import { confirmAsk } from "../AdminFeedback";
export type RegisterLeaveGuard = (
  guard: (() => Promise<boolean>) | null,
) => void;
export const WorkspaceGuardContext = createContext<RegisterLeaveGuard | undefined>(undefined);
const scopes = new WeakMap<RegisterLeaveGuard, Map<symbol, boolean>>();
export function useWorkspaceNavigation(explicit?:RegisterLeaveGuard) {
  const inherited=useContext(WorkspaceGuardContext),register=explicit||inherited;
  return (action:()=>void) => { void (async()=>{const dirty=register?[...(scopes.get(register)?.values()||[])].some(Boolean):false;if(await confirmWorkspaceLeave(dirty))action();})(); };
}
export async function confirmWorkspaceLeave(dirty: boolean): Promise<boolean> {
  return (
    !dirty ||
    confirmAsk({
      title: "Закрыть несохранённую форму?",
      description: "Введённые изменения ещё не сохранены.",
      confirmLabel: "Закрыть форму",
    })
  );
}
export function useWorkspaceGuard(
  dirty: boolean,
  explicit?: RegisterLeaveGuard,
) {
  const inherited = useContext(WorkspaceGuardContext), register = explicit || inherited;
  const scope = useRef(Symbol('form'));
  useEffect(() => {
    if (register) {
      const active = scopes.get(register) || new Map<symbol, boolean>();
      scopes.set(register, active);
      active.set(scope.current, dirty);
      register(() => confirmWorkspaceLeave([...active.values()].some(Boolean)));
    }
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      if (register) { const active = scopes.get(register); active?.delete(scope.current); if (!active?.size) register(null); }
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, register]);
}
