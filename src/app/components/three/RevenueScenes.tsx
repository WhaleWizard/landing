import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

type SceneProps = {
  title: string;
  subtitle: string;
  accent: string;
};

export function SceneShell({ children }: { children: React.ReactNode }) {
  return <div className="relative h-[420px] md:h-[560px] w-full overflow-hidden rounded-[2rem] border border-white/15 bg-[#06070d] shadow-[0_40px_120px_rgba(0,0,0,0.55)]">{children}</div>;
}

function ImmersiveScene({ title, subtitle, accent }: SceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const ySlow = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const yFast = useTransform(scrollYProgress, [0, 1], [80, -80]);

  return (
    <div ref={ref} className="relative h-full w-full">
      <motion.div style={{ background: accent, y: ySlow, opacity: 0.35 }} className="absolute -left-24 -top-16 h-72 w-72 rounded-full blur-3xl" />
      <motion.div style={{ y: yFast }} className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />

      <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 800 500" fill="none" aria-hidden>
        <motion.path
          d="M-30 420C70 340 160 330 250 360C340 390 440 380 520 310C600 240 680 220 860 260"
          stroke="url(#grad1)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.2 }}
          whileInView={{ pathLength: 1, opacity: 0.95 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, margin: '-10%' }}
        />
        <motion.path
          d="M-30 300C90 220 160 210 240 240C320 270 420 290 520 220C620 150 720 140 860 170"
          stroke="url(#grad2)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.2 }}
          whileInView={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 2.2, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, margin: '-10%' }}
        />
        <defs>
          <linearGradient id="grad1" x1="100" y1="100" x2="650" y2="350" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="grad2" x1="100" y1="100" x2="650" y2="350" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="1" stopColor="#c084fc" stopOpacity="0.8" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(129,140,248,0.25),transparent_40%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ once: true }}
        className="absolute bottom-10 left-8 right-8 rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl"
      >
        <p className="text-xs uppercase tracking-[0.22em] text-white/70">Cinematic conversion layer</p>
        <h3 className="mt-2 text-2xl font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm text-white/80 md:text-base">{subtitle}</p>
      </motion.div>
    </div>
  );
}

export function FlowFunnelScene() {
  return <ImmersiveScene title="Signal vs Noise Reactor" subtitle="Холодный трафик проходит фильтрацию креативом и аналитикой, остаются только лиды с высоким потенциалом покупки." accent="#8b5cf6" />;
}

export function SearchIntentScene() {
  return <ImmersiveScene title="Intent Gravity Field" subtitle="Спрос высокой готовности притягивается в кампании, где Search и PMax синхронизируются по маржинальности." accent="#0ea5e9" />;
}

export function ConsultGrowthScene() {
  return <ImmersiveScene title="Revenue Architecture" subtitle="Консультация превращает хаос в пошаговую систему роста: позиционирование, оффер, продажи и контент." accent="#d946ef" />;
}
