#!/usr/bin/env bash
# Converts every .gif in data/images to lossless animated .webp, then removes the .gif.
set -euo pipefail

IMAGES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/images"

if ! command -v gif2webp >/dev/null 2>&1; then
  echo "gif2webp not found. Install with: brew install webp" >&2
  exit 1
fi

shopt -s nullglob
gifs=("$IMAGES_DIR"/*.gif)

if [ ${#gifs[@]} -eq 0 ]; then
  echo "No .gif files found in $IMAGES_DIR"
  exit 0
fi

for gif in "${gifs[@]}"; do
  webp="${gif%.gif}.webp"
  echo "Converting $(basename "$gif") -> $(basename "$webp")"
  gif2webp -q 100 -m 6 "$gif" -o "$webp"
  rm "$gif"
done

echo "Done. Converted ${#gifs[@]} file(s)."
