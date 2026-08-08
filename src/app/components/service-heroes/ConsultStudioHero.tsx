import { ArrowRight, Sparkles } from 'lucide-react';
import type { HeroContent } from '../Hero';
import { useScrollTo } from '../hooks/useScrollTo';
import { Button } from '../ui/button';

type ConsultStudioHeroProps = {
  content: HeroContent;
};

function ConsultStudioHero({ content }: ConsultStudioHeroProps) {
  const { scrollToWhenReady } = useScrollTo();

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

          <h1 id="consult-studio-title" className="consult-studio-hero__title">
            <span>{content.titlePrefix}</span>
            <span>{content.titleAccent}</span>
          </h1>

          <div className="consult-studio-hero__paragraphs">
            {content.paragraphs.map((paragraph, index) => (
              <p key={index} className={index === 1 ? 'consult-studio-hero__format-note' : undefined}>
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
