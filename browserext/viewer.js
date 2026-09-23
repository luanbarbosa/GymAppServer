const CATALOG_URL = "https://gymnerd-catalog.pages.dev";
const PAGE_SIZE_KEY = "gymnerd.pageSize";
const OFFSET_KEY = "gymnerd.offset";
let pageSize = 4;
try {
  pageSize = Number(localStorage.getItem(PAGE_SIZE_KEY)) || 4;
} catch {}

let exercises = [];
let offset = 0;

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const jumpInput = document.getElementById("jump");
const exportBtn = document.getElementById("export");
const clearBtn = document.getElementById("clear");
const sendToDownloaderBtn = document.getElementById("send-to-downloader");
const toast = document.getElementById("toast");
const pageSizeSelect = document.getElementById("page-size");

const PROBLEMS_KEY = "gymnerd.problemExerciseIds";
let problems = loadProblems();

function loadProblems() {
  try {
    return JSON.parse(localStorage.getItem(PROBLEMS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProblems() {
  try {
    localStorage.setItem(PROBLEMS_KEY, JSON.stringify(problems));
  } catch {
    showToast("Could not save to localStorage");
  }
  exportBtn.textContent = `Export problems (${problems.length})`;
}

function toggleProblem(id) {
  problems = problems.includes(id) ? problems.filter((x) => x !== id) : [...problems, id];
  saveProblems();
  render();
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(`Copied ${label}: ${text}`);
}

function actionButton(label, onClick, className) {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
  button.onclick = onClick;
  return button;
}

const problemsDialog = document.getElementById("problems-dialog");
const problemsList = document.getElementById("problems-list");
const problemsTitle = document.getElementById("problems-title");

function renderProblemsList() {
  problemsTitle.textContent = `Problematic exercises (${problems.length})`;
  problemsList.innerHTML = "";
  if (!problems.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No problematic exercises marked.";
    problemsList.appendChild(empty);
    return;
  }
  problems.forEach((id) => {
    const index = exercises.findIndex((e) => e.id === id);
    const exercise = exercises[index];

    const row = document.createElement("li");
    const text = document.createElement("div");
    text.className = "row-text";
    const name = document.createElement("div");
    name.className = "row-name";
    name.textContent = exercise ? `${index + 1}. ${exercise.name}` : "Unknown exercise";
    const idText = document.createElement("div");
    idText.className = "row-id";
    idText.textContent = id;
    text.append(name, idText);

    row.append(text, actionButton("Copy", () => copy(id, "exercise id")));
    if (exercise) {
      row.append(actionButton("Go to", () => {
        problemsDialog.close();
        goTo(index - (index % pageSize));
      }));
    }
    row.append(actionButton("Remove", () => {
      toggleProblem(id);
      renderProblemsList();
    }));
    problemsList.appendChild(row);
  });
}

function render() {
  grid.innerHTML = "";
  const page = exercises.slice(offset, offset + pageSize);
  page.forEach((exercise, i) => {
    const card = document.createElement("div");
    const isProblem = problems.includes(exercise.id);
    card.className = isProblem ? "card problem" : "card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "img-wrap";
    if (exercise.imageFileId) {
      const img = document.createElement("img");
      img.src = `${CATALOG_URL}/images/${exercise.imageFileId}.webp`;
      img.alt = exercise.name;
      img.onerror = () => { imgWrap.innerHTML = '<span class="missing">Image failed to load</span>'; };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = '<span class="missing">No image</span>';
    }

    const info = document.createElement("div");
    info.className = "info";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `${offset + i + 1}. ${exercise.name}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [exercise.namePT, exercise.type].filter(Boolean).join(" · ");
    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      actionButton("Copy exercise id", () => copy(exercise.id, "exercise id")),
      actionButton("Copy image id", () => copy(exercise.imageFileId || "", "image id")),
      actionButton(isProblem ? "Problematic ✓" : "Mark as problematic", () => toggleProblem(exercise.id), "mark"),
    );

    card.append(imgWrap, info, actions);
    grid.appendChild(card);
  });

  const end = Math.min(offset + pageSize, exercises.length);
  status.textContent = `${offset + 1}–${end} of ${exercises.length}`;
  prevBtn.disabled = offset === 0;
  nextBtn.disabled = end >= exercises.length;
  history.replaceState(null, "", `#${offset + 1}`);
  try {
    localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {}
}

function goTo(newOffset) {
  const maxOffset = Math.max(0, exercises.length - 1);
  offset = Math.min(Math.max(0, newOffset), maxOffset);
  render();
}

function updateGridShape() {
  let cols = pageSize % 4 === 0 ? 4 : pageSize % 3 === 0 ? 3 : Math.min(pageSize, 4);
  if (window.innerWidth <= 480) cols = 1;
  else if (window.innerWidth <= 900) cols = Math.min(cols, 2);
  grid.style.setProperty("--cols", cols);
  grid.style.setProperty("--rows", Math.ceil(pageSize / cols));
}
window.addEventListener("resize", updateGridShape);

function applyPageSize() {
  pageSizeSelect.value = String(pageSize);
  updateGridShape();
}
pageSizeSelect.onchange = () => {
  pageSize = Number(pageSizeSelect.value);
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(pageSize));
  } catch {}
  applyPageSize();
  goTo(offset - (offset % pageSize));
};
applyPageSize();

prevBtn.onclick = () => goTo(offset - pageSize);
nextBtn.onclick = () => goTo(offset + pageSize);
jumpInput.onchange = () => goTo(Number(jumpInput.value) - 1);
document.getElementById("show-problems").onclick = () => {
  renderProblemsList();
  problemsDialog.showModal();
};
document.getElementById("close-problems").onclick = () => problemsDialog.close();
problemsDialog.onclick = (e) => { if (e.target === problemsDialog) problemsDialog.close(); };
document.getElementById("copy-all").onclick = () => {
  if (problems.length) copy(problems.join(","), `${problems.length} ids`);
};
exportBtn.onclick = () => {
  const blob = new Blob([problems.join("\n") + (problems.length ? "\n" : "")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download(
    { url, filename: "problem-images.txt", conflictAction: "overwrite", saveAs: false },
    (downloadId) => {
      URL.revokeObjectURL(url);
      if (chrome.runtime.lastError || downloadId === undefined) {
        showToast(`Export failed: ${chrome.runtime.lastError?.message}`);
        return;
      }
      chrome.downloads.show(downloadId);
    },
  );
};
// Loads the problematic exercises into the popup's downloader queue (same storage keys popup.js uses).
sendToDownloaderBtn.onclick = async () => {
  const queue = problems.map((id) => exercises.find((e) => e.id === id)).filter((e) => e?.imageFileId);
  if (!queue.length) {
    showToast("No problematic exercises to send");
    return;
  }
  await chrome.storage.local.set({ catalog: queue, pointer: 0 });
  showToast(`Sent ${queue.length} exercises to the downloader`);
};
clearBtn.onclick = () => {
  if (!problems.length || !window.confirm(`Clear ${problems.length} problematic exercise ids?`)) return;
  problems = [];
  saveProblems();
  render();
};
saveProblems();
document.addEventListener("keydown", (e) => {
  if (e.target === jumpInput || e.target === pageSizeSelect || problemsDialog.open) return;
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); if (!nextBtn.disabled) nextBtn.click(); }
  if (e.key === "ArrowLeft") { e.preventDefault(); if (!prevBtn.disabled) prevBtn.click(); }
});

fetch(`${CATALOG_URL}/exercises.json`, { cache: "no-store" })
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((data) => {
    exercises = data;
    // URL hash wins so links to a specific exercise still work; otherwise resume the last position.
    let start = parseInt(location.hash.slice(1), 10);
    if (!Number.isFinite(start)) {
      try {
        start = Number(localStorage.getItem(OFFSET_KEY)) + 1;
      } catch {}
    }
    goTo(Number.isFinite(start) ? start - 1 : 0);
  })
  .catch((err) => { status.textContent = `Failed to load exercises: ${err.message}`; });
