import { ArrowRight, Sparkles } from 'lucide-react';
import ConsultDeskScene from './ConsultDeskScene';
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
import './consult-studio-hero.css';

type ConsultStudioHeroProps = {
  content: HeroContent;
  /** Первый экран уже лежит в HTML сборки: эффекты заголовка не проигрываются заново. */
  settledEntrance?: boolean;
};

function ConsultStudioHero({ content, settledEntrance: _settledEntrance = false }: ConsultStudioHeroProps) {
  const { scrollToWhenReady } = useScrollTo();
  const titleLines = content.titleLines?.filter((line) => line.tone !== 'supporting');
  const supportingLine = content.titleLines?.find((line) => line.tone === 'supporting');
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(withMobileTitleLines(content.typography), { minFontSize: 17 });
  const titleAnimation = content.titleAnimation || {};

  const scrollTo = (elementId: 'contact' | 'cases') => {
    scrollToWhenReady(elementId, { offset: 88, attempts: 20, intervalMs: 80 });
  };

  return (
    <section id="hero" className="consult-studio-hero" aria-labelledby="consult-studio-title">
      <div className="consult-studio-hero__grid">
        <div className="consult-studio-hero__photo-wrap">
          {/* Сцена собрана из отдельных предметов, а не снята одним кадром:
              лампа, ноутбук, блокнот и записки лежат разными слоями и
              двигаются с разной скоростью — отсюда глубина. */}
          <ConsultDeskScene />
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
                  id="consult-studio-title"
                  data-ww-title-fit="2/0"
                  data-ww-title-fit-min="17"
                  className={`consult-studio-hero__title ${managedTitleClasses(content.typography, 'hero')}`}
                  style={managedTitleStyle(content.typography)}
                >
                  {resolvedTitle.map((resolved, index) => (
                    <HeroTitleEffect
                      as="span"
                      key={`line-${index}`}
                      className={resolved.line.tone === 'accent' ? 'consult-studio-hero__title-accent' : undefined}
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

                {resolvedSupporting ? (
                  <HeroTitleEffect
                    as="p"
                    className="consult-studio-hero__supporting"
                    style={resolvedSupporting.style}
                    text={resolvedSupporting.line.text}
                    effect={resolvedSupporting.effect}
                    speed={resolvedSupporting.speed}
                    delayMs={resolvedSupporting.delayMs}
                  >
                    {resolvedSupporting.line.text}
                  </HeroTitleEffect>
                ) : null}
              </>
            );
          })()}

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
