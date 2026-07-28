import { motion } from 'motion/react';
import { Instagram, Mail, MessageCircle, Music, Send, Twitter, Youtube } from 'lucide-react';
import { memo } from 'react';
import { trackContact } from '../consent/consent';

const socials = [
  { icon: Send, href: 'https://t.me/whalewzrd', label: 'Telegram', color: '#26A5E4' },
  { icon: Instagram, href: 'https://instagram.com/whalewzrd', label: 'Instagram', color: '#E4405F' },
  { icon: Youtube, href: 'https://youtube.com/@whalewzrd', label: 'YouTube', color: '#FF0000' },
  { icon: Twitter, href: 'https://twitter.com/whalewzrd', label: 'X', color: '#1DA1F2' },
  { icon: MessageCircle, href: 'https://threads.net/@whalewzrd', label: 'Threads', color: '#8A2BE2' },
  { icon: Music, href: 'https://tiktok.com/@whalewzrd', label: 'TikTok', color: '#FE2C55' },
  { icon: Mail, href: 'mailto:whalewzrd@gmail.com', label: 'Email', color: '#8B5CF6' },
];

function getContactChannel(label: string): 'telegram' | 'whatsapp' | 'email' | 'phone' | 'social' {
  const normalized = label.toLowerCase();
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('email')) return 'email';
  return 'social';
}

function SocialDock() {
  return (
    <motion.section
      id="social"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6 }}
      className="w-full py-10 md:py-16"
      style={{ contain: 'layout style paint' }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-6 flex items-center justify-center text-center md:mb-8">
          <div className="min-w-0">
            <h2 className="text-balance text-xl md:text-2xl font-bold mb-1.5">
              Разборы, заметки и связь{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                в соцсетях
              </span>
            </h2>
            <p className="text-pretty text-muted-foreground text-xs md:text-sm">
              <span className="lg:hidden">Выберите удобный канал — все ссылки сразу перед вами.</span>
              <span className="hidden lg:inline">Делюсь наблюдениями по рекламе, аналитике и работе с проектами.</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-1 md:gap-4">
          {socials.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.a
                key={s.label}
                data-social-card
                href={s.href}
                onClick={() => trackContact(getContactChannel(s.label), 'social_bar', { social_label: s.label })}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                whileTap={{ scale: 0.95 }}
                className={`social-card social-card-${i} group flex min-h-[88px] w-[76px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card/40 px-2 py-3 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg min-[360px]:w-[78px] md:min-h-[104px] md:w-[96px] md:gap-2.5 md:p-4`}
              >
                <Icon
                  className="social-icon h-[22px] w-[22px] transition-colors duration-300 md:h-6 md:w-6"
                  style={{ color: s.color }}
                  aria-hidden="true"
                />
                <span className="text-[11px] md:text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                  {s.label}
                </span>
              </motion.a>
            );
          })}
        </div>
      </div>

      <style>{`
        ${socials.map((s, i) => `
        .social-card-${i}:hover {
          border-color: ${s.color}80;
          background-color: ${s.color}1f;
          box-shadow: 0 12px 28px -14px ${s.color}99;
        }
        `).join('')}
      `}</style>
    </motion.section>
  );
}

export default memo(SocialDock);
