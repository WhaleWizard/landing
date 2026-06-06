import { memo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Gem, Orbit, Sparkles } from 'lucide-react';

type ServiceHeroVariant = 'meta-ads' | 'google-ads' | 'consult' | 'meta-apps';

interface ServiceHeroArtProps {
  variant: ServiceHeroVariant;
}

const serviceScenes: Record<ServiceHeroVariant, {
  eyebrow: string;
  title: string;
  center: string;
  chips: string[];
  halo: string;
}> = {
  'meta-ads': {
    eyebrow: 'creative signal field',
    title: 'Ad system in motion',
    center: 'META',
    chips: ['hook', 'offer', 'pixel', 'capi'],
    halo: 'from-[#4F7DFF]/45 via-[#B04DFF]/30 to-[#FF7AB6]/35',
  },
  'google-ads': {
    eyebrow: 'intent capture field',
    title: 'Demand engine',
    center: 'GOOGLE',
    chips: ['intent', 'feed', 'ga4', 'roas'],
    halo: 'from-[#4285F4]/45 via-[#34A853]/30 to-[#FBBC04]/35',
  },
  consult: {
    eyebrow: 'clarity architecture',
    title: 'Growth route',
    center: 'PLAN',
    chips: ['niche', 'offer', 'price', 'clients'],
    halo: 'from-[#8B5CF6]/45 via-[#6366F1]/30 to-[#3B82F6]/35',
  },
  'meta-apps': {
    eyebrow: 'app event orbit',
    title: 'Quality user loop',
    center: 'APP',
    chips: ['install', 'event', 'trial', 'scale'],
    halo: 'from-[#4F7DFF]/45 via-[#B04DFF]/30 to-[#FF7AB6]/35',
  },
};

function ServiceHeroArtBase({ variant }: ServiceHeroArtProps) {
  const reduced = useReducedMotion();
  const scene = serviceScenes[variant];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduced ? 0.15 : 0.75, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-[34rem] lg:max-w-none"
    >
      <div className={`absolute -inset-10 rounded-[3rem] bg-gradient-to-br ${scene.halo} blur-3xl`} />
      <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#070711]/80 p-5 shadow-[0_34px_120px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,.16),transparent_24%),radial-gradient(circle_at_78%_24%,rgba(255,255,255,.10),transparent_24%),linear-gradient(135deg,rgba(255,255,255,.08),transparent_44%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,rgba(255,255,255,.45)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.35)_1px,transparent_1px)] bg-[size:52px_52px]" />

        <div className="relative min-h-[430px] rounded-[1.75rem] border border-white/10 bg-background/35 p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-primary/80">{scene.eyebrow}</p>
              <p className="mt-2 text-2xl font-bold text-white">{scene.title}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary shadow-[0_0_34px_rgba(79,125,255,.22)]">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>

          <div className="absolute left-1/2 top-[54%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20" />
          <div className="absolute left-1/2 top-[54%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/20" />
          <motion.div
            className="absolute left-1/2 top-[54%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/26 via-accent/20 to-secondary/24 blur-sm"
            animate={reduced ? undefined : { scale: [1, 1.06, 1], opacity: [0.76, 1, 0.76] }}
            transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute left-1/2 top-[54%] flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_20px_70px_rgba(0,0,0,.36)] backdrop-blur"
            animate={reduced ? undefined : { y: [-4, 8, -4], rotate: [-2, 2, -2] }}
            transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Gem className="absolute h-16 w-16 text-primary/30" />
            <span className="relative text-sm font-black tracking-[0.24em] text-white">{scene.center}</span>
          </motion.div>

          {scene.chips.map((chip, index) => {
            const positions = [
              'left-[8%] top-[33%]',
              'right-[7%] top-[37%]',
              'left-[12%] bottom-[18%]',
              'right-[10%] bottom-[15%]',
            ];
            return (
              <motion.div
                key={chip}
                className={`absolute ${positions[index]} rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white/90 shadow-2xl backdrop-blur`}
                animate={reduced ? undefined : { y: [0, index % 2 ? 12 : -12, 0], opacity: [0.72, 1, 0.72] }}
                transition={{ duration: 5.4 + index * 0.45, repeat: Infinity, ease: 'easeInOut' }}
              >
                {chip}
              </motion.div>
            );
          })}

          <motion.div
            className="absolute left-[13%] top-[21%] flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-primary/90"
            animate={reduced ? undefined : { rotate: 360 }}
            transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
          >
            <Orbit className="h-5 w-5" />
          </motion.div>
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/60 backdrop-blur">
            <span>premium acquisition layer</span>
            <span className="text-primary">live</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(ServiceHeroArtBase);
