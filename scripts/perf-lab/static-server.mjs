// Minimal static server for dist/ with brotli, directory index and 404.html — mirrors Cloudflare Pages closer than vite preview.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const ROOT = process.argv[2]; const PORT = Number(process.argv[3] || 4174);
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain','.ico':'image/x-icon','.gif':'image/gif'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(new URL(req.url,'http://x').pathname);
  if (p.startsWith('/api/')) { res.writeHead(404,{'content-type':'application/json'}); return res.end('{"success":false}'); }
  let file = path.join(ROOT, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  let status = 200;
  if (!fs.existsSync(file)) { file = path.join(ROOT,'404.html'); status = 404; }
  const ext = path.extname(file); const type = TYPES[ext] || 'application/octet-stream';
  const data = fs.readFileSync(file);
  const headers = {'content-type':type,'cache-control': p.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate'};
  const ae = req.headers['accept-encoding']||'';
  if (/\.(html|js|css|json|svg|xml|txt)$/.test(ext) && /br/.test(ae)) { headers['content-encoding']='br'; res.writeHead(status,headers); return res.end(zlib.brotliCompressSync(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:5}})); }
  if (/\.(html|js|css|json|svg|xml|txt)$/.test(ext) && /gzip/.test(ae)) { headers['content-encoding']='gzip'; res.writeHead(status,headers); return res.end(zlib.gzipSync(data)); }
  res.writeHead(status,headers); res.end(data);
}).listen(PORT, ()=>console.log('static on',PORT));
