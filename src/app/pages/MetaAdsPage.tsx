import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color } from 'three';
import { motion } from 'motion/react';
import { useMemo, useRef } from 'react';
import type { Points } from 'three';
import ContactForm from '../components/ContactForm';

const ease = [0.22, 1, 0.36, 1] as const;

function WhalePoints() {
  const pointsRef = useRef<Points>(null);
  const trailRef = useRef<Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(2200 * 3);
    for (let i = 0; i < 2200; i++) {
      const t = Math.random() * Math.PI * 2;
      const r = 1.8 + Math.random() * 0.9;
      arr[i * 3] = Math.cos(t) * r * (0.7 + Math.random() * 0.3);
      arr[i * 3 + 1] = Math.sin(t * 0.7) * 0.7 + (Math.random() - 0.5) * 0.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    return arr;
  }, []);

  const trail = useMemo(() => {
    const arr = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 2;
      arr[i * 3 + 1] = -1 - Math.random() * 1.6;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current || !trailRef.current) return;
    const t = clock.getElapsedTime();
    pointsRef.current.position.y = -0.4 + Math.sin(t * 0.4) * 0.18;
    pointsRef.current.rotation.y = Math.sin(t * 0.2) * 0.2;
    trailRef.current.position.y = pointsRef.current.position.y - 0.25;
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.025} color={new Color('#8b5cf6')} transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} />
      </points>
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={trail.length / 3} array={trail} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.016} color={new Color('#6366f1')} transparent opacity={0.65} blending={AdditiveBlending} depthWrite={false} />
      </points>
    </>
  );
}

export default function MetaAdsPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0"><Canvas camera={{ position: [0, 0, 4.8] }}><WhalePoints /></Canvas></div>
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-28 pb-16">
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }} className="text-4xl md:text-6xl font-black max-w-4xl">Стабильные заявки из Facebook и Instagram без слива бюджета</motion.h1>
          <p className="mt-5 text-gray-300 max-w-2xl">Настрою рекламу по системе: кастдев → оффер → креативы → трекинг. Вы получаете целевые лиды, а не просто клики.</p>
          <a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] shadow-[0_10px_30px_rgba(139,92,246,0.2)]">Получить аудит текущей рекламы</a>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 py-20 grid md:grid-cols-3 gap-5">{['Оффер не цепляет ЦА','Креативы не останавливают скролл','Нет сквозной аналитики'].map((t)=><motion.article key={t} initial={{opacity:0,rotateX:15,y:40}} whileInView={{opacity:1,rotateX:0,y:0}} transition={{duration:0.7,ease}} className="rounded-2xl border border-white/10 p-6 bg-gradient-to-br from-[#8b5cf6]/10 to-[#6366f1]/10">{t}</motion.article>)}</section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-3xl font-bold mb-6">Моя система работы</h2><div className="grid md:grid-cols-4 gap-4">{['Аудит ниши и кастдев','Создание и тестирование креативов','Настройка аналитики (GA4, GTM, Meta CAPI)','Оптимизация и масштабирование'].map((s,i)=><div key={s} className="rounded-2xl p-5 bg-card border border-white/10"><div className="text-3xl font-black bg-gradient-to-r from-[#8b5cf6] to-[#6366f1] bg-clip-text text-transparent">{i+1}</div><p className="text-gray-300 mt-2">{s}</p></div>)}</div></section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-3xl font-bold mb-6">Кейсы</h2><div className="grid md:grid-cols-3 gap-4">{[1,2,3].map((k)=><motion.div whileHover={{rotateX:-4,rotateY:4}} key={k} className="rounded-2xl p-6 border border-primary/30 bg-card shadow-[0_10px_30px_rgba(139,92,246,0.2)]"><h3 className="font-semibold">Снизили CPA с $31 до $18 за 5 недель</h3><p className="text-gray-300 mt-2">Пересборка структуры кампаний, creative testing и CAPI.</p></motion.div>)}</div></section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-3xl font-bold mb-5">Оффер и условия</h2><ul className="space-y-2 text-gray-300"><li>Полная настройка кабинета</li><li>10+ креативов/мес.</li><li>Еженедельные отчеты</li><li>Интеграция с CRM</li><li>Под ключ от $X/мес. + бюджет</li></ul></section>
      <section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Узнайте, сколько будут стоить ваши клиенты в Meta Ads</h2><ContactForm service="meta-ads" /></section>
    </main>
  );
}
