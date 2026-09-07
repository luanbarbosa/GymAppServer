#!/usr/bin/env python3
"""Erase known brand watermarks from .webp images (static or animated),
auto-detecting which ones are actually present per image.

For animated webp, only the frames that actually paint a watermark box
are re-encoded; every other frame is copied through byte-for-byte.

Requires: `webpmux` and `cwebp` (brew install webp), and Pillow (pip install pillow).

Single file:
    python3 remove-webp-watermark.py IN.webp OUT.webp

Batch (scans a directory, patches in place, skips files with no known watermark):
    python3 remove-webp-watermark.py --batch catalog/images

Each watermark is defined by a reference crop under scripts/assets/, anchored to
a canvas corner (so it works regardless of the image's actual dimensions). The
reference is only used to detect *presence* (via a shift-tolerant IoU match) and
as a flood-fill seed -- the actual box that gets blanked is the true ink extent
of that corner's connected blob, found fresh per image. That way a bigger/smaller
rendering of the same brand mark still gets fully covered, not just the reference's
own footprint (which left fragments visible on marks that render larger).
"""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = SCRIPT_DIR / "assets"
SHIFT_WINDOW = 5  # px of slack for locating the reference match, since exports place it a few px off
DILATE = 4  # px to bridge letter/icon gaps when flood-filling the true watermark blob
PAD = 3  # px of extra margin around the discovered blob when blanking it
MAX_AREA_FRACTION = 0.6  # safety cap: if the flood-filled blob covers more than this
                          # fraction of the search window, distrust it (likely bled into
                          # real artwork) and fall back to the reference-sized box

# name, corner anchor ("tl" or "br"), reference crop file, IoU match threshold,
# allowed canvas sizes (None = any size; a set restricts detection to those exact
# (w, h) sizes -- needed when the watermark's ink pattern is thin enough that
# coincidental matches on unrelated corner content can otherwise clear a loose
# threshold; calibrated against this catalog, see scripts/README for the scan),
# and a generous search window (w, h) from that corner to flood-fill within --
# sized well beyond the reference so a larger rendering of the mark is still
# fully captured.
WATERMARKS = [
    {
        "name": "fitness-programer", "corner": "tl",
        "ref": ASSETS_DIR / "fitness-programer-watermark-ref.png",
        "threshold": 0.15, "sizes": {(360, 360), (360, 346)},
        "search": (220, 100),
    },
    {
        "name": "strength-level", "corner": "br",
        "ref": ASSETS_DIR / "strength-level-watermark-ref.png",
        "threshold": 0.5, "sizes": None,
        "search": (260, 100),
    },
]

FRAME_RE = re.compile(
    r"^\s*(\d+):\s+(\d+)\s+(\d+)\s+(yes|no)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\w+)\s+(yes|no)"
)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Command failed: {' '.join(cmd)}\n{r.stderr}")


def load_watermarks():
    wms = []
    for wm in WATERMARKS:
        ref = np.array(Image.open(wm["ref"]).convert("RGB"))
        mask = np.any(ref < 240, axis=2)  # ink pixels of the watermark
        wms.append({**wm, "mask": mask, "h": mask.shape[0], "w": mask.shape[1]})
    return wms


def detect(frame_rgb, wm, canvas_w, canvas_h):
    """Shift-tolerant match: slides the reference mask up to SHIFT_WINDOW px in
    from the anchored corner (different exports place the mark a few px off) and
    keeps the best IoU between candidate ink pixels and the reference ink mask.
    Returns the matched box in canvas coords if it clears the watermark's
    threshold, else None.
    """
    if wm["sizes"] is not None and (canvas_w, canvas_h) not in wm["sizes"]:
        return None
    w, h = wm["w"], wm["h"]
    mask = wm["mask"]
    H, W = frame_rgb.shape[:2]
    best_iou, best_box = 0.0, None
    for dy in range(0, SHIFT_WINDOW + 1):
        for dx in range(0, SHIFT_WINDOW + 1):
            if wm["corner"] == "tl":
                x0, y0 = dx, dy
            else:
                x0, y0 = canvas_w - w - dx, canvas_h - h - dy
            x1, y1 = x0 + w, y0 + h
            if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
                continue
            region = frame_rgb[y0:y1, x0:x1]
            ink = np.any(region < 240, axis=2)
            union = (ink | mask).sum()
            if union == 0:
                continue
            iou = (ink & mask).sum() / union
            if iou > best_iou:
                best_iou, best_box = iou, (x0, y0, x1, y1)
    return best_box if best_iou >= wm["threshold"] else None


def grow_watermark_bbox(frame_rgb, wm, seed_box, canvas_w, canvas_h):
    """Flood-fills the actual watermark blob starting from seed_box (the reference
    match), within a generous corner search window, and returns its tight ink
    bounding box in canvas coords (padded by PAD). Falls back to seed_box if the
    flood fill finds nothing or looks like it bled into real artwork.
    """
    sw, sh = wm["search"]
    if wm["corner"] == "tl":
        wx0, wy0 = 0, 0
    else:
        wx0, wy0 = max(0, canvas_w - sw), max(0, canvas_h - sh)
    wx1, wy1 = min(canvas_w, wx0 + sw), min(canvas_h, wy0 + sh)

    region = frame_rgb[wy0:wy1, wx0:wx1]
    ink = np.any(region < 240, axis=2)

    ink_img = Image.fromarray((ink * 255).astype(np.uint8))
    dilated = np.array(ink_img.filter(ImageFilter.MaxFilter(2 * DILATE + 1))) > 127

    Hh, Ww = dilated.shape
    sx0, sy0, sx1, sy1 = seed_box
    lsx0, lsy0 = max(0, sx0 - wx0), max(0, sy0 - wy0)
    lsx1, lsy1 = min(Ww, sx1 - wx0), min(Hh, sy1 - wy0)

    visited = np.zeros_like(dilated, dtype=bool)
    q = deque()
    for y in range(lsy0, lsy1):
        for x in range(lsx0, lsx1):
            if dilated[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    if not q:
        return seed_box

    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < Hh and 0 <= nx < Ww and dilated[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    if visited.mean() > MAX_AREA_FRACTION:
        return seed_box

    tight = ink & visited
    if not tight.any():
        return seed_box
    ys, xs = np.where(tight)
    y0, y1 = max(0, ys.min() - PAD), min(Hh, ys.max() + 1 + PAD)
    x0, x1 = max(0, xs.min() - PAD), min(Ww, xs.max() + 1 + PAD)
    return (wx0 + x0, wy0 + y0, wx0 + x1, wy0 + y1)


def get_first_frame_rgb(path):
    im = Image.open(path)
    im.seek(0)
    return np.array(im.convert("RGB")), im.size


def detect_boxes(path, wms, verbose=True):
    frame_rgb, (w, h) = get_first_frame_rgb(path)
    boxes, names = [], []
    for wm in wms:
        seed = detect(frame_rgb, wm, w, h)
        if seed:
            box = grow_watermark_bbox(frame_rgb, wm, seed, w, h)
            boxes.append(box)
            names.append(wm["name"])
            if verbose:
                print(f"  detected: {wm['name']} seed={seed} grown={box}")
    return boxes, names


def get_frames_info(path):
    out = subprocess.run(["webpmux", "-info", str(path)], capture_output=True, text=True).stdout
    frames = []
    for line in out.splitlines():
        m = FRAME_RE.match(line)
        if m:
            idx, w, h, alpha, x, y, dur, dispose, blend = m.groups()
            frames.append({
                "idx": int(idx), "w": int(w), "h": int(h), "alpha": alpha == "yes",
                "x": int(x), "y": int(y), "dur": int(dur),
                "dispose": 1 if dispose == "background" else 0,
                "blend": blend == "yes",
            })
    return frames


def blank_boxes(img, boxes, origin=(0, 0)):
    """Fill each box (in canvas coords) that intersects img, placed at origin, with
    white (opaque images) or transparent (alpha images). Returns patched img or None
    if nothing intersected."""
    ox, oy = origin
    fill = (0, 0, 0, 0) if img.mode == "RGBA" else (255, 255, 255)
    if img.mode not in ("RGBA",):
        img = img.convert("RGB")
    patched = None
    for bx0, by0, bx1, by1 in boxes:
        ix0, iy0 = max(bx0, ox), max(by0, oy)
        ix1, iy1 = min(bx1, ox + img.width), min(by1, oy + img.height)
        if ix1 > ix0 and iy1 > iy0:
            if patched is None:
                patched = img.copy()
            lx0, ly0, lx1, ly1 = ix0 - ox, iy0 - oy, ix1 - ox, iy1 - oy
            patched.paste(Image.new(img.mode, (lx1 - lx0, ly1 - ly0), fill), (lx0, ly0))
    return patched


def patch_static(src, dst, boxes):
    img = Image.open(src)
    patched = blank_boxes(img, boxes)
    patched.save(dst, lossless=True, quality=100, method=6)


def patch_animated(src, dst, boxes, frames, verbose=True):
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        frame_args = []
        for f in frames:
            fsrc = td / f"frame{f['idx']}.webp"
            run(["webpmux", "-get", "frame", str(f["idx"]), str(src), "-o", str(fsrc)])

            img = Image.open(fsrc)
            if f["alpha"]:
                img = img.convert("RGBA")
            patched = blank_boxes(img, boxes, origin=(f["x"], f["y"]))
            if patched is not None:
                fsrc = td / f"frame{f['idx']}_patched.webp"
                patched.save(fsrc, lossless=True, quality=100, method=6)
                if verbose:
                    print(f"  frame {f['idx']}: patched")

            blend_flag = "+b" if f["blend"] else "-b"
            frame_args += ["-frame", str(fsrc), f"+{f['dur']}+{f['x']}+{f['y']}+{f['dispose']}{blend_flag}"]

        if verbose:
            print(f"  reassembling {len(frames)} frames...")
        cmd = ["webpmux"] + frame_args + ["-loop", "0", "-o", str(dst)]
        run(cmd)


def process_one(src, dst, wms, verbose=True):
    im = Image.open(src)
    animated = getattr(im, "is_animated", False)

    boxes, names = detect_boxes(src, wms, verbose=verbose)
    if not boxes:
        return None

    if animated:
        frames = get_frames_info(src)
        if not frames:
            return None
        if verbose:
            print(f"  animated, {len(frames)} frames")
        patch_animated(src, dst, boxes, frames, verbose=verbose)
    else:
        if verbose:
            print("  static image")
        patch_static(src, dst, boxes)
    if verbose:
        print(f"patched: {src}")
    return names


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", type=Path)
    ap.add_argument("output", nargs="?", type=Path)
    ap.add_argument("--batch", type=Path, help="directory of .webp files to scan and patch in place")
    args = ap.parse_args()

    for tool in ("webpmux", "cwebp"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found. Install with: brew install webp")

    wms = load_watermarks()

    if args.batch:
        files = sorted(args.batch.glob("*.webp"))
        total = len(files)
        patched, skipped = 0, 0
        for i, f in enumerate(files, 1):
            print(f"[{i}/{total}] {f.name} ... ", end="", flush=True)
            with tempfile.TemporaryDirectory() as td:
                tmp_out = Path(td) / f.name
                names = process_one(f, tmp_out, wms, verbose=False)
                if names:
                    shutil.move(str(tmp_out), str(f))
                    patched += 1
                    print(f"patched ({', '.join(names)})")
                else:
                    skipped += 1
                    print("skipped (no known watermark)")
        print(f"Done. Patched {patched}, skipped {skipped}, total {total}.")
        return

    if not args.input or not args.output:
        sys.exit("Provide INPUT and OUTPUT, or use --batch DIR")

    if not process_one(args.input, args.output, wms):
        sys.exit(f"No known watermark detected in {args.input}; nothing written.")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
