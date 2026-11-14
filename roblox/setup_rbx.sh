#!/usr/bin/env bash
# New Roblox-style project: the normal kit project (tools/setup.sh) + the Roblox cast/world module, caption tools,
# fonts and the Roblox example story.
# Usage: bash <kit>/roblox/setup_rbx.sh ~/shorts/<slug>
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
P="${1:?usage: setup_rbx.sh <project dir>}"
FRESH=0; [ -f "$P/story.ts" ] || FRESH=1
bash "$KIT/tools/setup.sh" "$P"
mkdir -p "$P/engine/src/rbx" "$P/fonts"
cp "$KIT/roblox/src/"*.ts "$P/engine/src/rbx/"
cp "$KIT/roblox/tools/"* "$P/tools/"
cp "$KIT/roblox/assets/fonts/"* "$P/fonts/"
if [ "$FRESH" = "1" ]; then cp "$KIT/roblox/example/story.ts" "$P/story.ts"; fi
FILTERS=$(ffmpeg -hide_banner -filters 2>/dev/null || true); echo "$FILTERS" | grep -q " ass " || echo "WARNING: this ffmpeg has no libass: captions cannot be burned in"
cd "$P" && node tools/build.mjs
echo "roblox project ready: $P"
