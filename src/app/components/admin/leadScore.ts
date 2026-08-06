/**
 * Автооценка лида: 0–100 по тем сигналам, которые реально пришли с заявкой.
 *
 * Оценка не ставится молча — она предлагается рядом с ручным ползунком и
 * всегда объясняет себя списком причин. Никакой «магии» и скрытых моделей:
 * маркетолог должен понимать, почему один лид выше другого, и иметь право
 * не согласиться.
 */

export interface ScorableLead {
  budget?: string;
  message?: string;
  service?: string;
  email?: string;
  phone?: string;
  telegram_username?: string;
  submissions_count?: number;
  utm_source?: string;
  marketing_consent?: number;
  quality?: string;
}

export interface LeadScoreSuggestion {
  score: number;
  reasons: string[];
}

/**
 * Бюджет приходит строкой вида «$1к-10к» или «до 500». Берём наибольшее
 * число в строке: верхняя граница вилки честнее описывает потолок сделки,
 * а «к»/«k» после числа означает тысячи.
 */
function budgetPoints(budget: string): { points: number; label: string } {
  const text = String(budget || '').toLowerCase();
  if (!text.trim()) return { points: 0, label: '' };

  let max = 0;
  const matches = text.matchAll(/(\d+(?:[.,]\d+)?)\s*([кk])?/g);
  for (const match of matches) {
    const value = Number(String(match[1]).replace(',', '.')) * (match[2] ? 1000 : 1);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  if (max <= 0) return { points: 0, label: '' };
  if (max >= 50_000) return { points: 30, label: 'крупный бюджет' };
  if (max >= 10_000) return { points: 24, label: 'бюджет выше среднего' };
  if (max >= 5_000) return { points: 18, label: 'средний бюджет' };
  if (max >= 1_000) return { points: 12, label: 'небольшой бюджет' };
  return { points: 6, label: 'бюджет минимальный' };
}

export function suggestLeadScore(lead: ScorableLead): LeadScoreSuggestion {
  const reasons: string[] = [];
  let score = 0;

  const budget = budgetPoints(lead.budget || '');
  if (budget.points) {
    score += budget.points;
    reasons.push(`${budget.label} (+${budget.points})`);
  }

  // Чем больше рабочих каналов связи, тем выше шанс вообще дозвониться.
  const channels: Array<[string, string, number]> = [
    [String(lead.phone || '').trim(), 'оставил телефон', 10],
    [String(lead.telegram_username || '').trim(), 'оставил Telegram', 8],
    [String(lead.email || '').trim(), 'оставил почту', 6],
  ];
  for (const [value, label, points] of channels) {
    if (!value) continue;
    score += points;
    reasons.push(`${label} (+${points})`);
  }

  const repeats = Number(lead.submissions_count || 0);
  if (repeats > 1) {
    score += 10;
    reasons.push(`обращался ${repeats} раза — уже тёплый (+10)`);
  }

  const message = String(lead.message || '').trim();
  if (message.length >= 80) {
    score += 10;
    reasons.push('подробно описал задачу (+10)');
  } else if (message.length >= 30) {
    score += 5;
    reasons.push('написал по делу (+5)');
  }

  if (String(lead.service || '').trim()) {
    score += 5;
    reasons.push('выбрал услугу (+5)');
  }

  if (String(lead.utm_source || '').trim()) {
    score += 5;
    reasons.push('пришёл с размеченного источника (+5)');
  }

  if (Number(lead.marketing_consent || 0) === 1) {
    score += 6;
    reasons.push('дал согласие на маркетинг — можно догревать (+6)');
  }

  const quality = String(lead.quality || '').toLowerCase();
  if (quality === 'qualified') {
    score += 10;
    reasons.push('отмечен целевым (+10)');
  } else if (quality === 'unqualified') {
    // Нецелевой лид не должен выглядеть перспективным из-за бюджета и каналов.
    score = Math.min(score, 15);
    reasons.push('отмечен нецелевым — оценка ограничена');
  }

  // Шаг ползунка в карточке — пять единиц, подгоняем под него.
  const capped = Math.max(0, Math.min(100, score));
  return { score: Math.round(capped / 5) * 5, reasons };
}
