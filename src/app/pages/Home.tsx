import { lazy, Suspense } from 'react';
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

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <Hero />

      <Suspense fallback={<SectionSkeleton />}><Services /></Suspense>
      <Suspense fallback={<SectionSkeleton />}><Cases /></Suspense>
      <Suspense fallback={<SectionSkeleton />}><CallToAction /></Suspense>
      <Suspense fallback={<SectionSkeleton />}><Testimonials /></Suspense>
      <Suspense fallback={<SectionSkeleton />}><Blog /></Suspense>

      <section className="w-full flex justify-center py-12 md:py-16">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 blur-3xl opacity-40" />
          <Suspense fallback={<SectionSkeleton height="min-h-[80px]" />}><SocialBar /></Suspense>
        </div>
      </section>

      <Suspense fallback={<SectionSkeleton height="min-h-[120px]" />}><CalculatorButtons /></Suspense>
      <Suspense fallback={<SectionSkeleton height="min-h-[240px]" />}><ContactForm /></Suspense>
      <Suspense fallback={<SectionSkeleton height="min-h-[160px]" />}><Footer /></Suspense>
    </main>
  );
}
