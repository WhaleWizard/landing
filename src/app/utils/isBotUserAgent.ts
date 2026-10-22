/**
 * Проверка User-Agent на поисковых и ИИ-роботов (F-076).
 * Тот же список, что и BOT_UA_PATTERN в functions/_lib/seo.ts.
 */
export const BOT_UA_PATTERN = /(googlebot|googleother|google-extended|google-inspectiontool|adsbot-google|mediapartners-google|storebot-google|feedfetcher-google|apis-google|google-safety|google-site-verification|googleweblight|bingbot|bingpreview|msnbot|adidxbot|yandex|duckduckbot|baiduspider|petalbot|slurp|facebot|facebookexternalhit|meta-externalagent|meta-externalfetcher|twitterbot|rogerbot|linkedinbot|embedly|quora\slink\spreview|slackbot|discordbot|telegrambot|whatsapp|viber|skypeuripreview|vkshare|mail\.ru|pinterest|redditbot|tiktokspider|applebot|ia_archiver|archive\.org_bot|gptbot|chatgpt-user|oai-searchbot|ccbot|claudebot|claude-(?:web|searchbot|user)|anthropic-ai|perplexitybot|perplexity-user|youbot|bytespider|cohere-ai|cohere-training-data-crawler|amazonbot|diffbot|timpibot|omgili|omgilibot|webzio-extended|semrushbot|ahrefsbot|mj12bot|dotbot|seekportbot|imagesiftbot|grok|xai-|mistralai-user|bravebot|bravesearch|duckassistbot|meta-webindexer)/i;

export function isBotUserAgent(userAgent?: string | null): boolean {
  if (!userAgent) return false;
  return BOT_UA_PATTERN.test(userAgent);
}
