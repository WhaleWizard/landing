import { ArrowRight, Sparkles } from 'lucide-react';
import ConsultDeskScene from './ConsultDeskScene';
import type { HeroContent } from '../../types/hero';
import HeroTitleEffect, { heroTitleLinesForDisplay, resolveHeroTitleLines } from '../HeroTitleEffect';
import { useScrollTo } from '../hooks/useScrollTo';
import { useLandingVisibility } from '../../hooks/useLandingVisibility';
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
// import './consult-studio-hero.css' -> consolidated into src/styles/index.css for single-stylesheet SSR CRP

type ConsultStudioHeroProps = {
  content: HeroContent;
  /** Первый экран уже лежит в HTML сборки: эффекты заголовка не проигрываются заново. */
  settledEntrance?: boolean;
};

function ConsultStudioHero({ content, settledEntrance: _settledEntrance = false }: ConsultStudioHeroProps) {
  const { scrollToWhenReady } = useScrollTo();
  const visible = useLandingVisibility();
  // Все поясняющие строки, а не только первая (DA-153); заголовок не бывает
  // пустым, даже если все строки помечены поясняющими (DA-152).
  const displayLines = heroTitleLinesForDisplay(content.titleLines);
  const titleLines = displayLines?.filter((line) => line.tone !== 'supporting');
  const supportingLines = displayLines?.filter((line) => line.tone === 'supporting') || [];
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
            const allToResolve = [...rawLines, ...supportingLines];
            const resolvedAll = resolveHeroTitleLines(allToResolve, titleAnimation, { display: 'block' });
            const resolvedTitle = resolvedAll.slice(0, rawLines.length);
            const resolvedSupporting = resolvedAll.slice(rawLines.length);

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

                {resolvedSupporting.map((supporting, index) => (
                  <HeroTitleEffect
                    as="p"
                    key={`supporting-${index}`}
                    className="consult-studio-hero__supporting"
                    style={supporting.style}
                    text={supporting.line.text}
                    effect={supporting.effect}
                    speed={supporting.speed}
                    delayMs={supporting.delayMs}
                  >
                    {supporting.line.text}
                  </HeroTitleEffect>
                ))}
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

          {(visible.contact || visible.cases) && <div className="consult-studio-hero__actions">
            {/* Ссылки, а не кнопки (DA-36): до запуска React у кнопки нет
                обработчика, и первый тап ничего не делал. Ссылка ведёт к форме
                сама, а после запуска — с той же плавной прокруткой, что раньше. */}
            {visible.contact && <Button
              size="lg"
              asChild
              className="consult-studio-hero__primary"
            >
              <a href="#contact" onClick={(event) => { event.preventDefault(); scrollTo('contact'); }}>
                <span>{content.primaryButton}</span>
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>}
            {visible.cases && <Button
              size="lg"
              variant="outline"
              asChild
              className="consult-studio-hero__secondary"
            >
              <a href="#cases" onClick={(event) => { event.preventDefault(); scrollTo('cases'); }}>
                {content.secondaryButton}
              </a>
            </Button>}
          </div>}

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
