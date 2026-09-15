#!/usr/bin/env bash
set -euo pipefail
out="${1:-test-results/linux-desktop}"
mkdir -p "$out"
export TERM=xterm-256color
export LANG=C.UTF-8
xterm -fa 'DejaVu Sans Mono' -fs 11 -geometry 140x42 -bg '#050507' -fg '#F5F5F7' -T 'Perfect Harness - native terminal - DEMO' -e node --experimental-ffi dist/cli/index.js --demo repair --motion off &
terminal_pid=$!
trap 'kill "$terminal_pid" 2>/dev/null || true' EXIT
sleep 5
window_id=$(xdotool search --sync --pid "$terminal_pid" --name 'Perfect Harness' | head -1)
if [ -z "$window_id" ]; then echo 'No actual xterm window found' >&2; exit 1; fi
import -window "$window_id" "$out/xterm-repair.png"
xwininfo -id "$window_id" > "$out/window.txt"
node --input-type=module - "$out" <<'JS'
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
await writeFile(join(process.argv[2],'provenance.json'),JSON.stringify({platform:process.platform,node:process.version,source:'actual xterm window on Xvfb, OS screenshot',scene:'synthetic repair fixture; no real providers',blur:'none; this terminal has no Acrylic compositor'},null,2));
JS
xdotool key --window "$window_id" ctrl+c
sleep 1
