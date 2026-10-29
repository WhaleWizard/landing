import { ArrowRight, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { HeroContent } from '../../types/hero';
import HeroTitleEffect, { resolveHeroTitleLines } from '../HeroTitleEffect';
import { useScrollTo } from '../hooks/useScrollTo';
import { Button } from '../ui/button';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
  withMobileTitleLines,
} from '../../utils/contentTypography';
// Стили живут рядом с компонентом, а не на странице: точный предпросмотр
// редактора монтирует хиро напрямую и без этого рисовал голую вёрстку.
// import './meta-ads-editorial-hero.css' -> consolidated into src/styles/index.css

type MetaAdsEditorialHeroProps = {
  content: HeroContent;
  /** Первый экран уже лежит в HTML сборки: эффекты заголовка не проигрываются заново. */
  settledEntrance?: boolean;
};

const proofCases = [
  {
    id: 'ecommerce',
    title: 'E-commerce',
    metric: '30k+ покупок',
    image: '/images/meta-proof/ecommerce-photo.webp',
    imageSrcSet: '/images/meta-proof/ecommerce-photo-480.webp 480w, /images/meta-proof/ecommerce-photo-800.webp 800w, /images/meta-proof/ecommerce-photo.webp 1440w',
    alt: 'Тележка для покупок — кейс продвижения e-commerce',
    width: 1440,
    height: 1080,
  },
  {
    id: 'concierge',
    title: 'Консьерж',
    metric: '65k+ лидов',
    image: '/images/meta-proof/concierge-photo.webp',
    imageSrcSet: '/images/meta-proof/concierge-photo-480.webp 480w, /images/meta-proof/concierge-photo-800.webp 800w, /images/meta-proof/concierge-photo.webp 1448w',
    alt: 'Звонок консьержа — кейс лидогенерации для сервиса',
    width: 1448,
    height: 1086,
  },
  {
    id: 'infoproduct',
    title: 'Инфопродукты',
    metric: 'CPL до $5',
    image: '/images/meta-proof/infoproduct-photo.webp',
    imageSrcSet: '/images/meta-proof/infoproduct-photo-480.webp 480w, /images/meta-proof/infoproduct-photo-800.webp 800w, /images/meta-proof/infoproduct-photo.webp 1448w',
    alt: 'Ноутбук и академическая шапочка — кейс продвижения инфопродуктов',
    width: 1448,
    height: 1086,
  },
] as const;

function MetaAdsEditorialHero({ content, settledEntrance: _settledEntrance = false }: MetaAdsEditorialHeroProps) {
  const { scrollToWhenReady } = useScrollTo();
  const titleLines = content.titleLines?.filter((line) => line.tone !== 'supporting');
  const supportingLine = content.titleLines?.find((line) => line.tone === 'supporting');
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(withMobileTitleLines(content.typography), { minFontSize: 13 });
  const titleAnimation = content.titleAnimation || {};

  const scrollTo = (elementId: 'contact' | 'cases') => {
    scrollToWhenReady(elementId, { offset: 88, attempts: 20, intervalMs: 80 });
  };

  return (
    <section id="hero" className="meta-editorial-hero" aria-labelledby="meta-editorial-title">
      <div className="meta-editorial-hero__glow meta-editorial-hero__glow--blue" aria-hidden="true" />
      <div className="meta-editorial-hero__glow meta-editorial-hero__glow--pink" aria-hidden="true" />

      <div className="meta-editorial-hero__inner">
        <div className="meta-editorial-hero__copy">
          <div className="meta-editorial-hero__kicker">
            <Sparkles aria-hidden="true" />
            <span>{content.badge}</span>
          </div>

          {(() => {
            const rawLines = titleLines?.length
              ? titleLines
              : [
                { text: String(content.titlePrefix || ''), tone: 'default' as const },
                { text: String(content.titleAccent || ''), tone: 'accent' as const },
              ];
            const allToResolve = supportingLine ? [...rawLines, supportingLine] : rawLines;
            const resolvedAll = resolveHeroTitleLines(allToResolve, titleAnimation, { display: 'block' });
            const resolvedTitle = resolvedAll.slice(0, rawLines.length);
            const resolvedSupporting = supportingLine ? resolvedAll[rawLines.length] : null;

            return (
              <>
                <h1
                  ref={titleRef}
                  id="meta-editorial-title"
                  data-ww-title-fit="2/0"
                  data-ww-title-fit-min="13"
                  className={`meta-editorial-hero__title ${managedTitleClasses(content.typography, 'hero')}`}
                  style={managedTitleStyle(content.typography)}
                >
                  {resolvedTitle.map((resolved, index) => (
                    <HeroTitleEffect
                      as="span"
                      key={`line-${index}`}
                      className={resolved.line.tone === 'accent' ? 'meta-editorial-hero__title-accent' : undefined}
                      style={resolved.style}
                      text={resolved.line.text}
                      effect={resolved.effect}
                      speed={resolved.speed}
                      delayMs={resolved.delayMs}
                    >
                      {resolved.line.text}
                    </HeroTitleEffect>
                  ))}
                </h1>

                {resolvedSupporting && (
                  <HeroTitleEffect
                    as="p"
                    className="meta-editorial-hero__supporting"
                    style={resolvedSupporting.style}
                    text={resolvedSupporting.line.text}
                    effect={resolvedSupporting.effect}
                    speed={resolvedSupporting.speed}
                    delayMs={resolvedSupporting.delayMs}
                  >
                    {resolvedSupporting.line.text}
                  </HeroTitleEffect>
                )}
              </>
            );
          })()}

          <div className="meta-editorial-hero__paragraphs">
            {content.paragraphs.map((paragraph, index) => (
              <p key={index} style={managedBodyStyle(content.typography)} className={`${index === 1 ? 'meta-editorial-hero__data-note' : ''} ${managedBodyClasses(content.typography)}`.trim()}>
                {paragraph}
              </p>
            ))}
          </div>

          <div className="meta-editorial-hero__actions">
            <Button
              asChild
              size="lg"
              className="meta-editorial-hero__primary"
            >
              <a href="#contact" onClick={(event) => { event.preventDefault(); scrollTo('contact'); }}>
                <span>{content.primaryButton}</span>
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="meta-editorial-hero__secondary"
            >
              <a href="#cases" onClick={(event) => { event.preventDefault(); scrollTo('cases'); }}>
                {content.secondaryButton}
              </a>
            </Button>
          </div>

          <div
            className="meta-editorial-hero__proof meta-editorial-hero__proof--desktop"
            aria-label="Основа рекламной аналитики"
          >
            {content.stats.map((stat, index) => (
              <div className="meta-editorial-hero__proof-item" key={`${stat.value}-desktop-${index}`}>
                <span className="meta-editorial-hero__proof-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="meta-editorial-hero__visual" aria-label="Кейсы Meta Ads">
          <div className="meta-proof__collage">
            {proofCases.map((item, index) => (
              <article
                key={item.id}
                className={`meta-proof__item meta-proof__item--${item.id}`}
                style={{ '--proof-index': index } as CSSProperties}
              >
                <div className="meta-proof__art">
                  <img
                    src="/images/meta-proof/paper-stack-768.webp"
                    srcSet="/images/meta-proof/paper-stack-480.webp 480w, /images/meta-proof/paper-stack-768.webp 768w"
                    sizes="(max-width: 767px) 182px, 384px"
                    width="768"
                    height="512"
                    alt=""
                    aria-hidden="true"
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchpriority={index === 0 ? 'high' : 'low'}
                    className="meta-proof__paper"
                  />
                  <div className="meta-proof__photo-frame">
                    <img
                      src={item.image}
                      srcSet={item.imageSrcSet}
                      sizes="(max-width: 767px) 230px, 400px"
                      width={item.width}
                      height={item.height}
                      alt={item.alt}
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      className="meta-proof__photo"
                    />
                  </div>
                  <img
                    src="/images/meta-proof/tape-strip-384.webp"
                    width="384"
                    height="256"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    className="meta-proof__tape"
                  />
                </div>

                <img
                  src="/images/meta-proof/arrow-left-256.webp"
                  width="256"
                  height="171"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  fetchpriority="low"
                  className="meta-proof__arrow"
                />

                <div className="meta-proof__label">
                  <span>{item.title}</span>
                  <strong>{item.metric}</strong>
                  <img
                    src="/images/meta-proof/underline-384.webp"
                    width="384"
                    height="28"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    className="meta-proof__underline"
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="meta-proof__motto" aria-label="Практика, не обещания">
            <span aria-hidden="true" />
            <strong>ПРАКТИКА, НЕ ОБЕЩАНИЯ</strong>
            <span aria-hidden="true" />
          </div>
        </div>

        <div
          className="meta-editorial-hero__proof meta-editorial-hero__proof--mobile"
          aria-label="Основа рекламной аналитики"
        >
          {content.stats.map((stat, index) => (
            <div className="meta-editorial-hero__proof-item" key={`${stat.value}-mobile-${index}`}>
              <span className="meta-editorial-hero__proof-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default MetaAdsEditorialHero;
