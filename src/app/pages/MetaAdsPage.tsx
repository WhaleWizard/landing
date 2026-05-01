import ContactForm from '../components/ContactForm';
import { FlowFunnelScene, SceneShell } from '../components/three/RevenueScenes';

export default function MetaAdsPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="min-h-screen max-w-6xl mx-auto px-4 pt-24 pb-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-violet-300">META ADS · SIGNAL VS NOISE</p>
          <h1 className="mt-3 text-4xl md:text-6xl font-black">Превращаем шумный трафик в предсказуемые лиды.</h1>
          <p className="mt-5 text-gray-300 max-w-xl">Мы строим рекламный реактор: креативы цепляют внимание, аналитика отсеивает пустые клики, алгоритм добивает до заявок по целевому CPL.</p>
          <a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1]">Получить прогноз CPL на 30 дней</a>
        </div>
        <SceneShell><FlowFunnelScene /></SceneShell>
      </section>
      <section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Запустить Meta Ads под KPI</h2><ContactForm service="meta-ads" /></section>
    </main>
  );
}
