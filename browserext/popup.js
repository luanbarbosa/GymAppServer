const fileInput = document.getElementById("filePicker");
const statusEl = document.getElementById("status");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");
const cancelBtn = document.getElementById("cancelBtn");

async function render() {
  const { catalog = [], pointer = 0 } = await chrome.storage.local.get(["catalog", "pointer"]);

  if (!catalog.length) {
    statusEl.textContent = "No catalog loaded.";
    return;
  }
  if (pointer >= catalog.length) {
    statusEl.textContent = `Done. ${catalog.length}/${catalog.length} processed.`;
    return;
  }

  const ex = catalog[pointer];
  statusEl.textContent = `${pointer + 1}/${catalog.length}\n${ex.name}\nimageFileId: ${ex.imageFileId}`;
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const catalog = JSON.parse(text);
    if (!Array.isArray(catalog) || !catalog.every((ex) => ex.imageFileId)) {
      throw new Error("JSON must be an array of exercises with an imageFileId field.");
    }
    await chrome.storage.local.set({ catalog, pointer: 0 });
    await render();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

skipBtn.addEventListener("click", async () => {
  const { pointer = 0 } = await chrome.storage.local.get("pointer");
  await chrome.storage.local.set({ pointer: pointer + 1 });
  await render();
});

resetBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ pointer: 0 });
  await render();
});

cancelBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(["catalog", "pointer"]);
  fileInput.value = "";
  await render();
});

render();
