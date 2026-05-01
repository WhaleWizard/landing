import { lazy, Suspense } from 'react';
import ContactForm from '../components/ContactForm';

const AdsScenes = lazy(() => import('../components/three/Ads3DScenes'));

export default function MetaAdsPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="min-h-screen max-w-6xl mx-auto px-4 pt-24 pb-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-violet-300">Meta Ads Engine</p>
          <h1 className="mt-3 text-4xl md:text-6xl font-black">Система, где трафик превращается в лиды, а не в шум.</h1>
          <p className="mt-5 text-gray-300 max-w-xl">3D-воронка показывает путь: креатив → клик → квалификация → заявка. Каждый этап подкрепляется аналитикой и creative testing.</p>
          <a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1]">Получить прогноз CPL</a>
        </div>
        <Suspense fallback={<div className="h-[460px] rounded-3xl bg-zinc-900 animate-pulse" />}>
          <AdsScenes.SceneShell><AdsScenes.FlowFunnelScene /></AdsScenes.SceneShell>
        </Suspense>
      </section>
      <section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Запустить Meta Ads под KPI</h2><ContactForm service="meta-ads" /></section>
    </main>
  );
}
