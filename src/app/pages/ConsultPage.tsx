import { useState } from 'react';
import { motion } from 'motion/react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { API_ROUTES } from '../config';
import { trackLead } from '../consent/consent';

const wins = ['Позиционирование и ниша, где проще закрываться в оплату.', 'Переупаковка кейсов в язык результата для бизнеса.', 'Скрипты переписки и созвона, которые двигают к сделке.', 'План привлечения клиентов на 30 дней.'];

export default function ConsultPage() {
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', experience: '', goal: '', problem: '' });
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSending(true); const eventId = crypto.randomUUID(); try { const res = await fetch(API_ROUTES.lead,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name,phone:form.phone,budget:'consult',event_id:eventId,page_url:window.location.href,referrer:document.referrer||undefined,message:`Consult | Опыт: ${form.experience}; Цель: ${form.goal}; Проблема: ${form.problem}`})}); if(!res.ok) throw new Error('failed'); trackLead(eventId); alert('Заявка отправлена'); setForm({ name:'', phone:'', experience:'', goal:'', problem:'' }); } finally { setSending(false);} };

  return <main className="min-h-screen bg-background text-foreground overflow-x-hidden"><SEO title="Консультация таргетологам" description="Помогу таргетологу найти клиентов, упаковать кейсы и поднять чек" url="/consult" /><Navbar />
  <section className="relative pt-28 pb-14 md:pb-20"><div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-primary/10 to-secondary/15" /><div className="relative max-w-6xl mx-auto px-4 space-y-6"><h1 className="text-3xl sm:text-4xl md:text-6xl font-bold">Консультация для таргетолога: клиенты, чек, уверенные продажи</h1><p className="text-base md:text-lg text-muted-foreground max-w-4xl">Если умеете настраивать рекламу, но нестабильно с клиентами — соберем стратегию поиска, оффер и упаковку, чтобы вас покупали дороже и чаще.</p><a href="#lead"><Button size="lg" className="w-full sm:w-auto">Записаться на консультацию</Button></a></div></section>
  <section className="max-w-6xl mx-auto px-4 py-8 md:py-12 grid md:grid-cols-2 gap-4">{wins.map((w)=><motion.div key={w} whileHover={{ y:-4 }} className="rounded-2xl border bg-card/60 p-6"><h3 className="font-semibold mb-2">Результат консультации</h3><p className="text-sm text-muted-foreground">{w}</p></motion.div>)}</section>
  <section className="max-w-6xl mx-auto px-4 py-8 md:py-12"><h2 className="text-2xl md:text-3xl font-bold mb-4">Отзывы таргетологов</h2><div className="grid md:grid-cols-2 gap-4"><blockquote className="rounded-2xl border bg-card/60 p-6"><p className="text-sm md:text-base">“После консультации понял, как упаковать кейсы и поднять чек. За 3 недели закрыл двух клиентов.”</p><footer className="text-xs text-primary mt-3">— Артем, таргетолог</footer></blockquote><blockquote className="rounded-2xl border bg-card/60 p-6"><p className="text-sm md:text-base">“Получил рабочий скрипт диалога и стал чаще доводить лидов до созвона.”</p><footer className="text-xs text-primary mt-3">— София, media buyer</footer></blockquote></div></section>
  <section id="lead" className="max-w-3xl mx-auto px-4 py-12 md:py-14"><form onSubmit={submit} className="rounded-3xl border bg-card/60 p-6 md:p-8 space-y-4"><h2 className="text-2xl font-bold">Хочу консультацию</h2><Input required placeholder="Имя" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /><Input required placeholder="Telegram / WhatsApp" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} /><Input placeholder="Опыт в таргете" value={form.experience} onChange={(e)=>setForm({...form,experience:e.target.value})} /><Input placeholder="Цель (доход / клиенты / ниша)" value={form.goal} onChange={(e)=>setForm({...form,goal:e.target.value})} /><Textarea placeholder="Главная проблема сейчас" value={form.problem} onChange={(e)=>setForm({...form,problem:e.target.value})} /><Button className="w-full" disabled={sending}>{sending?'Отправка...':'Записаться'}</Button></form></section>
  <Footer /></main>;
}
