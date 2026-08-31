const MENU_ID = "gymnerd-download";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Download for GymApp",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const { catalog = [], pointer = 0 } = await chrome.storage.local.get(["catalog", "pointer"]);

  if (!catalog.length) {
    console.warn("GymNerd: no catalog loaded. Open popup and pick a JSON file first.");
    return;
  }
  if (pointer >= catalog.length) {
    console.warn("GymNerd: catalog exhausted. Reset pointer in popup to reuse.");
    return;
  }

  const exercise = catalog[pointer];
  const ext = getExtension(info.srcUrl);
  const filename = `${exercise.imageFileId}.${ext}`;

  chrome.downloads.download({ url: info.srcUrl, filename, saveAs: false }, (downloadId) => {
    if (chrome.runtime.lastError || downloadId === undefined) {
      console.error("GymNerd: download failed", chrome.runtime.lastError);
      return;
    }
    chrome.storage.local.set({ pointer: pointer + 1 });
    if (tab?.id !== undefined) {
      chrome.tabs.remove(tab.id);
    }
  });
});

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}

async function openSearchTab(name) {
  const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name)}`;
  const { searchTabId } = await chrome.storage.local.get("searchTabId");

  if (searchTabId !== undefined) {
    chrome.tabs.update(searchTabId, { url, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        createSearchTab(url);
      }
    });
    return;
  }

  createSearchTab(url);
}

function createSearchTab(url) {
  chrome.tabs.create({ url }, (tab) => {
    chrome.storage.local.set({ searchTabId: tab.id });
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { searchTabId } = await chrome.storage.local.get("searchTabId");
  if (tabId === searchTabId) {
    chrome.storage.local.remove("searchTabId");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.catalog && !changes.pointer) return;

  chrome.storage.local.get(["catalog", "pointer"]).then(({ catalog = [], pointer = 0 }) => {
    const remaining = catalog.length - pointer;
    chrome.action.setBadgeText({ text: remaining > 0 ? String(remaining) : "" });

    if (remaining > 0) {
      openSearchTab(catalog[pointer].name);
    }
  });
});
