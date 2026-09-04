#!/usr/bin/env bash
# Converts every non-.webp image in catalog/images to lossless .webp (animated
# .gif stays animated), then removes the original.
set -euo pipefail

IMAGES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/catalog/images"

for cmd in gif2webp cwebp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd not found. Install with: brew install webp" >&2
    exit 1
  fi
done

shopt -s nullglob nocaseglob
files=("$IMAGES_DIR"/*.gif "$IMAGES_DIR"/*.jpg "$IMAGES_DIR"/*.jpeg "$IMAGES_DIR"/*.png "$IMAGES_DIR"/*.avif)
shopt -u nocaseglob

if [ ${#files[@]} -eq 0 ]; then
  echo "No convertible images found in $IMAGES_DIR"
  exit 0
fi

converted=0
for f in "${files[@]}"; do
  ext="${f##*.}"
  ext_lower="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
  webp="${f%.*}.webp"

  echo "Converting $(basename "$f") -> $(basename "$webp")"
  case "$ext_lower" in
    gif)
      gif2webp -q 100 -m 6 "$f" -o "$webp"
      ;;
    avif)
      if ! command -v ffmpeg >/dev/null 2>&1; then
        echo "ffmpeg not found (needed for .avif). Install with: brew install ffmpeg" >&2
        exit 1
      fi
      tmp_png="${f%.*}.tmp.png"
      ffmpeg -y -loglevel error -i "$f" "$tmp_png"
      cwebp -lossless -q 100 -m 6 "$tmp_png" -o "$webp"
      rm "$tmp_png"
      ;;
    *)
      cwebp -lossless -q 100 -m 6 "$f" -o "$webp"
      ;;
  esac
  rm "$f"
  converted=$((converted + 1))
done

echo "Done. Converted $converted file(s)."
