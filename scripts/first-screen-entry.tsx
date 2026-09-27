import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import Navbar from '../src/app/components/Navbar';
import Hero, { type HeroContent } from '../src/app/components/Hero';
import CosmicHeroScene from '../src/app/components/CosmicHeroScene';

/** The same components/CMS content as the first React frame, with no effects
 * or browser APIs run at build time. The rest of the document keeps its full
 * crawlable content, links and no-JavaScript fallback. */
export function renderHomeFirstScreen(content: HeroContent): string {
  return renderToString(
    <StaticRouter location="/">
      <LazyMotion features={domAnimation}>
        <MotionConfig reducedMotion="always">
          <div className="dark" data-ww-first-screen="/">
            <div className="marketing-typography bg-background text-foreground overflow-x-hidden">
              <Navbar />
              <Hero content={content} visual="cosmic" staticMotion settledEntrance scene={<CosmicHeroScene active={false} />} />
            </div>
          </div>
        </MotionConfig>
      </LazyMotion>
    </StaticRouter>,
  );
}
