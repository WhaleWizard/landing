const fs=require('fs');
for (const f of process.argv.slice(2)) {
  try {
    const r=JSON.parse(fs.readFileSync(f,'utf8')); const a=r.audits||{};
    const ms=k=>a[k]&&Number.isFinite(a[k].numericValue)?Math.round(a[k].numericValue):null;
    let lcpEl='';
    try { lcpEl = (a['largest-contentful-paint-element'].details.items[0].items[0].node.snippet||'').slice(0,100); } catch {}
    console.log(JSON.stringify({file:f.split('/').pop(),score:r.categories&&r.categories.performance?Math.round(r.categories.performance.score*100):null,FCP:ms('first-contentful-paint'),LCP:ms('largest-contentful-paint'),TBT:ms('total-blocking-time'),CLS:a['cumulative-layout-shift']?a['cumulative-layout-shift'].numericValue.toFixed(3):null,SI:ms('speed-index'),bytes:ms('total-byte-weight'),mainThread:ms('mainthread-work-breakdown'),bootup:ms('bootup-time'),lcpEl, runtimeError: r.runtimeError&&r.runtimeError.message}));
  } catch(e){ console.log(f,'ERR',e.message); }
}
