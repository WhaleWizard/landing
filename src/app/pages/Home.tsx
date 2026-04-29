import { lazy, Suspense, type ReactNode } from 'react';
import Navbar from '../components/Navbar';
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
}: {
  children: ReactNode;
  height?: string;
}) {
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 720px' }}>
      <Suspense fallback={<SectionSkeleton height={height} />}>{children}</Suspense>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <Hero />

      <DeferredSection><Services /></DeferredSection>
      <DeferredSection><Cases /></DeferredSection>
      <DeferredSection><CallToAction /></DeferredSection>
      <DeferredSection><Testimonials /></DeferredSection>
      <DeferredSection><Blog /></DeferredSection>

      <section className="w-full flex justify-center py-12 md:py-16">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 blur-3xl opacity-40" />
          <DeferredSection height="min-h-[80px]"><SocialBar /></DeferredSection>
        </div>
      </section>

      <DeferredSection height="min-h-[120px]"><CalculatorButtons /></DeferredSection>
      <DeferredSection height="min-h-[240px]"><ContactForm /></DeferredSection>
      <DeferredSection height="min-h-[160px]"><Footer /></DeferredSection>
    </main>
  );
}
