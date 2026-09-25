const CATALOG_URL = "https://gymnerd-catalog.pages.dev";
const TYPES = ["LEGS", "ARMS", "BACK", "CORE", "CHEST", "SHOULDERS", "FULL_BODY", "CARDIO", "STRETCHING", "MOBILITY", "OTHER"];
const REPORTS_KEY = "gymnerd.accuracy.reports";
const TYPE_DECISIONS_KEY = "gymnerd.accuracy.typeDecisions";
const MERGE_DECISIONS_KEY = "gymnerd.accuracy.mergeDecisions";
const TAB_KEY = "gymnerd.accuracy.tab";

const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const sourceFilter = document.getElementById("source-filter");
const undecidedOnly = document.getElementById("undecided-only");
const promptPanel = document.getElementById("prompt-panel");
const promptEl = document.getElementById("prompt");
const warningsEl = document.getElementById("warnings");
const zoom = document.getElementById("zoom");
const toast = document.getElementById("toast");

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Could not save to localStorage");
  }
}

let exercises = [];
let byId = new Map();
// { fileName: markdown }
let reports = load(REPORTS_KEY, {});
// Exercise id -> chosen type (equal to the current type when the reviewer kept it).
let typeDecisions = load(TYPE_DECISIONS_KEY, {});
// Duplicate group key -> { keep: id, merge: [ids] } or { skip: true }.
let mergeDecisions = load(MERGE_DECISIONS_KEY, {});
let tab = load(TAB_KEY, "types");
let typeItems = [];
let duplicateItems = [];

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
}

function imageUrl(imageFileId) {
  return `${CATALOG_URL}/images/${imageFileId}.webp`;
}

// ---------- Markdown parsing ----------

function cleanCell(text) {
  return text.replace(/\*\*/g, "").replace(/`/g, "").replace(/fileciteturn\S*/g, "").trim();
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanCell);
}

// Returns every pipe table in the document as { headers, rows }, with lowercased headers.
function parseTables(markdown) {
  const lines = markdown.split("\n");
  const tables = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith("|") || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) continue;
    const headers = splitRow(lines[i]).map((h) => h.toLowerCase());
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith("|"); j++) {
      const cells = splitRow(lines[j]);
      rows.push(Object.fromEntries(headers.map((h, k) => [h, cells[k] ?? ""])));
    }
    tables.push({ headers, rows });
    i = j - 1;
  }
  return tables;
}

// Splits a cell holding several exercise names: "['A', 'B']", "A; B" or "A / B".
function splitNames(cell) {
  if (!cell || cell === "—" || cell === "-") return [];
  const quoted = [...cell.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
  if (cell.trim().startsWith("[") && quoted.length) return quoted;
  return cell.split(/;|\s\/\s/).map((s) => s.trim()).filter(Boolean);
}

function findHeader(headers, regex) {
  return headers.find((h) => regex.test(h));
}

function typesIn(text) {
  const found = [];
  for (const m of text.matchAll(/\b(full[_ ]body|legs|arms|back|core|chest|shoulders|cardio|stretching|mobility|other)\b/gi)) {
    const type = m[1].toUpperCase().replace(" ", "_");
    if (!found.includes(type)) found.push(type);
  }
  return found;
}

// Category the report was written for, from its file name (e.g. "full_body_type_verification.md" -> FULL_BODY).
function reportType(fileName) {
  const lower = fileName.toLowerCase();
  return TYPES.find((t) => lower.startsWith(t.toLowerCase()));
}

// ---------- Exercise matching ----------

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

let nameIndex = new Map();
let aliasIndex = new Map();

function buildIndexes() {
  nameIndex = new Map();
  aliasIndex = new Map();
  const add = (index, key, ex) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    if (!index.get(key).includes(ex)) index.get(key).push(ex);
  };
  for (const ex of exercises) {
    add(nameIndex, normalize(ex.name), ex);
    for (const alias of ex.searchAlias || []) add(aliasIndex, normalize(alias), ex);
  }
}

// Prefers exact name matches, then alias matches; within those, exercises of the report's category.
function matchExercise(name, preferredType) {
  const key = normalize(name);
  for (const index of [nameIndex, aliasIndex]) {
    const candidates = index.get(key);
    if (!candidates?.length) continue;
    return candidates.find((ex) => ex.type === preferredType) || candidates[0];
  }
  return null;
}

// ---------- Building review items ----------

function buildItems() {
  typeItems = [];
  duplicateItems = [];
  const seenTypeIds = new Map();
  const seenGroups = new Set();

  for (const [file, markdown] of Object.entries(reports).sort()) {
    const preferredType = reportType(file);
    for (const { headers, rows } of parseTables(markdown)) {
      const exerciseA = findHeader(headers, /^exercise a$/);
      const exerciseB = findHeader(headers, /^exercise b$/);
      const variants = findHeader(headers, /variant/);
      const groupNames = findHeader(headers, /^exercises$/);
      const suggested = findHeader(headers, /(suggested|recommended)[ _]type|alternative/);
      const exerciseCol = findHeader(headers, /^(exercise|exercises)$/);
      const infoCols = headers.filter((h) => ![exerciseA, exerciseB, variants, groupNames, exerciseCol, suggested].includes(h));

      if ((exerciseA && exerciseB) || (groupNames && !suggested)) {
        for (const row of rows) {
          const names = exerciseA
            ? [row[exerciseA], row[exerciseB], ...splitNames(row[variants])].flatMap(splitNames)
            : splitNames(row[groupNames]);
          const members = [...new Set(names)].map((name) => ({ name, ex: matchExercise(name, preferredType) }));
          if (members.filter((m) => m.ex).length < 2) continue;
          const key = members.map((m) => m.ex?.id || m.name).sort().join("|");
          if (seenGroups.has(key)) continue;
          seenGroups.add(key);
          duplicateItems.push({ key, file, members, info: infoCols.map((h) => [h, row[h]]).filter(([, v]) => v) });
        }
      } else if (suggested && exerciseCol) {
        for (const row of rows) {
          for (const name of splitNames(row[exerciseCol])) {
            const ex = matchExercise(name, preferredType);
            if (!ex) continue;
            const suggestions = typesIn(row[suggested]).filter((t) => t !== ex.type);
            if (!suggestions.length) continue;
            const info = infoCols.map((h) => [h, row[h]]).filter(([, v]) => v);
            // Same exercise flagged by several reports: merge the suggestions into one item.
            if (seenTypeIds.has(ex.id)) {
              const item = seenTypeIds.get(ex.id);
              item.suggestions = [...new Set([...item.suggestions, ...suggestions])];
              item.info.push(["also in", file], ...info);
              continue;
            }
            const item = { ex, file, suggestions, info };
            seenTypeIds.set(ex.id, item);
            typeItems.push(item);
          }
        }
      }
    }
  }

  const files = Object.keys(reports).sort();
  const current = sourceFilter.value;
  sourceFilter.innerHTML = `<option value="">All (${files.length})</option>` +
    files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  sourceFilter.value = files.includes(current) ? current : "";
}

// ---------- Rendering ----------

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function infoHtml(info) {
  return info.map(([h, v]) => `<p class="reason"><b>${escapeHtml(h)}:</b> ${escapeHtml(v)}</p>`).join("");
}

function exerciseCard(ex, extraClass = "", footer = "") {
  return `<div class="ex ${extraClass}">
    <img src="${imageUrl(ex.imageFileId)}" alt="" loading="lazy" data-zoom>
    <div class="name">${escapeHtml(ex.name)}</div>
    <div class="meta">${escapeHtml(ex.namePT || "")}</div>
    <div class="meta">${ex.type} · ${ex.id}</div>
    ${footer}
  </div>`;
}

function renderStatus() {
  const typeChanges = Object.entries(typeDecisions).filter(([id, type]) => byId.get(id)?.type !== type).length;
  const merges = Object.values(mergeDecisions).filter((d) => d.keep && d.merge?.length).length;
  statusEl.textContent =
    `${exercises.length} exercises · ${Object.keys(reports).length} reports · ` +
    `${typeItems.length} type suggestions (${typeChanges} changes chosen) · ` +
    `${duplicateItems.length} duplicate groups (${merges} merges chosen)`;
}

function render() {
  renderStatus();
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.textContent = b.dataset.tab === "types"
      ? `Type changes (${typeItems.length})`
      : `Duplicates (${duplicateItems.length})`;
  });

  if (!exercises.length) {
    listEl.innerHTML = `<div class="empty">No exercises loaded.</div>`;
    return;
  }
  if (!Object.keys(reports).length) {
    listEl.innerHTML = `<div class="empty">Load the reports folder (temp/reports) or its .md files.</div>`;
    return;
  }
  const file = sourceFilter.value;
  if (tab === "types") renderTypes(typeItems.filter((i) => !file || i.file === file));
  else renderDuplicates(duplicateItems.filter((i) => !file || i.file === file));
}

function renderTypes(items) {
  if (undecidedOnly.checked) items = items.filter((i) => !(i.ex.id in typeDecisions));
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">Nothing to review.</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => {
    const { ex } = item;
    const chosen = typeDecisions[ex.id] || ex.type;
    const decided = ex.id in typeDecisions;
    const buttons = TYPES.map((t) => {
      const classes = [
        t === ex.type ? "current" : "",
        item.suggestions.includes(t) ? "suggested" : "",
        decided && t === chosen ? "selected" : "",
      ].join(" ");
      const label = t === ex.type ? `${t} (keep)` : t;
      return `<button class="${classes}" data-set-type="${t}" data-id="${ex.id}">${label}</button>`;
    }).join("");
    return `<div class="item ${decided ? "decided" : ""} ${chosen !== ex.type ? "change" : ""}">
      <div class="row">
        ${exerciseCard(ex)}
        <div class="type-body">
          <div class="item-head">
            <span class="title">${escapeHtml(ex.name)}</span>
            <span class="tag">${escapeHtml(item.file)}</span>
            <span class="tag">suggested: ${item.suggestions.join(", ")}</span>
          </div>
          ${infoHtml(item.info)}
          <div class="types">${buttons}</div>
        </div>
      </div>
    </div>`;
  }).join("");
}

// Exercise id -> group keys where it was chosen as kept or merged, to flag conflicts across groups.
function decisionsByExercise() {
  const map = new Map();
  for (const [key, d] of Object.entries(mergeDecisions)) {
    if (!d.keep) continue;
    for (const id of [d.keep, ...(d.merge || [])]) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ key, role: id === d.keep ? "kept" : "merged" });
    }
  }
  return map;
}

function renderDuplicates(items) {
  if (undecidedOnly.checked) items = items.filter((i) => !mergeDecisions[i.key]);
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">Nothing to review.</div>`;
    return;
  }
  const byExercise = decisionsByExercise();
  listEl.innerHTML = items.map((item) => {
    const decision = mergeDecisions[item.key] || {};
    const cards = item.members.map(({ name, ex }) => {
      if (!ex) {
        return `<div class="ex unmatched"><div class="name">${escapeHtml(name)}</div><div class="meta">No match in exercises.json</div></div>`;
      }
      const role = decision.keep === ex.id ? "keep" : decision.merge?.includes(ex.id) ? "merge" : "";
      const elsewhere = (byExercise.get(ex.id) || []).filter((d) => d.key !== item.key);
      const note = elsewhere.length
        ? `<div class="other-decision">Also ${elsewhere.map((d) => d.role).join(", ")} in another group</div>`
        : "";
      const actions = `<div class="actions">
        <button class="${role === "keep" ? "on-keep" : ""}" data-keep="${ex.id}" data-key="${escapeHtml(item.key)}">Keep</button>
        <button class="${role === "merge" ? "on-merge" : ""}" data-merge="${ex.id}" data-key="${escapeHtml(item.key)}">Merge</button>
      </div>`;
      return exerciseCard(ex, role, note + actions);
    }).join("");
    const state = decision.skip ? "decided" : decision.keep && decision.merge?.length ? "decided merge" : "";
    const label = decision.skip ? "Kept separate" : "Keep all separate";
    return `<div class="item ${state}">
      <div class="item-head">
        <span class="title">${escapeHtml(item.members.map((m) => m.name).join(" ↔ "))}</span>
        <span class="tag">${escapeHtml(item.file)}</span>
      </div>
      ${infoHtml(item.info)}
      <div class="row">${cards}</div>
      <div class="group-actions">
        <button data-skip="${escapeHtml(item.key)}">${label}</button>
        <button data-clear="${escapeHtml(item.key)}">Clear</button>
      </div>
    </div>`;
  }).join("");
}

// ---------- Decisions ----------

function setType(id, type) {
  if (typeDecisions[id] === type) delete typeDecisions[id];
  else typeDecisions[id] = type;
  save(TYPE_DECISIONS_KEY, typeDecisions);
  render();
}

function setKeep(key, id) {
  const d = mergeDecisions[key]?.skip ? {} : { ...mergeDecisions[key] };
  d.keep = d.keep === id ? undefined : id;
  const item = duplicateItems.find((i) => i.key === key);
  // Picking a kept exercise defaults every other matched member to merge.
  if (d.keep) d.merge = item.members.filter((m) => m.ex && m.ex.id !== id).map((m) => m.ex.id);
  else d.merge = [];
  mergeDecisions[key] = d;
  if (!d.keep) delete mergeDecisions[key];
  save(MERGE_DECISIONS_KEY, mergeDecisions);
  render();
}

function toggleMerge(key, id) {
  const d = mergeDecisions[key]?.skip ? {} : { merge: [], ...mergeDecisions[key] };
  if (!d.keep || d.keep === id) {
    showToast("Pick the exercise to keep first");
    return;
  }
  d.merge = d.merge.includes(id) ? d.merge.filter((x) => x !== id) : [...d.merge, id];
  mergeDecisions[key] = d;
  save(MERGE_DECISIONS_KEY, mergeDecisions);
  render();
}

function setSkip(key) {
  if (mergeDecisions[key]?.skip) delete mergeDecisions[key];
  else mergeDecisions[key] = { skip: true };
  save(MERGE_DECISIONS_KEY, mergeDecisions);
  render();
}

function clearGroup(key) {
  delete mergeDecisions[key];
  save(MERGE_DECISIONS_KEY, mergeDecisions);
  render();
}

// ---------- Prompt ----------

// Collapses every merge decision into removedId -> keptId, following chains (A kept over B, B kept over C => C -> A).
function resolveMerges(warnings) {
  const target = new Map();
  for (const d of Object.values(mergeDecisions)) {
    if (!d.keep) continue;
    for (const id of d.merge || []) {
      if (target.has(id) && target.get(id) !== d.keep) {
        warnings.push(`"${byId.get(id).name}" is merged into both "${byId.get(target.get(id)).name}" and "${byId.get(d.keep).name}"; using the first.`);
        continue;
      }
      target.set(id, d.keep);
    }
  }
  const resolve = (id, seen = new Set()) => {
    if (!target.has(id)) return id;
    if (seen.has(id)) return null;
    seen.add(id);
    return resolve(target.get(id), seen);
  };
  const result = new Map();
  for (const id of target.keys()) {
    const finalId = resolve(id);
    if (!finalId) {
      warnings.push(`Circular merge involving "${byId.get(id).name}"; skipped.`);
      continue;
    }
    result.set(id, finalId);
  }
  return result;
}

function generatePrompt() {
  const warnings = [];
  const merges = resolveMerges(warnings);
  const typeChanges = Object.entries(typeDecisions).filter(([id, type]) => byId.has(id) && type !== byId.get(id).type);

  for (const [id] of typeChanges) {
    if (merges.has(id)) warnings.push(`"${byId.get(id).name}" has a type change but is merged away; the type change is dropped.`);
  }
  const effectiveTypeChanges = typeChanges.filter(([id]) => !merges.has(id));

  const groups = new Map();
  for (const [removed, kept] of merges) {
    if (!groups.has(kept)) groups.set(kept, []);
    groups.get(kept).push(removed);
  }

  const describe = (ex) => `"${ex.name}" (id: ${ex.id}, imageFileId: ${ex.imageFileId}, type: ${ex.type})`;
  const lines = [
    "Apply the following reviewed changes to `catalog/exercises.json`.",
    "Match exercises by `id` (names are only for readability). Keep the file's formatting and the order of the remaining exercises; do not change anything not listed here.",
    "",
  ];

  if (effectiveTypeChanges.length) {
    lines.push(`## 1. Type changes (${effectiveTypeChanges.length})`, "", "Set `type` to the new value:", "");
    for (const [id, type] of effectiveTypeChanges) lines.push(`- ${describe(byId.get(id))} → \`${type}\``);
    lines.push("");
  }

  if (groups.size) {
    lines.push(
      `## ${effectiveTypeChanges.length ? 2 : 1}. Merge duplicates (${groups.size} kept, ${merges.size} removed)`,
      "",
      "For each group, keep the listed exercise and delete the removed ones from the array. Before deleting, fold each removed exercise into the kept one:",
      "- Add the removed exercise's `name` and its `searchAlias` entries to the kept exercise's `searchAlias`.",
      "- Add the removed exercise's `namePT` and its `searchAliasPT` entries to the kept exercise's `searchAliasPT`.",
      "- Skip entries that equal the kept exercise's own `name`/`namePT` or are already present (case-insensitive).",
      "- Keep the kept exercise's `id`, `imageFileId`, `legacyImageId`, `type` and `trackedMetrics` unchanged.",
      ""
    );
    for (const [kept, removed] of groups) {
      lines.push(`- Keep ${describe(byId.get(kept))}`);
      for (const id of removed) lines.push(`  - Remove ${describe(byId.get(id))}`);
    }
    lines.push(
      "",
      "Afterwards, list the removed `imageFileId`s whose image in `catalog/images/` is no longer referenced by any exercise, so I can delete them.",
      "",
      "Removed id → kept id mapping (for migrating references elsewhere):",
      "```json",
      JSON.stringify(Object.fromEntries(merges), null, 2),
      "```",
      ""
    );
  }

  if (!effectiveTypeChanges.length && !groups.size) lines.push("(No changes selected.)");

  lines.push("Finally, validate that the file is still valid JSON and that every `id` is unique.");
  promptEl.value = lines.join("\n");
  warningsEl.textContent = warnings.join("\n");
  promptPanel.hidden = false;
  promptPanel.scrollIntoView({ behavior: "smooth" });
}

// ---------- Loading ----------

async function readReportFiles(fileList) {
  const mdFiles = [...fileList].filter((f) => f.name.toLowerCase().endsWith(".md"));
  if (!mdFiles.length) {
    showToast("No .md files selected");
    return;
  }
  reports = {};
  for (const f of mdFiles) reports[f.name] = await f.text();
  save(REPORTS_KEY, reports);
  buildItems();
  render();
  showToast(`Loaded ${mdFiles.length} reports`);
}

function setExercises(list) {
  exercises = list;
  byId = new Map(exercises.map((ex) => [ex.id, ex]));
  buildIndexes();
  buildItems();
  render();
}

// Same source priority as the popup: an uploaded exercises.json (session) wins over the deployed catalog.
async function loadExercises() {
  try {
    const { sourceCatalog } = await chrome.storage.session.get("sourceCatalog");
    if (sourceCatalog) return setExercises(sourceCatalog);
  } catch {}
  try {
    const res = await fetch(`${CATALOG_URL}/exercises.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setExercises(await res.json());
  } catch (err) {
    statusEl.textContent = `Could not fetch exercises.json (${err.message}). Load it manually.`;
  }
}

document.getElementById("reports-dir").addEventListener("change", (e) => readReportFiles(e.target.files));
document.getElementById("reports-files").addEventListener("change", (e) => readReportFiles(e.target.files));
document.getElementById("catalog-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error("exercises.json must be an array.");
    setExercises(parsed);
    showToast(`Loaded ${parsed.length} exercises`);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
});

sourceFilter.addEventListener("change", render);
undecidedOnly.addEventListener("change", render);

document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    tab = b.dataset.tab;
    save(TAB_KEY, tab);
    render();
  })
);

document.getElementById("reset").addEventListener("click", () => {
  typeDecisions = {};
  mergeDecisions = {};
  save(TYPE_DECISIONS_KEY, typeDecisions);
  save(MERGE_DECISIONS_KEY, mergeDecisions);
  render();
  showToast("Decisions cleared");
});

document.getElementById("generate").addEventListener("click", generatePrompt);
document.getElementById("close-prompt").addEventListener("click", () => { promptPanel.hidden = true; });
document.getElementById("copy-prompt").addEventListener("click", async () => {
  await navigator.clipboard.writeText(promptEl.value);
  showToast("Prompt copied");
});

listEl.addEventListener("click", (e) => {
  const t = e.target.closest("button, img[data-zoom]");
  if (!t) return;
  if (t.matches("img[data-zoom]")) {
    zoom.querySelector("img").src = t.src;
    zoom.classList.add("show");
  } else if (t.dataset.setType) setType(t.dataset.id, t.dataset.setType);
  else if (t.dataset.keep) setKeep(t.dataset.key, t.dataset.keep);
  else if (t.dataset.merge) toggleMerge(t.dataset.key, t.dataset.merge);
  else if (t.dataset.skip) setSkip(t.dataset.skip);
  else if (t.dataset.clear) clearGroup(t.dataset.clear);
});
zoom.addEventListener("click", () => zoom.classList.remove("show"));

buildItems();
render();
loadExercises();
