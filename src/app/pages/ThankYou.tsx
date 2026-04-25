import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Instagram, MessageCircle, Mail, Sparkles, ArrowRight } from 'lucide-react';
import { Youtube } from 'lucide-react';
import { trackThankYouConversion } from '../consent/consent';
import SEO from '../components/SEO';

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
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">

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
          className="mt-6 text-1xl md:text-4xl font-bold"
        >
          Вы на шаг ближе к{' '}
          <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            росту заявок
          </span>{' '}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 text-muted-foreground text-sm md:text-lg"
        >
          Я уже получил вашу заявку и свяжусь с вами в ближайшее время.
          Пока можете посмотреть мои соцсети 👇
        </motion.p>

        {/* CTA Instagram Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <a
            href="https://www.whalewzrd.com/blog"
            className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/30 overflow-hidden transition-transform hover:scale-105"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />

            <span className="relative">Статьи и Кейсы</span>
            <ArrowRight className="w-4 h-4 relative group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>

        {/* Social Bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          {socialLinks.map((social, i) => (
            <a
              key={i}
              href={social.link}
              target="_blank"
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
          Обычно отвечаю в течение 24 часов ⚡
        </motion.p>

      </div>
      </section>
    </>
  );
}
