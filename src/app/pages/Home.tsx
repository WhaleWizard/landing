import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import SEO from '../components/SEO';
import { useSiteSection } from '../hooks/useServiceContent';

const defaultHomeSeo = {
  title: 'Google Ads, Meta Ads и аналитика',
  description: 'Настройка и ведение Google Ads и Meta Ads с опорой на аналитику, качество заявок и продажи: GA4, GTM, Meta Pixel, CAPI и данные CRM.',
};

const Services = lazy(() => import('../components/Services'));
const Cases = lazy(() => import('../components/Cases'));
const CallToAction = lazy(() => import('../components/CallToAction'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const Blog = lazy(() => import('../components/Blog'));
const SocialBar = lazy(() => import('../components/SocialBar'));
const ContactForm = lazy(() => import('../components/ContactForm'));
const Footer = lazy(() => import('../components/Footer'));
const CalculatorButtons = lazy(() => import('../components/CalculatorButtons'));

type DeferredSectionHeights = {
  mobile: number;
  tablet: number;
  desktop: number;
};

type DeferredSectionStyle = CSSProperties & {
  '--home-deferred-mobile': string;
  '--home-deferred-tablet': string;
  '--home-deferred-desktop': string;
};

function SectionSkeleton({ heights }: { heights: DeferredSectionHeights }) {
  const style: DeferredSectionStyle = {
    '--home-deferred-mobile': `${heights.mobile}px`,
    '--home-deferred-tablet': `${heights.tablet}px`,
    '--home-deferred-desktop': `${heights.desktop}px`,
  };

  return (
    <div
      className="min-h-[var(--home-deferred-mobile)] w-full md:min-h-[var(--home-deferred-tablet)] lg:min-h-[var(--home-deferred-desktop)]"
      style={style}
      aria-hidden="true"
    />
  );
}

function hashTargetsSection(anchorId?: string) {
  if (typeof window === 'undefined' || !anchorId) return false;
  const rawHash = window.location.hash.slice(1);
  if (!rawHash) return false;

  try {
    return decodeURIComponent(rawHash) === anchorId;
  } catch {
    return rawHash === anchorId;
  }
}

function DeferredSection({
  children,
  anchorId,
  heights,
}: {
  children: ReactNode;
  anchorId?: string;
  heights: DeferredSectionHeights;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [shouldRender, setShouldRender] = useState(() => (
    typeof window === 'undefined'
    || typeof window.IntersectionObserver === 'undefined'
    || hashTargetsSection(anchorId)
  ));

  useEffect(() => {
    if (shouldRender) return;
    const section = sectionRef.current;
    if (!section || typeof window.IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const mount = () => setShouldRender(true);
    const mountForHash = () => {
      if (hashTargetsSection(anchorId)) mount();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        mount();
      },
      { rootMargin: '1600px 0px', threshold: 0 },
    );

    observer.observe(section);
    window.addEventListener('hashchange', mountForHash);
    window.addEventListener('beforeprint', mount);
    mountForHash();

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', mountForHash);
      window.removeEventListener('beforeprint', mount);
    };
  }, [anchorId, shouldRender]);

  useEffect(() => {
    if (!shouldRender || !anchorId || !hashTargetsSection(anchorId)) return;

    let frame = 0;
    let attempts = 0;
    const alignToTarget = () => {
      const target = document.getElementById(anchorId);
      if (target) {
        target.scrollIntoView();
        return;
      }
      attempts += 1;
      if (attempts < 60) frame = window.requestAnimationFrame(alignToTarget);
    };

    frame = window.requestAnimationFrame(alignToTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [anchorId, shouldRender]);

  return (
    <section ref={sectionRef} id={shouldRender ? undefined : anchorId}>
      {shouldRender ? (
        <Suspense fallback={<SectionSkeleton heights={heights} />}>{children}</Suspense>
      ) : (
        <SectionSkeleton heights={heights} />
      )}
    </section>
  );
}

export default function Home() {
  const seo = useSiteSection('site:home', 'seo', defaultHomeSeo);
  return (
    <main className="marketing-typography min-h-screen bg-background text-foreground overflow-x-hidden">
      <SEO
        title={seo.title}
        description={seo.description}
        url="/"
      />
      <Navbar />
      <Hero contentKey="site:home" />

      <DeferredSection anchorId="services" heights={{ mobile: 1000, tablet: 1674, desktop: 1596 }}>
        <Services contentKey="site:home" />
      </DeferredSection>
      <DeferredSection anchorId="cases" heights={{ mobile: 1062, tablet: 1720, desktop: 1569 }}>
        <Cases contentKey="site:home" moreHref="/cases" />
      </DeferredSection>
      <DeferredSection heights={{ mobile: 352, tablet: 351, desktop: 332 }}>
        <CallToAction contentKey="site:home" />
      </DeferredSection>
      <DeferredSection anchorId="about" heights={{ mobile: 1085, tablet: 1105, desktop: 1137 }}>
        <Testimonials contentKey="site:home" />
      </DeferredSection>
      <DeferredSection anchorId="blog" heights={{ mobile: 943, tablet: 1150, desktop: 1166 }}>
        <Blog />
      </DeferredSection>

      <section className="w-full flex justify-center py-12 md:py-16">
        <div className="relative w-full min-w-0">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 blur-3xl opacity-40" />
          <DeferredSection anchorId="social" heights={{ mobile: 348, tablet: 363, desktop: 353 }}>
            <SocialBar />
          </DeferredSection>
        </div>
      </section>

      <DeferredSection anchorId="calculator-section" heights={{ mobile: 642, tablet: 679, desktop: 647 }}>
        <CalculatorButtons />
      </DeferredSection>
      <DeferredSection anchorId="contact" heights={{ mobile: 1721, tablet: 1701, desktop: 1175 }}>
        <ContactForm contentKey="site:home" />
      </DeferredSection>
      <DeferredSection heights={{ mobile: 1049, tablet: 457, desktop: 429 }}>
        <Footer />
      </DeferredSection>
    </main>
  );
}
