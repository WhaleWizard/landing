import { lazy, Suspense, type ReactNode } from 'react';
import Hero from '../components/Hero';

const Services = lazy(() => import('../components/Services'));
const Cases = lazy(() => import('../components/Cases'));
const CallToAction = lazy(() => import('../components/CallToAction'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const Blog = lazy(() => import('../components/Blog'));
const SocialBar = lazy(() => import('../components/SocialBar'));
const ContactForm = lazy(() => import('../components/ContactForm'));
const Footer = lazy(() => import('../components/Footer'));
const CalculatorButtons = lazy(() => import('../components/CalculatorButtons'));

function SectionSkeleton({ height = 'min-h-[180px]' }: { height?: string }) {
  return <div className={`w-full ${height}`} aria-hidden="true" />;
}

function DeferredSection({
  children,
  height = 'min-h-[180px]',
  id,
}: {
  children: ReactNode;
  height?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 720px', scrollMarginTop: '80px' }}
    >
      <Suspense fallback={<SectionSkeleton height={height} />}>{children}</Suspense>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Hero />

      <DeferredSection id="services"><Services /></DeferredSection>
      <DeferredSection id="cases"><Cases /></DeferredSection>
      <DeferredSection><CallToAction /></DeferredSection>
      <DeferredSection id="about"><Testimonials /></DeferredSection>
      <DeferredSection><Blog /></DeferredSection>

      <section id="social" className="w-full flex justify-center py-12 md:py-16 scroll-mt-20">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 blur-3xl opacity-40" />
          <DeferredSection height="min-h-[80px]"><SocialBar /></DeferredSection>
        </div>
      </section>

      <DeferredSection id="calculator-section" height="min-h-[120px]"><CalculatorButtons /></DeferredSection>
      <DeferredSection id="contact" height="min-h-[240px]"><ContactForm /></DeferredSection>
      <DeferredSection height="min-h-[160px]"><Footer /></DeferredSection>
    </main>
  );
}
