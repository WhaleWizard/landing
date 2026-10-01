import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { isScrollActivityActive } from '../utils/motionPerformance';
import '../../styles/plexus-static.css';

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

/**
 * Телефон и планшет: сеть без холста и без JavaScript на кадр.
 *
 * Холст во всю секцию перерисовывался 24 раза в секунду в «Услугах»,
 * «Отзывах», подвале и блоге — на телефоне это была самая заметная причина
 * рывков при прокрутке. Здесь тот же узор (те же плотность, дистанция связи и
 * цвета) рисуется один раз как SVG, а живёт он за счёт композитора: два слоя
 * медленно дрейфуют навстречу друг другу, а мягкое свечение бродит по секции,
 * как раньше бродила точка притяжения. Владелец разрешил заменить паутинку на
 * телефоне более лёгкой анимацией — это она.
 */
const STATIC_LINK_DIST = 150;
const STATIC_MEDIA = '(pointer: coarse), (max-width: 900px)';

type StaticNode = { x: number; y: number; r: number };
type StaticLink = { x1: number; y1: number; x2: number; y2: number; alpha: number };

function buildConstellation(width: number, height: number, seed: number) {
  // Детерминированный разброс: один и тот же узор на одной и той же секции,
  // чтобы возврат к ней прокруткой не рисовал новую сеть.
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const count = Math.min(56, Math.max(36, Math.round((width * height) / 25000)));
  const near: StaticNode[] = Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    r: 1.3 + random() * 0.7,
  }));
  const far: StaticNode[] = Array.from({ length: Math.round(count / 2) }, () => ({
    x: random() * width,
    y: random() * height,
    r: 0.7 + random() * 0.6,
  }));
  const links: StaticLink[] = [];
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      const dx = near[i].x - near[j].x;
      const dy = near[i].y - near[j].y;
      const distance = Math.hypot(dx, dy);
      if (distance >= STATIC_LINK_DIST) continue;
      links.push({ x1: near[i].x, y1: near[i].y, x2: near[j].x, y2: near[j].y, alpha: (1 - distance / STATIC_LINK_DIST) * 0.16 });
    }
  }
  return { near, far, links };
}

type ConstellationStyle = CSSProperties & { '--plexus-w': string; '--plexus-h': string };

function PlexusConstellation({ className = '' }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  // Один замер при монтировании, а не наблюдатель: узор строится в своих
  // координатах, а при повороте экрана SVG сам масштабируется viewBox-ом.
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setBox({ width: Math.max(320, Math.round(rect.width)), height: Math.max(240, Math.round(rect.height)) });
  }, []);

  if (!box) return <div ref={rootRef} aria-hidden="true" className={`plexus-static ${className}`} />;

  const { near, far, links } = buildConstellation(box.width, box.height, box.width * 31 + box.height * 7);
  const gradientId = `plexus-grad-${box.width}x${box.height}`;
  const style: ConstellationStyle = { '--plexus-w': `${box.width}px`, '--plexus-h': `${box.height}px` };
  const viewBox = `0 0 ${box.width} ${box.height}`;

  return (
    <div ref={rootRef} aria-hidden="true" className={`plexus-static ${className}`} style={style}>
      <svg className="plexus-static__layer plexus-static__layer--far ww-ambient-motion" viewBox={viewBox} preserveAspectRatio="xMidYMid slice">
        {far.map((node, index) => (
          <circle key={index} cx={node.x} cy={node.y} r={node.r} className="plexus-static__dot plexus-static__dot--far" />
        ))}
      </svg>
      <svg className="plexus-static__layer plexus-static__layer--near ww-ambient-motion" viewBox={viewBox} preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* Фиолетовый слева переходит в голубой справа — как смешение цветов по x в холсте. */}
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={box.width} y2="0">
            <stop offset="0%" className="plexus-static__stop plexus-static__stop--primary" />
            <stop offset="100%" className="plexus-static__stop plexus-static__stop--accent" />
          </linearGradient>
        </defs>
        {links.map((link, index) => (
          <line key={index} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} stroke={`url(#${gradientId})`} strokeOpacity={link.alpha.toFixed(3)} />
        ))}
        {near.map((node, index) => (
          <circle key={index} cx={node.x} cy={node.y} r={node.r} fill={`url(#${gradientId})`} className="plexus-static__dot" />
        ))}
      </svg>
      <div className="plexus-static__glow ww-ambient-motion" />
    </div>
  );
}

type PlexusNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseVx: number;
  baseVy: number;
};

const LINK_DIST = 150;
const INFLUENCE_R = 260;
const REPEL_DIST = 55;
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
const REPEL_DIST_SQ = REPEL_DIST * REPEL_DIST;
const REPEL_MIN_SQ = 0.5 * 0.5;
const FRAME_MS = 1000 / 60;
/** Шаг прозрачности при группировке линий: 1/40 — не больше 1–2 уровней из 255. */
const PLEXUS_ALPHA_STEPS = 40;
/** Ступени смешения основного цвета с акцентным для тех же групп. */
const PLEXUS_MIX_STEPS = 8;

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
  // Режим выбирается один раз при монтировании: телефон и планшет получают
  // композиторную версию, курсорный экран — интерактивный холст.
  const [staticMode] = useState(() => typeof window !== 'undefined' && window.matchMedia(STATIC_MEDIA).matches);
  if (staticMode) return <PlexusConstellation className={className} />;
  return <PlexusCanvas inView={inView} className={className} />;
});

PlexusBackdrop.displayName = 'PlexusBackdrop';

const PlexusCanvas = memo(({ inView, className = '' }: PlexusBackdropProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReduced = useReducedMotion();
  // Видимость живёт в ref, а не в зависимостях эффекта. Иначе каждый вход и
  // выход секции пересоздавал весь эффект вместе с точками сети: возврат
  // прокруткой наверх строил новый узор с нуля, и фон заметно прыгал.
  const selfObserved = inView === undefined;
  const inViewRef = useRef(inView ?? false);
  const controlRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  // Preserve the generated network across a compact/desktop breakpoint
  // change. The effect still updates its FPS/DPR budget, but the visible
  // constellation scales in place instead of teleporting to new random nodes.
  const patternRef = useRef<{ nodes: PlexusNode[]; width: number; height: number }>({
    nodes: [],
    width: 0,
    height: 0,
  });
  const [compactMotion, setCompactMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setCompactMotion(media.matches);
    media.addEventListener('change', sync);
    sync();
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const compactDevice = coarsePointer || compactMotion;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const constrainedDevice = compactDevice
      || navigator.hardwareConcurrency <= 4
      || deviceMemory <= 4;
    const targetFps = compactDevice ? 24 : constrainedDevice ? 40 : 60;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      compactDevice ? 1.25 : constrainedDevice ? 1.5 : 2,
    );
    const minFrameMs = 1000 / targetFps;
    let width = 0;
    let height = 0;
    let canvasLeft = 0;
    let canvasTop = 0;
    let lastRectMeasureAt = -1e9;

    const restoredWidth = patternRef.current.width;
    const restoredHeight = patternRef.current.height;
    let nodes = patternRef.current.nodes;

    // Ячейки размером с максимальную дистанцию связи. Поэтому для каждой точки
    // достаточно проверить только восемь соседних ячеек вместо всех N² пар.
    let gridColumns = 1;
    let gridRows = 1;
    let grid: number[][] = [[]];

    const styles = getComputedStyle(canvas);
    const [pr, pg, pb] = parseHexColor(styles.getPropertyValue('--primary'), [139, 92, 246]);
    const [ar, ag, ab] = parseHexColor(styles.getPropertyValue('--accent'), [0, 210, 255]);

    const createNode = (targetWidth: number, targetHeight: number): PlexusNode => {
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

    const rebuild = (size?: { width: number; height: number }) => {
      let nextWidth: number;
      let nextHeight: number;
      if (size) {
        // Размер пришёл из события наблюдателя — раскладку страницы не трогаем
        // (правило из CLAUDE.md). Положение холста для курсора пересчитается
        // при следующем движении мыши.
        nextWidth = size.width;
        nextHeight = size.height;
        lastRectMeasureAt = -1e9;
      } else {
        const rect = canvas.getBoundingClientRect();
        canvasLeft = rect.left;
        canvasTop = rect.top;
        lastRectMeasureAt = performance.now();
        nextWidth = rect.width;
        nextHeight = rect.height;
      }
      if (nextWidth === 0 || nextHeight === 0) return;
      if (Math.abs(nextWidth - width) < 0.5 && Math.abs(nextHeight - height) < 0.5) return;

      const previousWidth = width || restoredWidth;
      const previousHeight = height || restoredHeight;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';

      gridColumns = Math.max(1, Math.ceil(width / LINK_DIST));
      gridRows = Math.max(1, Math.ceil(height / LINK_DIST));
      grid = Array.from({ length: gridColumns * gridRows }, () => []);

      const maxNodes = compactDevice ? 56 : constrainedDevice ? 72 : 100;
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
      // Every mounted section receives the window event. Off-screen networks
      // must not force layout just because the visitor moved the pointer.
      if (!inViewRef.current || document.hidden || isScrollActivityActive()) return;
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

    /**
     * Цвет линий и точек квантуется в общие «ведёрки»: прозрачность с шагом
     * 1/40, смешение фиолетового с голубым — в 8 ступеней. Все отрезки одного
     * ведёрка уходят в один `stroke()`, точки — в один `fill()`.
     *
     * Раньше каждая из сотен линий получала свой `strokeStyle` и свой вызов
     * `stroke()`: на телефоне и в headless-Chrome PageSpeed кадр стоил
     * десятки миллисекунд, сеть съедала около четверти процессора всё время,
     * пока страница открыта, а проверка скорости не могла дождаться тишины
     * и обрывалась. Расчёт положения точек, притяжение к курсору и сами
     * значения цвета не менялись — округление на 1–2 уровня из 255 глазом
     * не читается, а число команд холсту падает на порядок.
     */
    const styleCache = new Map<number, string>();
    const bucketStyle = (alphaLevel: number, mixLevel: number): string => {
      const key = alphaLevel * PLEXUS_MIX_STEPS + mixLevel;
      let style = styleCache.get(key);
      if (!style) {
        const mix = mixLevel / (PLEXUS_MIX_STEPS - 1);
        const red = Math.round(pr + (ar - pr) * mix);
        const green = Math.round(pg + (ag - pg) * mix);
        const blue = Math.round(pb + (ab - pb) * mix);
        style = `rgba(${red},${green},${blue},${(alphaLevel / PLEXUS_ALPHA_STEPS).toFixed(3)})`;
        styleCache.set(key, style);
      }
      return style;
    };
    const bucketKey = (alpha: number, mix: number): number => {
      const alphaLevel = Math.min(PLEXUS_ALPHA_STEPS, Math.max(0, Math.round(alpha * PLEXUS_ALPHA_STEPS)));
      const mixLevel = Math.min(PLEXUS_MIX_STEPS - 1, Math.max(0, Math.round(mix * (PLEXUS_MIX_STEPS - 1))));
      return alphaLevel * PLEXUS_MIX_STEPS + mixLevel;
    };
    const lineBatches = new Map<number, Path2D>();
    const dotBatches = new Map<number, Path2D>();

    const draw = (animate: boolean, delta = 1) => {
      if (width === 0 || height === 0) return;
      if (animate) updateNodes(delta);
      ctx.clearRect(0, 0, width, height);
      for (const cell of grid) cell.length = 0;
      lineBatches.clear();
      dotBatches.clear();

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

              const key = bucketKey(alpha, mix);
              let path = lineBatches.get(key);
              if (!path) {
                path = new Path2D();
                lineBatches.set(key, path);
              }
              path.moveTo(node.x, node.y);
              path.lineTo(other.x, other.y);
            }
          }
        }

        grid[cellY * gridColumns + cellX].push(i);
      }

      ctx.lineWidth = 1;
      for (const [key, path] of lineBatches) {
        ctx.strokeStyle = bucketStyle(Math.floor(key / PLEXUS_MIX_STEPS), key % PLEXUS_MIX_STEPS);
        ctx.stroke(path);
      }

      for (const node of nodes) {
        const dx = node.x - attractor.x;
        const dy = node.y - attractor.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const glow = distance < INFLUENCE_R ? 1 - distance / INFLUENCE_R : 0;
        const mix = Math.min(1, (node.x / width) * 0.6 + glow * 0.55);
        const radius = 1.6 + glow * 0.9;
        const key = bucketKey(0.25 + glow * 0.45, mix);
        let path = dotBatches.get(key);
        if (!path) {
          path = new Path2D();
          dotBatches.set(key, path);
        }
        // moveTo перед дугой: иначе путь соединил бы соседние точки линией.
        path.moveTo(node.x + radius, node.y);
        path.arc(node.x, node.y, radius, 0, Math.PI * 2);
      }

      for (const [key, path] of dotBatches) {
        ctx.fillStyle = bucketStyle(Math.floor(key / PLEXUS_MIX_STEPS), key % PLEXUS_MIX_STEPS);
        ctx.fill(path);
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
        // Симуляция продвигается на реально прошедшее время, а потолок лишь
        // чуть выше текущего бюджета кадра: после свёрнутой вкладки точки не
        // телепортируются. Прежний потолок в 2,5 кадра был меньше бюджета
        // прокрутки — сеть замедлялась втрое на время скролла и ускорялась
        // после.
        draw(true, Math.min(budget / FRAME_MS + 1, elapsed / FRAME_MS));
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
    const handleResize = (entries?: ResizeObserverEntry[]) => {
      const box = entries?.[0]?.contentRect;
      rebuild(box ? { width: box.width, height: box.height } : undefined);
      if (!rafId) draw(false);
    };
    const handleWindowResize = () => handleResize();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleResize);
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener('resize', handleWindowResize, { passive: true });

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
      patternRef.current = { nodes, width, height };
      controlRef.current = null;
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('mousemove', handleMove);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [compactMotion, prefersReduced]);

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

    // Desktop gets a small lead-in. On a phone the section is mounted before
    // it is visible, so starting its full-size canvas in that lead-in would
    // compete with the hero's first paint for no visible benefit.
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      inViewRef.current = visible;
      if (visible) controlRef.current?.start();
      else controlRef.current?.stop();
    }, {
      rootMargin: compactMotion ? '0px' : '25% 0px',
      threshold: compactMotion ? 0.01 : 0,
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [compactMotion, selfObserved]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none ${className}`} />;
});

PlexusCanvas.displayName = 'PlexusCanvas';

export default PlexusBackdrop;
