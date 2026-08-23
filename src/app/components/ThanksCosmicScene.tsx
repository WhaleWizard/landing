import { memo, useEffect, useRef } from 'react';
// Стили рядом с компонентом — по образцу остальных сцен проекта: сцену могут
// смонтировать вне своей страницы, и без этого она приедет без раскладки.
import '../../styles/thanks-scene.css';

type Piece = {
  file: string;
  cls: string;
  w: number;
  h: number;
};

// Луны и кристаллы берутся из общей космической серии: они уже лежат в кеше у
// всех, кто был на главной или на лендинге услуги, и серия гарантированно не
// расползается по стилю.
const DEEP: Piece[] = [
  { file: 'moon3', cls: 'ths-m3', w: 248, h: 255 },
  { file: 'moon4', cls: 'ths-m4', w: 201, h: 204 },
  { file: 'moon5', cls: 'ths-m5', w: 149, h: 157 },
];

const MID: Piece[] = [
  { file: 'shard3', cls: 'ths-c3', w: 216, h: 467 },
  { file: 'shard4', cls: 'ths-c4', w: 300, h: 278 },
];

const NEAR: Piece[] = [
  { file: 'shard1', cls: 'ths-c1', w: 300, h: 519 },
  { file: 'shard2', cls: 'ths-c2', w: 300, h: 285 },
];

// Насколько план уходит за курсором: [по горизонтали, по вертикали].
const DEPTH: Record<string, [number, number]> = {
  sky: [8, 5],
  deep: [18, 12],
  mid: [28, 18],
  whale: [38, 24],
  near: [52, 33],
  front: [72, 46],
  dust: [60, 38],
};

type Mote = { x: number; y: number; r: number; sp: number; drift: number; ph: number };

function Layer({ items }: { items: Piece[] }) {
  return (
    <>
      {items.map((p) => (
        <img
          key={p.file}
          className={`ths-obj ${p.cls}`}
          src={`/images/cosmic/${p.file}.webp`}
          alt=""
          width={p.w}
          height={p.h}
          // Объекты лежат внутри контейнера с overflow: hidden и
          // трансформированных слоёв — с lazy браузер считает их невидимыми и
          // не начинает загрузку вовсе. Это содержимое первого экрана.
          loading="eager"
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function ThanksCosmicScene() {
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
      root.querySelectorAll<HTMLElement>(`[data-plane="${key}"]`).forEach((el) => {
        planes.push([el, DEPTH[key][0], DEPTH[key][1]]);
      });
    });

    let motes: Mote[] = [];
    let raf = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      // Присваивание в width/height само считается изменением размера —
      // без этой проверки наблюдатель ушёл бы в бесконечный цикл.
      if (!w || !h || (canvas.width === w && canvas.height === h)) {
        if (motes.length) return;
      }
      canvas.width = w;
      canvas.height = h;

      const count = canvas.clientWidth < 900 ? 34 : 66;
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.4 + 0.4) * dpr,
        sp: (Math.random() * 0.22 + 0.05) * dpr,
        drift: (Math.random() - 0.5) * 0.1 * dpr,
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
            m.y = canvas.height + 6;
            m.x = Math.random() * canvas.width;
          }
        }
        const a = 0.12 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.001 + m.ph));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 206, 150, ${a.toFixed(3)})`;
        ctx.fill();
      }
    };

    // Сцена платит за кадры только пока она на экране и вкладка активна.
    let onScreen = true;
    const shouldRun = () => onScreen && !document.hidden;

    let appliedX = Number.NaN;
    let appliedY = Number.NaN;

    const loop = (t: number) => {
      if (!shouldRun()) {
        raf = 0;
        return;
      }

      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;
      // Порог отсекает движение в тысячную пикселя: сближение с целью
      // асимптотическое и само по себе никогда не заканчивается.
      if (!(Math.abs(current.x - appliedX) < 0.0004 && Math.abs(current.y - appliedY) < 0.0004)) {
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

    const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

    const onMove = (e: MouseEvent) => {
      if (coarse || reduced) return;
      target = {
        x: clamp((e.clientX / window.innerWidth) * 2 - 1),
        y: clamp((e.clientY / window.innerHeight) * 2 - 1),
      };
    };

    // Наблюдаем за сценой, а не за холстом: холст мы меняем внутри build, и
    // наблюдение за ним замкнуло бы цикл на себя.
    const observer = new ResizeObserver(build);
    observer.observe(root);

    build();

    const visibility = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
        if (onScreen) start();
        else stop();
      }, { rootMargin: '120px 0px', threshold: 0 });
    visibility?.observe(root);

    start();
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer.disconnect();
      visibility?.disconnect();
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="ths" ref={rootRef} aria-hidden="true">
      <div className="ths-sky" data-plane="sky" />
      <div className="ths-aurora" data-plane="sky" />

      <div className="ths-plane" data-plane="deep">
        <Layer items={DEEP} />
      </div>

      <div className="ths-plane" data-plane="mid">
        <Layer items={MID} />
      </div>

      <div className="ths-plane" data-plane="whale">
        <div className="ths-whale-wrap">
          <div className="ths-whale-enter">
          <img
            className="ths-whale"
            src="/images/cosmic/whale.webp"
            alt=""
            width={1195}
            height={697}
            loading="eager"
            decoding="async"
          />
          {/* Вторая копия кита поверх первой — по ней прокатывается волна
              света. Отдельной картинки для этого не нужно: полоса маски едет
              вдоль тела и подсвечивает созвездие на лету. */}
          <img
            className="ths-whale-wave"
            src="/images/cosmic/whale.webp"
            alt=""
            width={1195}
            height={697}
            loading="eager"
            decoding="async"
          />
          {/* Капсула и кольцо лежат внутри кита, а не на сцене: их координаты
              считаются от его кадра, поэтому связка «кит — письмо» держится на
              любой высоте экрана. От сцены капсула уезжала под карточку текста
              на узких телефонах. */}
          <span className="ths-ring" />
          {/* Подъём и парение живут на разных элементах намеренно. Пока обе
              анимации сидели на одном, вторая перехватывала transform в момент
              окончания первой — и капсула в этот кадр дёргалась. */}
          <span className="ths-capsule">
            <span className="ths-capsule-in">
              {/* След лежит здесь, а не на сцене: так он едет ровно с капсулой
                  и не опаздывает за ней, а порядок в разметке кладёт его под
                  письмо, а не поверх. Поэтому у него настоящая прозрачность —
                  режим screen внутри кадра кита смешивался бы с пустотой. */}
              <img
                className="ths-trail"
                src="/images/thanks/trail.webp"
                alt=""
                width={240}
                height={705}
                loading="eager"
                decoding="async"
              />
              <img
                className="ths-capsule-img"
                src="/images/thanks/capsule.webp"
                alt=""
                width={560}
                height={456}
                loading="eager"
                decoding="async"
              />
            </span>
          </span>
          </div>
        </div>
      </div>

      <div className="ths-plane" data-plane="near">
        <Layer items={NEAR} />
      </div>

      <canvas className="ths-dust" data-plane="dust" ref={dustRef} />
      <div className="ths-shade" />
      <div className="ths-vignette" />
    </div>
  );
}

export default memo(ThanksCosmicScene);
