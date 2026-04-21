import { Mail, MessageSquare, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import { openCookieSettings } from '../consent/consent';

function Footer() {
  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <footer className="relative border-t border-border bg-card/30 backdrop-blur-sm overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[600px] h-48 bg-gradient-radial from-primary/10 via-transparent to-transparent blur-3xl" />

      {/* Top Glow Line */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          
          {/* Brand */}
          <motion.div 
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                Whale Wzrd
              </h3>
              <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">
              Perfomance-таргетолог для роста вашего бизнеса через Google Ads и Meta Ads
            </p>
          </motion.div>

          {/* Services */}
          <motion.div
            id="services"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              Услуги
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className="space-y-2 text-sm text-muted-foreground">
              <li
                onClick={() => scrollToSection('services')}
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Google Ads
              </li>

              <li
                onClick={() => scrollToSection('services')}
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Meta Ads (Facebook & Instagram)
              </li>

              <li
                onClick={() => scrollToSection('services')}
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Аналитика
              </li>

              <li
                onClick={() => scrollToSection('services')}
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Оптимизация кампаний
              </li>
            </ul>
          </motion.div>

          {/* Company */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              Компания
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <button
                  onClick={() => scrollToSection('about')}
                  className="hover:text-primary transition-colors"
                >
                  Обо мне говорят
                </button>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('cases')}
                  className="hover:text-primary transition-colors"
                >
                  Кейсы
                </button>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('blog')}
                  className="hover:text-primary transition-colors"
                >
                  Блог
                </button>
              </li>

              <li>
                <a href="/faq" className="hover:text-primary transition-colors">
                  FAQ
                </a>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('social')}
                  className="hover:text-primary transition-colors"
                >
                  Контакты
                </button>
              </li>
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div
            id="social"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              Контакты
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:whalewzrd@gmail.com"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  whalewzrd@gmail.com
                </a>
              </li>

              <li>
                <a
                  href="https://t.me/white_rsh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  Telegram
                </a>
              </li>

              <li>
                <a
                  href="#"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  Портфолио
                </a>
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Bottom */}
        <motion.div 
          className="pt-8 border-t border-border/50"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              © 2026 WhaleWzrd. Все права защищены.
              <span className="hidden md:inline">|</span>
              <span className="text-xs">Made with ❤️</span>
            </p>

            <div className="flex gap-6">
  <a href="/privacy-policy" className="hover:text-primary transition-colors relative group">
    Политика конфиденциальности
    <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
  </a>
  <a href="/offer" className="hover:text-primary transition-colors relative group">
    Публичная оферта
    <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
  </a>
  <a href="/cookie-policy" className="hover:text-primary transition-colors relative group">
    Политика Cookie
    <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
  </a>
  <a href="/faq" className="hover:text-primary transition-colors relative group">
    FAQ
    <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
  </a>
  <button
    type="button"
    onClick={openCookieSettings}
    className="hover:text-primary transition-colors relative group text-left"
  >
    Настройки Cookie
    <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
  </button>
</div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}

export default memo(Footer);
