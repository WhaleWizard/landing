/**
 * Поиск дублей контактов среди заявок.
 *
 * На приёме заявка дедуплицируется по точному совпадению email, телефона или
 * телеграма — но один и тот же человек приходит то с почтой, то с телефоном,
 * то пишет номер в другом формате. Здесь контакты нормализуются и заявки
 * связываются в группы: совпал хотя бы один канал — это один человек.
 *
 * Телефон сравнивается по последним десяти цифрам: +7 999 123-45-67 и
 * 8 (999) 123-45-67 — один и тот же номер, а код страны пишут по-разному.
 */

export interface DuplicateCandidate {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  telegram_username?: string;
  created_at?: string;
}

function normalizeEmail(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value?: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function normalizeTelegram(value?: string): string {
  return String(value || '').trim().toLowerCase().replace(/^@/, '');
}

export function contactKeys(lead: DuplicateCandidate): string[] {
  const keys: string[] = [];
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  const telegram = normalizeTelegram(lead.telegram_username);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  if (telegram) keys.push(`tg:${telegram}`);
  return keys;
}

/**
 * Группы из двух и более заявок, которые выглядят как один человек.
 * Внутри группы заявки идут от самой ранней к поздней: первая — та, в
 * которой накопилась история, её и логично оставить основной.
 */
export function findDuplicateGroups<T extends DuplicateCandidate>(leads: T[]): T[][] {
  const parent = new Map<number, number>();

  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as number;
    // Путь сжимаем, чтобы повторные поиски не ходили по цепочке заново.
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) as number;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  leads.forEach((lead) => parent.set(lead.id, lead.id));

  const seen = new Map<string, number>();
  leads.forEach((lead) => {
    contactKeys(lead).forEach((key) => {
      const owner = seen.get(key);
      if (owner === undefined) seen.set(key, lead.id);
      else union(owner, lead.id);
    });
  });

  const groups = new Map<number, T[]>();
  leads.forEach((lead) => {
    if (!contactKeys(lead).length) return;
    const root = find(lead.id);
    const group = groups.get(root);
    if (group) group.push(lead);
    else groups.set(root, [lead]);
  });

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id - b.id));
}
