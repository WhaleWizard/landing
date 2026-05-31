import { Mail, MessageSquare, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { openCookieSettings, trackContact } from '../consent/consent';

const footerHeadingClass = 'font-semibold mb-4 flex items-center gap-2';
const footerListClass = 'space-y-2 text-sm font-semibold text-muted-foreground';
const footerLinkClass = 'font-semibold hover:text-primary transition-colors';
const footerContactLinkClass =
  'flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors group';
const footerLegalLinkClass =
  'inline-flex h-5 items-center text-sm font-semibold leading-none hover:text-primary transition-colors relative group';

function Footer() {
  const navigate = useNavigate();
  const location = useLocation();

  const scrollToSection = useCallback((id: string) => {
    const scrollNow = () => {
      const element = document.getElementById(id);
      if (!element) return false;

      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;

      window.scrollTo({
        top: y,
        behavior: 'smooth',
      });
      return true;
    };

    const scrollWhenReady = (attempt = 0) => {
      if (scrollNow()) return;
      if (attempt >= 60) return;
      window.setTimeout(() => scrollWhenReady(attempt + 1), 100);
    };

    if (scrollNow()) return;

    if (location.pathname !== '/') {
      navigate('/');
      window.setTimeout(() => {
        scrollWhenReady();
      }, 120);
      return;
    }

    scrollWhenReady();
  }, [location.pathname, navigate]);

  return (
    <footer className="relative border-t border-border bg-card/30 backdrop-blur-sm overflow-hidden">
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 transform -translate-x-1/2 w-[600px] h-48 bg-gradient-radial from-primary/10 via-transparent to-transparent blur-3xl" />

      {/* Top Glow Line */}
      <div className="pointer-events-none absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

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
              Performance-таргетолог для роста вашего бизнеса через Google Ads и Meta Ads
            </p>
          </motion.div>

          {/* Services */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h4 className={footerHeadingClass}>
              Услуги
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className={footerListClass}>
              <li>
                <a href="/google-ads" className={footerLinkClass}>
                  Google Ads
                </a>
              </li>

              <li>
                <a href="/meta-ads" className={footerLinkClass}>
                  Meta Ads (Facebook & Instagram)
                </a>
              </li>

              <li>
                <a href="/consult" className={footerLinkClass}>
                  Консультация
                </a>
              </li>

              <li>
                <a href="/meta-apps" className={footerLinkClass}>
                  Meta Apps
                </a>
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
            <h4 className={footerHeadingClass}>
              Компания
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className={footerListClass}>
              <li>
                <button
                  onClick={() => scrollToSection('about')}
                  className={footerLinkClass}
                >
                  Обо мне говорят
                </button>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('cases')}
                  className={footerLinkClass}
                >
                  Кейсы
                </button>
              </li>

              <li>
                <button
                  onClick={() => navigate('/blog')}
                  className={footerLinkClass}
                >
                  Блог
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/cases')}
                  className={footerLinkClass}
                >
                  Кейсы статьи
                </button>
              </li>

              <li>
                <a href="/faq" className={footerLinkClass}>
                  FAQ
                </a>
              </li>

              <li>
                <a href="/marketing-glossary" className={footerLinkClass}>
                  Словарь метрик
                </a>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('contact')}
                  className={footerLinkClass}
                >
                  Контакты
                </button>
              </li>
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h4 className={footerHeadingClass}>
              Контакты
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:whalewzrd@gmail.com"
                  onClick={() => trackContact('email', 'footer')}
                  className={footerContactLinkClass}
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
                  onClick={() => trackContact('telegram', 'footer')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footerContactLinkClass}
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  Telegram
                </a>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('cases')}
                  className={footerContactLinkClass}
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  Портфолио
                </button>
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

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 justify-center md:justify-end leading-none">
              <a href="/privacy-policy" className={footerLegalLinkClass}>
                <span>Политика конфиденциальности и ПД</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </a>
              <a href="/offer" className={footerLegalLinkClass}>
                <span>Публичная оферта</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </a>
              <a href="/cookie-policy" className={footerLegalLinkClass}>
                <span>Политика Cookie</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </a>
              <a href="/faq" className={footerLegalLinkClass}>
                <span>FAQ</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </a>
              <button
                type="button"
                onClick={openCookieSettings}
                className={`${footerLegalLinkClass} text-muted-foreground text-left bg-transparent border-0 p-0 m-0 appearance-none cursor-pointer`}
              >
                <span>Настройки Cookie</span>
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
