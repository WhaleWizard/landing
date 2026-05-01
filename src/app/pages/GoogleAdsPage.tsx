import { Canvas, useFrame } from '@react-three/fiber';
import { motion } from 'motion/react';
import { useRef } from 'react';
import type { Group } from 'three';
import ContactForm from '../components/ContactForm';

function Laptop() {
  const group = useRef<Group>(null);
  useFrame(({ clock, pointer }) => {
    if (!group.current) return;
    group.current.rotation.y = pointer.x * 0.2;
    group.current.rotation.x = pointer.y * 0.15;
    group.current.children[1].rotation.x = -1.2 + Math.sin(clock.getElapsedTime() * 0.7) * 0.08;
  });
  return (
    <group ref={group}>
      <mesh position={[0, -0.5, 0]}><boxGeometry args={[2.3, 0.1, 1.5]} /><meshBasicMaterial wireframe color="#8b5cf6" /></mesh>
      <mesh position={[0, 0.15, -0.75]} rotation={[-1.2, 0, 0]}><boxGeometry args={[2.3, 0.06, 1.5]} /><meshBasicMaterial wireframe color="#6366f1" /></mesh>
    </group>
  );
}

export default function GoogleAdsPage() {
  return <main className="bg-background text-foreground"><section className="min-h-screen grid lg:grid-cols-[40%_60%] items-center px-4 max-w-6xl mx-auto gap-8"><div className="h-[360px]"><Canvas camera={{position:[0,0,4]}}><Laptop /></Canvas></div><div><h1 className="text-4xl md:text-6xl font-black">Привлеку горячих клиентов из Google Ads, готовых купить сейчас</h1><p className="text-gray-300 mt-4">Настрою связку Search + Performance Max + YouTube так, чтобы каждый $ приносил максимум целевых заявок.</p><a href="#contact" className="mt-8 inline-flex rounded-3xl px-8 py-4 bg-gradient-to-r from-[#8b5cf6] to-[#6366f1]">Получить срез стоимости лида в вашей нише</a></div></section><section className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-4">{['Ставка только на поисковые кампании','Отсутствие ретаргетинга','Неподготовленный сайт'].map(x=><article key={x} className="rounded-2xl p-6 bg-card border border-white/10">{x}</article>)}</section><section id="contact" className="max-w-6xl mx-auto px-4 py-16"><h2 className="text-3xl font-bold mb-4">Рассчитайте прогнозируемый ROAS для вашей ниши</h2><ContactForm service="google-ads" /></section></main>;
}
