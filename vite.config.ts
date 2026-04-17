import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { viteSSG } from 'vite-plugin-ssg-spa'

// ... (figmaAssetResolver остаётся)

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
    viteSSG({
      routes: ['/', '/services', '/calculator', '/roi-calculator', '/blog'],
      dynamicRoutes: async () => {
        // Загружаем статьи из jsonbin.io
        const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest'
        const res = await fetch(BIN_URL)
        const data = await res.json()
        const articles = data.record || []
        return articles.map(article => `/blog/${article.slug}`)
      }
    })
  ],
  // остальное без изменений
})
