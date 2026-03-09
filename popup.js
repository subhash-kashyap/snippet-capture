chrome.storage.local.get("snippets", (data) => {
  const snippets = data.snippets || [];
  document.getElementById("count").textContent = snippets.length;
});

document.getElementById("open-page").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_SNIPPETS_PAGE" });
  window.close();
});
