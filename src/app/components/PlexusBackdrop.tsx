import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { isScrollActivityActive } from '../utils/motionPerformance';

// Интерактивный фон-сеть. Состояние живёт в refs/замыкании canvas, поэтому
// кадры анимации не вызывают React-рендеры.
type PlexusBackdropProps = {
  /**
   * Видимость снаружи. Без этого значения сеть следит за собой сама — так
   * секции не приходится держать видимость в состоянии React и перерисовывать
   * себя целиком на каждом пересечении границы экрана.
   */
  inView?: boolean;
  className?: string;
};

const LINK_DIST = 150;
const INFLUENCE_R = 260;
const REPEL_DIST = 55;
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
const REPEL_DIST_SQ = REPEL_DIST * REPEL_DIST;
const REPEL_MIN_SQ = 0.5 * 0.5;
const FRAME_MS = 1000 / 60;

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
  // Видимость живёт в ref, а не в зависимостях эффекта. Иначе каждый вход и
  // выход секции пересоздавал весь эффект вместе с точками сети: возврат
  // прокруткой наверх строил новый узор с нуля, и фон заметно прыгал.
  const selfObserved = inView === undefined;
  const inViewRef = useRef(inView ?? false);
  const controlRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const constrainedDevice = coarsePointer
      || navigator.hardwareConcurrency <= 4
      || deviceMemory <= 4;
    const targetFps = coarsePointer ? 30 : constrainedDevice ? 40 : 60;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      coarsePointer ? 1.25 : constrainedDevice ? 1.5 : 2,
    );
    const minFrameMs = 1000 / targetFps;
    let width = 0;
    let height = 0;
    let canvasLeft = 0;
    let canvasTop = 0;
    let lastRectMeasureAt = -1e9;

    type Node = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      baseVx: number;
      baseVy: number;
    };
    let nodes: Node[] = [];

    // Ячейки размером с максимальную дистанцию связи. Поэтому для каждой точки
    // достаточно проверить только восемь соседних ячеек вместо всех N² пар.
    let gridColumns = 1;
    let gridRows = 1;
    let grid: number[][] = [[]];

    const styles = getComputedStyle(canvas);
    const [pr, pg, pb] = parseHexColor(styles.getPropertyValue('--primary'), [139, 92, 246]);
    const [ar, ag, ab] = parseHexColor(styles.getPropertyValue('--accent'), [0, 210, 255]);

    const createNode = (targetWidth: number, targetHeight: number): Node => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.12 + Math.random() * 0.14;
      return {
        x: Math.random() * targetWidth,
        y: Math.random() * targetHeight,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseVx: Math.cos(angle) * speed,
        baseVy: Math.sin(angle) * speed,
      };
    };

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      canvasLeft = rect.left;
      canvasTop = rect.top;
      lastRectMeasureAt = performance.now();

      const nextWidth = rect.width;
      const nextHeight = rect.height;
      if (nextWidth === 0 || nextHeight === 0) return;
      if (Math.abs(nextWidth - width) < 0.5 && Math.abs(nextHeight - height) < 0.5) return;

      const previousWidth = width;
      const previousHeight = height;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';

      gridColumns = Math.max(1, Math.ceil(width / LINK_DIST));
      gridRows = Math.max(1, Math.ceil(height / LINK_DIST));
      grid = Array.from({ length: gridColumns * gridRows }, () => []);

      const maxNodes = coarsePointer ? 56 : constrainedDevice ? 72 : 100;
      const density = constrainedDevice ? 25000 : 19000;
      const count = Math.min(maxNodes, Math.max(36, Math.round((width * height) / density)));
      if (nodes.length === 0 || previousWidth === 0 || previousHeight === 0) {
        nodes = Array.from({ length: count }, () => createNode(width, height));
        return;
      }

      const scaleX = width / previousWidth;
      const scaleY = height / previousHeight;
      nodes = nodes.slice(0, count).map((node) => ({
        ...node,
        x: Math.min(width, Math.max(0, node.x * scaleX)),
        y: Math.min(height, Math.max(0, node.y * scaleY)),
      }));
      while (nodes.length < count) nodes.push(createNode(width, height));
    };

    const mouse = { x: -9999, y: -9999 };
    let lastMouseAt = -1e9;
    const handleMove = (event: MouseEvent) => {
      const now = performance.now();
      // Геометрию canvas измеряем максимум раз в 120 мс, а не на каждое
      // системное mousemove-событие. Между измерениями координаты стабильны.
      if (now - lastRectMeasureAt > 120) {
        const rect = canvas.getBoundingClientRect();
        canvasLeft = rect.left;
        canvasTop = rect.top;
        lastRectMeasureAt = now;
      }
      mouse.x = event.clientX - canvasLeft;
      mouse.y = event.clientY - canvasTop;
      lastMouseAt = now;
    };

    const attractor = { x: -9999, y: -9999 };
    let time = Math.random() * 100;

    const updateAttractor = (delta: number) => {
      time += 0.016 * delta;
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
      const ease = 1 - Math.pow(0.97, delta);
      attractor.x += (targetX - attractor.x) * ease;
      attractor.y += (targetY - attractor.y) * ease;
    };

    const updateNodes = (delta: number) => {
      updateAttractor(delta);
      const damping = Math.pow(0.92, delta);
      const restore = 1 - damping;
      for (const node of nodes) {
        node.vx = node.vx * damping + node.baseVx * restore;
        node.vy = node.vy * damping + node.baseVy * restore;

        const dxm = attractor.x - node.x;
        const dym = attractor.y - node.y;
        const dmSq = dxm * dxm + dym * dym;
        if (dmSq < INFLUENCE_R * INFLUENCE_R && dmSq > 1) {
          const dm = Math.sqrt(dmSq);
          const force = (1 - dm / INFLUENCE_R) * 0.5 * delta;
          node.vx += (dxm / dm) * force;
          node.vy += (dym / dm) * force;
        }

        node.x += node.vx * delta;
        node.y += node.vy * delta;
        if (node.x < 0) { node.x = 0; node.baseVx = Math.abs(node.baseVx); node.vx = Math.abs(node.vx); }
        if (node.x > width) { node.x = width; node.baseVx = -Math.abs(node.baseVx); node.vx = -Math.abs(node.vx); }
        if (node.y < 0) { node.y = 0; node.baseVy = Math.abs(node.baseVy); node.vy = Math.abs(node.vy); }
        if (node.y > height) { node.y = height; node.baseVy = -Math.abs(node.baseVy); node.vy = -Math.abs(node.vy); }
      }
    };

    const draw = (animate: boolean, delta = 1) => {
      if (width === 0 || height === 0) return;
      if (animate) updateNodes(delta);
      ctx.clearRect(0, 0, width, height);
      for (const cell of grid) cell.length = 0;

      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const cellX = Math.min(gridColumns - 1, Math.max(0, Math.floor(node.x / LINK_DIST)));
        const cellY = Math.min(gridRows - 1, Math.max(0, Math.floor(node.y / LINK_DIST)));

        for (let y = Math.max(0, cellY - 1); y <= Math.min(gridRows - 1, cellY + 1); y += 1) {
          for (let x = Math.max(0, cellX - 1); x <= Math.min(gridColumns - 1, cellX + 1); x += 1) {
            for (const otherIndex of grid[y * gridColumns + x]) {
              const other = nodes[otherIndex];
              const dx = node.x - other.x;
              const dy = node.y - other.y;
              const distSq = dx * dx + dy * dy;

              if (animate && distSq < REPEL_DIST_SQ && distSq > REPEL_MIN_SQ) {
                const distance = Math.sqrt(distSq);
                const push = ((REPEL_DIST - distance) / REPEL_DIST) * 0.35 * delta;
                const ux = dx / distance;
                const uy = dy / distance;
                node.vx += ux * push;
                node.vy += uy * push;
                other.vx -= ux * push;
                other.vy -= uy * push;
              }

              if (distSq >= LINK_DIST_SQ) continue;
              const distance = Math.sqrt(distSq);
              const midX = (node.x + other.x) / 2;
              const midY = (node.y + other.y) / 2;
              const attractorDx = midX - attractor.x;
              const attractorDy = midY - attractor.y;
              const attractorDistance = Math.sqrt(attractorDx * attractorDx + attractorDy * attractorDy);
              const glow = attractorDistance < INFLUENCE_R ? 1 - attractorDistance / INFLUENCE_R : 0;
              const alpha = (1 - distance / LINK_DIST) * (0.1 + glow * 0.3);
              const mix = Math.min(1, (midX / width) * 0.6 + glow * 0.55);
              const red = Math.round(pr + (ar - pr) * mix);
              const green = Math.round(pg + (ag - pg) * mix);
              const blue = Math.round(pb + (ab - pb) * mix);

              ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
              ctx.beginPath();
              ctx.moveTo(node.x, node.y);
              ctx.lineTo(other.x, other.y);
              ctx.stroke();
            }
          }
        }

        grid[cellY * gridColumns + cellX].push(i);
      }

      for (const node of nodes) {
        const dx = node.x - attractor.x;
        const dy = node.y - attractor.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const glow = distance < INFLUENCE_R ? 1 - distance / INFLUENCE_R : 0;
        const mix = Math.min(1, (node.x / width) * 0.6 + glow * 0.55);
        const red = Math.round(pr + (ar - pr) * mix);
        const green = Math.round(pg + (ag - pg) * mix);
        const blue = Math.round(pb + (ab - pb) * mix);
        ctx.fillStyle = `rgba(${red},${green},${blue},${0.25 + glow * 0.45})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1.6 + glow * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let rafId = 0;
    let lastFrameAt = 0;
    // Во время прокрутки сеть не останавливается, а разрежает кадры. Полная
    // остановка освобождала главный поток, но при медленном скролле сеть на
    // экране просто замирала — движение здесь и есть весь смысл фона.
    const SCROLL_FRAME_FACTOR = 3;
    const loop = (now: number) => {
      if (document.hidden || !inViewRef.current || prefersReduced) {
        rafId = 0;
        return;
      }
      const budget = isScrollActivityActive() ? minFrameMs * SCROLL_FRAME_FACTOR : minFrameMs;
      const elapsed = lastFrameAt === 0 ? FRAME_MS : now - lastFrameAt;
      if (lastFrameAt === 0 || elapsed >= budget - 0.5) {
        lastFrameAt = now;
        draw(true, Math.min(2.5, elapsed / FRAME_MS));
      }
      rafId = requestAnimationFrame(loop);
    };
    const start = () => {
      if (rafId || document.hidden || !inViewRef.current || prefersReduced) return;
      lastFrameAt = 0;
      rafId = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    rebuild();
    const resizeObserver = new ResizeObserver(() => {
      rebuild();
      if (!rafId) draw(false);
    });
    resizeObserver.observe(canvas);

    controlRef.current = { start, stop };

    if (prefersReduced) {
      draw(false);
    } else {
      if (!coarsePointer) window.addEventListener('mousemove', handleMove, { passive: true });
      document.addEventListener('visibilitychange', handleVisibility);
      // Первый кадр рисуем всегда: сеть должна стоять на своём месте ещё до
      // того, как секция попала в зону видимости.
      draw(false);
      start();
    }

    return () => {
      stop();
      controlRef.current = null;
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMove);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [prefersReduced]);

  useEffect(() => {
    if (selfObserved) return;
    inViewRef.current = Boolean(inView);
    if (inView) controlRef.current?.start();
    else controlRef.current?.stop();
  }, [inView, selfObserved]);

  useEffect(() => {
    if (!selfObserved) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      inViewRef.current = true;
      controlRef.current?.start();
      return undefined;
    }

    // Запас в четверть экрана: сеть успевает ожить до того, как секция
    // въезжает в кадр, и не мигает на границе.
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      inViewRef.current = visible;
      if (visible) controlRef.current?.start();
      else controlRef.current?.stop();
    }, { rootMargin: '25% 0px', threshold: 0 });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [selfObserved]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none ${className}`} />;
});

PlexusBackdrop.displayName = 'PlexusBackdrop';

export default PlexusBackdrop;
