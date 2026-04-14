import { motion } from 'motion/react';
import {
  Instagram,
  Youtube,
  Send,
  Twitter,
  MessageCircle,
  Phone,
  Music,
  Mail,
} from 'lucide-react';
import { useRef, useEffect, memo, useCallback } from 'react';

const socialsDesktop = [
  { icon: Instagram, href: 'https://instagram.com/whalewzrd', label: 'Instagram', color: '#E4405F' },
  { icon: Youtube, href: 'https://youtube.com/@whalewzrd', label: 'YouTube', color: '#FF0000' },
  { icon: Send, href: 'https://t.me/whalewzrd', label: 'Telegram', color: '#26A5E4' },
  { icon: Twitter, href: 'https://twitter.com/whalewzrd', label: 'X', color: '#1DA1F2' },
  { icon: MessageCircle, href: 'https://threads.net/@whalewzrd', label: 'Threads', color: '#8A2BE2' },
  { icon: Phone, href: '#', label: 'WhatsApp', color: '#25D366' },
  { icon: Music, href: 'https://tiktok.com/@whalewzrd', label: 'TikTok', color: '#000000' },
  { icon: Mail, href: 'mailto:whalewzrd@gmail.com', label: 'Email', color: '#8B5CF6' },
];

const socialsMobileOrder = [
  { icon: Twitter, href: 'https://twitter.com/whalewzrd', label: 'X', color: '#1DA1F2' },
  { icon: MessageCircle, href: 'https://threads.net/@whalewzrd', label: 'Threads', color: '#8A2BE2' },
  { icon: Phone, href: '#', label: 'WhatsApp', color: '#25D366' },
  { icon: Music, href: 'https://tiktok.com/@whalewzrd', label: 'TikTok', color: '#000000' },
  { icon: Mail, href: 'mailto:whalewzrd@gmail.com', label: 'Email', color: '#8B5CF6' },
  { icon: Instagram, href: 'https://instagram.com/whalewzrd', label: 'Instagram', color: '#E4405F' },
  { icon: Send, href: 'https://t.me/whalewzrd', label: 'Telegram', color: '#26A5E4' },
  { icon: Youtube, href: 'https://youtube.com/@whalewzrd', label: 'YouTube', color: '#FF0000' },
];

// Два повтора вместо трёх — достаточно для бесконечного скролла, снижает нагрузку
const socialsInfinite = [...socialsMobileOrder, ...socialsMobileOrder];

// Хук для определения тач-устройства
const useTouchDevice = () => {
  const isTouch = useRef(false);
  useEffect(() => {
    isTouch.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);
  return isTouch.current;
};

function SocialDock() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isTouch = useTouchDevice();

  // Показываем скроллбар только во время скролла на мобильных
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const showScrollbar = () => {
      container.style.scrollbarColor = '#8b5cf6 transparent';
      container.style.setProperty('--scrollbar-opacity', '0.6');
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        container.style.scrollbarColor = 'rgba(139, 92, 246, 0) transparent';
        container.style.setProperty('--scrollbar-opacity', '0');
      }, 1000);
    };

    container.addEventListener('scroll', showScrollbar, { passive: true });
    return () => {
      container.removeEventListener('scroll', showScrollbar);
      clearTimeout(timeoutId);
    };
  }, []);

  // Оптимизация: анимации на тач-устройствах отключаем hover, оставляем только tap
  const desktopHover = !isTouch ? { whileHover: { y: -5, scale: 1.1 } } : {};
  const mobileTap = { whileTap: { scale: 0.95 } };

  return (
    <motion.section
      id="social"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6 }}
      className="w-full py-12 md:py-16"
      style={{ contain: 'layout style paint' }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-xl md:text-2xl font-medium mb-2">
            Подробнее о моей работе{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              в соцсетях
            </span>
          </h2>
          <p className="text-muted-foreground text-xs md:text-sm">
            <span className="md:hidden">→ Листай вправо, чтобы увидеть все ←</span>
            <span className="hidden md:inline">Нажми на иконку, чтобы перейти</span>
          </p>
        </div>

        {/* Десктопная версия */}
        <div className="hidden md:flex justify-center flex-wrap gap-4">
          {socialsDesktop.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.a
                key={i}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                {...desktopHover}
                whileTap={{ scale: 0.95 }}
                className="group relative flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-300 hover:bg-primary/10"
                style={{ transform: 'translateZ(0)' }}
              >
                <div className="relative">
                  <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 group-hover:from-primary/30 group-hover:to-accent/30 transition-all duration-300">
                    <Icon className="w-6 h-6 text-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  {s.label}
                </span>
              </motion.a>
            );
          })}
        </div>

        {/* Мобильная версия с горизонтальным скроллом */}
        <div className="md:hidden relative overflow-visible">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto overflow-y-visible scroll-smooth pb-8"
            style={{
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch',
              cursor: 'grab',
              transform: 'translateZ(0)',
            }}
          >
            {socialsInfinite.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.a
                  key={i}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (i % socialsMobileOrder.length) * 0.02, duration: 0.2 }}
                  {...mobileTap}
                  className="flex-shrink-0 group relative flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-300 active:bg-primary/10"
                  style={{ zIndex: 20, transform: 'translateZ(0)' }}
                >
                  <div className="relative">
                    <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 transition-all duration-300 active:from-primary/30 active:to-accent/30">
                      <Icon className="w-6 h-6 text-foreground transition-colors" />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {s.label}
                  </span>
                </motion.a>
              );
            })}
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground/50 mt-6">
          <span className="md:hidden">✨ Подпишись, чтобы не пропустить важные новости ✨</span>
          <span className="hidden md:inline">Все соцсети в одном месте</span>
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .overflow-x-auto {
            scrollbar-width: thin;
            scrollbar-color: rgba(139, 92, 246, 0) transparent;
          }
          .overflow-x-auto::-webkit-scrollbar {
            height: 2px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
            background: transparent;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb {
            background: #8b5cf6;
            border-radius: 4px;
            opacity: var(--scrollbar-opacity, 0);
            transition: opacity 0.2s;
          }
        }
      `}</style>
    </motion.section>
  );
}

export default memo(SocialDock);