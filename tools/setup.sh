#!/usr/bin/env bash
# Create (or refresh) a video project from this kit.
# Usage: bash <kit>/tools/setup.sh ~/shorts/<slug>
# Copies engine/ and tools/ into the project, adds web/index.html, a story.ts from the example (only if the
# project has none yet), installs three + postprocessing + esbuild, checks Playwright/Chromium and ffmpeg.
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
P="${1:?usage: setup.sh <project dir>}"
mkdir -p "$P"/{web,work,frames,stills,out}
rm -rf "$P/engine" "$P/tools"
cp -r "$KIT/engine" "$P/engine"
cp -r "$KIT/tools" "$P/tools"
cp "$KIT/engine/web/index.html" "$P/web/index.html"
[ -f "$P/story.ts" ] || cp "$KIT/example/story.ts" "$P/story.ts"
cd "$P"
[ -f package.json ] || echo '{"name":"short","private":true,"type":"module"}' > package.json
if [ ! -d node_modules/three ] || [ ! -d node_modules/postprocessing ] || [ ! -d node_modules/esbuild ]; then
  if [ -d "$KIT/vendor/node_modules" ]; then cp -r "$KIT/vendor/node_modules" ./node_modules
  else npm i --no-audit --no-fund three@0.169.0 postprocessing@6.36.4 esbuild@0.24 >/dev/null; fi
fi
node -e "import('playwright').catch(()=>import(require('child_process').execSync('npm root -g').toString().trim()+'/playwright/index.mjs')).then(()=>console.log('playwright ok')).catch(()=>{console.error('Playwright missing: npm i -g playwright && npx playwright install chromium');process.exit(1)})"
command -v ffmpeg >/dev/null || { echo "ffmpeg missing"; exit 1; }
python3 -c "import numpy, scipy, PIL" 2>/dev/null || pip install --break-system-packages -q numpy scipy pillow
node tools/build.mjs
echo "project ready: $P"
