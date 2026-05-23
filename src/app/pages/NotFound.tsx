import { Link } from 'react-router';

const quickLinks = [
  {
    to: '/blog',
    title: 'Пойти в блог',
    subtitle: 'Почитать умное, пока 404 отдыхает',
    emoji: '🧠',
  },
  {
    to: '/calculator',
    title: 'Рассчитать бюджет',
    subtitle: 'Пусть хотя бы цифры будут точными',
    emoji: '🧮',
  },
  {
    to: '/consult',
    title: 'Связаться с нами',
    subtitle: 'Найдём путь даже из цифрового тумана',
    emoji: '🛟',
  },
];

export default function NotFound() {
  return (
    <main className="relative overflow-hidden min-h-screen bg-[#050816] text-white px-6 py-14 md:py-20 flex items-center justify-center">
      <style>{`
        @keyframes floaty {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-12px) rotate(2deg); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-16 left-[14%] text-2xl" style={{ animation: 'twinkle 2.8s ease-in-out infinite' }}>✨</div>
        <div className="absolute top-28 right-[18%] text-xl" style={{ animation: 'twinkle 2.2s ease-in-out infinite' }}>⭐</div>
        <div className="absolute bottom-28 left-[22%] text-xl" style={{ animation: 'twinkle 3.1s ease-in-out infinite' }}>✨</div>
        <div className="absolute bottom-20 right-[15%] text-2xl" style={{ animation: 'twinkle 2.5s ease-in-out infinite' }}>⭐</div>
      </div>

      <section className="relative z-10 w-full max-w-4xl rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl p-6 md:p-10 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-8 items-center">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-sm text-blue-100/90">
              <span>🚨</span>
              Страница потерялась в гиперпространстве
            </p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
              404: мы искали,
              <br />
              но нашли только мемы
            </h1>
            <p className="text-base md:text-lg text-slate-200/90 max-w-xl">
              Похоже, ссылка устарела или опечаталась. Хорошая новость: у нас есть запасной план, хорошее чувство юмора и полезные страницы.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/"
                className="inline-flex items-center rounded-xl bg-[#3b82f6] px-5 py-3 text-white font-semibold hover:bg-[#2563eb] transition-colors"
              >
                🏠 На главную
              </Link>
              <Link
                to="/offer"
                className="inline-flex items-center rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                🎁 Посмотреть оффер
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/25 border border-white/10 p-6 text-center">
            <div className="text-7xl" style={{ animation: 'floaty 3.2s ease-in-out infinite' }}>🐋</div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Whale Navigation Mode</p>
            <p className="text-sm text-slate-200/90">Кит уже прокладывает маршрут обратно к контенту.</p>
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-3 gap-3">
          {quickLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-2xl border border-white/15 bg-white/5 p-4 hover:bg-white/15 transition-colors"
            >
              <p className="text-2xl mb-2">{item.emoji}</p>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-slate-300 mt-1 group-hover:text-white transition-colors">{item.subtitle}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
