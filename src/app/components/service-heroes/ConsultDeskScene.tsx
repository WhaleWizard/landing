import { memo, useEffect, useRef } from 'react';
// Стили рядом с компонентом: точный предпросмотр в админке монтирует хиро
// напрямую, и без этого сцена приехала бы без раскладки.
import '../../../styles/consult-desk-scene.css';

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

function Layer({ items }: { items: Piece[] }) {
  return (
    <>
      {items.map((p) => (
        <img
          key={p.file}
          className={`cds-obj ${p.cls}`}
          src={`/images/consult-proof/scene/${p.file}.webp`}
          alt=""
          loading="eager"
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function ConsultDeskScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = dustRef.current;
    if (!root || !canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const ctx = canvas.getContext('2d');

    const planes: [HTMLElement, number, number][] = [];
    (Object.keys(DEPTH) as (keyof typeof DEPTH)[]).forEach((key) => {
      const el = root.querySelector<HTMLElement>(`[data-plane="${key}"]`);
      if (el) planes.push([el, DEPTH[key][0], DEPTH[key][1]]);
    });

    let motes: Mote[] = [];
    let raf = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      // Присваиваем только при реальном изменении: запись в width/height сама
      // считается изменением размера, и наблюдатель уходил бы в бесконечный
      // цикл, раздувая холст на каждом шаге.
      if (!w || !h || (canvas.width === w && canvas.height === h)) {
        if (motes.length) return;
      }
      canvas.width = w;
      canvas.height = h;

      // Пылинки держатся у луча лампы — она в левой верхней части кадра.
      const count = canvas.clientWidth < 900 ? 26 : 54;
      motes = Array.from({ length: count }, () => ({
        x: (0.02 + Math.random() * 0.68) * canvas.width,
        y: Math.random() * canvas.height * 0.82,
        r: (Math.random() * 1.3 + 0.4) * dpr,
        sp: (Math.random() * 0.16 + 0.03) * dpr,
        drift: (Math.random() - 0.5) * 0.08 * dpr,
        ph: Math.random() * Math.PI * 2,
      }));
    };

    const paint = (t: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const m of motes) {
        if (!reduced) {
          m.y -= m.sp;
          m.x += m.drift;
          if (m.y < -6) {
            m.y = canvas.height * 0.85;
            m.x = (0.02 + Math.random() * 0.68) * canvas.width;
          }
        }
        const a = 0.14 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.0009 + m.ph));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 214, 150, ${a.toFixed(3)})`;
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;
      for (const [el, kx, ky] of planes) {
        el.style.transform = `translate3d(${current.x * kx}px,${current.y * ky}px,0)`;
      }
      paint(t);
      raf = requestAnimationFrame(loop);
    };

    // Курсор почти всё время лежит на колонке текста — левее сцены, — поэтому
    // доля считается от окна и зажимается в -1..1. Без зажима значение уходило
    // до -2.8, предметы уезжали на полторы сотни пикселей и упирались в борт.
    const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

    const onMove = (e: MouseEvent) => {
      if (coarse || reduced) return;
      target = {
        x: clamp((e.clientX / window.innerWidth) * 2 - 1),
        y: clamp((e.clientY / window.innerHeight) * 2 - 1),
      };
    };

    // Наблюдаем за самой сценой, а не за холстом: холст мы меняем внутри
    // build, и наблюдение за ним замыкало бы цикл на себя. В момент первого
    // прохода стили ещё не применены, и холст отдаёт дефолтные 300×150 —
    // без наблюдателя пылинки оставались бы в углу.
    const observer = new ResizeObserver(build);
    observer.observe(root);

    build();
    raf = requestAnimationFrame(loop);
    window.addEventListener('mousemove', onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div className="cds" ref={rootRef} aria-hidden="true">
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
