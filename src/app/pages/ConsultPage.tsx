import ContactForm from '../components/ContactForm';
import { ConsultGrowthScene, SceneShell } from '../components/three/RevenueScenes';

export default function ConsultPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="min-h-screen max-w-6xl mx-auto px-4 pt-24 pb-14 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-fuchsia-300">CONSULT · REVENUE ARCHITECTURE</p>
          <h1 className="mt-3 text-4xl md:text-6xl font-black">Собираем персональную архитектуру роста на 90 дней.</h1>
          <p className="mt-5 text-gray-300 max-w-xl">На консультации вы получаете не мотивацию, а систему: позиционирование, оффер, канал продаж и контент-план, который приводит клиентов стабильно.</p>
          <a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#d946ef] to-[#6366f1]">Получить персональный growth-план</a>
        </div>
        <SceneShell><ConsultGrowthScene /></SceneShell>
      </section>
      <section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Записаться на стратегическую консультацию</h2><ContactForm service="consult" /></section>
    </main>
  );
}
