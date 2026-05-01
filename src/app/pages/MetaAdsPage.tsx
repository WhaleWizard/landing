import ContactForm from '../components/ContactForm';
import SEO from '../components/SEO';
import { FlowFunnelScene, SceneShell, SearchIntentScene, ConsultGrowthScene } from '../components/three/RevenueScenes';

function SectionTitle({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs uppercase tracking-[0.2em] text-primary/80">{kicker}</p>
      <h2 className="mt-2 text-3xl md:text-4xl font-black">{title}</h2>
      {subtitle ? <p className="mt-3 text-muted-foreground max-w-3xl">{subtitle}</p> : null}
    </div>
  );
}

function MetaAdsPage() {
  return (
    <main className="bg-background text-foreground">
      <SEO title="Meta Ads под прибыль в 2026" description="Meta Ads под KPI: от оффера и креативов до сквозной аналитики. Снижаю CPL, масштабирую лидогенерацию и выстраиваю прогнозируемую экономику рекламных кампаний в 2026 году." url="/meta-ads" />
      <section className="min-h-screen max-w-6xl mx-auto px-4 pt-24 pb-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-violet-300">META ADS · HERO</p>
          <h1 className="mt-3 text-4xl md:text-6xl font-black">Meta Ads, которые продают, а не просто «крутятся».</h1>
          <p className="mt-5 text-gray-300 max-w-xl">В 2026 году Meta стала жестче к качеству сигнала: выигрывают те, у кого связка оффер → креатив → CRM-данные построена как система. Я запускаю именно такую систему под ваш KPI по CPL/CPA и марже.</p>
          <a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1]">Получить прогноз CPL на 30 дней</a>
        </div>
        <SceneShell><FlowFunnelScene /></SceneShell>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionTitle kicker="Боль" title="Почему Meta Ads «сливает» бюджет даже при красивых креативах" />
        <div className="grid md:grid-cols-3 gap-4">
          {['Слабый сигнал оптимизации: пиксель получает «мусорные» события, а не качественные лиды.', 'Оффер не дифференцирован: в ленте вы выглядите как все, а CPM растет.', 'Нет управления юнит-экономикой: реклама есть, но прибыли на масштабе нет.'].map((item) => (
            <article key={item} className="rounded-2xl border border-white/10 p-5 bg-white/5">{item}</article>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionTitle kicker="Решение" title="Как я строю прибыльную систему Meta Ads" subtitle="Проверенный фреймворк: диагностика → стратегия → запуск → оптимизация → масштабирование." />
        <ol className="grid md:grid-cols-2 gap-4 list-decimal list-inside">
          <li className="rounded-2xl border border-white/10 p-5">Аудит текущей воронки и трекинга (Pixel + CAPI + CRM события).</li>
          <li className="rounded-2xl border border-white/10 p-5">Разработка офферов и креативных углов под разные сегменты аудитории.</li>
          <li className="rounded-2xl border border-white/10 p-5">Медиаплан с лимитами риска и контрольными KPI на 2, 4 и 8 недель.</li>
          <li className="rounded-2xl border border-white/10 p-5">Еженедельная оптимизация по факту маржи, а не только по метрикам кабинета.</li>
        </ol>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionTitle kicker="Доказательства" title="Что видят клиенты после внедрения" subtitle="Типовые результаты из проектов услуг, e-commerce и экспертного бизнеса: CPL ниже на 18–42%, рост доли квалифицированных лидов, стабильный объем заявок при контролируемом CAC." />
        <p className="text-sm text-muted-foreground">Используются подходы 2026: короткие видео-форматы, мультиугольные креативы, серверный трекинг и оптимизация на глубокие события воронки.</p>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionTitle kicker="Оффер" title="Старт Meta Ads под ключ за 14 дней" subtitle="Что входит: стратегия, креативные ТЗ, настройка кампаний, дашборд KPI, регламент масштабирования." />
        <div className="rounded-3xl border border-violet-400/30 bg-violet-500/10 p-6">
          <p>Если за первый цикл теста не фиксируем валидный вектор к целевому CPL/CPA — даю расширенную сессию оптимизации без доплаты.</p>
        </div>
      </section>

      <section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Запустить Meta Ads под KPI</h2><ContactForm service="meta-ads" /></section>
    </main>
  );
}


export default MetaAdsPage;
