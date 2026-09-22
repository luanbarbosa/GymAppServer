#!/usr/bin/env node
// Writes catalog/manifest.json with content hashes so clients can detect changes
// without downloading the catalog or images.
//
//   version  - changes when anything in the catalog changes (cheap top-level check)
//   catalog  - hash of exercises.json
//   images   - per-image hash keyed by imageFileId (images are edited in place,
//              so the client needs this to know which cached images are stale)
//
// Runs as the Cloudflare Pages build command; the output is not committed.
//
// Usage:
//   node scripts/build-manifest.js

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_DIR = path.join(ROOT, "catalog");
const EXERCISES_PATH = path.join(CATALOG_DIR, "exercises.json");
const IMAGES_DIR = path.join(CATALOG_DIR, "images");
const MANIFEST_PATH = path.join(CATALOG_DIR, "manifest.json");

function hash(data) {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function main() {
  const catalog = hash(fs.readFileSync(EXERCISES_PATH));

  const images = {};
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => name.endsWith(".webp"))
    .sort();
  for (const name of files) {
    images[path.basename(name, ".webp")] = hash(fs.readFileSync(path.join(IMAGES_DIR, name)));
  }

  const version = hash(JSON.stringify({ catalog, images }));
  const manifest = { version, catalog, images };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}: version ${version}, ${files.length} images`);
}

main();
