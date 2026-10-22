const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../dist');
const DATA_DIR = path.resolve(__dirname, '../data');

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function startAuditServer(port = 4173) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Mock /api/site-content
    if (pathname === '/api/site-content') {
      const key = parsedUrl.searchParams.get('key');
      let siteContent = {};
      try {
        if (fs.existsSync(path.join(DATA_DIR, 'site-content.build.json'))) {
          siteContent = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'site-content.build.json'), 'utf8'));
        }
      } catch (e) {}

      const content = siteContent.sections?.[key] || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, version: 1, content }));
      return;
    }

    // Mock /api/articles
    if (pathname === '/api/articles') {
      let articles = [];
      try {
        if (fs.existsSync(path.join(DATA_DIR, 'articles.build.json'))) {
          articles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'articles.build.json'), 'utf8'));
        }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, articles }));
      return;
    }

    // Static file resolution
    let candidate = path.join(DIST_DIR, pathname);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      candidate = path.join(candidate, 'index.html');
    }

    if (!fs.existsSync(candidate)) {
      if (fs.existsSync(candidate + '.html')) {
        candidate = candidate + '.html';
      } else if (fs.existsSync(path.join(DIST_DIR, pathname, 'index.html'))) {
        candidate = path.join(DIST_DIR, pathname, 'index.html');
      } else {
        candidate = path.join(DIST_DIR, 'index.html');
      }
    }

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const mime = getMimeType(candidate);
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(candidate).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[AuditServer] Running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startAuditServer(4173);
} else {
  module.exports = { startAuditServer };
}
