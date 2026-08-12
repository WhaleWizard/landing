import { ArrowRight, Sparkles } from 'lucide-react';
import type { HeroContent } from '../Hero';
import HeroTitleEffect, { resolveHeroTitleLine } from '../HeroTitleEffect';
import { useScrollTo } from '../hooks/useScrollTo';
import { Button } from '../ui/button';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
} from '../../utils/contentTypography';
// Стили живут рядом с компонентом, а не на странице: точный предпросмотр
// редактора монтирует хиро напрямую и без этого рисовал голую вёрстку.
import './consult-studio-hero.css';

type ConsultStudioHeroProps = {
  content: HeroContent;
};

function ConsultStudioHero({ content }: ConsultStudioHeroProps) {
  const { scrollToWhenReady } = useScrollTo();
  const titleLines = content.titleLines?.filter((line) => line.tone !== 'supporting');
  const supportingLine = content.titleLines?.find((line) => line.tone === 'supporting');
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(content.typography, { minFontSize: 17 });
  const titleAnimation = content.titleAnimation || {};

  const scrollTo = (elementId: 'contact' | 'cases') => {
    scrollToWhenReady(elementId, { offset: 88, attempts: 20, intervalMs: 80 });
  };

  return (
    <section id="hero" className="consult-studio-hero" aria-labelledby="consult-studio-title">
      <div className="consult-studio-hero__grid">
        <div className="consult-studio-hero__photo-wrap">
          <picture>
            <source
              media="(max-width: 1023px)"
              srcSet="/images/consult-proof/workspace-mobile.webp"
            />
            <img
              src="/images/consult-proof/workspace-portrait.webp"
              width="1440"
              height="1800"
              alt="Рабочий разбор рекламного кабинета: ноутбук, блокнот и заметки"
              loading="eager"
              decoding="async"
              fetchpriority="high"
              className="consult-studio-hero__photo"
            />
          </picture>
          <div className="consult-studio-hero__photo-shade" aria-hidden="true" />
          <div className="consult-studio-hero__photo-caption" aria-hidden="true">
            <span>01</span>
            <span>КАБИНЕТ</span>
            <i />
            <span>ПРИЧИНА</span>
            <i />
            <span>ПЛАН</span>
          </div>
        </div>

        <div className="consult-studio-hero__content">
          <div className="consult-studio-hero__badge">
            <Sparkles aria-hidden="true" />
            <span>{content.badge}</span>
          </div>

          <h1
            ref={titleRef}
            id="consult-studio-title"
            className={`consult-studio-hero__title ${managedTitleClasses(content.typography, 'hero')}`}
            style={managedTitleStyle(content.typography)}
          >
            {titleLines?.length ? titleLines.map((line, index) => {
              const resolved = resolveHeroTitleLine(line, titleAnimation, { display: 'block' });
              return (
                <HeroTitleEffect
                  as="span"
                  key={`line-${index}`}
                  className={line.tone === 'accent' ? 'consult-studio-hero__title-accent' : undefined}
                  style={resolved.style}
                  text={line.text}
                  effect={resolved.effect}
                  speed={resolved.speed}
                  delayMs={resolved.delayMs}
                  sequenceIndex={index}
                >
                  {line.text}
                </HeroTitleEffect>
              );
            }) : (
              <>
                <HeroTitleEffect as="span" style={{ display: 'block' }} text={String(content.titlePrefix || '')} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={0}>{content.titlePrefix}</HeroTitleEffect>
                <HeroTitleEffect as="span" className="consult-studio-hero__title-accent" style={{ display: 'block' }} text={String(content.titleAccent || '')} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={1}>{content.titleAccent}</HeroTitleEffect>
              </>
            )}
          </h1>

          {supportingLine ? (() => {
            const resolved = resolveHeroTitleLine(supportingLine, titleAnimation, { display: 'block' });
            return (
              <HeroTitleEffect as="p" className="consult-studio-hero__supporting" style={resolved.style} text={supportingLine.text} effect={resolved.effect} speed={resolved.speed} delayMs={resolved.delayMs} sequenceIndex={titleLines?.length || 2}>{supportingLine.text}</HeroTitleEffect>
            );
          })() : null}

          <div className="consult-studio-hero__paragraphs">
            {content.paragraphs.map((paragraph, index) => (
              <p key={index} style={managedBodyStyle(content.typography)} className={`${index === 1 ? 'consult-studio-hero__format-note' : ''} ${managedBodyClasses(content.typography)}`.trim()}>
                {paragraph}
              </p>
            ))}
          </div>

          <div className="consult-studio-hero__actions">
            <Button
              type="button"
              size="lg"
              onClick={() => scrollTo('contact')}
              className="consult-studio-hero__primary"
            >
              <span>{content.primaryButton}</span>
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => scrollTo('cases')}
              className="consult-studio-hero__secondary"
            >
              {content.secondaryButton}
            </Button>
          </div>

          <div className="consult-studio-hero__proof" aria-label="Формат консультации">
            {content.stats.map((stat, index) => (
              <div key={`${stat.value}-${index}`}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ConsultStudioHero;
