#!/usr/bin/env node
// Upserts exercises from temp/new-update.json into catalog/exercises.json.
// Matches by "id": existing id -> edit (full replace), new id -> add.
// User is responsible for creating temp/new-update.json and adding any new
// images to catalog/images/ before running this.
//
// Usage:
//   node scripts/update-exercises.js
//   node scripts/update-exercises.js --input path/to/other.json
//   node scripts/update-exercises.js --no-image-check
//   node scripts/update-exercises.js --keep-input   (don't clear input file after success)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXERCISES_PATH = path.join(ROOT, "catalog", "exercises.json");
const IMAGES_DIR = path.join(ROOT, "catalog", "images");
const DEFAULT_INPUT_PATH = path.join(ROOT, "temp", "new-update.json");

const VALID_TYPES = new Set([
  "CORE",
  "FULL_BODY",
  "SHOULDERS",
  "CHEST",
  "BACK",
  "MOBILITY",
  "LEGS",
  "OTHER",
  "ARMS",
  "STRETCHING",
  "CARDIO",
]);

const VALID_METRIC_TYPES = new Set(["WEIGHT", "DURATION", "DISTANCE", "REPS"]);

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT_PATH, imageCheck: true, keepInput: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = path.resolve(argv[++i]);
    } else if (arg === "--no-image-check") {
      args.imageCheck = false;
    } else if (arg === "--keep-input") {
      args.keepInput = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function validateExercise(exercise, index) {
  const label = `entry #${index} (${exercise.id || exercise.name || "unknown"})`;
  const requiredFields = ["id", "imageFileId", "name", "namePT", "type", "trackedMetrics"];
  for (const field of requiredFields) {
    if (exercise[field] === undefined || exercise[field] === null) {
      fail(`${label} is missing required field "${field}"`);
    }
  }
  if (!VALID_TYPES.has(exercise.type)) {
    fail(`${label} has invalid type "${exercise.type}". Valid types: ${[...VALID_TYPES].join(", ")}`);
  }
  if (!Array.isArray(exercise.trackedMetrics) || exercise.trackedMetrics.length === 0) {
    fail(`${label} must have a non-empty trackedMetrics array`);
  }
  for (const metric of exercise.trackedMetrics) {
    if (!VALID_METRIC_TYPES.has(metric.type)) {
      fail(`${label} has invalid trackedMetrics type "${metric.type}". Valid: ${[...VALID_METRIC_TYPES].join(", ")}`);
    }
  }
  if (exercise.searchAlias === undefined) exercise.searchAlias = [];
  if (exercise.searchAliasPT === undefined) exercise.searchAliasPT = [];
  if (exercise.legacyImageId === undefined) exercise.legacyImageId = null;
}

function imageExists(imageFileId) {
  const files = fs.readdirSync(IMAGES_DIR);
  return files.some((f) => path.parse(f).name === imageFileId);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.input)) {
    fail(`Input file not found: ${path.relative(ROOT, args.input)}`);
  }

  const incoming = readJson(args.input);
  if (!Array.isArray(incoming)) {
    fail("Input file must be a JSON array of exercise objects");
  }
  if (incoming.length === 0) {
    console.log("Input file is empty, nothing to do.");
    return;
  }

  incoming.forEach(validateExercise);

  const existing = readJson(EXERCISES_PATH);
  const indexById = new Map(existing.map((e, i) => [e.id, i]));

  let added = 0;
  let edited = 0;
  const skippedImages = [];

  for (const exercise of incoming) {
    if (args.imageCheck && !imageExists(exercise.imageFileId)) {
      skippedImages.push(`${exercise.id} (${exercise.name}) -> imageFileId ${exercise.imageFileId}`);
      continue;
    }
    if (indexById.has(exercise.id)) {
      existing[indexById.get(exercise.id)] = exercise;
      edited++;
    } else {
      existing.push(exercise);
      indexById.set(exercise.id, existing.length - 1);
      added++;
    }
  }

  if (skippedImages.length > 0) {
    console.error("Skipped entries with missing images in catalog/images/:");
    for (const line of skippedImages) console.error(`  - ${line}`);
    if (added === 0 && edited === 0) {
      process.exit(1);
    }
  }

  fs.writeFileSync(EXERCISES_PATH, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Done. Added ${added}, edited ${edited}. Total exercises: ${existing.length}.`);

  if (!args.keepInput) {
    fs.writeFileSync(args.input, "[]\n");
    console.log(`Cleared ${path.relative(ROOT, args.input)}.`);
  }
}

main();
