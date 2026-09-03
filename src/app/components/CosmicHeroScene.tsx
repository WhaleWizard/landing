import { memo, useEffect, useRef, useState } from 'react';
import {
  SCROLL_ACTIVITY_END_EVENT,
  SCROLL_ACTIVITY_START_EVENT,
  isScrollActivityActive,
} from '../utils/motionPerformance';

type Piece = {
  file: string;
  cls: string;
  w: number;
  h: number;
};

const MOONS: Piece[] = [
  { file: 'moon1', cls: 'cosmic-m1', w: 420, h: 418 },
  { file: 'moon2', cls: 'cosmic-m2', w: 360, h: 368 },
];

const DEEP_MOONS: Piece[] = [
  { file: 'moon3', cls: 'cosmic-m3', w: 248, h: 255 },
  { file: 'moon4', cls: 'cosmic-m4', w: 201, h: 204 },
  { file: 'moon5', cls: 'cosmic-m5', w: 149, h: 157 },
];

const SHARDS: Piece[] = [
  { file: 'shard1', cls: 'cosmic-c1', w: 300, h: 519 },
  { file: 'shard2', cls: 'cosmic-c2', w: 300, h: 285 },
  { file: 'shard3', cls: 'cosmic-c3', w: 216, h: 467 },
  { file: 'shard4', cls: 'cosmic-c4', w: 300, h: 278 },
  { file: 'shard5', cls: 'cosmic-c5', w: 247, h: 302 },
  { file: 'shard6', cls: 'cosmic-c6', w: 169, h: 330 },
  { file: 'shard7', cls: 'cosmic-c7', w: 133, h: 278 },
];

// CSS hides these objects below 900px. Do not download invisible decoration
// on a phone; when the viewport grows they are mounted and loaded normally.
const COMPACT_DEEP_MOONS = DEEP_MOONS.filter((piece) => piece.cls === 'cosmic-m3');
const COMPACT_SHARDS = SHARDS.filter((piece) => (
  piece.cls === 'cosmic-c1'
  || piece.cls === 'cosmic-c3'
  || piece.cls === 'cosmic-c5'
));
const WIDE_ONLY_PIECES = [
  ...DEEP_MOONS.filter((piece) => !COMPACT_DEEP_MOONS.includes(piece)),
  ...SHARDS.filter((piece) => !COMPACT_SHARDS.includes(piece)),
];

function preloadPiece(piece: Piece): Promise<void> {
  const image = new Image();
  image.decoding = 'async';
  image.src = `/images/cosmic/${piece.file}.webp`;
  if (typeof image.decode === 'function') return image.decode().catch(() => undefined);
  return new Promise((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  });
}

// Насколько сильно план уходит за курсором: [по горизонтали, по вертикали].
const DEPTH: Record<string, [number, number]> = {
  sky: [10, 7],
  deep: [20, 14],
  mid: [30, 20],
  near: [46, 30],
  front: [68, 44],
  dust: [58, 38],
};

type Dot = { x: number; y: number; r: number; sp: number; ph: number; hue: string };

/**
 * Все объекты сцены грузятся сразу. С loading="lazy" браузер не начинал
 * загрузку вовсе — они лежат внутри контейнера с overflow: hidden и
 * трансформированных слоёв, и наблюдатель считал их невидимыми. В бою это
 * выглядело как сцена из одного кита без кристаллов и мелких сфер.
 * Откладывать тут нечего: всё это и так содержимое первого экрана.
 */
function Layer({ items, kind }: { items: Piece[]; kind: 'moon' | 'shard' }) {
  return (
    <>
      {items.map((p) => (
        <img
          key={p.file}
          className={`cosmic-obj cosmic-${kind} ${p.cls}`}
          src={`/images/cosmic/${p.file}.webp`}
          alt=""
          width={p.w}
          height={p.h}
          loading="eager"
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function CosmicHeroScene({ active = true }: { active?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const controlRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [compactScene, setCompactScene] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    let revision = 0;
    let wasCompact = media.matches;
    const sync = () => {
      const nextCompact = media.matches;
      const currentRevision = ++revision;
      if (nextCompact) {
        wasCompact = true;
        setCompactScene(true);
        return;
      }
      if (!wasCompact) {
        setCompactScene(false);
        return;
      }

      // Assets omitted from the compact DOM are decoded before mounting when
      // a tablet/phone rotates above 900px. The desktop composition therefore
      // arrives in one frame instead of planets and shards popping in one by
      // one on a slower connection.
      wasCompact = false;
      void Promise.all(WIDE_ONLY_PIECES.map(preloadPiece)).then(() => {
        if (revision === currentRevision && !media.matches) setCompactScene(false);
      });
    };
    media.addEventListener('change', sync);
    setCompactScene(wasCompact);
    return () => {
      revision += 1;
      media.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (active) controlRef.current?.start();
    else controlRef.current?.stop();
  }, [active]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = dustRef.current;
    if (!stage || !canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches || compactScene;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const planes: [HTMLElement, number, number][] = [];
    (Object.keys(DEPTH) as (keyof typeof DEPTH)[]).forEach((key) => {
      const el = stage.querySelector<HTMLElement>(`[data-plane="${key}"]`);
      if (el) planes.push([el, DEPTH[key][0], DEPTH[key][1]]);
    });

    let dots: Dot[] = [];
    let canvasDpr = 1;
    let raf = 0;
    let coarseActivated = !coarse;
    let lastPaintAt = Number.NEGATIVE_INFINITY;
    let activationTimer = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const build = (): boolean => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.round(canvas.clientWidth * dpr);
      const nextHeight = Math.round(canvas.clientHeight * dpr);
      if (!nextWidth || !nextHeight) return false;
      // Пыль пересобирается только при настоящей смене размера холста. На
      // телефоне прокрутка прячет и показывает адресную строку, браузер шлёт
      // resize, и раньше каждый такой сигнал расставлял все точки заново — на
      // экране это читалось как рывок сцены посреди прокрутки.
      if (canvas.width === nextWidth && canvas.height === nextHeight && dots.length) return false;
      const previousWidth = canvas.width;
      const previousHeight = canvas.height;
      const previousDpr = canvasDpr;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      canvasDpr = dpr;

      const count = canvas.clientWidth < 900 ? 34 : 70;
      const createDot = (): Dot => ({
        x: (0.22 + Math.random() * 0.8) * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.4 + 0.4) * dpr,
        sp: (Math.random() * 0.2 + 0.04) * dpr,
        ph: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.5 ? '0, 210, 255' : '165, 125, 255',
      });
      if (dots.length && previousWidth && previousHeight) {
        const scaleX = nextWidth / previousWidth;
        const scaleY = nextHeight / previousHeight;
        dots = dots.slice(0, count).map((dot) => ({
          ...dot,
          x: dot.x * scaleX,
          y: dot.y * scaleY,
          r: dot.r * dpr / previousDpr,
          sp: dot.sp * dpr / previousDpr,
        }));
        while (dots.length < count) dots.push(createDot());
      } else {
        dots = Array.from({ length: count }, createDot);
      }
      return true;
    };

    const paint = (t: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dots) {
        if (!reduced && activeRef.current) {
          d.y -= d.sp;
          if (d.y < -6) {
            d.y = canvas.height + 6;
            d.x = (0.22 + Math.random() * 0.8) * canvas.width;
          }
        }
        const a = reduced ? 0.42 : 0.26 + 0.44 * (0.5 + 0.5 * Math.sin(t * 0.0012 + d.ph));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.hue},${a.toFixed(3)})`;
        ctx.fill();
      }
    };

    // Кадры выдаём только когда сцена действительно на экране и вкладка
    // активна. Раньше цикл крутился всегда: прокрутив главную до подвала,
    // посетитель продолжал платить за перерисовку холста во весь экран и шесть
    // записей transform в каждом кадре — эти кадры отбирались у самой прокрутки.
    let onScreen = true;
    const shouldRun = () => onScreen
      && activeRef.current
      && !document.hidden
      && !reduced
      && coarseActivated
      && !isScrollActivityActive();

    let appliedX = Number.NaN;
    let appliedY = Number.NaN;

    const loop = (t: number) => {
      if (!shouldRun()) {
        raf = 0;
        return;
      }

      // The dust moves slowly. After a touch user activates the scene, 24 fps
      // is visually continuous while avoiding a full canvas repaint on every
      // display refresh of a low-power phone.
      if (coarse && t - lastPaintAt < 1000 / 24) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastPaintAt = t;

      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;

      // Планы трогаем только при настоящем сдвиге: экспоненциальное сближение
      // никогда не даёт точный ноль, и без порога каждый кадр переписывал
      // transform шести слоям ради движения в тысячную пикселя.
      if (
        !(Math.abs(current.x - appliedX) < 0.0004 && Math.abs(current.y - appliedY) < 0.0004)
      ) {
        appliedX = current.x;
        appliedY = current.y;
        for (const [el, kx, ky] of planes) {
          el.style.transform = `translate3d(${current.x * kx}px,${current.y * ky}px,0)`;
        }
      }

      paint(t);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf || !shouldRun()) return;
      raf = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const onScrollStart = () => stop();
    const onScrollEnd = () => {
      if (coarse) coarseActivated = true;
      start();
    };

    const onMove = (e: MouseEvent) => {
      if (coarse || reduced || !activeRef.current) return;
      target = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };

    const handleResize = () => {
      // Changing canvas.width/height clears its bitmap. Repaint immediately
      // even while the animation loop is intentionally paused during touch
      // scrolling/browser-bar resize, otherwise dust disappears then pops in.
      if (build()) paint(performance.now());
    };

    build();

    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
        if (onScreen) start();
        else stop();
      }, { rootMargin: '120px 0px', threshold: 0 });
    observer?.observe(stage);

    // Always draw a complete first frame. Continuous canvas work starts
    // immediately on desktop; on touch devices it begins only after the first
    // real scroll, so loading and the browser-bar resize stay contention-free.
    paint(0);
    if (!reduced && !coarse) start();
    else if (!reduced) {
      // CSS layers already move immediately. Bring the subtler canvas dust in
      // only after the first-load burst so the effect remains present without
      // competing with LCP or Safari's initial browser-bar resize.
      activationTimer = window.setTimeout(() => {
        coarseActivated = true;
        start();
      }, 4_500);
    }
    controlRef.current = { start, stop };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener(SCROLL_ACTIVITY_START_EVENT, onScrollStart);
    document.addEventListener(SCROLL_ACTIVITY_END_EVENT, onScrollEnd);

    return () => {
      stop();
      if (activationTimer) window.clearTimeout(activationTimer);
      for (const [el] of planes) el.style.transform = '';
      controlRef.current = null;
      observer?.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener(SCROLL_ACTIVITY_START_EVENT, onScrollStart);
      document.removeEventListener(SCROLL_ACTIVITY_END_EVENT, onScrollEnd);
    };
  }, [compactScene]);

  return (
    <div className="cosmic-stage" ref={stageRef} aria-hidden="true">
      {/* Keep the slow sky drift on its own element. The wrapper receives the
          pointer parallax; putting both transforms on one node makes the CSS
          animation win over the inline transform and silently disables this
          depth layer's parallax. */}
      <div className="cosmic-plane cosmic-sky-plane" data-plane="sky">
        <div className="cosmic-sky" />
      </div>

      <div className="cosmic-plane cosmic-deep" data-plane="deep">
        <Layer items={compactScene ? COMPACT_DEEP_MOONS : DEEP_MOONS} kind="moon" />
      </div>

      <div className="cosmic-halo" />

      <div className="cosmic-plane cosmic-mid" data-plane="mid">
        {/* fetchpriority строчными намеренно: React 18 не знает camelCase-вариант
            и на каждый рендер пишет предупреждение в консоль */}
        <div className="cosmic-obj cosmic-whale">
          <span className="cosmic-swim">
            <img
              src="/images/cosmic/whale.webp"
              alt=""
              width={1195}
              height={697}
              loading="eager"
              fetchpriority="high"
              decoding="async"
            />
          </span>
        </div>
      </div>

      <div className="cosmic-plane cosmic-near" data-plane="near">
        <Layer items={MOONS} kind="moon" />
      </div>

      <div className="cosmic-plane cosmic-front" data-plane="front">
        <Layer items={compactScene ? COMPACT_SHARDS : SHARDS} kind="shard" />
      </div>

      <canvas className="cosmic-dust" data-plane="dust" ref={dustRef} />

      <div className="cosmic-scrim" />
      <div className="cosmic-vignette" />
    </div>
  );
}

export default memo(CosmicHeroScene);
