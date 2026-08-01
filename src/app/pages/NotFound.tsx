import { useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Home,
  MapPin,
  MessageCircle,
  TrendingUp,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import SEO from '../components/SEO';
import { useReturnTo } from '../utils/siteNavigation';
import './NotFound.css';

const secondaryLinks = [
  { to: '/blog', label: 'Блог', caption: 'Разборы и практика', Icon: BookOpen },
  { to: '/cases', label: 'Кейсы', caption: 'Цифры и выводы', Icon: TrendingUp },
  { to: '/#services', label: 'Услуги', caption: 'Форматы работы', Icon: Briefcase },
  { to: '/#contact', label: 'Контакты', caption: 'Обсудить задачу', Icon: MessageCircle },
];

export default function NotFound() {
  const location = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useReturnTo('/');
  const isHomeFallback = returnTo.path === '/';
  const primaryLabel = isHomeFallback ? 'На главную' : 'Вернуться';
  const primaryAriaLabel = isHomeFallback
    ? 'Перейти на главную'
    : `Вернуться на страницу «${returnTo.label}»`;
  const contextLabel = isHomeFallback && !returnTo.explicit
    ? 'Точка возврата не сохранилась'
    : returnTo.label;
  const contextKicker = isHomeFallback && !returnTo.explicit ? 'Маршрут' : 'До портала';
  const secondaryAction = isHomeFallback
    ? { to: '/blog', label: 'Блог', Icon: BookOpen }
    : { to: '/', label: 'Главная', Icon: Home };
  const SecondaryActionIcon = secondaryAction.Icon;

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
        <section className="not-found-stage" aria-labelledby="not-found-title">
          <div className="not-found-orbit" aria-hidden="true">
            <img
              className="not-found-depth"
              src="/images/404/portal-depth.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-aura"
              src="/images/404/portal-aura.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-portal not-found-portal--halo"
              src="/images/404/portal-rings-cutout.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-portal"
              src="/images/404/portal-rings-cutout.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-accent not-found-accent--desktop"
              src="/images/404/portal-accent-desktop.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-accent not-found-accent--mobile"
              src="/images/404/portal-accent-mobile.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-grid"
              src="/images/404/portal-grid.png"
              alt=""
              width="896"
              height="896"
            />
            <img
              className="not-found-preview"
              src="/images/404/route-preview.png"
              alt=""
              width="364"
              height="320"
            />

            <div className="not-found-whale">
              <div className="not-found-whale-art">
                <img
                  className="not-found-whale-image"
                  src="/images/brand/whale-wizard.png"
                  width="640"
                  height="640"
                  alt=""
                  draggable={false}
                />
                <img
                  className="not-found-wand-glow"
                  src="/images/brand/whale-wand-glow.png"
                  width="96"
                  height="96"
                  alt=""
                  draggable={false}
                />
              </div>
            </div>
          </div>

          <header className="not-found-intro">
            <h1
              ref={titleRef}
              id="not-found-title"
              tabIndex={-1}
              aria-label="404 · Портал закрыт"
            >
              <span className="not-found-code">404</span>
              <span className="not-found-title-divider" aria-hidden="true"> · </span>
              <span>ПОРТАЛ ЗАКРЫТ</span>
            </h1>
            <p className="not-found-tagline">Эта страница выпала из воронки.</p>
            <p className="not-found-lead">Без паники — точка возврата сохранилась.</p>
          </header>

          <div className="not-found-actions">
            <p className="not-found-context" title={contextLabel}>
              <span className="not-found-context-mark" aria-hidden="true">
                <MapPin className="not-found-context-icon" focusable="false" />
              </span>
              <span className="not-found-context-copy">
                <span>{contextKicker}</span>
                <strong>{contextLabel}</strong>
              </span>
            </p>

            <div className="not-found-action-row">
              <button
                type="button"
                className="not-found-return"
                aria-label={primaryAriaLabel}
                onClick={returnTo.goBack}
              >
                <span className="not-found-action-icon" aria-hidden="true">
                  <ArrowLeft focusable="false" />
                </span>
                <span className="not-found-action-copy">
                  <small>{isHomeFallback ? 'Главный маршрут' : 'Маршрут сохранён'}</small>
                  <strong>{primaryLabel}</strong>
                </span>
              </button>

              <Link className="not-found-home" to={secondaryAction.to}>
                <span className="not-found-secondary-icon" aria-hidden="true">
                  <SecondaryActionIcon focusable="false" />
                </span>
                <span className="not-found-action-copy">
                  <small>{isHomeFallback ? 'Маршрут' : 'С нуля'}</small>
                  <strong>{secondaryAction.label}</strong>
                </span>
              </Link>
            </div>

            <nav className="not-found-links" aria-label="Куда перейти">
              <div className="not-found-links-head" aria-hidden="true">
                <span>Быстрые маршруты</span>
                <span>04 направления</span>
              </div>
              <div className="not-found-links-grid">
                {secondaryLinks.map((item, index) => {
                  const ItemIcon = item.Icon;

                  return (
                    <Link key={item.to} to={item.to}>
                      <span className="not-found-link-index" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="not-found-link-icon" aria-hidden="true">
                        <ItemIcon focusable="false" />
                      </span>
                      <span className="not-found-link-copy">
                        <strong>{item.label}</strong>
                        <small>{item.caption}</small>
                      </span>
                      <ArrowUpRight
                        className="not-found-link-arrow"
                        aria-hidden="true"
                        focusable="false"
                      />
                    </Link>
                  );
                })}
              </div>
            </nav>

            <p className="not-found-note">Ссылка потерялась. Маршрут сохранился.</p>
          </div>
        </section>
      </main>
    </>
  );
}
