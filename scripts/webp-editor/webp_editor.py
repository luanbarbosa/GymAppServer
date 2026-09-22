#!/usr/bin/env python3
"""WebP Editor - extract animated WebP frames to PNG, and merge PNG frames back into animated WebP."""

import glob
import json
import os
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image
from tkinterdnd2 import DND_FILES, TkinterDnD

META_FILENAME = "_webp_meta.json"
AFFINITY_APP = "Affinity"
APP_DIR = os.path.dirname(os.path.abspath(__file__))


def open_in_affinity(paths):
    if not paths:
        return
    subprocess.run(["open", "-a", AFFINITY_APP] + list(paths))


def detect_lossless(webp_path):
    """Heuristic: whichever image-data fourCC (VP8L=lossless, VP8 =lossy) appears
    first in the raw bytes wins. Defaults to lossless if neither is found."""
    with open(webp_path, "rb") as f:
        data = f.read()
    i_lossless = data.find(b"VP8L")
    i_lossy = data.find(b"VP8 ")
    if i_lossless == -1 and i_lossy == -1:
        return True
    if i_lossless == -1:
        return False
    if i_lossy == -1:
        return True
    return i_lossless < i_lossy


def extract_frames(webp_path, out_dir, progress_cb=None):
    im = Image.open(webp_path)
    n_frames = getattr(im, "n_frames", 1)

    durations = []
    loop = im.info.get("loop", 0)
    background = im.info.get("background")

    digits = max(4, len(str(n_frames)))
    for i in range(n_frames):
        im.seek(i)
        frame = im.convert("RGBA")
        frame.save(os.path.join(out_dir, f"frame_{i:0{digits}d}.png"))
        durations.append(im.info.get("duration", 100))
        if progress_cb:
            progress_cb(i + 1, n_frames)

    meta = {
        "source": os.path.basename(webp_path),
        "n_frames": n_frames,
        "loop": loop,
        "durations": durations,
        "background": background,
        "mode": im.mode,
        "lossless": detect_lossless(webp_path),
    }
    with open(os.path.join(out_dir, META_FILENAME), "w") as f:
        json.dump(meta, f, indent=2)

    return n_frames


MAX_OUTPUT_BYTES = 500 * 1024


def _save_webp(frames, out_path, duration, loop, lossless, quality):
    frames[0].save(
        out_path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=loop,
        lossless=lossless,
        quality=quality,
        method=6,
    )


def merge_frames(frames_dir, out_path, default_fps=10, progress_cb=None, stage_cb=None):
    files = sorted(
        f for f in os.listdir(frames_dir)
        if f.lower().endswith(".png")
    )
    if not files:
        raise ValueError("No PNG files found in that folder.")

    meta_path = os.path.join(frames_dir, META_FILENAME)
    meta = None
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)

    frames = []
    for i, name in enumerate(files):
        frames.append(Image.open(os.path.join(frames_dir, name)).convert("RGBA"))
        if progress_cb:
            progress_cb(i + 1, len(files))

    if meta and len(meta.get("durations", [])) == len(frames):
        durations = meta["durations"]
        loop = meta.get("loop", 0)
    else:
        durations = int(1000 / default_fps)
        loop = 0

    lossless = meta.get("lossless", True) if meta else True
    quality = 100 if lossless else 90

    if stage_cb:
        stage_cb("Encoding WebP...")
    _save_webp(frames, out_path, durations, loop, lossless, quality)

    if os.path.getsize(out_path) > MAX_OUTPUT_BYTES:
        for q in (85, 70, 55, 40, 25, 15):
            if stage_cb:
                stage_cb(f"File too large, compressing (quality {q})...")
            _save_webp(frames, out_path, durations, loop, False, q)
            if os.path.getsize(out_path) <= MAX_OUTPUT_BYTES:
                break

    return len(frames)


class DropZone(tk.Label):
    """Click-to-browse + drag-and-drop target."""

    def __init__(self, parent, text, on_path, browse_cmd):
        super().__init__(
            parent,
            text=text,
            bg="#f5f5f5",
            fg="#555555",
            relief="groove",
            borderwidth=2,
            height=3,
            wraplength=380,
            justify="center",
            cursor="hand2",
        )
        self.default_text = text
        self.on_path = on_path
        self.browse_cmd = browse_cmd

        self.bind("<Button-1>", lambda e: browse_cmd())

        self.drop_target_register(DND_FILES)
        self.dnd_bind("<<Drop>>", self._on_drop)
        self.dnd_bind("<<DragEnter>>", lambda e: self.config(bg="#dceeff"))
        self.dnd_bind("<<DragLeave>>", lambda e: self.config(bg="#f5f5f5"))

    def _on_drop(self, event):
        self.config(bg="#f5f5f5")
        paths = self.tk.splitlist(event.data)
        if paths:
            self.on_path(paths[0])

    def set_display(self, text):
        self.config(text=text, fg="#111111")


class App(TkinterDnD.Tk):
    def __init__(self):
        super().__init__()
        self.title("WebP Editor")
        self.geometry("440x320")
        self.resizable(False, False)

        self.frames_dir = None
        self.source_name = None

        self.drop = DropZone(
            self,
            "Drop a .webp file here\n(animated or static)\nor click to browse",
            self._handle_webp,
            self._choose_webp,
        )
        self.drop.pack(fill="both", expand=True, padx=14, pady=(14, 6))

        self.progress = ttk.Progressbar(self, mode="determinate")
        self.progress.pack(fill="x", padx=14, pady=(0, 4))

        self.status = ttk.Label(self, text="")
        self.status.pack(anchor="w", padx=14)

        self.merge_btn = ttk.Button(
            self, text="Merge to WebP", command=self._run_merge, state="disabled"
        )
        self.merge_btn.pack(pady=14)

    def _reset(self):
        self.frames_dir = None
        self.source_name = None
        self.drop.config(text=self.drop.default_text, fg="#555555")
        self.progress["value"] = 0
        self.status.config(text="")
        self.merge_btn.config(state="disabled")

    def _choose_webp(self):
        path = filedialog.askopenfilename(
            title="Choose WebP file",
            filetypes=[("WebP images", "*.webp"), ("All files", "*.*")],
        )
        if path:
            self._handle_webp(path)

    def _handle_webp(self, path):
        if os.path.isdir(path):
            messagebox.showerror("Invalid drop", "Drop a .webp file here, not a folder.")
            return
        if not path.lower().endswith(".webp"):
            messagebox.showerror("Invalid drop", "That file isn't a .webp image.")
            return

        self.drop.set_display(os.path.basename(path))
        self.merge_btn.config(state="disabled")
        self.status.config(text="Extracting...")

        name = os.path.splitext(os.path.basename(path))[0]
        out_dir = os.path.join(APP_DIR, name + "_frames")
        os.makedirs(out_dir, exist_ok=True)

        def progress(i, n):
            self.progress["maximum"] = n
            self.progress["value"] = i
            self.status.config(text=f"Extracting frame {i}/{n}...")

        def work():
            try:
                n = extract_frames(path, out_dir, progress_cb=progress)
                self.frames_dir = out_dir
                self.source_name = name
                pngs = sorted(glob.glob(os.path.join(out_dir, "*.png")))
                open_in_affinity(pngs)
                self.status.config(
                    text=f"{n} frame(s) open in Affinity. Edit, save, then click Merge."
                )
                self.merge_btn.config(state="normal")
            except Exception as e:
                self.status.config(text="Extraction failed.")
                messagebox.showerror("Extraction failed", str(e))

        threading.Thread(target=work, daemon=True).start()

    def _run_merge(self):
        if not self.frames_dir:
            return
        frames_dir = self.frames_dir
        out_path = os.path.join(APP_DIR, self.source_name + ".webp")

        self.merge_btn.config(state="disabled")

        def progress(i, n):
            self.progress["maximum"] = n
            self.progress["value"] = i
            self.status.config(text=f"Loading frame {i}/{n}...")

        def stage(text):
            if str(self.progress["mode"]) != "indeterminate":
                self.progress.config(mode="indeterminate")
                self.progress.start(12)
            self.status.config(text=text)

        def work():
            try:
                merge_frames(frames_dir, out_path, progress_cb=progress, stage_cb=stage)
                self.progress.stop()
                self.progress.config(mode="determinate")
                shutil.rmtree(frames_dir, ignore_errors=True)
                messagebox.showinfo("Done", f"Saved:\n{out_path}")
                self._reset()
            except Exception as e:
                self.progress.stop()
                self.progress.config(mode="determinate")
                self.status.config(text="Merge failed.")
                self.merge_btn.config(state="normal")
                messagebox.showerror("Merge failed", str(e))

        threading.Thread(target=work, daemon=True).start()


if __name__ == "__main__":
    app = App()
    app.mainloop()
