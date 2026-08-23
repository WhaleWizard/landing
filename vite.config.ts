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
  const localSiteContentPath = path.resolve(__dirname, 'data/site-content.local.json')
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

  const readSiteContentPayload = () => {
    if (!existsSync(localSiteContentPath)) return { sections: {} }
    try {
      const payload = JSON.parse(readFileSync(localSiteContentPath, 'utf8'))
      return payload?.schemaVersion === 1 && payload?.sections && typeof payload.sections === 'object'
        ? payload
        : { sections: {} }
    } catch {
      return { sections: {} }
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
          image: article?.image || '/og-image-v2.jpg',
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

    const publicArticles = normalized.filter(isVisibleArticle)
    const publicPayload = {
      ...payload,
      total: publicArticles.length,
      articles: publicArticles,
    }

    writeFileSync(localArticlesPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    // Drafts and scheduled posts remain private even in local development.
    // public/articles.seed.json is served without authentication.
    writeFileSync(publicSeedPath, `${JSON.stringify(publicPayload, null, 2)}\n`, 'utf8')
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
          const requestedSlug = String(url.searchParams.get('slug') || '').trim()
          if (requestedSlug) {
            const article = visibleArticles.find((item) => item?.slug === requestedSlug)
            sendJson(res, article ? 200 : 404, article ? { article } : { error: 'Article not found' })
            return
          }

          const articles = url.searchParams.get('view') === 'summary'
            ? visibleArticles.map((article) => ({ ...article, content: '', _summary: true }))
            : visibleArticles
          sendJson(res, 200, { articles })
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

        if (url.pathname === '/api/site-content' && req.method === 'GET') {
          const key = String(url.searchParams.get('key') || '')
          const payload = readSiteContentPayload()
          const content = payload.sections?.[key] || null
          sendJson(res, 200, {
            success: true,
            content,
            source: content ? 'production-snapshot' : 'static',
            fetchedAt: payload.fetchedAt || null,
            localOnly: true,
          })
          return
        }

        // Вход в админку. Настоящая сессия подписывается на сервере, а здесь
        // достаточно простой метки в cookie: смысл локального мока в том,
        // чтобы админка открывалась без Cloudflare, а не в том, чтобы
        // повторять криптографию. Двухфакторная защита локально недоступна —
        // её секрет живёт в D1.
        if (url.pathname === '/api/admin/auth' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const action = String(body?.action || 'login')
          const hasLocalSession = String(req.headers.cookie || '').includes('ww_admin_session=local-dev')

          if (action === 'status') {
            sendJson(res, 200, {
              success: true,
              authenticated: hasLocalSession,
              ...(hasLocalSession ? { twoFactor: { configured: false, enabled: false, backupCodesLeft: 0, migrationRequired: true } } : {}),
            })
            return
          }

          if (action === 'logout') {
            res.setHeader('Set-Cookie', 'ww_admin_session=; Path=/; Max-Age=0; SameSite=Strict')
            sendJson(res, 200, { success: true })
            return
          }

          if (action === 'login') {
            if (!verifyLocalPassword(body?.password)) {
              sendJson(res, 401, { success: false, error: 'invalid_credentials' })
              return
            }
            res.setHeader('Set-Cookie', 'ww_admin_session=local-dev; Path=/; Max-Age=43200; SameSite=Strict')
            sendJson(res, 200, { success: true, authenticated: true, twoFactor: { enabled: false } })
            return
          }

          sendJson(res, 503, {
            success: false,
            code: 'LOCAL_CLOUDFLARE_BINDINGS_UNAVAILABLE',
            error: 'Двухфакторная защита требует D1 — настраивается в Preview или Production.',
            localOnly: true,
          })
          return
        }

        // The Vite dev server intentionally has no Cloudflare D1/R2 bindings.
        // Return an honest JSON state instead of letting API requests fall through
        // to the SPA index.html with a misleading HTTP 200 response.
        if (url.pathname.startsWith('/api/admin/')) {
          const password = req.headers['x-admin-password']
          if (!verifyLocalPassword(password)) {
            sendJson(res, 401, { success: false, error: 'Unauthorized' })
            return
          }
          sendJson(res, 503, {
            success: false,
            code: 'LOCAL_CLOUDFLARE_BINDINGS_UNAVAILABLE',
            error: 'Cloudflare D1/R2 недоступны в локальном Vite. Проверьте этот раздел в Preview или Production после подключения bindings и применения миграций.',
            localOnly: true,
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
    // Пре-рендер читает манифест, чтобы поставить modulepreload на чанки
    // конкретного маршрута: без этого браузер узнаёт о них только после
    // разбора index.js и выстраивает загрузку лесенкой.
    manifest: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'vendor';
          if (/node_modules[\\/]motion/.test(id)) return 'motion';
          // Каждая иконка уезжала в собственный чанк по 300–700 байт: страница
          // статьи тянула около двадцати таких файлов отдельными запросами, и
          // на мобильной сети водопад стоил дороже самих иконок.
          if (/node_modules[\\/]lucide-react/.test(id)) return 'icons';
          return undefined;
        },
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv', '**/*.glb', '**/*.gltf'],
})
