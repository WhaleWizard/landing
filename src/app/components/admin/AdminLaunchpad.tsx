import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Filter,
  Layers,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { notify } from './AdminFeedback';

export type LaunchpadCategory = 'tracking' | 'landing' | 'creatives' | 'campaign' | 'legal';
export type LaunchpadPriority = 'critical' | 'important' | 'recommended';

export interface LaunchpadItem {
  id: string;
  title: string;
  desc: string;
  category: LaunchpadCategory;
  priority: LaunchpadPriority;
  checkUrl?: string;
  tip?: string;
  isCustom?: boolean;
}

export interface LaunchpadTemplate {
  id: string;
  name: string;
  targetBadge: string;
  description: string;
  items: LaunchpadItem[];
}

const TEMPLATES: LaunchpadTemplate[] = [
  {
    id: 'meta_leads',
    name: 'Meta Ads — Лидогенерация',
    targetBadge: 'Instagram / Facebook',
    description: 'Комплексный префлайт-чеклист для запуска лид-кампаний на сайт и Instant Forms',
    items: [
      {
        id: 'ml_meta_pixel',
        title: 'Meta Pixel установлен в <head> и шлет PageView',
        desc: 'Проверен расширением Meta Pixel Helper, статус зелёный, нет дублей base code',
        category: 'tracking',
        priority: 'critical',
        checkUrl: 'https://business.facebook.com/events_manager2/',
        tip: 'Убедитесь, что пиксель не грузится дважды через разные плагины или GTM.',
      },
      {
        id: 'ml_meta_capi',
        title: 'Meta CAPI (Conversions API) подключен и синхронизирован',
        desc: 'Серверные события Lead и PageView доходят с дедупликацией по event_id, EMQ (Event Quality) >= 8.0',
        category: 'tracking',
        priority: 'critical',
        tip: 'Сверьте дедупликацию в Test Events — серверное и браузерное события должны схлопываться в одно.',
      },
      {
        id: 'ml_gtm_ga4',
        title: 'GTM и GA4 настроены, поток данных активен',
        desc: 'Целевое действие generate_lead регистрируется в отчёте реального времени GA4',
        category: 'tracking',
        priority: 'important',
      },
      {
        id: 'ml_utm_template',
        title: 'Единый шаблон UTM-меток проверен в URL Parameters',
        desc: 'Шаблон utm_source=fb&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.id}}',
        category: 'tracking',
        priority: 'critical',
        tip: 'Не зашивайте UTM прямо в ссылку сайта в Ads Manager, используйте поле URL Parameters.',
      },
      {
        id: 'ml_speed_mobile',
        title: 'Скорость мобильной посадочной < 1.8с (LCP)',
        desc: 'Тест в PageSpeed Insights пройден, критические стили заинлайнены, картинки в WebP',
        category: 'landing',
        priority: 'critical',
        checkUrl: 'https://pagespeed.web.dev/',
        tip: '90%+ трафика Meta — мобильный. Медленная страница сольет 40% кликов до первой секунды.',
      },
      {
        id: 'ml_form_crm',
        title: 'Тестовая отправка формы сохраняется в CRM и дублируется',
        desc: 'Заявка падает в базу, приходит уведомление в Telegram/Email, менеджер получает контакты',
        category: 'landing',
        priority: 'critical',
      },
      {
        id: 'ml_thankyou_page',
        title: 'Страница «Спасибо» настроена и не индексируется',
        desc: 'Установлен noindex, отслеживается факт конверсии, есть кнопка перехода в соцсеть/мессенджер',
        category: 'landing',
        priority: 'important',
      },
      {
        id: 'ml_privacy_policy',
        title: 'Политика конфиденциальности доступна в 1 клик',
        desc: 'Ссылка есть под каждой формой и в подвале, чекбокс согласия на обработку данных активен',
        category: 'legal',
        priority: 'critical',
        tip: 'Без явного согласия и ссылки на политику модерация Meta может отклонить лид-форму.',
      },
      {
        id: 'ml_creatives_ratio',
        title: 'Креативы подготовлены в пропорциях 1:1, 4:5 и 9:16',
        desc: 'Главный посыл и текст не обрезаются интерфейсом Stories/Reels (безопасные зоны 250px сверху и снизу)',
        category: 'creatives',
        priority: 'important',
      },
      {
        id: 'ml_offer_clarity',
        title: 'Оффер сформулирован по формуле «Результат + Срок + Гарантия»',
        desc: 'Понятный USP, отсутствие двусмысленных обещаний ("100% за 1 день"), триггеры доверия на креативе',
        category: 'creatives',
        priority: 'important',
      },
      {
        id: 'ml_policy_compliance',
        title: 'Креативы проверены на запрещенные темы Advertising Standards',
        desc: 'Нет элементов "До/После", агрессивных стрелок на интимные зоны, фальшивых кнопок play, сенсаций',
        category: 'creatives',
        priority: 'critical',
        tip: 'Избегайте прямого обращения "У вас проблемы с долгами?" — формулируйте через "Как законно списать долги".',
      },
      {
        id: 'ml_daily_budget',
        title: 'Дневной бюджет рассчитан с запасом на обучение (50 конверсий / нед)',
        desc: 'Бюджет группы >= 5 × целевая стоимость лида (CPL) в сутки для стабильного прохождения фазы Learning',
        category: 'campaign',
        priority: 'important',
      },
      {
        id: 'ml_geo_exclusions',
        title: 'Геотаргетинг: выбраны «Люди, живущие здесь», исключены нецелевые регионы',
        desc: 'Убрана галочка "недавно бывавшие здесь", если бизнес оказывает услуги строго локально',
        category: 'campaign',
        priority: 'critical',
      },
      {
        id: 'ml_payment_method',
        title: 'Способ оплаты привязан, лимит аккаунта проверен',
        desc: 'Карта верифицирована, биллинг-порог установлен, баланс покрывает 3-5 дней открутки',
        category: 'campaign',
        priority: 'critical',
      },
    ],
  },
  {
    id: 'google_search',
    name: 'Google Ads — Поиск и PMax',
    targetBadge: 'Google Search / PMax',
    description: 'Чек-лист для запуска поисковых кампаний, смарт-баннеров и Performance Max',
    items: [
      {
        id: 'gs_conversion_tag',
        title: 'Тег конверсии Google Ads (Gtag/GTM) отправляет Enhanced Conversions',
        desc: 'Успешная отправка подтверждена в Google Tag Assistant, хешированные email/phone передаются',
        category: 'tracking',
        priority: 'critical',
        checkUrl: 'https://tagassistant.google.com/',
      },
      {
        id: 'gs_negative_keywords',
        title: 'Списки минус-слов привязаны на уровне кампании/аккаунта',
        desc: 'Базовый список нецелевых запросов ("бесплатно", "скачать", "своими руками", "вакансии", "реферат")',
        category: 'campaign',
        priority: 'critical',
        tip: 'Обязательно проверьте, чтобы минус-слова с широким соответствием случайно не заблокировали целевые ключи.',
      },
      {
        id: 'gs_ad_extensions',
        title: 'Настроены расширения (Assets): быстрые ссылки, уточнения, номер телефона',
        desc: 'Минимум 4 быстрые ссылки с описаниями, 4 уточнения и структурированные описания',
        category: 'creatives',
        priority: 'important',
      },
      {
        id: 'gs_landing_relevance',
        title: 'Релевантность посадочной страницы (Ad Relevance Score)',
        desc: 'H1 и текст посадочной напрямую отвечают на поисковый запрос группы объявлений',
        category: 'landing',
        priority: 'critical',
      },
      {
        id: 'gs_bid_strategy',
        title: 'Выбрана адекватная стратегия назначения ставок',
        desc: 'Для старта без истории: "Максимум кликов" с ограничением макс. цены клика, либо ручной CPC',
        category: 'campaign',
        priority: 'important',
      },
      {
        id: 'gs_search_partners',
        title: 'Отключены поисковые партнеры и КМС в поисковой кампании',
        desc: 'Сняты галочки "Включать поисковых партнеров Google" и "Включать контекстно-медийную сеть"',
        category: 'campaign',
        priority: 'critical',
        tip: 'Поисковые партнеры и КМС в обычной поисковой кампании часто дают мусорный кликфрод.',
      },
      {
        id: 'gs_geo_presence',
        title: 'Геолокация: настройка «Присутствие: Пользователи в целевом местоположении»',
        desc: 'Запрещен показ тем, кто только проявляет интерес к локации из других стран/городов',
        category: 'campaign',
        priority: 'critical',
      },
    ],
  },
  {
    id: 'express_audit',
    name: 'Экспресс-аудит проекта клиента',
    targetBadge: 'Аудит / Онбординг',
    description: 'Быстрая диагностика готовности инфраструктуры нового клиента к приёму платного трафика',
    items: [
      {
        id: 'ea_access_bm',
        title: 'Выданы партнерские доступы в Business Manager / Ads Manager',
        desc: 'Доступ сотрудника или через Business ID агентства с правами рекламодателя (не администратора)',
        category: 'campaign',
        priority: 'critical',
      },
      {
        id: 'ea_domain_verification',
        title: 'Домен верифицирован в Meta Business Manager через DNS TXT',
        desc: 'Статус домена "Подтвержден", настроена конфигурация агрегированных событий (AEM)',
        category: 'tracking',
        priority: 'important',
      },
      {
        id: 'ea_crm_speed',
        title: 'Скорость обработки лида отделом продаж < 15 минут',
        desc: 'Регламент обработки лидов согласован с клиентом, автоответчик в мессенджере включен',
        category: 'landing',
        priority: 'critical',
        tip: 'Даже идеальный маркетинг бесполезен, если клиент перезванивает через 6 часов.',
      },
      {
        id: 'ea_ssl_cert',
        title: 'SSL-сертификат сайта валиден и автообновляется',
        desc: 'Нет смешанного контента (HTTP ресурсов на HTTPS), перенаправление 301 работает корректно',
        category: 'landing',
        priority: 'critical',
      },
      {
        id: 'ea_unit_economics',
        title: 'Согласованы допустимая стоимость заявки (CPL) и маржинальность',
        desc: 'Зафиксированы плановый средний чек, конверсия отдела продаж в сделку и точка безубыточности',
        category: 'campaign',
        priority: 'critical',
      },
    ],
  },
];

const CATEGORY_NAMES: Record<LaunchpadCategory, string> = {
  tracking: 'Трекинг и аналитика',
  landing: 'Посадочная страница',
  creatives: 'Креативы и оффер',
  campaign: 'Кампания и биллинг',
  legal: 'Юридические требования',
};

export default function AdminLaunchpad() {
  const [activeTemplateId, setActiveTemplateId] = useState<string>('meta_leads');
  const [clientName, setClientName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Custom items added by user
  const [customItems, setCustomItems] = useState<Record<string, LaunchpadItem[]>>({});
  
  // Checked state: { [templateId]: { [itemId]: boolean } }
  const [checkedMap, setCheckedMap] = useState<Record<string, Record<string, boolean>>>({});

  // New item modal / form state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCat, setNewItemCat] = useState<LaunchpadCategory>('tracking');
  const [newItemPri, setNewItemPri] = useState<LaunchpadPriority>('important');

  // Load state from localStorage on initial render
  useEffect(() => {
    try {
      const savedChecked = localStorage.getItem('ww_launchpad_checked');
      if (savedChecked) setCheckedMap(JSON.parse(savedChecked));
      const savedCustom = localStorage.getItem('ww_launchpad_custom');
      if (savedCustom) setCustomItems(JSON.parse(savedCustom));
      const savedClient = localStorage.getItem('ww_launchpad_client');
      if (savedClient) setClientName(savedClient);
    } catch {
      // ignore
    }
  }, []);

  // Save checked state
  const toggleItem = useCallback((itemId: string) => {
    setCheckedMap((prev) => {
      const currentTemplateMap = prev[activeTemplateId] || {};
      const updated = {
        ...prev,
        [activeTemplateId]: {
          ...currentTemplateMap,
          [itemId]: !currentTemplateMap[itemId],
        },
      };
      try {
        localStorage.setItem('ww_launchpad_checked', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, [activeTemplateId]);

  // Handle client name change
  const handleClientNameChange = (val: string) => {
    setClientName(val);
    try {
      localStorage.setItem('ww_launchpad_client', val);
    } catch {
      // ignore
    }
  };

  const currentTemplate = useMemo(() => {
    return TEMPLATES.find((t) => t.id === activeTemplateId) || TEMPLATES[0];
  }, [activeTemplateId]);

  const allItemsForTemplate = useMemo(() => {
    const base = currentTemplate.items;
    const customs = customItems[activeTemplateId] || [];
    return [...base, ...customs];
  }, [currentTemplate, customItems, activeTemplateId]);

  const activeChecked = useMemo(() => {
    return checkedMap[activeTemplateId] || {};
  }, [checkedMap, activeTemplateId]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItemsForTemplate.filter((item) => {
      const isChecked = Boolean(activeChecked[item.id]);

      if (priorityFilter === 'critical' && item.priority !== 'critical') return false;
      if (priorityFilter === 'pending' && isChecked) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;

      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        (item.tip && item.tip.toLowerCase().includes(q))
      );
    });
  }, [allItemsForTemplate, activeChecked, priorityFilter, categoryFilter, searchQuery]);

  // Stats
  const totalCount = allItemsForTemplate.length;
  const completedCount = allItemsForTemplate.filter((i) => activeChecked[i.id]).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const criticalItems = allItemsForTemplate.filter((i) => i.priority === 'critical');
  const criticalCompleted = criticalItems.filter((i) => activeChecked[i.id]).length;
  const hasCriticalPending = criticalCompleted < criticalItems.length;

  // Add custom item
  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const newItem: LaunchpadItem = {
      id: `custom_${Date.now()}`,
      title: newItemTitle.trim(),
      desc: newItemDesc.trim(),
      category: newItemCat,
      priority: newItemPri,
      isCustom: true,
    };

    setCustomItems((prev) => {
      const updated = {
        ...prev,
        [activeTemplateId]: [...(prev[activeTemplateId] || []), newItem],
      };
      try {
        localStorage.setItem('ww_launchpad_custom', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });

    setNewItemTitle('');
    setNewItemDesc('');
    setIsAddingItem(false);
    notify.success('Пункт добавлен в чек-лист');
  };

  // Remove custom item
  const handleRemoveCustomItem = (itemId: string) => {
    setCustomItems((prev) => {
      const updated = {
        ...prev,
        [activeTemplateId]: (prev[activeTemplateId] || []).filter((i) => i.id !== itemId),
      };
      try {
        localStorage.setItem('ww_launchpad_custom', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    notify.info('Пункт удален');
  };

  // Reset checklist
  const handleResetChecklist = () => {
    if (!window.confirm('Сбросить все отметки выполнения в этом чек-листе?')) return;
    setCheckedMap((prev) => {
      const updated = {
        ...prev,
        [activeTemplateId]: {},
      };
      try {
        localStorage.setItem('ww_launchpad_checked', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    notify.info('Отметки сброшены');
  };

  // Copy launchpad report
  const handleCopyReport = async () => {
    const dateStr = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let report = `🚀 ПРЕФЛАЙТ-ОТЧЕТ ГОТОВНОСТИ К ЗАПУСКУ\n`;
    report += `Кампания: ${currentTemplate.name}\n`;
    if (clientName) report += `Проект: ${clientName}\n`;
    report += `Дата проверки: ${dateStr}\n`;
    report += `Готовность: ${progressPercent}% (${completedCount}/${totalCount})\n`;
    report += `Критичные точки: ${criticalCompleted}/${criticalItems.length} закрыто\n\n`;

    const categories: LaunchpadCategory[] = ['tracking', 'landing', 'creatives', 'campaign', 'legal'];
    for (const cat of categories) {
      const catItems = allItemsForTemplate.filter((i) => i.category === cat);
      if (catItems.length === 0) continue;

      report += `📁 ${CATEGORY_NAMES[cat].toUpperCase()}:\n`;
      for (const item of catItems) {
        const isDone = Boolean(activeChecked[item.id]);
        const icon = isDone ? '✅' : item.priority === 'critical' ? '🛑 [КРИТИЧНО]' : '⏳';
        report += `  ${icon} ${item.title}\n`;
      }
      report += `\n`;
    }

    if (hasCriticalPending) {
      report += `⚠️ ВНИМАНИЕ: Перед включением рекламы устраните критичные блокираторы!\n`;
    } else {
      report += `✨ Все критичные проверки пройдены. Запуск разрешен!\n`;
    }

    try {
      await navigator.clipboard.writeText(report);
      notify.success('Отчет скопирован в буфер обмена');
    } catch {
      notify.error('Не удалось скопировать отчет');
    }
  };

  return (
    <div className="admin-launchpad-container">
      {/* Top Header */}
      <div className="admin-launchpad-header">
        <div className="admin-launchpad-title-group">
          <div className="admin-launchpad-icon-wrap">
            <Rocket className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <div className="admin-launchpad-badge-row">
              <span className="admin-launchpad-pill">Launchpad 2.0</span>
              <span className="admin-launchpad-badge-sub">Префлайт-контроль</span>
            </div>
            <h2 className="admin-launchpad-heading">Чек-листы запуска рекламы</h2>
          </div>
        </div>

        <div className="admin-launchpad-actions">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={handleCopyReport}
            title="Скопировать текстовый отчет для клиента или рабочего чата"
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Копировать отчёт
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={handleResetChecklist}
            title="Сбросить все отметки в текущем чек-листе"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сброс
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => setIsAddingItem(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Добавить пункт
          </button>
        </div>
      </div>

      {/* Template Selector Tabs */}
      <div className="admin-launchpad-templates">
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            type="button"
            className={`admin-launchpad-template-card ${
              activeTemplateId === tmpl.id ? 'active' : ''
            }`}
            onClick={() => setActiveTemplateId(tmpl.id)}
          >
            <div className="admin-launchpad-tmpl-top">
              <span className="admin-launchpad-tmpl-name">{tmpl.name}</span>
              <span className="admin-launchpad-tmpl-target">{tmpl.targetBadge}</span>
            </div>
            <p className="admin-launchpad-tmpl-desc">{tmpl.description}</p>
          </button>
        ))}
      </div>

      {/* Progress & Readiness Banner */}
      <div className="admin-launchpad-status-card">
        <div className="admin-launchpad-status-main">
          <div className="admin-launchpad-progress-ring-box">
            <div className="admin-launchpad-progress-num">{progressPercent}%</div>
            <div className="admin-launchpad-progress-label">Готовность</div>
          </div>

          <div className="admin-launchpad-progress-details">
            <div className="admin-launchpad-progress-bar-wrap">
              <div
                className={`admin-launchpad-progress-bar-fill ${
                  progressPercent === 100
                    ? 'complete'
                    : hasCriticalPending
                    ? 'danger'
                    : 'progressing'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="admin-launchpad-stats-row">
              <span className="admin-launchpad-stat-item">
                Выполнено: <strong>{completedCount}</strong> из <strong>{totalCount}</strong>
              </span>
              <span className="admin-launchpad-stat-divider">•</span>
              <span
                className={`admin-launchpad-stat-item ${
                  hasCriticalPending ? 'text-red-400 font-semibold' : 'text-emerald-400'
                }`}
              >
                {hasCriticalPending ? (
                  <>
                    <ShieldAlert className="h-4 w-4 inline mr-1 text-red-400" />
                    Критичные блокираторы: {criticalItems.length - criticalCompleted} не закрыто
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 inline mr-1 text-emerald-400" />
                    Все критичные точки закрыты ({criticalCompleted}/{criticalItems.length})
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Client Name Input */}
        <div className="admin-launchpad-client-input-wrap">
          <label className="admin-launchpad-client-label">Проект / Кампания:</label>
          <input
            type="text"
            className="admin-input admin-launchpad-client-input"
            placeholder="Например: Клиент Smile Dent / Лидген Meta"
            value={clientName}
            onChange={(e) => handleClientNameChange(e.target.value)}
          />
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="admin-launchpad-toolbar">
        <div className="admin-launchpad-search">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="admin-launchpad-search-input"
            placeholder="Поиск по чек-листу или подсказкам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="admin-launchpad-filters">
          <div className="admin-launchpad-filter-group">
            <Filter className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
            <select
              className="admin-launchpad-select"
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as 'all' | 'critical' | 'pending')
              }
            >
              <option value="all">Все приоритеты</option>
              <option value="critical">Только критичные 🛑</option>
              <option value="pending">Незавершенные ⏳</option>
            </select>
          </div>

          <div className="admin-launchpad-filter-group">
            <Layers className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
            <select
              className="admin-launchpad-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">Все категории</option>
              <option value="tracking">Трекинг и CAPI</option>
              <option value="landing">Посадочная страница</option>
              <option value="creatives">Креативы и оффер</option>
              <option value="campaign">Кампания и биллинг</option>
              <option value="legal">Юридические</option>
            </select>
          </div>
        </div>
      </div>

      {/* Checklist Items Container */}
      <div className="admin-launchpad-items-list">
        {filteredItems.length === 0 ? (
          <div className="admin-launchpad-empty">
            <Sparkles className="h-8 w-8 text-slate-500 mb-2" />
            <p className="text-slate-300 font-medium">Нет пунктов по выбранным фильтрам</p>
            <p className="text-xs text-slate-500 mt-1">
              Попробуйте сбросить поисковый запрос или фильтр приоритета
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isDone = Boolean(activeChecked[item.id]);

            return (
              <div
                key={item.id}
                className={`admin-launchpad-item ${isDone ? 'done' : ''} ${
                  item.priority === 'critical' && !isDone ? 'critical-pending' : ''
                }`}
                onClick={() => toggleItem(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggleItem(item.id);
                  }
                }}
              >
                {/* Checkbox */}
                <div className="admin-launchpad-item-check-col">
                  {isDone ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0 animate-scale-in" />
                  ) : (
                    <Circle className="h-6 w-6 text-slate-600 flex-shrink-0 hover:text-slate-400 transition-colors" />
                  )}
                </div>

                {/* Content */}
                <div className="admin-launchpad-item-content">
                  <div className="admin-launchpad-item-header">
                    <span
                      className={`admin-launchpad-item-title ${isDone ? 'line-through text-slate-500' : ''}`}
                    >
                      {item.title}
                    </span>

                    <div className="admin-launchpad-item-badges" onClick={(e) => e.stopPropagation()}>
                      {item.priority === 'critical' && (
                        <span className="admin-launchpad-badge-crit">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          Критично
                        </span>
                      )}
                      <span className="admin-launchpad-badge-cat">
                        {CATEGORY_NAMES[item.category]}
                      </span>
                      {item.isCustom && (
                        <button
                          type="button"
                          className="admin-launchpad-btn-del"
                          title="Удалить пользовательский пункт"
                          onClick={() => handleRemoveCustomItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-slate-500 hover:text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p
                    className={`admin-launchpad-item-desc ${isDone ? 'text-slate-600' : 'text-slate-400'}`}
                  >
                    {item.desc}
                  </p>

                  {/* Advice / Tip & Check Tool Link */}
                  {(item.tip || item.checkUrl) && (
                    <div
                      className="admin-launchpad-item-footer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.tip && (
                        <span className="admin-launchpad-item-tip">
                          💡 <strong>Совет:</strong> {item.tip}
                        </span>
                      )}
                      {item.checkUrl && (
                        <a
                          href={item.checkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-launchpad-item-link"
                        >
                          Открыть инструмент проверки
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal for Adding Custom Item */}
      {isAddingItem && (
        <div className="admin-modal-overlay" onClick={() => setIsAddingItem(false)}>
          <div
            className="admin-modal-card admin-launchpad-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Добавить пункт в чек-лист</h3>
              <button
                type="button"
                className="admin-btn-icon"
                onClick={() => setIsAddingItem(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomItem} className="admin-launchpad-modal-form">
              <div className="admin-form-group">
                <label className="admin-label">Название пункта *</label>
                <input
                  type="text"
                  required
                  className="admin-input"
                  placeholder="Например: Проверен автоответчик в WhatsApp при заявке"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Описание и критерий готовности</label>
                <textarea
                  className="admin-input admin-textarea"
                  rows={2}
                  placeholder="Что именно проверить и какой ожидаемый результат..."
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                />
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group flex-1">
                  <label className="admin-label">Категория</label>
                  <select
                    className="admin-input"
                    value={newItemCat}
                    onChange={(e) => setNewItemCat(e.target.value as LaunchpadCategory)}
                  >
                    <option value="tracking">Трекинг и аналитика</option>
                    <option value="landing">Посадочная страница</option>
                    <option value="creatives">Креативы и оффер</option>
                    <option value="campaign">Кампания и биллинг</option>
                    <option value="legal">Юридические требования</option>
                  </select>
                </div>

                <div className="admin-form-group flex-1">
                  <label className="admin-label">Приоритет</label>
                  <select
                    className="admin-input"
                    value={newItemPri}
                    onChange={(e) => setNewItemPri(e.target.value as LaunchpadPriority)}
                  >
                    <option value="critical">Критично (Блокиратор) 🛑</option>
                    <option value="important">Важно ⚡</option>
                    <option value="recommended">Рекомендовано 💡</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal-actions mt-4">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsAddingItem(false)}
                >
                  Отмена
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Сохранить пункт
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
