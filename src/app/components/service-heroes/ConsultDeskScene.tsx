import { memo, useEffect, useRef } from 'react';
import { useAmbientVisibility } from '../hooks/useAmbientVisibility';
import {
  SCROLL_ACTIVITY_END_EVENT,
  SCROLL_ACTIVITY_START_EVENT,
  createSceneFrameClock,
  isScrollActivityActive,
} from '../../utils/motionPerformance';
// Стили рядом с компонентом: точный предпросмотр в админке монтирует хиро
// напрямую, и без этого сцена приехала бы без раскладки.
// import '../../../styles/consult-desk-scene.css' -> consolidated into src/styles/index.css for single-stylesheet SSR CRP

type Piece = {
  file: string;
  cls: string;
  alt?: string;
};

// Порядок в массиве — порядок укладки на стол: сначала дальние вещи.
// Лампа, растение, очки, перьевая ручка и скрепка на стол не кладутся:
// ручка уже нарисована на блокноте, скрепка в одиночестве читалась как
// мусор, а остальное перегружало кадр. Свет лампы тоже снят — без самой
// лампы свечение было бы пятном из ниоткуда.
const FAR: Piece[] = [
  { file: 'obj1', cls: 'cds-books' },
];

const MID: Piece[] = [
  { file: 'laptop', cls: 'cds-laptop' },
];

const NEAR: Piece[] = [
  { file: 'notebook', cls: 'cds-notebook' },
  { file: 'obj3', cls: 'cds-cup' },
];

const FRONT: Piece[] = [
  { file: 'paper1', cls: 'cds-note-a' },
  { file: 'paper3', cls: 'cds-note-b' },
  { file: 'paper2', cls: 'cds-torn' },
  { file: 'paper4', cls: 'cds-card' },
];

// Насколько каждый план уходит за курсором: [по горизонтали, по вертикали].
const DEPTH: Record<string, [number, number]> = {
  desk: [6, 4],
  far: [14, 9],
  mid: [24, 15],
  near: [38, 24],
  front: [58, 36],
  dust: [50, 32],
};

type Mote = { x: number; y: number; r: number; sp: number; drift: number; ph: number };

const PIECE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  laptop: { width: 720, height: 693 },
  notebook: { width: 700, height: 582 },
  obj1: { width: 320, height: 265 },
  obj3: { width: 320, height: 297 },
  paper1: { width: 260, height: 258 },
  paper2: { width: 254, height: 233 },
  paper3: { width: 260, height: 270 },
  paper4: { width: 260, height: 170 },
};

function Layer({ items }: { items: Piece[] }) {
  return (
    <>
      {items.map((p) => (
        <img
          key={p.file}
          className={`cds-obj ${p.cls}`}
          src={`/images/consult-proof/scene/${p.file}.webp`}
          srcSet={
            p.file === 'laptop'
              ? '/images/consult-proof/scene/laptop-mobile.webp 480w, /images/consult-proof/scene/laptop.webp 720w'
              : p.file === 'notebook'
              ? '/images/consult-proof/scene/notebook-mobile.webp 400w, /images/consult-proof/scene/notebook.webp 700w'
              : undefined
          }
          sizes={
            p.file === 'laptop'
              ? '(max-width: 1023px) 240px, 720px'
              : p.file === 'notebook'
              ? '(max-width: 1023px) 210px, 700px'
              : undefined
          }
          width={PIECE_DIMENSIONS[p.file]?.width}
          height={PIECE_DIMENSIONS[p.file]?.height}
          alt=""
          loading="lazy"
          fetchpriority="low"
          decoding="async"
        />
      ))}
    </>
  );
}

function ConsultDeskScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  useAmbientVisibility(rootRef, { rootMargin: '120px 0px' });

  useEffect(() => {
    const root = rootRef.current;
    const canvas = dustRef.current;
    if (!root || !canvas) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionPreference.matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const compact = coarse || window.matchMedia('(max-width: 900px)').matches;
    const frameClock = createSceneFrameClock(compact);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const planes: [HTMLElement, number, number][] = [];
    (Object.keys(DEPTH) as (keyof typeof DEPTH)[]).forEach((key) => {
      const el = root.querySelector<HTMLElement>(`[data-plane="${key}"]`);
      if (el) planes.push([el, DEPTH[key][0], DEPTH[key][1]]);
    });

    let motes: Mote[] = [];
    let canvasDpr = 1;
    let raf = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    // Размер приходит из события наблюдателя: холст растянут на всю сцену
    // (`inset: 0`), поэтому её контент-бокс и есть размер холста. Читать
    // clientWidth внутри наблюдателя нельзя — это пересчёт раскладки страницы.
    const build = (size?: { width: number; height: number }) => {
      const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 2);
      const cssWidth = size ? size.width : canvas.clientWidth;
      const cssHeight = size ? size.height : canvas.clientHeight;
      const w = Math.round(cssWidth * dpr);
      const h = Math.round(cssHeight * dpr);
      // Присваиваем только при реальном изменении: запись в width/height сама
      // считается изменением размера, и наблюдатель уходил бы в бесконечный
      // цикл, раздувая холст на каждом шаге.
      if (!w || !h || (canvas.width === w && canvas.height === h && motes.length)) return false;
      const previousWidth = canvas.width;
      const previousHeight = canvas.height;
      const previousDpr = canvasDpr;
      canvas.width = w;
      canvas.height = h;
      canvasDpr = dpr;

      // Пылинки держатся у луча лампы — она в левой верхней части кадра.
      const count = cssWidth < 900 ? 26 : 54;
      const createMote = (): Mote => ({
        x: (0.02 + Math.random() * 0.68) * canvas.width,
        y: Math.random() * canvas.height * 0.82,
        r: (Math.random() * 1.3 + 0.4) * dpr,
        sp: (Math.random() * 0.16 + 0.03) * dpr,
        drift: (Math.random() - 0.5) * 0.08 * dpr,
        ph: Math.random() * Math.PI * 2,
      });
      if (motes.length && previousWidth && previousHeight) {
        motes = motes.slice(0, count).map((mote) => ({
          ...mote,
          x: mote.x * w / previousWidth,
          y: mote.y * h / previousHeight,
          r: mote.r * dpr / previousDpr,
          sp: mote.sp * dpr / previousDpr,
          drift: mote.drift * dpr / previousDpr,
        }));
        while (motes.length < count) motes.push(createMote());
      } else {
        motes = Array.from({ length: count }, createMote);
      }
      return true;
    };

    // Скорость пылинок задана за кадр при 60 Гц; шаг считается по времени,
    // чтобы экран 120 Гц не гонял их вдвое быстрее, а пауза не давала прыжка.
    const paint = (t: number, step = 0) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const m of motes) {
        if (!reduced) {
          m.y -= m.sp * step;
          m.x += m.drift * step;
          if (m.y < -6) {
            m.y = canvas.height * 0.85;
            m.x = (0.02 + Math.random() * 0.68) * canvas.width;
          }
        }
        const a = reduced ? 0.31 : 0.14 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.0009 + m.ph));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 214, 150, ${a.toFixed(3)})`;
        ctx.fill();
      }
    };

    // Сцена платит за кадры только пока она на экране и вкладка активна. Без
    // этого цикл рисовал пыль и переписывал transform всем планам всю дорогу
    // вниз по странице, отбирая кадры у самой прокрутки.
    let onScreen = true;
    const shouldRun = () => onScreen && !document.hidden && !reduced && !isScrollActivityActive();

    let appliedX = 0;
    let appliedY = 0;

    const loop = (t: number) => {
      if (!shouldRun()) {
        raf = 0;
        return;
      }

      const step = frameClock.step(t);
      if (!step) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const ease = 1 - Math.pow(1 - 0.055, step);
      current.x += (target.x - current.x) * ease;
      current.y += (target.y - current.y) * ease;
      // Порог отсекает движение в тысячную пикселя: сближение с целью
      // асимптотическое и само по себе никогда не заканчивается.
      if (
        !(Math.abs(current.x - appliedX) < 0.0004 && Math.abs(current.y - appliedY) < 0.0004)
      ) {
        appliedX = current.x;
        appliedY = current.y;
        for (const [el, kx, ky] of planes) {
          el.style.transform = `translate3d(${current.x * kx}px,${current.y * ky}px,0)`;
        }
      }
      paint(t, step);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf || !shouldRun()) return;
      frameClock.reset();
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
    const onScrollEnd = () => start();
    const onMotionPreference = () => {
      reduced = motionPreference.matches;
      if (reduced) {
        stop();
        target = { x: 0, y: 0 };
        current.x = current.y = 0;
        appliedX = appliedY = Number.NaN;
        for (const [el] of planes) el.style.transform = '';
        paint(0);
      } else start();
    };

    // Курсор почти всё время лежит на колонке текста — левее сцены, — поэтому
    // доля считается от окна и зажимается в -1..1. Без зажима значение уходило
    // до -2.8, предметы уезжали на полторы сотни пикселей и упирались в борт.
    const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

    const onMove = (e: MouseEvent) => {
      if (coarse || !shouldRun()) return;
      target = {
        x: clamp((e.clientX / window.innerWidth) * 2 - 1),
        y: clamp((e.clientY / window.innerHeight) * 2 - 1),
      };
    };

    // Наблюдаем за самой сценой, а не за холстом: холст мы меняем внутри
    // build, и наблюдение за ним замыкало бы цикл на себя. В момент первого
    // прохода стили ещё не применены, и холст отдаёт дефолтные 300×150 —
    // без наблюдателя пылинки оставались бы в углу.
    const handleResize = (entries: ResizeObserverEntry[]) => {
      const box = entries[0]?.contentRect;
      if (box && build({ width: box.width, height: box.height })) paint(performance.now());
    };
    const handleWindowResize = () => { if (build()) paint(performance.now()); };
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleResize);
    observer?.observe(root);
    if (!observer) window.addEventListener('resize', handleWindowResize, { passive: true });

    build();

    if (compact) {
      paint(0);
      return () => {
        observer?.disconnect();
        if (!observer) window.removeEventListener('resize', handleWindowResize);
      };
    }

    const visibility = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
        if (onScreen) start();
        else stop();
      }, { rootMargin: '120px 0px', threshold: 0 });
    visibility?.observe(root);

    let activationTimer = 0;
    paint(0);
    if (!reduced && !coarse) start();
    else if (!reduced) {
      activationTimer = window.setTimeout(() => {
        start();
      }, 4_500);
    }
    if (!coarse) window.addEventListener('mousemove', onMove, { passive: true });
    motionPreference.addEventListener('change', onMotionPreference);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener(SCROLL_ACTIVITY_START_EVENT, onScrollStart);
    document.addEventListener(SCROLL_ACTIVITY_END_EVENT, onScrollEnd);

    return () => {
      stop();
      if (activationTimer) window.clearTimeout(activationTimer);
      for (const [el] of planes) el.style.transform = '';
      motionPreference.removeEventListener('change', onMotionPreference);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', handleWindowResize);
      visibility?.disconnect();
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener(SCROLL_ACTIVITY_START_EVENT, onScrollStart);
      document.removeEventListener(SCROLL_ACTIVITY_END_EVENT, onScrollEnd);
    };
  }, []);

  return (
    <div className="cds" ref={rootRef}>
      <div className="cds-desk" data-plane="desk" />

      <div className="cds-plane" data-plane="far">
        <Layer items={FAR} />
      </div>

      <div className="cds-plane" data-plane="mid">
        <Layer items={MID} />
      </div>

      <div className="cds-plane" data-plane="near">
        <Layer items={NEAR} />
        {/* Пар над чашкой — три струйки с разными фазами, рисуются кодом:
            в картинке он был бы застывшим. */}
        <span className="cds-steam">
          <i />
          <i />
          <i />
        </span>
      </div>

      <div className="cds-plane" data-plane="front">
        <Layer items={FRONT} />
      </div>

      <canvas className="cds-dust" data-plane="dust" ref={dustRef} />
      {/* Тень под колонку текста лежит поверх сцены: так дерево уходит в
          темноту плавно и границы между «фото» и «фоном» не видно. */}
      <div className="cds-shade" />
      <div className="cds-vignette" />
    </div>
  );
}

export default memo(ConsultDeskScene);
