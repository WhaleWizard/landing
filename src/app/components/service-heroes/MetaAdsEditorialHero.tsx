import { ArrowRight, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { HeroContent } from '../Hero';
import HeroTitleEffect from '../HeroTitleEffect';
import { useScrollTo } from '../hooks/useScrollTo';
import { Button } from '../ui/button';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
} from '../../utils/contentTypography';

type MetaAdsEditorialHeroProps = {
  content: HeroContent;
};

const proofCases = [
  {
    id: 'ecommerce',
    title: 'E-commerce',
    metric: '30k+ покупок',
    image: '/images/meta-proof/ecommerce-photo.webp',
    alt: 'Тележка для покупок — кейс продвижения e-commerce',
    width: 1440,
    height: 1080,
  },
  {
    id: 'concierge',
    title: 'Консьерж',
    metric: '65k+ лидов',
    image: '/images/meta-proof/concierge-photo.webp',
    alt: 'Звонок консьержа — кейс лидогенерации для сервиса',
    width: 1448,
    height: 1086,
  },
  {
    id: 'infoproduct',
    title: 'Инфопродукты',
    metric: 'CPL до $5',
    image: '/images/meta-proof/infoproduct-photo.webp',
    alt: 'Ноутбук и академическая шапочка — кейс продвижения инфопродуктов',
    width: 1448,
    height: 1086,
  },
] as const;

function MetaAdsEditorialHero({ content }: MetaAdsEditorialHeroProps) {
  const { scrollToWhenReady } = useScrollTo();
  const titleLines = content.titleLines?.filter((line) => line.tone !== 'supporting');
  const supportingLine = content.titleLines?.find((line) => line.tone === 'supporting');
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(content.typography, { minFontSize: 18 });
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

          <h1
            ref={titleRef}
            id="meta-editorial-title"
            className={`meta-editorial-hero__title ${managedTitleClasses(content.typography, 'hero')}`}
            style={managedTitleStyle(content.typography)}
          >
            {titleLines?.length ? (
              titleLines.map((line, index) => (
                <HeroTitleEffect
                  as="span"
                  key={`${line.text}-${index}`}
                  className={line.tone === 'accent' ? 'meta-editorial-hero__title-accent' : undefined}
                  style={{ display: 'block' }}
                  text={line.text}
                  effect={titleAnimation.effect}
                  speed={titleAnimation.speed}
                  delayMs={titleAnimation.delayMs}
                  sequenceIndex={index}
                >
                  {line.text}
                </HeroTitleEffect>
              ))
            ) : (
              <>
                <HeroTitleEffect as="span" style={{ display: 'block' }} text={String(content.titlePrefix || '')} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={0}>{content.titlePrefix}</HeroTitleEffect>
                <HeroTitleEffect as="span" className="meta-editorial-hero__title-accent" style={{ display: 'block' }} text={String(content.titleAccent || '')} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={1}>{content.titleAccent}</HeroTitleEffect>
              </>
            )}
          </h1>

          {supportingLine && (
            <HeroTitleEffect as="p" className="meta-editorial-hero__supporting" style={{ display: 'block' }} text={supportingLine.text} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={titleLines?.length || 2}>{supportingLine.text}</HeroTitleEffect>
          )}

          <div className="meta-editorial-hero__paragraphs">
            {content.paragraphs.map((paragraph, index) => (
              <p key={index} style={managedBodyStyle(content.typography)} className={`${index === 1 ? 'meta-editorial-hero__data-note' : ''} ${managedBodyClasses(content.typography)}`.trim()}>
                {paragraph}
              </p>
            ))}
          </div>

          <div className="meta-editorial-hero__actions">
            <Button
              type="button"
              size="lg"
              onClick={() => scrollTo('contact')}
              className="meta-editorial-hero__primary"
            >
              <span>{content.primaryButton}</span>
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => scrollTo('cases')}
              className="meta-editorial-hero__secondary"
            >
              {content.secondaryButton}
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
          <button
            type="button"
            className="meta-proof__case-link"
            onClick={() => scrollTo('cases')}
          >
            <span>Смотреть кейсы</span>
            <ArrowRight aria-hidden="true" />
          </button>

          <div className="meta-proof__collage">
            {proofCases.map((item, index) => (
              <article
                key={item.id}
                className={`meta-proof__item meta-proof__item--${item.id}`}
                style={{ '--proof-index': index } as CSSProperties}
              >
                <div className="meta-proof__art">
                  <img
                    src="/images/meta-proof/paper-stack.webp"
                    width="1536"
                    height="1024"
                    alt=""
                    aria-hidden="true"
                    className="meta-proof__paper"
                  />
                  <div className="meta-proof__photo-frame">
                    <img
                      src={item.image}
                      width={item.width}
                      height={item.height}
                      alt={item.alt}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="meta-proof__photo"
                    />
                  </div>
                  <img
                    src="/images/meta-proof/tape-strip.webp"
                    width="1536"
                    height="1024"
                    alt=""
                    aria-hidden="true"
                    className="meta-proof__tape"
                  />
                </div>

                <img
                  src="/images/meta-proof/arrow-left.webp"
                  width="1536"
                  height="1024"
                  alt=""
                  aria-hidden="true"
                  className="meta-proof__arrow"
                />

                <div className="meta-proof__label">
                  <span>{item.title}</span>
                  <strong>{item.metric}</strong>
                  <img
                    src="/images/meta-proof/underline.png"
                    width="1200"
                    height="89"
                    alt=""
                    aria-hidden="true"
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
