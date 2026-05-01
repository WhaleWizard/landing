import { Canvas, useFrame } from '@react-three/fiber';
import { motion } from 'motion/react';
import { useMemo, useRef } from 'react';
import type { Points } from 'three';
import ContactForm from '../components/ContactForm';

function TailSplash() {
  const ref = useRef<Points>(null);
  const pts = useMemo(() => {
    const a = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      a[i * 3] = (Math.random() - 0.5) * 3;
      a[i * 3 + 1] = Math.random() * 2 - 1;
      a[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return a;
  }, []);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.3) * 0.2; });
  return <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" count={pts.length/3} array={pts} itemSize={3} /></bufferGeometry><pointsMaterial color="#8b5cf6" size={0.03} /></points>;
}

export default function ConsultPage() {
  return <main className="bg-background text-foreground"><section className="min-h-screen relative"><div className="absolute inset-0"><Canvas camera={{position:[0,0,4]}}><TailSplash /></Canvas></div><div className="relative z-10 max-w-6xl mx-auto px-4 pt-28"><h1 className="text-4xl md:text-6xl font-black">Помогу таргетологу найти стабильный поток клиентов и выйти на доход от $1000/мес</h1><p className="text-gray-300 mt-4 max-w-2xl">Разбор вашей стратегии поиска клиентов, упаковка услуг, сильный оффер и стратегия продвижения на основе личного опыта.</p><a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1]">Записаться на консультацию</a></div></section><section className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-4 gap-4">{['Нет ниши и четкого оффера','Портфолио не продает','Не используются каналы поиска','Нет личного бренда и контента'].map(v=><motion.div whileHover={{rotateX:-5,rotateY:4}} key={v} className="rounded-2xl p-5 bg-card border border-white/10">{v}</motion.div>)}</section><section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Хочу консультацию</h2><ContactForm service="consult" /></section></main>;
}
