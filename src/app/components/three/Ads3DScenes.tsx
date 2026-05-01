import { useEffect, useRef } from 'react';

export function SceneShell({ children }: { children: React.ReactNode }) {
  return <div className="h-[320px] md:h-[460px] w-full rounded-3xl border border-white/10 bg-black/30 backdrop-blur-sm p-6">{children}</div>;
}

function SceneCard({ title, caption }: { title: string; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.animate([{ transform: 'rotateX(20deg) translateY(20px)', opacity: 0.2 }, { transform: 'rotateX(0) translateY(0)', opacity: 1 }], { duration: 900, fill: 'forwards' });
    }
  }, []);
  return <div ref={ref} className="h-full rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-indigo-500/10 p-6 [transform-style:preserve-3d]"><h3 className="text-2xl font-bold">{title}</h3><p className="mt-3 text-gray-300">{caption}</p></div>;
}

export function FlowFunnelScene() { return <SceneCard title="Traffic Flow Funnel" caption="Креативы втягивают холодный трафик, алгоритм фильтрует и ведет к дорогим лидам." />; }
export function SearchIntentScene() { return <SceneCard title="Search Intent Orbit" caption="Кольца спроса: high-intent ключи, PMax усиление и ремаркетинг перед конверсией." />; }
export function ConsultGrowthScene() { return <SceneCard title="Expert Growth Stack" caption="Позиционирование → упаковка → продажи → система контента как рост по уровням." />; }
