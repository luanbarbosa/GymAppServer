#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input.webp> <output.webp>" >&2
  exit 1
fi

IN="$1"
OUT="$2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REALESRGAN="$SCRIPT_DIR/bin/realesrgan-ncnn-vulkan"
MODEL_DIR="$SCRIPT_DIR/bin/models"
MODEL="realesrgan-x4plus-anime"
MAX_WIDTH=1024

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

magick "$IN" -coalesce "$TMP/frame-%03d.png"

loop=$(webpmux -info "$IN" | awk -F'Loop Count : ' '/Loop Count/{print $2}')
durations=($(webpmux -info "$IN" | awk '/^[[:space:]]*[0-9]+:/{print $7}'))

args=(-loop "$loop")
i=0
for frame in "$TMP"/frame-*.png; do
  up="${frame%.png}-up.webp"
  "$REALESRGAN" -i "$frame" -o "$up" -n "$MODEL" -m "$MODEL_DIR" -s 4 >/dev/null 2>&1
  width=$(identify -format "%w" "$up")
  if [ "$width" -gt "$MAX_WIDTH" ]; then
    magick "$up" -resize "${MAX_WIDTH}x" "$up"
  fi
  args+=(-d "${durations[$i]}" "$up")
  i=$((i + 1))
done

img2webp "${args[@]}" -o "$OUT" >/dev/null 2>&1

echo "Done: $OUT"
