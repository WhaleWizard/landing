import { defineConfig } from 'vite'
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

function localArticlesApi() {
  const localArticlesPath = path.resolve(__dirname, 'data/articles.local.json')
  const publicSeedPath = path.resolve(__dirname, 'public/articles.seed.json')
  const localAdminPassword = process.env.LOCAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin'
  const protectedArticleSlug = 'kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh'

  const sendJson = (res, status, payload) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload, null, 2))
  }

  const readJsonBody = (req) => new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })

  const readPayload = () => {
    const sourcePath = [localArticlesPath, publicSeedPath].find((filePath) => existsSync(filePath))
    if (!sourcePath) return { source: 'local-dev-empty', total: 0, articles: [] }

    try {
      const payload = JSON.parse(readFileSync(sourcePath, 'utf8'))
      const articles = Array.isArray(payload?.articles) ? payload.articles : []
      return {
        source: payload?.source || 'local-dev',
        fetchedAt: payload?.fetchedAt || new Date().toISOString(),
        updatedAt: payload?.updatedAt || payload?.fetchedAt || new Date().toISOString(),
        total: articles.length,
        articles,
      }
    } catch {
      return { source: 'local-dev-invalid', total: 0, articles: [] }
    }
  }

  const comparableArticle = (article) => ({
    slug: article?.slug || '',
    title: article?.title || '',
    category: article?.category || '',
    readTime: article?.readTime || '',
    date: article?.date || '',
    description: article?.description || '',
    content: article?.content || '',
    image: article?.image || '',
    seoTitle: article?.seoTitle || '',
    seoDescription: article?.seoDescription || '',
    publishedAt: article?.publishedAt || '',
    tags: article?.tags || [],
    summary: article?.summary || '',
    keyTakeaways: article?.keyTakeaways || [],
    faq: article?.faq || [],
    status: article?.status || 'published',
  })

  const didArticleChange = (previous, next) => {
    if (!previous) return true
    return JSON.stringify(comparableArticle(previous)) !== JSON.stringify(comparableArticle(next))
  }

  const isProtectedArticleUnchanged = (existingArticles, incomingArticles) => {
    const currentProtected = existingArticles.find((article) => article?.slug === protectedArticleSlug)
    if (!currentProtected) return true

    const nextProtected = incomingArticles.find((article) => article?.slug === protectedArticleSlug)
    if (!nextProtected) return false

    return !didArticleChange(currentProtected, nextProtected)
  }

  const writePayload = (articles, previousArticles = []) => {
    const nowIso = new Date().toISOString()
    const previousBySlug = new Map(previousArticles.map((article) => [article?.slug, article]))
    const normalized = Array.isArray(articles)
      ? articles.map((article, index) => {
        const previous = previousBySlug.get(article?.slug)
        const changed = didArticleChange(previous, article)
        return {
          ...article,
          id: index + 1,
          status: article?.status === 'draft' ? 'draft' : 'published',
          image: article?.image || '/og-image.jpg',
          publishedAt: article?.publishedAt || previous?.publishedAt || nowIso,
          updatedAt: changed ? nowIso : (previous?.updatedAt || previous?.publishedAt || nowIso),
        }
      })
      : []
    const payload = {
      source: 'local-dev-admin',
      fetchedAt: nowIso,
      updatedAt: nowIso,
      total: normalized.length,
      articles: normalized,
    }

    writeFileSync(localArticlesPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    writeFileSync(publicSeedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return payload
  }

  const isVisibleArticle = (article) => {
    if (article?.status === 'draft') return false
    if (article?.publishedAt && article.publishedAt > new Date().toISOString()) return false
    return true
  }

  const verifyLocalPassword = (password) => String(password || '') === localAdminPassword

  return {
    name: 'local-articles-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')

        if (url.pathname === '/api/articles' && req.method === 'GET') {
          const payload = readPayload()
          const visibleArticles = payload.articles
            .filter(isVisibleArticle)
            .sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0))
          sendJson(res, 200, { articles: visibleArticles })
          return
        }

        if (url.pathname === '/api/health/content' && req.method === 'GET') {
          const payload = readPayload()
          sendJson(res, 200, {
            ok: true,
            source: payload.source,
            articlesCount: payload.articles.length,
            timestamp: new Date().toISOString(),
          })
          return
        }

        if (url.pathname === '/api/admin/articles' && req.method === 'POST') {
          const body = await readJsonBody(req)
          sendJson(res, verifyLocalPassword(body?.password) ? 200 : 401, {
            success: verifyLocalPassword(body?.password),
            error: verifyLocalPassword(body?.password) ? undefined : 'Unauthorized',
          })
          return
        }

        if (url.pathname === '/api/admin/articles' && req.method === 'GET') {
          const password = req.headers['x-admin-password']
          if (!verifyLocalPassword(password)) {
            sendJson(res, 401, { success: false, error: 'Unauthorized' })
            return
          }
          const payload = readPayload()
          sendJson(res, 200, { success: true, articles: payload.articles })
          return
        }

        if (url.pathname === '/api/admin/articles' && req.method === 'PUT') {
          const body = await readJsonBody(req)
          if (!verifyLocalPassword(body?.password)) {
            sendJson(res, 401, { success: false, error: 'Unauthorized' })
            return
          }
          if (!Array.isArray(body?.articles)) {
            sendJson(res, 400, { success: false, error: 'Invalid payload: articles[] required' })
            return
          }
          const currentPayload = readPayload()
          if (!isProtectedArticleUnchanged(currentPayload.articles, body.articles)) {
            sendJson(res, 409, {
              success: false,
              error: `Protected article "${protectedArticleSlug}" cannot be changed through admin updates`,
            })
            return
          }
          const payload = writePayload(body.articles, currentPayload.articles)
          sendJson(res, 200, {
            success: true,
            articles: payload.articles,
            cacheInvalidationAttempted: false,
            siteUrlUsed: 'http://localhost:5173',
            requestOrigin: 'http://localhost:5173',
            invalidatedPathsCount: 0,
            invalidationTargetsCount: 0,
            invalidationFailedCount: 0,
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    localArticlesApi(),
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
          motion: ['motion'],
          tiptap: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image'],
        },
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv', '**/*.glb', '**/*.gltf'],
})
