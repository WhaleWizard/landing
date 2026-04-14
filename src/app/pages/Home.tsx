import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Services from '../components/Services';
import Cases from '../components/Cases';
import CallToAction from '../components/CallToAction';
import Testimonials from '../components/Testimonials';
import Blog from '../components/Blog';
import SocialBar from '../components/SocialBar';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';
import CalculatorButtons from '../components/CalculatorButtons';

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <Hero />
      <Services />
      <Cases />
      <CallToAction />
      <Testimonials />
      <Blog />
      <section className="w-full flex justify-center py-12 md:py-16">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 blur-3xl opacity-40" />
          <SocialBar />
        </div>
      </section>
      
      {/* 👇 НОВЫЙ БЛОК С КНОПКАМИ-КАЛЬКУЛЯТОРАМИ */}
      <CalculatorButtons />
      
      <ContactForm />
      <Footer />
    </main>
  );
}