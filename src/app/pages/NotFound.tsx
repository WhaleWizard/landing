import { useEffect, useRef } from 'react';
import { ArrowLeft, Home, MapPin } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import SEO from '../components/SEO';
import { useReturnTo } from '../utils/siteNavigation';
import { useIsPathHiddenInNav } from '../utils/pageLocks';
import './NotFound.css';

const destinations = [
  { to: '/blog', label: 'Блог' },
  { to: '/cases', label: 'Кейсы' },
  { to: '/#services', label: 'Услуги' },
  { to: '/#contact', label: 'Контакты' },
];

export default function NotFound() {
  const location = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useReturnTo('/');

  // Страница ошибки — последнее место, где стоит предлагать закрытый раздел:
  // человек уже никуда не попал, а по ссылке получил бы заглушку. Навбар,
  // подвал и блоки главной такие ссылки прячут — здесь этого не хватало.
  const isHiddenInNav = useIsPathHiddenInNav();
  const visibleDestinations = destinations.filter((item) => !isHiddenInNav(item.to.split('#')[0] || '/'));

  // Вторая кнопка появляется только когда возврат ведёт НЕ на главную.
  // Иначе рядом стояли бы два одинаковых действия «На главную».
  const returnsHome = returnTo.path === '/';
  const knownReturnPoint = !returnsHome || returnTo.explicit;

  const routeText = knownReturnPoint
    ? `Точка возврата — ${returnTo.label}`
    : 'Точка возврата не сохранилась';

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <>
      <SEO
        title="Страница не найдена"
        description="Страница не найдена. Whale Wizard сохранит предыдущий маршрут и поможет вернуться к нужному разделу."
        url={location.pathname}
        noIndex
      />

      <main className="not-found-page marketing-typography">
        <div className="nf-frame">

          {/* слой 1 · портал и карточка маршрута внутри него */}
          <div className="nf-portal" aria-hidden="true">
            <img className="nf-depth" src="/images/404/portal-depth.png" alt="" width="896" height="896" />
            <img className="nf-aura" src="/images/404/portal-aura.png" alt="" width="896" height="896" />
            <img className="nf-rings nf-rings--halo" src="/images/404/portal-rings-cutout.png" alt="" width="896" height="896" />
            <img className="nf-rings" src="/images/404/portal-rings-cutout.png" alt="" width="896" height="896" />
            <img className="nf-accent nf-accent--desktop" src="/images/404/portal-accent-desktop.png" alt="" width="896" height="896" />
            <img className="nf-accent nf-accent--mobile" src="/images/404/portal-accent-mobile.png" alt="" width="896" height="896" />
            <img className="nf-grid" src="/images/404/portal-grid.png" alt="" width="896" height="896" />
            <img className="nf-preview" src="/images/404/route-preview.png" alt="" width="364" height="320" />
          </div>

          {/* слой 2 · затемнение под текстом, обязательно НИЖЕ кита */}
          <div className="nf-scrim nf-scrim--top" aria-hidden="true" />
          <div className="nf-scrim nf-scrim--bottom" aria-hidden="true" />

          {/* слой 3 · кит */}
          <div className="nf-whale-layer" aria-hidden="true">
            <div className="nf-whale">
              <div className="nf-whale-drift">
                <div className="nf-whale-art">
                  <span className="nf-whale-glow" />
                  <img
                    className="nf-whale-image"
                    src="/images/brand/whale-wizard.png"
                    width="640"
                    height="640"
                    alt=""
                    draggable={false}
                  />
                  <img
                    className="nf-wand-glow"
                    src="/images/brand/whale-wand-glow.png"
                    width="96"
                    height="96"
                    alt=""
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* слой 4 · текст */}
          <div className="nf-content">
            <header className="nf-intro">
              <p className="nf-badge">
                <span className="nf-badge-dot" aria-hidden="true" />
                <b>404</b>
                <i aria-hidden="true" />
                страница не найдена
              </p>
              <h1 ref={titleRef} id="not-found-title" tabIndex={-1}>
                Портал закрыт
              </h1>
              <p className="nf-lead">
                Эта страница выпала из воронки. Без паники — маршрут сохранился.
              </p>
            </header>

            <div className="nf-nav">
              <p className="nf-route" title={routeText}>
                <MapPin focusable="false" aria-hidden="true" />
                <span>{routeText}</span>
              </p>

              <div className="nf-actions">
                <button
                  type="button"
                  className="nf-primary"
                  aria-label={returnsHome ? 'Перейти на главную' : `Вернуться на страницу «${returnTo.label}»`}
                  onClick={returnTo.goBack}
                >
                  <ArrowLeft focusable="false" aria-hidden="true" />
                  {returnsHome ? 'На главную' : returnTo.buttonLabel}
                </button>

                {!returnsHome ? (
                  <Link className="nf-secondary" to="/">
                    <Home focusable="false" aria-hidden="true" />
                    На главную
                  </Link>
                ) : null}
              </div>

              {visibleDestinations.length ? (
                <ul className="nf-links">
                  {visibleDestinations.map((item) => (
                    <li key={item.to}>
                      <Link to={item.to}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="nf-note">Ссылка потерялась. Маршрут сохранился.</p>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
