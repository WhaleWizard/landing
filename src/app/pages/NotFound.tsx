import { lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router';
import Navbar from '../components/Navbar';
import SEO from '../components/SEO';

const Footer = lazy(() => import('../components/Footer'));

const quickLinks = [
  {
    to: '/blog',
    title: 'Открыть блог',
    subtitle: 'Практические материалы о рекламе и аналитике',
    emoji: '🧠',
  },
  {
    to: '/cases',
    title: 'Посмотреть кейсы',
    subtitle: 'Проекты с бюджетами, метриками и выводами',
    emoji: '📈',
  },
  {
    to: '/calculator',
    title: 'Оценить стоимость ведения',
    subtitle: 'Получить предварительный ориентир по стоимости',
    emoji: '🧮',
  },
  {
    to: '/consult',
    title: 'О консультации',
    subtitle: 'Посмотреть формат и темы личного разбора',
    emoji: '🛟',
  },
];

export default function NotFound() {
  const location = useLocation();

  return (
    <>
      <SEO
        title="Страница не найдена"
        description="Такой страницы на сайте Whale Wizard нет."
        url={location.pathname}
        noIndex
      />
      <Navbar variant="content" />
      <main className="marketing-typography relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050816] px-6 pb-14 pt-28 text-white md:pb-20 md:pt-32">
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
              Такой страницы нет
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
              Кит свернул не туда,
              <br />
              но курс уже пересчитан
            </h1>
            <p className="text-base md:text-lg text-slate-200/90 max-w-xl">
              Возможно, ссылка устарела или в адресе есть опечатка. Вернитесь на главную или выберите нужный раздел ниже.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/"
                className="inline-flex items-center rounded-xl bg-[#3b82f6] px-5 py-3 text-white font-semibold hover:bg-[#2563eb] transition-colors"
              >
                🏠 На главную
              </Link>
              <Link
                to="/blog"
                className="inline-flex items-center rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                Читать блог
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/25 border border-white/10 p-6 text-center">
            <div className="text-7xl" style={{ animation: 'floaty 3.2s ease-in-out infinite' }}>🐋</div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Whale Navigation</p>
            <p className="text-sm text-slate-200/90">Выберите полезный раздел — нужный маршрут уже рядом.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
