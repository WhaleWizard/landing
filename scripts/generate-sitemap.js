// scripts/generate-sitemap.js
import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';
const SITE_URL = 'https://whalewzrd.com';

async function generateSitemap() {
    try {
        const res = await fetch(BIN_URL);
        const data = await res.json();
        const articles = data.record || [];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/blog</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;

        articles.forEach(article => {
            xml += `
  <url>
    <loc>${SITE_URL}/blog/${article.slug}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        });

        const staticPages = ['services', 'calculator', 'roi-calculator', 'privacy-policy', 'offer', 'cookie-policy'];
        staticPages.forEach(page => {
            xml += `
  <url>
    <loc>${SITE_URL}/${page}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;
        });

        xml += `
</urlset>`;

        const outputPath = join(__dirname, '..', 'public', 'sitemap.xml');
        writeFileSync(outputPath, xml, 'utf8');
        console.log('✅ Sitemap generated at', outputPath);
    } catch (err) {
        console.error('❌ Failed to generate sitemap:', err);
        process.exit(1);
    }
}

generateSitemap();
