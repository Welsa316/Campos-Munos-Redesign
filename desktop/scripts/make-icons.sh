#!/bin/sh
# Rebuilds the app icons in build/ from the portal's favicon. Run on macOS
# (needs sips, iconutil and python3 with Pillow) only when the logo changes;
# the outputs are committed so builds on other machines do not need this.
set -eu
cd "$(dirname "$0")/.."
SRC=../admin/public/favicon-512.png
OUT=build
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp "$SRC" "$OUT/icon.png"

# macOS icons sit inside a margin (about 80% of the canvas) so the Dock
# shows them at the same size as other apps; the favicon is full-bleed.
python3 - "$SRC" "$TMP/mac-1024.png" <<'PY'
import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert('RGBA')
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
body = src.resize((824, 824), Image.LANCZOS)
canvas.paste(body, (100, 100), body)
canvas.save(sys.argv[2])
PY

SET="$TMP/icon.iconset"
mkdir "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/mac-1024.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d "$TMP/mac-1024.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$OUT/icon.icns"

# Windows .ico with the sizes Explorer, the taskbar and the installer use.
python3 - "$SRC" "$OUT/icon.ico" <<'PY'
import sys
from PIL import Image
Image.open(sys.argv[1]).convert('RGBA').save(sys.argv[2], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
PY

# Files the running app loads itself go in assets/, which is packaged
# (build/ is only read by electron-builder). Tray / menu bar icons come in
# 16 px and 32 px for high-density screens; icon.png is the toast image.
sips -z 16 16 "$SRC" --out assets/tray.png >/dev/null
sips -z 32 32 "$SRC" --out assets/tray@2x.png >/dev/null
cp "$SRC" assets/icon.png
echo "Icons written to $OUT/ and assets/"
