/**
 * Скрипт анализа выдачи Bing (SERP, Snippets, People Also Ask) через Bing Web Search API.
 * 
 * Использование:
 *   node scripts/scout-bing.mjs --query "продвижение мобильных приложений meta ads"
 * 
 * Переменная окружения:
 *   BING_SEARCH_API_KEY - ключ Azure Cognitive Services
 */

const query = process.argv.find((arg, i, arr) => arr[i - 1] === '--query') || process.argv[2];

if (!query) {
  console.log(`
Использование:
  node scripts/scout-bing.mjs --query "таргетированная реклама инфобизнес"

Параметры:
  --query    Поисковый запрос для анализа топа выдачи и связанных вопросов
`);
  process.exit(0);
}

const BING_KEY = process.env.BING_SEARCH_API_KEY;

if (!BING_KEY) {
  console.log(`
[Инфо] BING_SEARCH_API_KEY не задан в окружении.
Для подключения:
1. Создайте ресурс "Bing Search v7" в Microsoft Azure Portal (portal.azure.com).
2. Скопируйте ключ подписки (Key 1 или Key 2).
3. Передайте через переменную окружения:
   $env:BING_SEARCH_API_KEY="ваш_ключ_azure"
`);
  process.exit(0);
}

async function runBingScout() {
  const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=10&mkt=ru-RU`;
  
  try {
    const res = await fetch(endpoint, {
      headers: { 'Ocp-Apim-Subscription-Key': BING_KEY }
    });
    
    if (!res.ok) {
      throw new Error(`Bing API error ${res.status}: ${await res.text()}`);
    }
    
    const data = await res.json();
    console.log(`\n=== Результаты Bing для: "${query}" ===\n`);
    
    if (data.webPages?.value) {
      console.log('--- Топ-10 страниц конкурентов: ---');
      data.webPages.value.forEach((page, idx) => {
        console.log(`\n${idx + 1}. ${page.name}`);
        console.log(`   URL: ${page.url}`);
        console.log(`   Сниппет: ${page.snippet}`);
      });
    }
    
    if (data.relatedSearches?.value) {
      console.log('\n--- Связанные поисковые запросы (LSI / People Also Ask): ---');
      data.relatedSearches.value.forEach(item => {
        console.log(` • ${item.text}`);
      });
    }
  } catch (err) {
    console.error('Ошибка при запросе к Bing API:', err.message);
  }
}

runBingScout();
