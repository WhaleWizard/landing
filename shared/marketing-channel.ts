/**
 * Канал рекламы по UTM-меткам — одно правило для «UTM-кампаний» (сервер) и
 * графика каналов «Воронки» (браузер) (CL-01).
 *
 * Раньше было два разных правила: сервер искал слова через `\b`, который в
 * JS считает «_» частью слова и не видит кириллицу (`google_ads` и
 * `facebook_ads` уходили в «Другое», «органика» не распознавалась никогда), а
 * браузер искал подстроки (`instant_offer` становился Meta по «inst»,
 * `outgoing_mail` — Telegram по «tg»). Теперь метка режется на слова по любым
 * не-буквам и не-цифрам, и сравниваются целые слова.
 *
 * Источник важнее кампании: `telegram` с кампанией `promo-cpc` — это
 * Telegram. «cpc» — тип оплаты, а не площадка, и каналом не считается.
 */
export type MarketingChannel = 'meta' | 'google' | 'telegram' | 'organic' | 'other';

const CHANNEL_WORDS: Array<[Exclude<MarketingChannel, 'other'>, ReadonlySet<string>]> = [
  ['meta', new Set(['meta', 'facebook', 'fb', 'instagram', 'insta', 'inst', 'ig'])],
  ['google', new Set(['google', 'googleads', 'gads', 'adwords', 'pmax'])],
  ['telegram', new Set(['telegram', 'tg'])],
  ['organic', new Set(['organic', 'seo', 'органика', 'органический', 'органическая'])],
];

/** Слова метки: латиница, кириллица и цифры; «_», «-», «/», пробелы — границы. */
export function channelWords(value: string): string[] {
  return String(value || '').toLowerCase().split(/[^a-zа-яё0-9]+/u).filter(Boolean);
}

function channelOf(words: string[]): MarketingChannel | null {
  for (const [channel, set] of CHANNEL_WORDS) {
    if (words.some((word) => set.has(word))) return channel;
  }
  return null;
}

export function classifyChannel(source: string, medium = '', campaign = ''): MarketingChannel {
  return channelOf(channelWords(source))
    ?? channelOf([...channelWords(medium), ...channelWords(campaign)])
    ?? 'other';
}
