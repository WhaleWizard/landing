import { useEffect, useRef } from 'react';

const DPR_CAP = 2;

export function SceneShell({ children }: { children: React.ReactNode }) {
  return <div className="relative h-[420px] md:h-[560px] w-full overflow-hidden rounded-[2rem] border border-white/15 bg-[#05060b] shadow-[0_40px_120px_rgba(0,0,0,0.55)]">{children}</div>;
}

function useCanvasRenderer(renderer: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

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
      renderer(ctx, canvas.clientWidth, canvas.clientHeight, t);
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [renderer]);

  return ref;
}

export function FlowFunnelScene() {
  const mouse = useRef({ x: 0, y: 0 });
  const scrollShift = useRef(0);
  const particles = useRef(
    Array.from({ length: 1000 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 80 + Math.random() * 240,
      y: Math.random() * 260 - 130,
      size: 0.7 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0015 + Math.random() * 0.003,
    })),
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onScroll = () => {
      scrollShift.current = Math.min(window.scrollY / 500, 1);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const ref = useCanvasRenderer((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const parX = mouse.current.x * 20;
    const parY = mouse.current.y * 16;
    const fade = 1 - scrollShift.current;
    const lift = scrollShift.current * 120;

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#050915');
    bg.addColorStop(1, '#120a1f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 7; i++) {
      const x = w * (0.08 + i * 0.14) + parX * (i % 2 ? -1 : 1);
      const y = h * 0.5 + parY * 0.6;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, 160);
      rg.addColorStop(0, 'rgba(139,92,246,0.18)');
      rg.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }

    const whaleX = w * 0.52 + parX;
    const whaleY = h * 0.54 + parY - lift;

    particles.current.forEach((p, i) => {
      p.angle += p.speed;
      const x = whaleX + Math.cos(p.angle + p.phase) * p.radius * 0.62;
      const y = whaleY + Math.sin(p.angle * 1.35 + p.phase) * p.y * 0.5;
      const glow = 0.2 + 0.6 * Math.sin(t * 0.002 + i * 0.04);
      ctx.fillStyle = `rgba(196,181,253,${Math.max(0.02, glow * fade)})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = `rgba(167,139,250,${0.35 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(whaleX - 180, whaleY + 8);
    ctx.bezierCurveTo(whaleX - 90, whaleY - 85, whaleX + 130, whaleY - 40, whaleX + 210, whaleY + 12);
    ctx.stroke();

    for (let i = 0; i < 24; i++) {
      const sx = whaleX - 170 - i * 10;
      const sy = whaleY + 10 + Math.sin(t * 0.003 + i) * 10;
      ctx.fillStyle = `rgba(125,211,252,${0.22 * fade})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 48; i++) {
      const splashX = whaleX + 150 + Math.sin(i * 0.5 + t * 0.002) * 20;
      const splashY = whaleY - 20 - ((t * 0.06 + i * 8) % 130);
      ctx.fillStyle = `rgba(216,180,254,${0.22 * fade})`;
      ctx.beginPath();
      ctx.arc(splashX, splashY, 1.2 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return <canvas ref={ref} className="h-full w-full" />;
}

export function SearchIntentScene() {
  const metrics = useRef([
    { label: 'CTR', x: 0.15, y: 0.25, vx: 0.13, vy: 0.12 },
    { label: 'ROAS', x: 0.45, y: 0.35, vx: -0.11, vy: 0.09 },
    { label: 'CPL', x: 0.68, y: 0.22, vx: 0.1, vy: -0.12 },
  ]);

  const ref = useCanvasRenderer((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#061223');
    bg.addColorStop(1, '#090b12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.58;
    const open = 0.55 + Math.sin(t * 0.0012) * 0.08;

    ctx.strokeStyle = 'rgba(56,189,248,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 170, cy + 55);
    ctx.lineTo(cx + 170, cy + 55);
    ctx.lineTo(cx + 130, cy + 95);
    ctx.lineTo(cx - 130, cy + 95);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 150, cy + 50);
    ctx.lineTo(cx - 125, cy - 80 * open);
    ctx.lineTo(cx + 125, cy - 80 * open);
    ctx.lineTo(cx + 150, cy + 50);
    ctx.closePath();
    ctx.stroke();

    const grad = ctx.createLinearGradient(cx, cy - 80 * open, cx, cy + 40);
    grad.addColorStop(0, 'rgba(14,165,233,0.18)');
    grad.addColorStop(1, 'rgba(99,102,241,0.04)');
    ctx.fillStyle = grad;
    ctx.fill();

    metrics.current.forEach((m) => {
      m.x += m.vx * 0.0035;
      m.y += m.vy * 0.0035;
      if (m.x > 0.9 || m.x < 0.1) m.vx *= -1;
      if (m.y > 0.55 || m.y < 0.1) m.vy *= -1;

      const x = w * m.x;
      const y = h * m.y;
      ctx.fillStyle = 'rgba(14,165,233,0.2)';
      ctx.beginPath();
      ctx.roundRect(x - 42, y - 16, 84, 32, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56,189,248,0.8)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(224,242,254,0.95)';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, x, y + 5);
    });
  });

  return <canvas ref={ref} className="h-full w-full" />;
}

export function ConsultGrowthScene() {
  const icons = useRef(Array.from({ length: 20 }, (_, i) => ({
    symbol: ['⚙', '📈', '💬', '🎯', '📊'][i % 5],
    angle: (Math.PI * 2 * i) / 20,
    speed: 0.003 + Math.random() * 0.004,
    radius: 40 + Math.random() * 120,
  })));

  const ref = useCanvasRenderer((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0b0d1a');
    bg.addColorStop(1, '#160920');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.48;
    const cy = h * 0.62;

    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(45,212,191,${0.18 - i * 0.03})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, cy + i * 18);
      ctx.bezierCurveTo(w * 0.25, cy - 30 + i * 12, w * 0.6, cy + 25 - i * 6, w, cy - 20 + i * 15);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(217,70,239,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + 20);
    ctx.quadraticCurveTo(cx + 50, cy - 80, cx + 140, cy - 20);
    ctx.quadraticCurveTo(cx + 70, cy - 5, cx + 45, cy + 50);
    ctx.stroke();

    icons.current.forEach((icon) => {
      icon.angle += icon.speed;
      const spread = 0.5 + 0.5 * Math.sin(t * 0.002);
      const x = cx + 90 + Math.cos(icon.angle) * icon.radius * spread;
      const y = cy - 90 + Math.sin(icon.angle * 1.6) * icon.radius * 0.45;
      ctx.font = '18px Inter, sans-serif';
      ctx.fillStyle = 'rgba(244,114,182,0.85)';
      ctx.fillText(icon.symbol, x, y);
    });
  });

  return <canvas ref={ref} className="h-full w-full" />;
}
