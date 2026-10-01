#!/bin/bash
# Usage: lh-run.sh <outdir> <url...>
OUT=$1; shift
export CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
for url in "$@"; do
  name=$(echo "$url" | sed 's#http://localhost:4173##; s#[^a-zA-Z0-9]#_#g'); [ -z "$name" ] && name=home
  for mode in mobile; do
    npx --yes lighthouse@13.5.0 "$url" --quiet --only-categories=performance --preset=perf \
      --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" \
      --output=json --output-path="$OUT/$name-$mode.json" ${mode:+--form-factor=$mode} \
      $( [ "$mode" = desktop ] && echo "--preset=desktop" ) 2>"$OUT/$name-$mode.err" || echo "FAILED $url $mode"
    node -e '
      const r=require(process.argv[1]); const a=r.audits;
      const ms=k=>Math.round(a[k].numericValue);
      console.log(JSON.stringify({url:r.finalDisplayedUrl,score:Math.round(r.categories.performance.score*100),FCP:ms("first-contentful-paint"),LCP:ms("largest-contentful-paint"),TBT:ms("total-blocking-time"),CLS:a["cumulative-layout-shift"].numericValue.toFixed(3),SI:ms("speed-index"),TTI:a["interactive"]?ms("interactive"):null,bytes:ms("total-byte-weight"),mainThread:ms("mainthread-work-breakdown"),bootup:ms("bootup-time"),lcpEl:(a["largest-contentful-paint-element"].details?.items?.[0]?.items?.[0]?.node?.snippet||"").slice(0,120)}));
    ' "$OUT/$name-$mode.json" 2>/dev/null || echo "no summary for $name-$mode"
  done
done
echo DONE
