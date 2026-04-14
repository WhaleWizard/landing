import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import SEO from '../components/SEO';

export default function CookiePolicy() {
  const navigate = useNavigate();

  const goHome = () => {
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <SEO
        title="Политика использования файлов cookie"
        description="Управление cookie на сайте Whale Wzrd. Вы можете контролировать их использование."
        url="/cookie-policy"
      />
      <section className="min-h-screen bg-background py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Кнопка "На главную" — над заголовком, слева */}
          <div className="mb-6">
            <button
              onClick={goHome}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-none"
            >
              ← На главную
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold">
              Политика<span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent"> использования файлов cookie</span>
            </h1>
            <p className="text-muted-foreground mt-4">Дата последнего обновления: 12 апреля 2026 г.</p>
          </motion.div>

          <div className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary max-w-none space-y-6">
            <p>Сайт <a href="https://whalewzrd.com">https://whalewzrd.com</a> использует файлы cookie и аналогичные технологии для сбора статистики, улучшения работы и показа релевантной рекламы.</p>

            <h2>1. Какие cookie мы используем</h2>
            <ul>
              <li><strong>Необходимые cookie</strong> – обеспечивают работу сайта (отправку форм, навигацию). Не требуют согласия.</li>
              <li><strong>Аналитические cookie</strong> – Google Analytics, собирают обезличенную информацию о посещениях.</li>
              <li><strong>Маркетинговые cookie</strong> – Meta Pixel, Google Ads, позволяют показывать вам релевантную рекламу в соцсетях.</li>
            </ul>
            <p>Подробный список cookie (названия, сроки хранения) можно посмотреть в настройках вашего браузера или через баннер управления cookie.</p>

            <h2>2. Управление cookie</h2>
            <p>При первом посещении сайта вы увидите баннер, где можете дать или отказать согласие на использование аналитических и маркетинговых cookie. Вы также можете изменить настройки в любое время через ссылку в подвале сайта или через настройки браузера.</p>

            <h2>3. Отказ от cookie</h2>
            <p>Вы можете заблокировать или удалить cookie через настройки вашего браузера. Обратите внимание, что некоторые функции сайта могут работать некорректно.</p>

            <h2>4. Ответственность</h2>
            <p>Мы не несём ответственности за работу сторонних сервисов (Google, Meta и др.), которые устанавливают свои cookie. Информация о них регулируется их политиками конфиденциальности.</p>

            <h2>5. Контакты</h2>
            <p>По вопросам cookie вы можете написать нам: <a href="mailto:whalewzrd@gmail.com">whalewzrd@gmail.com</a> или в Telegram <a href="https://t.me/white_rsh">@white_rsh</a>.</p>
          </div>
        </div>
      </section>
    </>
  );
}