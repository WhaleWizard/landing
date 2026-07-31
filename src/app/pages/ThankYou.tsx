import { lazy, Suspense, useEffect } from 'react';
import { motion } from 'motion/react';
import { Instagram, MessageCircle, Mail, Sparkles, ArrowRight } from 'lucide-react';
import { Youtube } from 'lucide-react';
import { Link } from 'react-router';
import { trackContact, trackThankYouConversion } from '../consent/consent';
import Navbar from '../components/Navbar';
import SEO from '../components/SEO';

const Footer = lazy(() => import('../components/Footer'));


function getThankYouContactChannel(name: string): 'telegram' | 'email' | 'social' {
  const normalized = name.toLowerCase();
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('email')) return 'email';
  return 'social';
}

export default function ThankYou() {
  useEffect(() => {
    trackThankYouConversion();
  }, []);

  const socialLinks = [
    {
      name: 'Instagram',
      icon: Instagram,
      link: 'https://instagram.com/whalewzrd',
      color: 'from-pink-500/20 to-purple-500/20',
    },
    {
      name: 'Telegram',
      icon: MessageCircle,
      link: 'https://t.me/white_rsh',
      color: 'from-blue-500/20 to-cyan-500/20',
    },
    {
      name: 'YouTube',
      icon: Youtube,
      link: 'https://youtube.com/whalewzrd',
      color: 'from-red-500/20 to-orange-500/20',
    },
    {
      name: 'Email',
      icon: Mail,
      link: 'mailto:whalewzrd@gmail.com',
      color: 'from-primary/20 to-accent/20',
    },
  ];

  return (
    <>
      <SEO
        title="Спасибо за заявку"
        description="Страница подтверждения отправки заявки."
        url="/thank-you"
        noIndex
      />
      <Navbar variant="content" />
      <section className="marketing-typography relative flex min-h-screen items-center justify-center overflow-x-hidden bg-background pb-20 pt-28 md:pt-32">

      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-primary/10 blur-[140px]" />
      <div className="absolute bottom-0 right-1/2 translate-x-1/2 w-[600px] h-[600px] bg-accent/10 blur-[140px]" />

      <div className="relative max-w-3xl w-full px-6 text-center">

        {/* Icon */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30"
        >
          <Sparkles className="w-10 h-10 text-white" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-2xl sm:text-3xl md:text-4xl font-bold"
        >
          Спасибо —{' '}
          <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            заявка отправлена
          </span>{' '}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 text-muted-foreground text-sm md:text-lg"
        >
          Я посмотрю вводные и свяжусь с вами указанным способом. Если хотите, пока можно открыть статьи и кейсы или написать мне напрямую.
        </motion.p>

        {/* CTA Instagram Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          {/* Внутренний переход роутером: раньше здесь стоял абсолютный адрес
              на прод, из-за чего страница перезагружалась целиком. */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/blog"
              className="group relative inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-6 font-semibold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105"
            >
              <div className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-[120%]" />

              <span className="relative">Открыть блог</span>
              <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/cases"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card/40 px-6 font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Посмотреть кейсы
            </Link>
          </div>
        </motion.div>

        {/* Social Bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
        >
          {socialLinks.map((social, i) => (
            <a
              key={i}
              href={social.link}
              onClick={() => trackContact(getThankYouContactChannel(social.name), 'thank_you', { social_label: social.name })}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative p-4 rounded-2xl border border-border bg-card/40 backdrop-blur-xl hover:scale-105 transition-all overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${social.color} opacity-0 group-hover:opacity-100 transition-opacity`} />

              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-background/60 border border-border flex items-center justify-center group-hover:rotate-6 transition-transform">
                  <social.icon className="w-5 h-5 text-primary" />
                </div>

                <div className="text-left">
                  <div className="font-semibold">{social.name}</div>
                  <div className="text-xs text-muted-foreground">Перейти</div>
                </div>
              </div>
            </a>
          ))}
        </motion.div>

        {/* Footer text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 text-xs text-muted-foreground"
        >
          Если хотите дополнить заявку, напишите мне в Telegram или на почту.
        </motion.p>

      </div>
      </section>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
