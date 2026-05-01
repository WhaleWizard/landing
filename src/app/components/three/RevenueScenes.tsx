import { useEffect, useRef } from 'react';

type SceneConfig = {
  title: string;
  subtitle: string;
  gradient: [string, string];
  speed: number;
};

export function SceneShell({ children }: { children: React.ReactNode }) {
  return <div className="relative h-[420px] md:h-[560px] w-full overflow-hidden rounded-[2rem] border border-white/15 bg-[#05060b] shadow-[0_40px_120px_rgba(0,0,0,0.55)]">{children}</div>;
}

function CanvasFlow({ config }: { config: SceneConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles = Array.from({ length: 170 }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random() * 1.6 + 0.2,
      s: Math.random() * 1.1 + 0.4,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (t: number) => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#090b12');
      bg.addColorStop(1, '#0d1020');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      particles.forEach((p, i) => {
        p.z -= 0.004 * config.speed;
        if (p.z < 0.18) {
          p.z = 1.7;
          p.x = Math.random() * 2 - 1;
          p.y = Math.random() * 2 - 1;
        }
        const scale = 1 / p.z;
        const x = w / 2 + p.x * w * 0.42 * scale;
        const y = h / 2 + p.y * h * 0.35 * scale + Math.sin((t / 1000 + i) * 0.8) * 8;
        const r = p.s * scale * 4;
        const alpha = Math.max(0.05, Math.min(0.9, 1 - p.z));

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        grad.addColorStop(0, `${config.gradient[0]}CC`);
        grad.addColorStop(1, `${config.gradient[1]}00`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const offset = ((t * 0.02 * config.speed + i * 72) % (w + 200)) - 100;
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.bezierCurveTo(offset + 90, h * 0.26, offset - 60, h * 0.72, offset + 130, h);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [config]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.2),transparent_45%),radial-gradient(circle_at_85%_85%,rgba(99,102,241,0.25),transparent_50%)]" />
      <div className="absolute bottom-8 left-6 right-6 rounded-2xl border border-white/15 bg-black/40 p-5 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.22em] text-white/70">Live depth visual</p>
        <h3 className="mt-2 text-2xl font-bold text-white">{config.title}</h3>
        <p className="mt-2 text-sm text-white/85">{config.subtitle}</p>
      </div>
    </div>
  );
}

export function FlowFunnelScene() {
  return <CanvasFlow config={{ title: 'Signal vs Noise Reactor', subtitle: 'Поток частиц показывает фильтрацию трафика: от хаоса к квалифицированным лидам.', gradient: ['#8b5cf6', '#312e81'], speed: 1 }} />;
}

export function SearchIntentScene() {
  return <CanvasFlow config={{ title: 'Intent Gravity Field', subtitle: 'Слои спроса движутся к центру конверсии, показывая приоритизацию high-intent трафика.', gradient: ['#0ea5e9', '#1e3a8a'], speed: 1.25 }} />;
}

export function ConsultGrowthScene() {
  return <CanvasFlow config={{ title: 'Revenue Architecture', subtitle: 'Пошаговый рост экспертизы визуализирован как подъём по глубинным траекториям.', gradient: ['#d946ef', '#581c87'], speed: 0.9 }} />;
}
