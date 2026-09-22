#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="$SCRIPT_DIR/../../catalog/images"
REALESRGAN="$SCRIPT_DIR/bin/realesrgan-ncnn-vulkan"
ANIM_SCRIPT="$SCRIPT_DIR/upscale-animated-webp.sh"
MODEL_DIR="$SCRIPT_DIR/bin/models"
MODEL="realesrgan-x4plus-anime"
MIN_WIDTH=600
MAX_WIDTH=1024
TMP_OUT="$(mktemp -d)"
trap 'rm -rf "$TMP_OUT"' EXIT

files=("$IMAGES_DIR"/*.webp)
total=${#files[@]}
converted=0
done=0

for f in "${files[@]}"; do
  done=$((done + 1))
  frames=$(identify "$f" 2>/dev/null | wc -l | tr -d ' ')
  width=$(identify -format "%w" "$f[0]" 2>/dev/null || echo 0)

  if [ "$width" -lt "$MIN_WIDTH" ]; then
    out="$TMP_OUT/$(basename "$f")"
    if [ "$frames" -gt 1 ]; then
      "$ANIM_SCRIPT" "$f" "$out" >/dev/null 2>&1
    else
      "$REALESRGAN" -i "$f" -o "$out" -n "$MODEL" -m "$MODEL_DIR" -s 4 >/dev/null 2>&1
      new_width=$(identify -format "%w" "$out[0]")
      if [ "$new_width" -gt "$MAX_WIDTH" ]; then
        magick "$out" -resize "${MAX_WIDTH}x" "$out"
      fi
    fi
    mv "$out" "$f"
    converted=$((converted + 1))
  fi

  pct=$(( done * 100 / total ))
  printf "\rConverted: %d/%d total (%d%% processed)" "$converted" "$total" "$pct"
done

echo
