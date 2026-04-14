import { motion } from 'motion/react';
import { ArrowDown, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { memo, useCallback } from 'react';

function CallToAction() {
  const scrollToContact = useCallback(() => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  return (
    <section className="relative py-12 md:py-16 overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-secondary/5" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative p-6 md:p-8 rounded-2xl md:rounded-3xl bg-gradient-to-br from-card/80 via-card/60 to-card/80 backdrop-blur-xl border border-primary/30 shadow-2xl shadow-primary/10"
        >
          {/* Animated Border Glow */}
          <div className="absolute inset-0 rounded-2xl md:rounded-3xl bg-gradient-to-r from-primary via-accent to-secondary opacity-20 blur-xl animate-pulse" />
          
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Left Content */}
            <div className="text-center md:text-left space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs md:text-sm text-primary font-semibold">Начните сейчас</span>
              </div>
              <h3 className="text-xl md:text-2xl lg:text-3xl font-bold">
                Готовы увеличить продажи?
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                Оставьте заявку на бесплатную консультацию
              </p>
            </div>

            {/* Right Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full md:w-auto">
              <Button
                onClick={scrollToContact}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden"
              >
                {/* Button Shine Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <span className="relative">Получить консультацию</span>
                <ArrowDown className="ml-2 w-4 h-4 md:w-5 md:h-5 group-hover:translate-y-1 transition-transform relative" />
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default memo(CallToAction);
