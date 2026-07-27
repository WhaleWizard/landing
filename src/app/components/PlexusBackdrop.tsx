import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

// Фон-«плексус»: невидимые узлы медленно дрейфуют по секции, линии соединяют
// те, что оказались рядом — сами собой образуются и распадаются треугольники
// и многоугольники. Курсор притягивает узлы: сеть стягивается к нему в плотный
// светящийся кластер, при уходе курсора разлетается обратно в свободный дрейф.
// Canvas + rAF, состояние в refs — React не ре-рендерится. Базовая прозрачность
// линий низкая, чтобы текст поверх оставался читабельным.
type PlexusBackdropProps = {
  inView: boolean;
  className?: string;
};

const LINK_DIST = 150; // расстояние, при котором узлы соединяются линией
const INFLUENCE_R = 260; // радиус притяжения курсора
const REPEL_DIST = 55; // мин. дистанция между узлами (чтобы кластер не схлопывался в точку)

// Оба парных цикла ниже перебирают ~9900 пар за кадр. Подавляющее большинство
// пар отсеивается по расстоянию, поэтому сравниваем КВАДРАТЫ расстояний, а
// корень извлекаем только для прошедших отбор. Результат тот же до последнего
// знака, работы — примерно в 15 раз меньше.
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
const REPEL_DIST_SQ = REPEL_DIST * REPEL_DIST;
const REPEL_MIN_SQ = 0.5 * 0.5;

function parseHexColor(value: string, fallback: [number, number, number]): [number, number, number] {
  const hex = value.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

const PlexusBackdrop = memo(({ inView, className = '' }: PlexusBackdropProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    type Node = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      baseVx: number;
      baseVy: number;
    };
    let nodes: Node[] = [];

    const styles = getComputedStyle(canvas);
    const [pr, pg, pb] = parseHexColor(styles.getPropertyValue('--primary'), [139, 92, 246]);
    const [ar, ag, ab] = parseHexColor(styles.getPropertyValue('--accent'), [0, 210, 255]);

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';

      // Плотность узлов пропорциональна площади, с разумным потолком
      const count = Math.min(100, Math.max(40, Math.round((width * height) / 19000)));
      nodes = Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.14;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          baseVx: Math.cos(angle) * speed,
          baseVy: Math.sin(angle) * speed,
        };
      });
    };

    const mouse = { x: -9999, y: -9999 };
    let lastMouseAt = -1e9;
    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      lastMouseAt = performance.now();
    };

    // Точка притяжения: следует за курсором, а на тач-устройствах и при
    // бездействии мыши (>2.5с) сама плавно блуждает по секции (кривая Лиссажу),
    // чтобы сеть жила и без курсора. Случайная фаза — секции не синхронны.
    const attractor = { x: -9999, y: -9999 };
    let time = Math.random() * 100;

    const updateAttractor = () => {
      time += 0.016;
      let targetX: number;
      let targetY: number;
      if (performance.now() - lastMouseAt < 2500) {
        targetX = mouse.x;
        targetY = mouse.y;
      } else {
        targetX = width / 2 + Math.sin(time * 0.21) * width * 0.36 + Math.sin(time * 0.07) * width * 0.1;
        targetY = height / 2 + Math.cos(time * 0.16) * height * 0.32 + Math.cos(time * 0.05) * height * 0.08;
      }
      if (attractor.x < -1000) {
        attractor.x = targetX;
        attractor.y = targetY;
      }
      attractor.x += (targetX - attractor.x) * 0.03;
      attractor.y += (targetY - attractor.y) * 0.03;
    };

    let rafId = 0;

    const step = () => {
      updateAttractor();
      for (const n of nodes) {
        // Скорость плавно возвращается к базовому дрейфу
        n.vx = n.vx * 0.92 + n.baseVx * 0.08;
        n.vy = n.vy * 0.92 + n.baseVy * 0.08;

        // Притяжение к точке притяжения (курсор или автономное блуждание)
        const dxm = attractor.x - n.x;
        const dym = attractor.y - n.y;
        const dm = Math.sqrt(dxm * dxm + dym * dym);
        if (dm < INFLUENCE_R && dm > 1) {
          const k = 1 - dm / INFLUENCE_R;
          n.vx += (dxm / dm) * k * 0.5;
          n.vy += (dym / dm) * k * 0.5;
        }

        n.x += n.vx;
        n.y += n.vy;

        // Отскок от краёв
        if (n.x < 0) { n.x = 0; n.baseVx = Math.abs(n.baseVx); n.vx = Math.abs(n.vx); }
        if (n.x > width) { n.x = width; n.baseVx = -Math.abs(n.baseVx); n.vx = -Math.abs(n.vx); }
        if (n.y < 0) { n.y = 0; n.baseVy = Math.abs(n.baseVy); n.vy = Math.abs(n.vy); }
        if (n.y > height) { n.y = height; n.baseVy = -Math.abs(n.baseVy); n.vy = -Math.abs(n.vy); }
      }

      // Короткодействующее отталкивание — кластер у курсора остаётся сетью, а не точкой
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= REPEL_DIST_SQ || distSq <= REPEL_MIN_SQ) continue;
          const d = Math.sqrt(distSq);
          const push = ((REPEL_DIST - d) / REPEL_DIST) * 0.35;
          const ux = dx / d;
          const uy = dy / d;
          a.vx -= ux * push;
          a.vy -= uy * push;
          b.vx += ux * push;
          b.vy += uy * push;
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Линии между близкими узлами
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= LINK_DIST_SQ) continue;
          const d = Math.sqrt(distSq);

          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const mdx = midX - attractor.x;
          const mdy = midY - attractor.y;
          const dm = Math.sqrt(mdx * mdx + mdy * mdy);
          const glow = dm < INFLUENCE_R ? 1 - dm / INFLUENCE_R : 0;

          const closeness = 1 - d / LINK_DIST;
          const alpha = closeness * (0.1 + glow * 0.3);
          const mix = Math.min(1, (midX / width) * 0.6 + glow * 0.55);
          const r = Math.round(pr + (ar - pr) * mix);
          const g = Math.round(pg + (ag - pg) * mix);
          const bl = Math.round(pb + (ab - pb) * mix);

          ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Узлы-точки
      for (const n of nodes) {
        const ndx = n.x - attractor.x;
        const ndy = n.y - attractor.y;
        const dm = Math.sqrt(ndx * ndx + ndy * ndy);
        const glow = dm < INFLUENCE_R ? 1 - dm / INFLUENCE_R : 0;
        const mix = Math.min(1, (n.x / width) * 0.6 + glow * 0.55);
        const r = Math.round(pr + (ar - pr) * mix);
        const g = Math.round(pg + (ag - pg) * mix);
        const bl = Math.round(pb + (ab - pb) * mix);
        ctx.fillStyle = `rgba(${r},${g},${bl},${0.25 + glow * 0.45})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.6 + glow * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      step();
      draw();
      rafId = requestAnimationFrame(loop);
    };

    rebuild();

    const resizeObserver = new ResizeObserver(() => {
      rebuild();
      if (prefersReduced || !inView) draw();
    });
    resizeObserver.observe(canvas);

    if (prefersReduced) {
      // Статичный кадр без анимации и реакции на курсор
      draw();
    } else {
      window.addEventListener('mousemove', handleMove, { passive: true });
      if (inView) {
        loop();
      } else {
        draw();
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMove);
    };
  }, [inView, prefersReduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none ${className}`} />;
});

PlexusBackdrop.displayName = 'PlexusBackdrop';

export default PlexusBackdrop;
