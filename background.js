const DEFAULT_SITES = ["claude.ai", "chatgpt.com"];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_SNIPPETS_PAGE") {
    chrome.tabs.create({ url: chrome.runtime.getURL("snippets.html") });
  }
});

// Inject content scripts into user-added sites on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  // Skip default sites — already handled by content_scripts in manifest
  const isDefault = DEFAULT_SITES.some((s) => tab.url.includes(s));
  if (isDefault) return;

  chrome.storage.local.get("userSites", (data) => {
    const userSites = data.userSites || [];
    const matches = userSites.some((site) => tab.url.includes(site));
    if (!matches) return;

    chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }).catch(() => {});
  });
});
